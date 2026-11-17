/** 校验网页实际会使用的字段，损坏或错版清单不能悄悄进入选购。 */
export function assertProductCatalog(catalog) {
  if (
    !catalog || catalog.schemaVersion !== "1.0" || catalog.currency !== "CNY" ||
    !Array.isArray(catalog.products) || catalog.products.length === 0 ||
    catalog.uniqueProductCount !== catalog.products.length ||
    !Number.isSafeInteger(catalog.requiredProductCount) || catalog.requiredProductCount < 30 ||
    catalog.missingProductCount !== Math.max(0, catalog.requiredProductCount - catalog.products.length) ||
    catalog.readyForExperiment !== (catalog.products.length >= catalog.requiredProductCount)
  ) {
    throw new Error("商品清单为空、版本不支持或数量信息不一致。");
  }
  const ids = new Set();
  for (const product of catalog.products) {
    if (
      !product || typeof product.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.id) ||
      ids.has(product.id) || typeof product.name !== "string" || !product.name.trim() ||
      typeof product.description !== "string" || typeof product.specLabel !== "string" ||
      !Number.isSafeInteger(product.unitPriceFen) || product.unitPriceFen <= 0 ||
      !Number.isSafeInteger(product.unitWeightGrams) || product.unitWeightGrams <= 0 ||
      !Number.isSafeInteger(product.sortOrder) || product.sortOrder < 1 ||
      typeof product.saleUnitLabel !== "string" || !product.saleUnitLabel.trim() ||
      typeof product.imagePath !== "string" || !/^products\/[a-z0-9-]+\.webp$/.test(product.imagePath) ||
      !Array.isArray(product.galleryImagePaths) || product.galleryImagePaths.length === 0 ||
      product.galleryImagePaths[0] !== product.imagePath
    ) {
      throw new Error(`商品字段无效或ID重复：${product?.id ?? "未知商品"}`);
    }
    for (const path of product.galleryImagePaths) {
      if (typeof path !== "string" || !/^products\/[a-z0-9-]+\.webp$/.test(path)) {
        throw new Error(`商品图片路径无效：${product.id}`);
      }
    }
    ids.add(product.id);
  }
  return catalog;
}

/** 图片以清单上一级目录为站点资源根路径，兼容GitHub Pages仓库子目录。 */
export function resolveProductImages(product, assetBaseUrl) {
  const galleryImageUrls = [];
  for (const path of product.galleryImagePaths) {
    galleryImageUrls.push(new URL(path, assetBaseUrl).href);
  }
  return {
    ...product,
    imageUrl: new URL(product.imagePath, assetBaseUrl).href,
    galleryImageUrls,
  };
}

/** 读取静态清单并解析图片地址；不足30种仍可预览，由readyForExperiment阻止正式实验。 */
export async function loadProductCatalog(catalogUrl = new URL("./products.json", import.meta.url)) {
  const resolvedUrl = new URL(catalogUrl, import.meta.url);
  const response = await fetch(resolvedUrl);
  if (!response.ok) {
    throw new Error(`商品清单加载失败（HTTP ${response.status}）。`);
  }
  let catalog;
  try {
    catalog = await response.json();
  } catch {
    throw new Error("商品清单不是有效的JSON文件。");
  }
  assertProductCatalog(catalog);
  const assetBaseUrl = new URL("../", response.url || resolvedUrl);
  const products = [];
  for (const product of catalog.products) {
    products.push(resolveProductImages(product, assetBaseUrl));
  }
  return { ...catalog, products };
}
