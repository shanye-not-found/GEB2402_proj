import type { Catalog, Event, ExperimentConfig, ExperimentRecord, Mode, PhaseRecord, ReasonedChoiceDraft, ReflectionDraft, SessionState, Summary } from './types';
import { assertRecord, expectedTotalFen } from '../../shared/export-format.mjs';
import { priceFeedback, questionContext, reflectionChoices, reflectionReason, validAnswer, visibleQuestions } from './questionnaire';

export function createSession(config: ExperimentConfig, mode: Mode): SessionState {
  return {
    storageVersion: '1.3', stage: 'consent', mode, sessionId: null, consentAcceptedAt: null,
    nameDraft: '', config: structuredClone(config), catalog: null, publicKey: null, shopping: null,
    priceDraft: '', weightDraft: '', priceSubmissions: [], estimate: null, budgetPerceptionDraft: '', budgetPerception: null, answers: {},
    completedAt: null, viewport: { viewportWidth: 0, viewportHeight: 0 }, error: '',
  };
}

/** 十进制文本转为整数百分之一单位，避免金额乘100产生浮点阈值误差。 */
export function parseHundredths(raw: string, allowZero: boolean): number | null {
  const value = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, decimals = ''] = value.split('.');
  const hundredths = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(hundredths) || hundredths < (allowZero ? 0 : 1)) return null;
  return hundredths;
}

export function summarize(catalog: Catalog, quantities: Record<string, number>): Summary {
  const result: Summary = { totalPriceFen: 0, totalWeightGrams: 0, totalQuantity: 0, distinctProductCount: 0, items: [] };
  const known = new Set<string>();
  for (const product of catalog.products) {
    known.add(product.id);
    const quantity = quantities[product.id] ?? 0;
    if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('商品数量无效。');
    if (quantity === 0) continue;
    const price = quantity * product.unitPriceFen, weight = quantity * product.unitWeightGrams;
    if (!Number.isSafeInteger(price) || !Number.isSafeInteger(weight)) throw new Error('商品数量超出安全范围。');
    result.items.push({ productId: product.id, name: product.name, unitPriceFen: product.unitPriceFen, unitWeightGrams: product.unitWeightGrams, quantity, subtotalPriceFen: price, subtotalWeightGrams: weight });
    result.totalPriceFen += price;
    result.totalWeightGrams += weight;
    result.totalQuantity += quantity;
    result.distinctProductCount += 1;
  }
  for (const id of Object.keys(quantities)) if (!known.has(id)) throw new Error('购物车包含未知商品。');
  if (![result.totalPriceFen, result.totalWeightGrams, result.totalQuantity].every(Number.isSafeInteger)) throw new Error('购买合计超出安全范围。');
  return result;
}

/** 单次阶段结算：首轮低于门槛才加时，追加结束后总是冻结购物结果。 */
function finishPhase(state: SessionState, reason: 'manual' | 'timeout', endedAt: number): SessionState {
  const shopping = state.shopping;
  if (!shopping || !state.catalog) return state;
  const summary = summarize(state.catalog, shopping.quantities);
  const phase: PhaseRecord = {
    ...summary, phase: shopping.phase, startedAt: new Date(shopping.phaseStartedAt).toISOString(),
    deadlineAt: new Date(shopping.deadlineAt).toISOString(), endedAt: new Date(endedAt).toISOString(),
    elapsedMs: endedAt - shopping.phaseStartedAt, endReason: reason,
  };
  const phases = [...shopping.phases, phase];
  if (shopping.phase === 'initial' && summary.totalPriceFen < state.config.extensionThresholdFen) {
    return { ...state, shopping: { ...shopping, phases, phase: 'extension', phaseStartedAt: endedAt, deadlineAt: endedAt + state.config.extensionDurationMs, extensionApplied: true } };
  }
  return { ...state, stage: 'price', shopping: { ...shopping, phases, endedAt, final: summary } };
}

/** 绝对截止时间用于后台恢复：最多推进两轮，不因延迟回调赠送额外时间。 */
export function advanceClock(state: SessionState, now: number): SessionState {
  let current = state;
  while (current.stage === 'shopping' && current.shopping && now >= current.shopping.deadlineAt) {
    current = finishPhase(current, 'timeout', current.shopping.deadlineAt);
  }
  return current;
}

