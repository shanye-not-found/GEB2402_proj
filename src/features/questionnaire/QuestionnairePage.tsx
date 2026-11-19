import type { AnswerDraft, Question, ReflectionDraft } from '../../domain/types';
import { formatYuan, questionContext, reflectionChoices, reflectionReason, type priceFeedback } from '../../domain/questionnaire';
import { RankingInput } from './RankingInput';

function ReflectionInput({ value, maxLength, onChange }: { value: ReflectionDraft; maxLength: number; onChange: (value: ReflectionDraft) => void }) {
  return <>
    <fieldset className="reflection-choice">
      <legend>您事先有预料到会超出预算这么多吗？</legend>
      <div className="survey-choices">{reflectionChoices.map(option => <label key={option.id}>
        <input type="radio" name="anticipated-budget-gap" value={option.id} checked={value.anticipated === option.id} onChange={() => onChange({ ...value, anticipated: option.id })} />
        {option.label}
      </label>)}</div>
    </fieldset>
    <fieldset className="reflection-choice">
      <legend>您当时觉得自己的花费接近预算吗？</legend>
      <div className="survey-choices">{reflectionChoices.map(option => <label key={option.id}>
        <input type="radio" name="felt-close-to-budget" value={option.id} checked={value.close === option.id} onChange={() => onChange({ ...value, close: option.id, reason: '' })} />
        {option.label}
      </label>)}</div>
    </fieldset>
    {value.close && <div className="survey-written">
      <label htmlFor="budget-reason">{reflectionReason(value.close)}</label>
      <textarea id="budget-reason" className="survey-text" rows={4} maxLength={maxLength} placeholder="请写下您当时的想法…" value={value.reason} onChange={event => onChange({ ...value, reason: event.target.value })} />
      <p className="text-count">{value.reason.length} / {maxLength}</p>
    </div>}
  </>;
}

interface QuestionnaireProps {
  feedback: ReturnType<typeof priceFeedback>;
  porkReferenceFen: number;
  questions: Question[];
  answers: Record<string, AnswerDraft>;
  error: string;
  onAnswer: (id: string, value: AnswerDraft) => void;
  onSubmit: () => void;
}

export function QuestionnairePage({ feedback, porkReferenceFen, questions, answers, error, onAnswer, onSubmit }: QuestionnaireProps) {
  const facts = [
    { label: '实际总花费', value: `¥${formatYuan(feedback.actualTotalFen)}`, unit: '' },
    { label: '实际单价（每斤）', value: feedback.actualPricePer500gFen === null ? '未购买商品' : `¥${formatYuan(feedback.actualPricePer500gFen)}`, unit: feedback.actualPricePer500gFen === null ? '' : '/ 500g' },
    { label: '您的预计总花费', value: `¥${formatYuan(feedback.expectedTotalPriceFen)}`, unit: '' },
    { label: '您填写的预期单价', value: `¥${formatYuan(feedback.expectedUnitFen)}`, unit: '/ 500g' },
  ];
  return <section className="panel narrow survey-panel">
    <p className="eyebrow">选购结果与问卷</p>
    <h1>实际花费与您的估算</h1>
    <dl className="price-feedback">{facts.map(({ label, value, unit }) =>
      <div key={label}><dt>{label}</dt><dd>{value}{unit && <small> {unit}</small>}</dd></div>
    )}</dl>
    <form noValidate onSubmit={event => { event.preventDefault(); onSubmit(); }}>
      {questions.map((question, index) => {
        const answer = answers[question.id];
        const context = questionContext(question, feedback, porkReferenceFen);
        const scale = question.id === 'repurchase';
        return <fieldset className="survey-question" key={question.id}>
          <legend><span className="question-number" aria-hidden="true">{index + 1}</span>{question.prompt}</legend>
          {context && <p className="survey-context">{context}</p>}
          {question.kind === 'reflection'
            ? <ReflectionInput value={answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : { anticipated: '', close: '', reason: '' }} maxLength={question.maxLength} onChange={value => onAnswer(question.id, value)} />
            : question.kind === 'rank'
              ? <RankingInput options={question.options} value={Array.isArray(answer) ? answer : ['', '', '']} onChange={value => onAnswer(question.id, value)} />
              : <>
                <div className={scale ? 'survey-choices survey-scale' : 'survey-choices'}>
                  {question.options.map(option => <label key={option.id}>
                    <input type="radio" name={question.id} value={option.id} checked={answer === option.id} onChange={() => onAnswer(question.id, option.id)} />
                    <span className={scale ? 'visually-hidden' : undefined}>{option.label}</span>
                    {scale && <span aria-hidden="true">{option.id}</span>}
                  </label>)}
                </div>
                {scale && <div className="scale-ends" aria-hidden="true"><span>完全不愿意</span><span>非常愿意</span></div>}
              </>}
        </fieldset>;
      })}
      {error && <p className="notice error" role="alert">{error}</p>}
      <button className="primary" type="submit">提交问卷</button>
    </form>
  </section>;
}
