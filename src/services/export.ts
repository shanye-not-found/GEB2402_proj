import { additionalData, assertRecord, FORMAT, FORMAT_VERSION } from '../../shared/export-format.mjs';
import type { ExperimentRecord, PublicKeyConfig } from '../domain/types';

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

function encodeBase64(value: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function importExportKey(config: PublicKeyConfig): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('此环境不支持安全加密，请使用HTTPS或localhost。');
  if (!config || config.algorithm !== 'RSA-OAEP-256' || config.modulusLength !== 3072 || !['demo', 'research'].includes(config.purpose) || !/^(demo|research)-[a-f0-9]{24}$/.test(config.keyId)) throw new Error('导出公钥配置无效。');
  const spki = decodeBase64(config.spki);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', spki));
  let fingerprint = '';
  for (const byte of hash) fingerprint += byte.toString(16).padStart(2, '0');
  if (config.keyId !== `${config.purpose}-${fingerprint.slice(0, 24)}`) throw new Error('公钥内容与公钥ID不匹配。');
  const key = await crypto.subtle.importKey('spki', spki, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  if (!('modulusLength' in key.algorithm) || key.algorithm.modulusLength !== 3072) throw new Error('导出公钥必须为3072位RSA。');
  return key;
}

export async function encryptRecord(record: ExperimentRecord, config: PublicKeyConfig) {
  assertRecord(record);
  if (record.mode === 'research' && config.purpose !== 'research') throw new Error('正式实验不能使用演示公钥。');
  const publicKey = await importExportKey(config);
  const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(record));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(config.keyId), tagLength: 128 }, aesKey, plaintext);
  const encryptedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, await crypto.subtle.exportKey('raw', aesKey));
  return {
    format: FORMAT, version: FORMAT_VERSION, keyId: config.keyId,
    keyAlgorithm: 'RSA-OAEP-256', dataAlgorithm: 'A256GCM',
    iv: encodeBase64(iv), encryptedKey: encodeBase64(encryptedKey), ciphertext: encodeBase64(ciphertext),
  };
}

export function downloadFile(content: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/octet-stream' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
