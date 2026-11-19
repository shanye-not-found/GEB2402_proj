import type { BudgetPerceptionAnswer } from '../../domain/types';
import { parseHundredths } from '../../domain/experiment';
import { formatYuan } from '../../domain/questionnaire';
import { expectedTotalFen } from '../../../shared/export-format.mjs';

interface ExperimentQuestionsProps {
  priceDraft: string;
  weightDraft: string;
  budgetAnswer: BudgetPerceptionAnswer | '';
  priceConfirmed: boolean;
  priceFen: number | null;
  onPriceChange: (value: string) => void;
  onPriceConfirm: () => void;
  onEditPrice: () => void;
  onWeightChange: (value: string) => void;
  onBudgetChange: (value: BudgetPerceptionAnswer) => void;
  onNext: () => void;
}

/** 同页展示三问，仍先确认价格，再共同确认重量与主观预算判断。 */
export function ExperimentQuestionsPage(props: ExperimentQuestionsProps) {
  const weightHundredths = parseHundredths(props.weightDraft, true);
  let totalFen: number | null = null;
  let outOfRange = false;
  if (props.priceConfirmed && props.priceFen !== null && weightHundredths !== null) {
    try { totalFen = expectedTotalFen(props.priceFen, weightHundredths); }
    catch { outOfRange = true; }
  }
  return <section className="panel narrow">
    <p className="eyebrow">选购后的回答</p><h1>请回答三个问题</h1>
    <section className="estimate-question">
      <h2>1. 您对零食价格的预期是多少？</h2><p>您认为每 500 克零食应当是多少钱？</p>
      <form noValidate onSubmit={event => { event.preventDefault(); if (!props.priceConfirmed) props.onPriceConfirm(); }}>
        <label htmlFor="expected-price">预期价格</label>
        <div className="input-with-unit"><input id="expected-price" type="text" inputMode="decimal" autoComplete="off" readOnly={props.priceConfirmed} value={props.priceDraft} onChange={event => props.onPriceChange(event.target.value)} /><span>元 / 500g</span></div>
        {/* 分开按钮身份并取消默认动作，避免改价时React复用按钮导致意外提交。 */}
        {props.priceConfirmed ? <button key="edit-price" type="button" onClick={event => { event.preventDefault(); props.onEditPrice(); }}>修改预期价格</button> : <button key="confirm-price" className="primary" type="submit">确认预期价格</button>}
      </form>
    </section>
    <form noValidate onSubmit={event => { event.preventDefault(); props.onNext(); }}>
      <section className="estimate-question">
        <h2>2. 您估计刚才购买的零食总共多少克？</h2>
        {props.priceConfirmed && props.priceFen !== null
          ? <p className="notice">您填写的预期价格：<strong>¥{(props.priceFen / 100).toFixed(2)} / 500g</strong></p>
          : <p className="muted">请先确认上方的预期价格，再根据该价格估计购买总重量。</p>}
        <label htmlFor="estimated-weight">估计总重量</label><div className="input-with-unit"><input id="estimated-weight" type="text" inputMode="decimal" autoComplete="off" disabled={!props.priceConfirmed} value={props.weightDraft} onChange={event => props.onWeightChange(event.target.value)} /><span>克</span></div>
        <div className="estimate-result" role="status">
          <span>预计总花费</span>
          {totalFen !== null
            ? <><strong>¥{formatYuan(totalFen)}</strong><p>预期单价 ×（估计总重量 ÷ 500 克）</p></>
            : <p>{outOfRange ? '计算结果超出可记录范围，请检查输入。' : '填完有效克重后，这里会显示预计总花费。'}</p>}
        </div>
      </section>
      <fieldset className="estimate-question budget-options" disabled={totalFen === null}>
        <legend>3. 您是否觉得自己花超预算了？</legend>
        <p className="muted">看过上方的预计总花费后，请按您的判断选择。提交前仍可修改预期价格或克重。</p>
        <label><input type="radio" name="budget-perception" value="yes" checked={props.budgetAnswer === 'yes'} onChange={() => props.onBudgetChange('yes')} />是，我觉得超预算了</label>
        <label><input type="radio" name="budget-perception" value="no" checked={props.budgetAnswer === 'no'} onChange={() => props.onBudgetChange('no')} />否，我觉得没有超预算</label>
        <label><input type="radio" name="budget-perception" value="unsure" checked={props.budgetAnswer === 'unsure'} onChange={() => props.onBudgetChange('unsure')} />不确定</label>
      </fieldset>
      <button className="primary" disabled={!props.priceConfirmed} type="submit">确认并继续</button>
    </form>
  </section>;
}
