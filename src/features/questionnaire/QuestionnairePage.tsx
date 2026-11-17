import type { Question } from '../../domain/types';

export function QuestionnairePage({ questions, answers, onAnswer, onSubmit }: { questions: Question[]; answers: Record<string, string>; onAnswer: (id: string, value: string) => void; onSubmit: () => void }) {
  return <section className="panel narrow"><p className="eyebrow">问卷</p><h1>还有几个问题</h1>
    <form noValidate onSubmit={event => { event.preventDefault(); onSubmit(); }}>
      {questions.map(question => <div className="question" key={question.id}><label htmlFor={question.id}>{question.prompt}{!question.required && <span className="muted">（选填）</span>}</label><textarea id={question.id} rows={4} maxLength={question.maxLength} value={answers[question.id] ?? ''} onChange={event => onAnswer(question.id, event.target.value)} /></div>)}
      <button className="primary" type="submit">提交问卷</button>
    </form>
  </section>;
}
