import type { Catalog, Phase, ShoppingState } from '../../domain/types';
import { summarize } from '../../domain/experiment';

export function ShoppingPage({ catalog, shopping, now, onChange, onCheckout }: { catalog: Catalog; shopping: ShoppingState; now: number; onChange: (id: string, delta: 1 | -1, phase: Phase) => void; onCheckout: (phase: Phase) => void }) {
  const summary = summarize(catalog, shopping.quantities);
  const fullDuration = Math.ceil((shopping.deadlineAt - shopping.phaseStartedAt) / 1000);
  const seconds = Math.max(0, Math.min(fullDuration, Math.ceil((shopping.deadlineAt - now) / 1000)));
  return <section className="shopping">
    <div className="shopping-toolbar">
      <div><h1>挑选喜欢的零食</h1><p className="muted">已选 {summary.distinctProductCount} 种</p></div>
      <div className={`timer ${seconds <= 10 ? 'urgent' : ''}`} role="timer" aria-label={`剩余${seconds}秒`}><small>剩余时间</small><strong>{seconds}<span> 秒</span></strong></div>
      <div className="checkout-group">
        <p className="checkout-count" role="status">已买 <strong>{summary.totalQuantity}</strong> 件</p>
        {/* 双击只结算一次，避免第二次点击直接结束刚开始的追加轮。 */}
        <button className="primary" disabled={seconds === 0} onClick={event => { if (event.detail <= 1) onCheckout(shopping.phase); }}>结账</button>
      </div>
    </div>
    {shopping.extensionApplied && <p className="notice" role="status">预算还没花完，再买点东西吧</p>}
    <div className="product-list">
      {catalog.products.map(product => {
        const quantity = shopping.quantities[product.id] ?? 0;
        const displaySpec = product.specLabel.split('（', 1)[0].replace(/约|估计/g, '');
        return <article className="product-row" key={product.id} data-product-id={product.id}>
          <img className="product-image" src={`${import.meta.env.BASE_URL}${product.imagePath}`} alt={product.name} onError={event => { const image = event.currentTarget; if (!image.dataset.fallback) { image.dataset.fallback = 'true'; image.src = `${import.meta.env.BASE_URL}product-fallback.svg`; } }} />
          <div className="product-info">
            <h2>{product.name}</h2><p>{product.description}</p>
            <div className="product-facts">
              <p className="product-spec">规格 {displaySpec}</p>
              <p className="product-price">¥{(product.unitPriceFen / 100).toFixed(2)}<span> / {product.saleUnitLabel}</span></p>
            </div>
          </div>
          <div className="product-controls">
            <button className="primary buy" aria-label={`购买${product.name}`} onClick={() => onChange(product.id, 1, shopping.phase)}>买！</button>
            <div className="quantity-actions">
              <span className="bought-count">已买 {quantity}</span>
              <button className="minus" aria-label={`少买一个：${product.name}`} disabled={quantity === 0} onClick={() => onChange(product.id, -1, shopping.phase)}>−</button>
            </div>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
