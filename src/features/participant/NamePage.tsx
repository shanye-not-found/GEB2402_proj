export function NamePage({ value, onChange, onNext, onBack }: { value: string; onChange: (value: string) => void; onNext: () => void; onBack: () => void }) {
  return <section className="panel narrow">
    <p className="eyebrow">基本信息</p><h1>请填写您的真实姓名</h1>
    <form noValidate onSubmit={event => { event.preventDefault(); onNext(); }}>
      <label htmlFor="real-name">真实姓名</label>
      <input id="real-name" autoFocus autoComplete="off" value={value} maxLength={160} onChange={event => onChange(event.target.value)} />
      <div className="actions"><button type="button" onClick={onBack}>返回</button><button className="primary" type="submit">下一步</button></div>
    </form>
  </section>;
}