export function transition(previous: SessionState, event: Event): SessionState {
  // 超时先于加减、结账生效；旧首轮事件不能在同一处理周期变成追加结账。
  const state = advanceClock(previous, event.now);
  if (event.type === 'TICK') return state;
  try {
    switch (event.type) {
      case 'CONSENT':
        if (state.stage !== 'consent') return state;
        return { ...state, stage: 'name', sessionId: state.sessionId || event.sessionId, consentAcceptedAt: state.consentAcceptedAt || new Date(event.now).toISOString(), error: '' };
      case 'NAME_DRAFT':
        return state.stage === 'name' ? { ...state, nameDraft: event.value, error: '' } : state;
      case 'CONFIRM_NAME':
        if (state.stage !== 'name') return state;
        if (Array.from(state.nameDraft.trim()).length < 1 || Array.from(state.nameDraft.trim()).length > 80) throw new Error('请填写1～80个字符的真实姓名。');
        return { ...state, nameDraft: state.nameDraft.trim(), stage: 'instructions', error: '' };
      case 'BACK_TO_CONSENT':
        return state.stage === 'name' ? { ...state, stage: 'consent', error: '' } : state;
      case 'START':
        if (state.stage !== 'instructions') return state;
        return {
          ...state, stage: 'shopping', catalog: structuredClone(event.catalog), publicKey: structuredClone(event.publicKey), viewport: event.viewport, error: '',
          shopping: { startedAt: event.now, phase: 'initial', phaseStartedAt: event.now, deadlineAt: event.now + state.config.initialDurationMs, quantities: {}, phases: [], extensionApplied: false, endedAt: null, final: null },
        };
      case 'ADD':
      case 'REMOVE': {
        if (state.stage !== 'shopping' || !state.shopping || !state.catalog || state.shopping.phase !== event.phase || previous.shopping?.phase !== state.shopping.phase) return state;
        const quantity = state.shopping.quantities[event.productId] ?? 0;
        const quantities = { ...state.shopping.quantities, [event.productId]: Math.max(0, quantity + (event.type === 'ADD' ? 1 : -1)) };
        summarize(state.catalog, quantities);
        return { ...state, shopping: { ...state.shopping, quantities }, error: '' };
      }
      case 'CHECKOUT':
        if (state.stage !== 'shopping' || !state.shopping || state.shopping.phase !== event.phase || previous.shopping?.phase !== state.shopping.phase) return state;
        return finishPhase({ ...state, error: '' }, 'manual', event.now);
      case 'PRICE_DRAFT':
        return state.stage === 'price' ? { ...state, priceDraft: event.value, error: '' } : state;
      case 'WEIGHT_DRAFT':
        return state.stage === 'weight' && event.value !== state.weightDraft ? { ...state, weightDraft: event.value, budgetPerceptionDraft: '', error: '' } : state;
      case 'SUBMIT_PRICE': {
        if (state.stage !== 'price') return state;
        const priceFen = parseHundredths(state.priceDraft, false);
        if (priceFen === null) throw new Error('请输入大于0且最多两位小数的预期价格。');
        const submission = { revision: state.priceSubmissions.length + 1, priceFen, submittedAt: new Date(event.now).toISOString() };
        return { ...state, stage: 'weight', estimate: null, budgetPerception: null, priceSubmissions: [...state.priceSubmissions, submission], error: '' };
      }
      case 'EDIT_PRICE':
        return state.stage === 'weight' ? { ...state, stage: 'price', estimate: null, budgetPerception: null, budgetPerceptionDraft: '', error: '' } : state;
      case 'BUDGET_PERCEPTION_DRAFT':
        if (state.stage !== 'weight' || parseHundredths(state.weightDraft, true) === null || !['yes', 'no', 'unsure'].includes(event.value)) return state;
        return { ...state, budgetPerceptionDraft: event.value, error: '' };
      case 'SUBMIT_WEIGHT': {
        const price = state.priceSubmissions.at(-1);
        if (state.stage !== 'weight' || !price) return state;
        const hundredths = parseHundredths(state.weightDraft, true);
        if (hundredths === null) throw new Error('请输入大于等于0且最多两位小数的估计重量。');
        expectedTotalFen(price.priceFen, hundredths);
        if (!['yes', 'no', 'unsure'].includes(state.budgetPerceptionDraft)) throw new Error('请选择您是否觉得自己花超预算了。');
        const answer = state.budgetPerceptionDraft;
        if (answer !== 'yes' && answer !== 'no' && answer !== 'unsure') return state;
        const submittedAt = new Date(event.now).toISOString();
        return { ...state, stage: 'questionnaire', estimate: { totalWeightGrams: hundredths / 100, priceExpectationRevision: state.priceSubmissions.length, submittedAt }, budgetPerception: { answer, submittedAt }, error: '' };
      }
      case 'ANSWER': {
        if (state.stage !== 'questionnaire') return state;
        const question = visibleQuestions(state).find(question => question.id === event.questionId);
        if (!question || !validAnswer(question, event.value, false)) return state;
        return { ...state, answers: { ...state.answers, [question.id]: event.value }, error: '' };
      }
      case 'COMPLETE':
        if (state.stage !== 'questionnaire') return state;
        for (const question of visibleQuestions(state)) {
          const answer = state.answers[question.id];
          if (validAnswer(question, answer, true)) continue;
          if (question.kind === 'reasoned-choice' && validAnswer(question, answer, false)) throw new Error('请填写您作出价格判断的原因。');
          throw new Error(`请完成：${question.prompt}`);
        }
        return { ...state, stage: 'complete', completedAt: new Date(event.now).toISOString(), error: '' };
      case 'ERROR':
        return { ...state, error: event.message };
    }
  } catch (error) {
    return { ...state, error: error instanceof Error ? error.message : '本次操作未完成，请重试。' };
  }
}

