import type { ExperimentConfig, Mode, SessionState } from '../domain/types';
import { advanceClock, createSession, makeRecord, parseHundredths, summarize } from '../domain/experiment';
import { priceFeedback, validAnswer, visibleQuestions } from '../domain/questionnaire';

const STORAGE_KEY = 'geb2402.session.v1.3';
const LEGACY_STORAGE_KEYS = ['geb2402.session.v1.1', 'geb2402.session.v1.2'];

export function probeStorage(): void {
  const key = 'geb2402.storage-probe';
  try {
    sessionStorage.setItem(key, '1');
    sessionStorage.removeItem(key);
  } catch {
    throw new Error('当前浏览器无法可靠保存本标签页进度，请允许会话存储后再开始。');
  }
}

/** 存储只来自本应用，但恢复前仍检查步骤与关键依赖，避免错版或损坏记录跳过流程。 */
function assertStoredSession(value: unknown, config: ExperimentConfig): asserts value is SessionState {
  if (!value || typeof value !== 'object') throw new Error('当前记录不是有效实验状态。');
  const state = value as SessionState;
  const postEstimate = ['questionnaire', 'complete'];
  const stages = ['consent', 'name', 'instructions', 'shopping', 'price', 'weight', ...postEstimate];
  if (state.storageVersion !== '1.3' || state.config?.configVersion !== config.configVersion || !stages.includes(state.stage) || !['demo', 'research'].includes(state.mode) || typeof state.nameDraft !== 'string' || typeof state.priceDraft !== 'string' || typeof state.weightDraft !== 'string' || !['', 'yes', 'no', 'unsure'].includes(state.budgetPerceptionDraft) || !Array.isArray(state.priceSubmissions) || !state.answers || typeof state.answers !== 'object') throw new Error('当前记录版本不兼容或内容损坏。');
  if (state.stage !== 'consent' && (!state.sessionId || !state.consentAcceptedAt || !Number.isFinite(Date.parse(state.consentAcceptedAt)))) throw new Error('当前记录缺少参与确认。');
  if (!['consent', 'name'].includes(state.stage) && (Array.from(state.nameDraft.trim()).length === 0 || Array.from(state.nameDraft.trim()).length > 80)) throw new Error('当前记录缺少姓名。');
  if (['shopping', 'price', 'weight', ...postEstimate].includes(state.stage)) {
    const shopping = state.shopping;
    if (!state.catalog || !Array.isArray(state.catalog.products) || state.catalog.products.length === 0 || !state.publicKey || !shopping || !['initial', 'extension'].includes(shopping.phase) || !Number.isSafeInteger(shopping.deadlineAt) || !Number.isSafeInteger(shopping.startedAt) || !Number.isSafeInteger(shopping.phaseStartedAt) || !Array.isArray(shopping.phases) || !shopping.quantities || typeof shopping.quantities !== 'object') throw new Error('当前记录缺少商品快照或计时信息。');
    summarize(state.catalog, shopping.quantities);
    if (state.stage !== 'shopping' && (!shopping.final || shopping.endedAt === null)) throw new Error('购物结果尚未冻结。');
  }
  let lastTime = state.shopping?.endedAt ?? 0;
  for (let index = 0; index < state.priceSubmissions.length; index += 1) {
    const submission = state.priceSubmissions[index];
    const time = Date.parse(submission.submittedAt);
    if (submission.revision !== index + 1 || !Number.isSafeInteger(submission.priceFen) || submission.priceFen <= 0 || !Number.isFinite(time) || time < lastTime) throw new Error('价格提交记录无效。');
    lastTime = time;
  }
  if (['weight', ...postEstimate].includes(state.stage) && state.priceSubmissions.length === 0) throw new Error('尚未提交有效预期价格。');
  if (postEstimate.includes(state.stage)) {
    if (!state.estimate || parseHundredths(state.weightDraft, true) !== Math.round(state.estimate.totalWeightGrams * 100) || state.estimate.priceExpectationRevision !== state.priceSubmissions.length) throw new Error('重量尚未绑定最新价格。');
    if (!state.budgetPerception || !['yes', 'no', 'unsure'].includes(state.budgetPerception.answer)) throw new Error('尚未回答超预算感受问题。');
    priceFeedback(state);
    const questions = visibleQuestions(state);
    for (const [id, value] of Object.entries(state.answers)) {
      const question = questions.find(candidate => candidate.id === id);
      if (!question || !validAnswer(question, value, false)) throw new Error('问卷草稿记录无效。');
    }
  }
  if (state.stage === 'complete') makeRecord(state);
}

export function loadSession(config: ExperimentConfig, mode: Mode): { state: SessionState; error: string } {
  const fallback = createSession(config, mode);
  try {
    const text = sessionStorage.getItem(STORAGE_KEY);
    if (!text) {
      if (LEGACY_STORAGE_KEYS.some(key => sessionStorage.getItem(key))) throw new Error('当前标签页保留了旧版实验。若还需要该记录，请另开标签页；否则可清除记录后重新开始。');
      return { state: fallback, error: '' };
    }
    const stored: unknown = JSON.parse(text);
    assertStoredSession(stored, config);
    if (stored.mode !== mode) throw new Error('当前标签页记录与所打开的演示/正式模式不一致。');
    return { state: advanceClock(stored, Date.now()), error: '' };
  } catch (error) {
    return { state: fallback, error: error instanceof Error ? error.message : '当前实验记录无法恢复。' };
  }
}

export function saveSession(state: SessionState): void {
  if (state.sessionId) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  for (const key of LEGACY_STORAGE_KEYS) sessionStorage.removeItem(key);
}
