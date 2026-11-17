import { useState } from 'react';

export function ConsentPage({ onContinue }: { onContinue: () => void }) {
  const [agreed, setAgreed] = useState(false);
  return <section className="panel narrow">
    <p className="eyebrow">参与确认</p>
    <h1>欢迎参加零食选购实验</h1>
    <p>本次采集的数据仅用于 GEB2402 小组项目，不会用于其他用途。</p>
    <p>我们将记录您的姓名、选购结果及问卷回答，实验结束后由您下载加密数据文件。</p>
    <label className="checkbox-label"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} />我已阅读并同意参与本次数据采集</label>
    <button className="primary" disabled={!agreed} onClick={onContinue}>下一步</button>
  </section>;
}
