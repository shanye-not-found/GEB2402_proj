import type { AnswerDraft, Question, ReflectionDraft, SessionState } from './types';
import { actualUnitFen, expectedTotalFen } from '../../shared/export-format.mjs';

export function formatYuan(fen: number): string {
  return (fen / 100).toFixed(2);
}

export const reflectionChoices = [
  { id: 'yes', label: '是' }, { id: 'no', label: '否' }, { id: 'unsure', label: '不确定' },
] as const;

export function reflectionReason(close: ReflectionDraft['close']): string {
  if (close === 'yes') return '是什么让您当时觉得花费接近预算？';
  if (close === 'no') return '您当时认为花费和预算有什么差距？为什么？';
  return '哪些因素让您当时不确定花费是否接近预算？';
}

export function priceFeedback(state: SessionState) {
  const final = state.shopping?.final;
  const price = state.priceSubmissions.at(-1);
  if (!final || !price || !state.estimate) throw new Error('必须先确认购物和估算结果。');
  return {
    expectedUnitFen: price.priceFen,
    expectedTotalPriceFen: expectedTotalFen(price.priceFen, Math.round(state.estimate.totalWeightGrams * 100)),
    actualTotalFen: final.totalPriceFen,
    actualPricePer500gFen: actualUnitFen(final.totalPriceFen, final.totalWeightGrams),
    budgetDifferenceFen: final.totalPriceFen - state.config.budgetFen,
  };
}

export function visibleQuestions(state: SessionState): Question[] {
  const final = state.shopping?.final;
  if (!final) return [];
  return state.config.questions.filter(question => {
    if (question.id === 'budget-reflection') return final.totalPriceFen - state.config.budgetFen >= state.config.budgetReflectionThresholdFen;
    if (question.id === 'price-value') return final.totalWeightGrams > 0;
    return true;
  });
}

export function questionContext(question: Question, feedback: ReturnType<typeof priceFeedback>, porkReferenceFen: number): string {
  if (question.id === 'budget-reflection') return `您的实际花费比预算高 ${formatYuan(feedback.budgetDifferenceFen)} 元。`;
  if (question.id === 'price-value' && feedback.actualPricePer500gFen !== null) {
    return `您购买的零食实际花费为 ${formatYuan(feedback.actualPricePer500gFen)} 元/500g。本题以嫩牛肉约 ${porkReferenceFen / 100} 元/500g 作为比较基准。`;
  }
  return '';
}

export function validAnswer(question: Question, value: AnswerDraft | undefined, complete: boolean): boolean {
  if (question.kind === 'reflection') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !('anticipated' in value)) return false;
    const allowed = (choice: ReflectionDraft['close']) => (!complete && choice === '') || reflectionChoices.some(option => option.id === choice);
    return allowed(value.anticipated) && allowed(value.close) && typeof value.reason === 'string' &&
      value.reason.length <= question.maxLength && (!complete || Boolean(value.reason.trim()));
  }
  const allowed = new Set(question.options.map(option => option.id));
  if (question.kind === 'choice') return typeof value === 'string' && allowed.has(value);
  if (question.kind === 'reasoned-choice') {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'choice' in value &&
      allowed.has(value.choice) && typeof value.reason === 'string' && value.reason.length <= question.maxLength &&
      (!complete || value.reason.trim()));
  }
  if (!Array.isArray(value) || value.length !== 3) return false;
  const selected = value.filter(id => id !== '');
  return (!complete || selected.length === 3) && new Set(selected).size === selected.length && selected.every(id => allowed.has(id));
}
