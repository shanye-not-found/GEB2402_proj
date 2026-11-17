export function CompletionPage({ busy, status, onDownload, onReset }: { busy: boolean; status: string; onDownload: () => void; onReset: () => void }) {
  return <section className="panel narrow"><p className="eyebrow">实验完成</p><h1>感谢您的参与！</h1>
    <p>请下载本次实验的数据文件，并按研究者的说明提交。</p>
    <button className="primary" disabled={busy} onClick={onDownload}>{busy ? '正在生成文件…' : '下载实验数据'}</button>
    {status && <p className="notice" role="status">{status}</p>}
    <div className="reset-section"><p className="muted">文件保存后，可为下一位参与者开始新实验。</p><button disabled={busy} onClick={onReset}>开始新实验</button></div>
  </section>;
}
