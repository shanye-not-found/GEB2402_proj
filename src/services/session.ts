import type { ExperimentConfig, Mode, SessionState } from '../domain/types';
import { advanceClock, createSession, makeRecord, parseHundredths, summarize } from '../domain/experiment';

const STORAGE_KEY = 'geb2402.session.v1.2';
const LEGACY_STORAGE_KEY = 'geb2402.session.v1.1';

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
  const stages = ['consent', 'name', 'instructions', 'shopping', 'price', 'weight', 'questionnaire', 'complete'];
  if (state.storageVersion !== '1.2' || state.config?.configVersion !== config.configVersion || !stages.includes(state.stage) || !['demo', 'research'].includes(state.mode) || typeof state.nameDraft !== 'string' || typeof state.priceDraft !== 'string' || typeof state.weightDraft !== 'string' || !['', 'yes', 'no', 'unsure'].includes(state.budgetPerceptionDraft) || !Array.isArray(state.priceSubmissions) || !state.answers || typeof state.answers !== 'object') throw new Error('当前记录版本不兼容或内容损坏。');
  if (state.stage !== 'consent' && (!state.sessionId || !state.consentAcceptedAt || !Number.isFinite(Date.parse(state.consentAcceptedAt)))) throw new Error('当前记录缺少参与确认。');
  if (!['consent', 'name'].includes(state.stage) && (Array.from(state.nameDraft.trim()).length === 0 || Array.from(state.nameDraft.trim()).length > 80)) throw new Error('当前记录缺少姓名。');
  if (['shopping', 'price', 'weight', 'questionnaire', 'complete'].includes(state.stage)) {
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
  if (['weight', 'questionnaire', 'complete'].includes(state.stage) && state.priceSubmissions.length === 0) throw new Error('尚未提交有效预期价格。');
  if (['questionnaire', 'complete'].includes(state.stage) && (!state.estimate || parseHundredths(state.weightDraft, true) === null || state.estimate.priceExpectationRevision !== state.priceSubmissions.length)) throw new Error('重量尚未绑定最新价格。');
  if (['questionnaire', 'complete'].includes(state.stage) && (!state.budgetPerception || !['yes', 'no', 'unsure'].includes(state.budgetPerception.answer))) throw new Error('尚未回答超预算感受问题。');
  if (state.stage === 'complete') makeRecord(state);
}

export function loadSession(config: ExperimentConfig, mode: Mode): { state: SessionState; error: string } {
  const fallback = createSession(config, mode);
  try {
    const text = sessionStorage.getItem(STORAGE_KEY);
    if (!text) {
      if (sessionStorage.getItem(LEGACY_STORAGE_KEY)) throw new Error('当前记录属于旧预算与旧问题版本，请清除旧演示记录后重新开始。');
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
  sessionStorage.removeItem(LEGACY_STORAGE_KEY);
}
