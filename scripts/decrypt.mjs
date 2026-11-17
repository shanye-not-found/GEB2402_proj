import { constants, createDecipheriv, createPrivateKey, privateDecrypt } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { additionalData, assertEnvelope, assertRecord } from '../shared/export-format.mjs';
import { keyIdForPublicKey } from './keys.mjs';

/** 先验证认证标签，再解析完整JSON；失败时不写任何解密结果。 */
export function decryptEnvelope(envelope, privatePem) {
  assertEnvelope(envelope);
  const privateKey = createPrivateKey(privatePem);
  if (privateKey.asymmetricKeyType !== 'rsa' || privateKey.asymmetricKeyDetails.modulusLength !== 3072) throw new Error('需要3072位RSA私钥。');
  const demo = envelope.keyId.startsWith('demo-');
  if (keyIdForPublicKey(privateKey, demo) !== envelope.keyId) throw new Error('私钥与文件公钥ID不匹配。');
  const iv = Buffer.from(envelope.iv, 'base64');
  const encryptedKey = Buffer.from(envelope.encryptedKey, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  if (iv.length !== 12 || encryptedKey.length !== 384 || ciphertext.length <= 16) throw new Error('加密字段长度无效。');
  const aesKey = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, encryptedKey);
  if (aesKey.length !== 32) throw new Error('AES密钥长度无效。');
  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv, { authTagLength: 16 });
  decipher.setAAD(additionalData(envelope.keyId));
  decipher.setAuthTag(ciphertext.subarray(-16));
  const plaintext = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  assertRecord(record);
  if (record.mode === 'research' && demo) throw new Error('正式实验不能使用演示公钥。');
  return record;
}

export function decryptFile(inputPath, keyPath, outputPath) {
  const record = decryptEnvelope(JSON.parse(readFileSync(inputPath, 'utf8')), readFileSync(keyPath, 'utf8'));
  const target = resolve(outputPath || join(dirname(inputPath), basename(inputPath, extname(inputPath)) + '.json'));
  writeFileSync(target, JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { output: target, sessionId: record.sessionId, mode: record.mode };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    let inputPath, keyPath, outputPath;
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '--key') keyPath = args[++index];
      else if (args[index] === '--out') outputPath = args[++index];
      else if (!inputPath && !args[index].startsWith('--')) inputPath = args[index];
      else throw new Error(`未知参数：${args[index]}`);
    }
    if (!inputPath || !keyPath) throw new Error('用法：node scripts/decrypt.mjs <文件.geb2402> --key <私钥.pem> [--out <结果.json>]');
    console.log(JSON.stringify(decryptFile(inputPath, keyPath, outputPath), null, 2));
  } catch (error) {
    console.error(`解密失败：${error.message}`);
    process.exitCode = 1;
  }
}
