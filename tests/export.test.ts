import { beforeAll, describe, expect, it } from 'vitest';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encryptRecord } from '../src/services/export';
import { makeRecord } from '../src/domain/experiment';
import type { ExperimentRecord, PublicKeyConfig } from '../src/domain/types';
import { decryptEnvelope, decryptFile } from '../scripts/decrypt.mjs';
import { assertRecord } from '../shared/export-format.mjs';
import { completed } from './fixtures';

let config: PublicKeyConfig;
let privatePem: string;
let wrongPem: string;
let record: ExperimentRecord;

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 3072 });
  const spki = pair.publicKey.export({ type: 'spki', format: 'der' });
  config = { keyId: `demo-${createHash('sha256').update(spki).digest('hex').slice(0, 24)}`, purpose: 'demo', algorithm: 'RSA-OAEP-256', modulusLength: 3072, spki: spki.toString('base64') };
  privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  wrongPem = generateKeyPairSync('rsa', { modulusLength: 3072 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  record = makeRecord(completed());
});

describe('Web Crypto导出与独立Node解密器', () => {
  it('完整往返一致、同一实验两次导出密文不同，外层没有参与者姓名', async () => {
    const first = await encryptRecord(record, config);
    const second = await encryptRecord(record, config);
    expect(decryptEnvelope(first, privatePem)).toEqual(record);
    expect(decryptEnvelope(second, privatePem)).toEqual(record);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(JSON.stringify(first)).not.toContain(record.participant.realName);
  });
  it('错误私钥、篡改密文和未知算法被拒绝', async () => {
    const envelope = await encryptRecord(record, config);
    expect(() => decryptEnvelope(envelope, wrongPem)).toThrow();
    const bytes = Buffer.from(envelope.ciphertext, 'base64');
    bytes[0] ^= 1;
    expect(() => decryptEnvelope({ ...envelope, ciphertext: bytes.toString('base64') }, privatePem)).toThrow();
    expect(() => decryptEnvelope({ ...envelope, dataAlgorithm: 'unknown' }, privatePem)).toThrow();
  });
  it('不一致的汇总、价格绑定和旧版本不能当作合法实验结果', () => {
    const wrongTotal = structuredClone(record);
    wrongTotal.shopping.final.totalPriceFen += 1;
    expect(() => assertRecord(wrongTotal)).toThrow();
    const wrongRevision = structuredClone(record);
    wrongRevision.estimate.priceExpectationRevision = 1;
    expect(() => assertRecord(wrongRevision)).toThrow();
    expect(() => assertRecord({ ...record, schemaVersion: '1.0' })).toThrow();
  });
  it('1.2要求预算感受回答，旧1.1文件仍可读取', () => {
    const { budgetPerception, ...legacy } = structuredClone(record);
    expect(() => assertRecord({ ...legacy, schemaVersion: '1.1' })).not.toThrow();
    expect(() => assertRecord({ ...legacy, schemaVersion: '1.2' })).toThrow();
    expect(() => assertRecord({ ...record, schemaVersion: '1.2' })).not.toThrow();
    expect(() => assertRecord({ ...record, budgetPerception: { ...budgetPerception, answer: 'invalid' } })).toThrow();
  });
  it('1.3校验预计总价和排序的真实性约束', () => {
    const wrongPrice = structuredClone(record);
    wrongPrice.feedback.expectedTotalPriceFen += 1;
    expect(() => assertRecord(wrongPrice)).toThrow('价格反馈');
    const duplicateRank = structuredClone(record);
    duplicateRank.questionnaire.at(-1)!.choiceIds = ['A', 'A', 'F'];
    expect(() => assertRecord(duplicateRank)).toThrow('排序');
  });
  it('离线文件解密可写JSON，拒绝覆盖文件，失败时不写部分结果', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'geb2402-test-'));
    const input = join(directory, 'sample.geb2402'), key = join(directory, 'private.pem'), output = join(directory, 'sample.json');
    const failedOutput = join(directory, 'failed.json');
    try {
      const envelope = await encryptRecord(record, config);
      writeFileSync(input, JSON.stringify(envelope));
      writeFileSync(key, privatePem);
      decryptFile(input, key, output);
      expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(record);
      expect(() => decryptFile(input, key, output)).toThrow();
      writeFileSync(key, wrongPem);
      expect(() => decryptFile(input, key, failedOutput)).toThrow();
      expect(existsSync(failedOutput)).toBe(false);
    } finally {
      for (const path of [input, key, output, failedOutput]) if (existsSync(path)) unlinkSync(path);
      rmdirSync(directory);
    }
  });
});
