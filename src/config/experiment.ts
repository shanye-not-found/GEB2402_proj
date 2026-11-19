import type { ExperimentConfig } from '../domain/types';

export const EXPERIMENT: ExperimentConfig = {
  experimentId: 'GEB2402',
  appVersion: '1.3.1',
  configVersion: '1.3.1',
  noticeVersion: '1.0',
  questionnaireVersion: '1.1-ranking-preview',
  questionnaireIsPlaceholder: true,
  budgetFen: 15000,
  initialDurationMs: 60000,
  extensionThresholdFen: 7500,
  extensionDurationMs: 30000,
  priceExpectationBasisWeightGrams: 500,
  budgetReflectionThresholdFen: 3000,
  porkReferenceFen: 5000,
  questions: [
    { id: 'budget-reflection', kind: 'reflection', prompt: '回顾您当时对预算的判断', maxLength: 2000 },
    { id: 'price-value', kind: 'reasoned-choice', prompt: '和这个价格相比，您觉得刚才买的零食划算还是偏贵？', maxLength: 2000, options: [
      { id: 'good-value', label: '划算', reasonPrompt: '为什么您觉得这些零食划算？' },
      { id: 'about-right', label: '价格适中', reasonPrompt: '为什么您觉得这些零食价格适中？' },
      { id: 'expensive', label: '偏贵', reasonPrompt: '为什么您觉得这些零食偏贵？' },
      { id: 'unsure', label: '不确定', reasonPrompt: '为什么您不确定这些零食是否划算？' },
    ] },
    { id: 'repurchase', kind: 'choice', prompt: '知道这些数据后，您还有多大意愿购买刚才的零食？', options: [
      { id: '1', label: '1 · 完全不愿意' }, { id: '2', label: '2 · 不太愿意' }, { id: '3', label: '3 · 一般' },
      { id: '4', label: '4 · 比较愿意' }, { id: '5', label: '5 · 非常愿意' },
    ] },
    { id: 'purchase-ranking', kind: 'rank', prompt: '挑选时，哪些因素最影响您的购买意愿？请按重要程度选出前三项。', options:
      ['A', 'B', 'C', 'D', 'E', 'F'].map(letter => ({ id: letter, label: `选项 ${letter}` })),
    },
  ],
};
