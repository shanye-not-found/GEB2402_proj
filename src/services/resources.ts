import type { Catalog, ExperimentConfig, Mode, PublicKeyConfig } from '../domain/types';
import { importExportKey } from './export';
import { probeStorage } from './session';

export async function loadResources(): Promise<{ catalog: Catalog; publicKey: PublicKeyConfig }> {
  const loader = await import(/* @vite-ignore */ `${import.meta.env.BASE_URL}data/catalog-loader.mjs`);
  const [catalog, keyResponse] = await Promise.all([
    loader.loadProductCatalog(),
    fetch(`${import.meta.env.BASE_URL}data/export-key.json`),
  ]);
  if (!keyResponse.ok) throw new Error('无法加载导出公钥，请检查导出配置后重试。');
  const publicKey: PublicKeyConfig = await keyResponse.json();
  await importExportKey(publicKey);
  return { catalog, publicKey };
}

export async function prepareExperiment(catalog: Catalog, publicKey: PublicKeyConfig, mode: Mode, config: ExperimentConfig): Promise<void> {
  probeStorage();
  await importExportKey(publicKey);
  if (mode === 'research') {
    if (!catalog.readyForExperiment || catalog.products.length < 30) throw new Error(`正式实验至少需要30种商品，当前${catalog.products.length}种。请先补齐商品，或使用已标识的演示入口。`);
    if (publicKey.purpose !== 'research') throw new Error('正式实验需要研究者公钥，不能使用演示公钥。');
    if (config.questionnaireIsPlaceholder) throw new Error('请替换并确认正式问卷后再开始正式实验。');
  }
  if (catalog.products.length === 0) throw new Error('没有可选购的商品。');
  // 图片解码结束后再开放购物；单张失败则使用统一占位图，不扣购物时间。
  const pending = [];
  for (const product of catalog.products) {
    const image = new Image();
    image.src = `${import.meta.env.BASE_URL}${product.imagePath}`;
    pending.push(image.decode().catch(() => undefined));
  }
  await Promise.all(pending);
}