export function makeRecord(state: SessionState): ExperimentRecord {
  const shopping = state.shopping;
  if (state.stage !== 'complete' || !state.sessionId || !state.consentAcceptedAt || !state.catalog || !shopping?.final || shopping.endedAt === null || !state.estimate || !state.budgetPerception || !state.completedAt || state.priceSubmissions.length === 0) throw new Error('实验尚未完成，不能导出。');
  const config = state.config;
  const feedback = priceFeedback(state);
  const { expectedTotalPriceFen, actualPricePer500gFen, budgetDifferenceFen } = feedback;
  const questionnaire = visibleQuestions(state).map(question => {
    const value = state.answers[question.id];
    if (!validAnswer(question, value, true)) throw new Error(`缺少回答：${question.prompt}`);
    const context = questionContext(question, feedback, config.porkReferenceFen);
    if (question.kind === 'reflection') {
      const reflection = value as ReflectionDraft;
      const label = (id: string) => reflectionChoices.find(option => option.id === id)!.label;
      const prompt = `${context}\n事先预料到会超出这么多吗？当时觉得花费接近预算吗？${reflectionReason(reflection.close)}`;
      return { questionId: question.id, prompt, answer: `事先预料到：${label(reflection.anticipated)}；觉得接近预算：${label(reflection.close)}。原因：${reflection.reason.trim()}`, choiceIds: [reflection.anticipated, reflection.close] };
    }
    const prompt = context ? `${context}\n${question.prompt}` : question.prompt;
    if (question.kind === 'reasoned-choice') {
      const { choice, reason } = value as ReasonedChoiceDraft;
      const option = question.options.find(candidate => candidate.id === choice)!;
      return { questionId: question.id, prompt: `${prompt}\n${option.reasonPrompt}`, answer: `${option.label}。原因：${reason.trim()}`, choiceIds: [choice], reason: reason.trim() };
    }
    const choiceIds = Array.isArray(value) ? value : [value as string];
    const labels = choiceIds.map(id => question.options.find(option => option.id === id)!.label);
    return { questionId: question.id, prompt, answer: question.kind === 'rank' ? labels.map((label, index) => `${index + 1}. ${label}`).join('；') : labels[0], choiceIds };
  });
  const record: ExperimentRecord = {
    schemaVersion: '1.3', experimentId: 'GEB2402', mode: state.mode, sessionId: state.sessionId,
    appVersion: config.appVersion, configVersion: config.configVersion, catalogVersion: state.catalog.catalogVersion, questionnaireVersion: config.questionnaireVersion,
    participant: { realName: state.nameDraft.trim() }, consent: { accepted: true, noticeVersion: config.noticeVersion, acceptedAt: state.consentAcceptedAt },
    task: { budgetFen: config.budgetFen, initialDurationMs: config.initialDurationMs, extensionThresholdFen: config.extensionThresholdFen, extensionDurationMs: config.extensionDurationMs, priceExpectationBasisWeightGrams: 500, budgetReflectionThresholdFen: config.budgetReflectionThresholdFen, porkReferenceFen: config.porkReferenceFen },
    shopping: { startedAt: new Date(shopping.startedAt).toISOString(), endedAt: new Date(shopping.endedAt).toISOString(), extensionApplied: shopping.extensionApplied, phases: shopping.phases, final: shopping.final },
    priceExpectation: { basisWeightGrams: 500, priceFen: state.priceSubmissions.at(-1)!.priceFen, submissions: state.priceSubmissions },
    estimate: state.estimate, feedback: { expectedTotalPriceFen, actualPricePer500gFen, budgetDifferenceFen }, budgetPerception: state.budgetPerception, questionnaire, environment: state.viewport, completedAt: state.completedAt,
  };
  assertRecord(record);
  return record;
}
