import { generateKeyPairSync, createHash, createPublicKey } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function keyIdForPublicKey(key, demo = false) {
  const spki = createPublicKey(key).export({ type: 'spki', format: 'der' });
  return `${demo ? 'demo' : 'research'}-${createHash('sha256').update(spki).digest('hex').slice(0, 24)}`;
}

export function generateKeys(privatePath, publicPath, demo = false) {
  const privateTarget = resolve(privatePath), publicTarget = resolve(publicPath);
  const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  for (const directory of ['public', 'dist']) {
    const forbidden = resolve(project, directory).toLowerCase();
    if (privateTarget.toLowerCase() === forbidden || privateTarget.toLowerCase().startsWith(forbidden + sep)) throw new Error('私钥不能保存到网页公开目录public或dist。');
  }
  if (privateTarget === publicTarget || existsSync(privateTarget) || existsSync(publicTarget)) {
    throw new Error('目标文件已存在或路径相同，拒绝覆盖密钥。请使用新的文件路径。');
  }
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072, publicExponent: 65537 });
  const config = {
    keyId: keyIdForPublicKey(privateKey, demo),
    purpose: demo ? 'demo' : 'research',
    algorithm: 'RSA-OAEP-256',
    modulusLength: 3072,
    spki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
  mkdirSync(dirname(privateTarget), { recursive: true });
  mkdirSync(dirname(publicTarget), { recursive: true });
  writeFileSync(privateTarget, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
  writeFileSync(publicTarget, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  return { keyId: config.keyId, privatePath: privateTarget, publicPath: publicTarget };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args[0] !== 'generate') throw new Error('用法：node scripts/keys.mjs generate --private-key <私钥.pem> --public-config <公钥.json> [--demo]');
    let privatePath, publicPath, demo = false;
    for (let index = 1; index < args.length; index += 1) {
      if (args[index] === '--demo') demo = true;
      else if (args[index] === '--private-key') privatePath = args[++index];
      else if (args[index] === '--public-config') publicPath = args[++index];
      else throw new Error(`未知参数：${args[index]}`);
    }
    if (!privatePath || !publicPath) throw new Error('必须指定私钥和公钥配置的输出路径。');
    console.log(JSON.stringify(generateKeys(privatePath, publicPath, demo), null, 2));
  } catch (error) {
    console.error(`密钥生成失败：${error.message}`);
    process.exitCode = 1;
  }
}
