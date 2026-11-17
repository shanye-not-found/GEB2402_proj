import type { ExperimentConfig } from '../domain/types';

export const EXPERIMENT: ExperimentConfig = {
  experimentId: 'GEB2402',
  appVersion: '1.2.0',
  configVersion: '1.2.0',
  noticeVersion: '1.0',
  questionnaireVersion: 'placeholder-1.0',
  questionnaireIsPlaceholder: true,
  budgetFen: 15000,
  initialDurationMs: 60000,
  extensionThresholdFen: 7500,
  extensionDurationMs: 30000,
  priceExpectationBasisWeightGrams: 500,
  questions: [
    { id: 'q1', prompt: '问题 1（待替换）', required: false, maxLength: 2000 },
    { id: 'q2', prompt: '问题 2（待替换）', required: false, maxLength: 2000 },
    { id: 'q3', prompt: '问题 3（待替换）', required: false, maxLength: 2000 },
  ],
};
