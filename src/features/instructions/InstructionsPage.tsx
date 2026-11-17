export function InstructionsPage({ busy, loading, loadError, budgetFen, onRetry, onStart }: { busy: boolean; loading: boolean; loadError: string; budgetFen: number; onRetry: () => void; onStart: () => void }) {
  const budgetYuan = (budgetFen / 100).toFixed(0);
  return <section className="panel narrow">
    <p className="eyebrow">任务说明</p><h1>准备开始选购</h1>
    <div className="task-facts"><div><strong>{budgetYuan} 元</strong><span>选购预算</span></div><div><strong>60 秒</strong><span>选购时间</span></div></div>
    <p className="notice budget-reminder">请记住，本次选购预算为 <strong>{budgetYuan} 元</strong>。</p>
    <p>接下来，您有 <strong>{budgetYuan} 元预算</strong>和 60 秒时间选购商品。请根据自己的喜好安排选购。</p>
    <p>您可以点击“买！”添加商品，也可以减少已选数量；可以提前结账，时间结束后将自动结账。</p>
    <p className="muted">点击“开始选购”后开始计时。</p>
    {loadError && <div role="alert" className="notice error">{loadError}<button onClick={onRetry}>重新加载</button></div>}
    <button className="primary" disabled={busy || loading || Boolean(loadError)} onClick={onStart}>{loading ? '正在加载商品…' : busy ? '正在准备…' : '开始选购'}</button>
  </section>;
}
