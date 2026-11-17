/** 浏览器导出与离线解密共用的协议校验；不依赖网页或第三方包。 */
export const FORMAT = 'GEB2402-EXPORT';
export const FORMAT_VERSION = 1;

export function additionalData(keyId) {
  return new TextEncoder().encode(`${FORMAT}|1|${keyId}|RSA-OAEP-256|A256GCM`);
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function integer(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function timestamp(value) {
  requireCondition(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) && Number.isFinite(Date.parse(value)), '实验时间戳无效。');
  return Date.parse(value);
}

export function assertEnvelope(value) {
  requireCondition(value && typeof value === 'object' && !Array.isArray(value), '文件不是加密实验信封。');
  requireCondition(value.format === FORMAT && value.version === FORMAT_VERSION, '不支持的加密文件格式或版本。');
  requireCondition(typeof value.keyId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value.keyId), '公钥ID无效。');
  requireCondition(value.keyAlgorithm === 'RSA-OAEP-256' && value.dataAlgorithm === 'A256GCM', '不支持的加密算法。');
  for (const field of ['iv', 'encryptedKey', 'ciphertext']) {
    requireCondition(typeof value[field] === 'string' && value[field].length > 0 && value[field].length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value[field]), `加密字段${field}不是标准Base64。`);
  }
}

function assertSummary(summary) {
  requireCondition(summary && Array.isArray(summary.items), '商品明细缺失。');
  const ids = new Set();
  let price = 0, weight = 0, quantity = 0;
  for (const item of summary.items) {
    requireCondition(typeof item.productId === 'string' && item.productId.length > 0 && !ids.has(item.productId), '商品ID缺失或重复。');
    requireCondition(typeof item.name === 'string' && item.name.trim().length > 0, '商品名称缺失。');
    requireCondition(integer(item.quantity, 1) && integer(item.unitPriceFen, 1) && integer(item.unitWeightGrams, 1), '商品数量、单价或规格无效。');
    requireCondition(integer(item.subtotalPriceFen) && item.subtotalPriceFen === item.quantity * item.unitPriceFen && integer(item.subtotalWeightGrams) && item.subtotalWeightGrams === item.quantity * item.unitWeightGrams, '商品小计与单价、克重不一致。');
    ids.add(item.productId);
    price += item.subtotalPriceFen;
    weight += item.subtotalWeightGrams;
    quantity += item.quantity;
  }
  requireCondition(integer(price) && integer(weight) && integer(quantity), '商品合计超出安全数值范围。');
  requireCondition(summary.totalPriceFen === price && summary.totalWeightGrams === weight && summary.totalQuantity === quantity && summary.distinctProductCount === ids.size, '商品明细与汇总不一致。');
}

export function assertRecord(record) {
  requireCondition(record && ['1.1', '1.2'].includes(record.schemaVersion) && record.experimentId === 'GEB2402', '不支持的实验JSON版本，当前解密器支持1.1和1.2。');
  requireCondition(record.mode === 'demo' || record.mode === 'research', '缺少演示/正式实验标记。');
  requireCondition(typeof record.sessionId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(record.sessionId), '实验ID无效。');
  requireCondition(record.participant && typeof record.participant.realName === 'string' && record.participant.realName.trim().length > 0 && Array.from(record.participant.realName.trim()).length <= 80, '姓名缺失或过长。');
  for (const key of ['appVersion', 'configVersion', 'catalogVersion', 'questionnaireVersion']) {
    requireCondition(typeof record[key] === 'string' && record[key].length > 0, `缺少${key}。`);
  }
  requireCondition(record.consent?.accepted === true && typeof record.consent.noticeVersion === 'string', '缺少数据用途确认。');
  const consentTime = timestamp(record.consent.acceptedAt);
  const task = record.task;
  requireCondition(task && integer(task.budgetFen, 1) && integer(task.initialDurationMs, 1) && integer(task.extensionThresholdFen, 1) && integer(task.extensionDurationMs, 1) && task.priceExpectationBasisWeightGrams === 500, '实验任务参数无效。');
  const shopping = record.shopping;
  requireCondition(shopping && typeof shopping.extensionApplied === 'boolean' && Array.isArray(shopping.phases) && shopping.phases.length === (shopping.extensionApplied ? 2 : 1), '购物阶段记录不完整。');
  let previousEnd = timestamp(shopping.startedAt);
  requireCondition(consentTime <= previousEnd, '购物时间早于确认时间。');
  for (let index = 0; index < shopping.phases.length; index += 1) {
    const phase = shopping.phases[index];
    const started = timestamp(phase.startedAt), ended = timestamp(phase.endedAt), deadline = timestamp(phase.deadlineAt);
    requireCondition(phase.phase === (index === 0 ? 'initial' : 'extension') && started === previousEnd, '购物阶段顺序或起始时间不一致。');
    requireCondition(deadline - started === (index === 0 ? task.initialDurationMs : task.extensionDurationMs), '购物阶段限时不一致。');
    requireCondition(phase.endReason === 'manual' || phase.endReason === 'timeout', '未知结账原因。');
    requireCondition(ended >= started && ended <= deadline && phase.elapsedMs === ended - started, '购物阶段时长不一致。');
    requireCondition(phase.endReason !== 'timeout' || ended === deadline, '超时结账必须使用原截止时间。');
    assertSummary(phase);
    previousEnd = ended;
  }
  requireCondition(shopping.extensionApplied === (shopping.phases[0].totalPriceFen < task.extensionThresholdFen), '追加阶段与首轮金额不一致。');
  requireCondition(timestamp(shopping.endedAt) === previousEnd, '最终购物结束时间不一致。');
  assertSummary(shopping.final);
  const lastPhase = shopping.phases.at(-1);
  for (const key of ['totalPriceFen', 'totalWeightGrams', 'totalQuantity', 'distinctProductCount']) {
    requireCondition(shopping.final[key] === lastPhase[key], '最终结果与最后购物阶段不一致。');
  }
  const finalItems = new Map();
  for (const item of shopping.final.items) finalItems.set(item.productId, item);
  for (const item of lastPhase.items) {
    const finalItem = finalItems.get(item.productId);
    requireCondition(finalItem && finalItem.quantity === item.quantity && finalItem.unitPriceFen === item.unitPriceFen && finalItem.unitWeightGrams === item.unitWeightGrams && finalItem.name === item.name, '最终明细与最后购物阶段不一致。');
  }
  const expectation = record.priceExpectation;
  requireCondition(expectation && expectation.basisWeightGrams === 500 && integer(expectation.priceFen, 1) && Array.isArray(expectation.submissions) && expectation.submissions.length > 0, '预期价格缺失或无效。');
  for (let index = 0; index < expectation.submissions.length; index += 1) {
    const submission = expectation.submissions[index];
    const submitted = timestamp(submission.submittedAt);
    requireCondition(submission.revision === index + 1 && integer(submission.priceFen, 1) && submitted >= previousEnd, '预期价格修订顺序或时间无效。');
    previousEnd = submitted;
  }
  requireCondition(expectation.priceFen === expectation.submissions.at(-1).priceFen, '最终价格不是最新提交值。');
  const estimate = record.estimate;
  requireCondition(estimate && typeof estimate.totalWeightGrams === 'number' && Number.isFinite(estimate.totalWeightGrams) && estimate.totalWeightGrams >= 0 && Number.isSafeInteger(Math.round(estimate.totalWeightGrams * 100)) && Math.abs(estimate.totalWeightGrams * 100 - Math.round(estimate.totalWeightGrams * 100)) < 0.001 && estimate.priceExpectationRevision === expectation.submissions.length && timestamp(estimate.submittedAt) >= previousEnd, '估计重量无效或没有关联最新预期价格。');
  if (record.schemaVersion === '1.2') {
    requireCondition(record.budgetPerception && ['yes', 'no', 'unsure'].includes(record.budgetPerception.answer) && timestamp(record.budgetPerception.submittedAt) >= timestamp(estimate.submittedAt), '超预算感受回答缺失或无效。');
    requireCondition(timestamp(record.completedAt) >= timestamp(record.budgetPerception.submittedAt), '完成时间早于超预算感受提交时间。');
  }
  requireCondition(Array.isArray(record.questionnaire), '缺少问卷回答。');
  const questionIds = new Set();
  for (const answer of record.questionnaire) {
    requireCondition(typeof answer.questionId === 'string' && !questionIds.has(answer.questionId) && typeof answer.prompt === 'string' && typeof answer.answer === 'string' && answer.answer.length <= 2000, '问卷记录无效。');
    questionIds.add(answer.questionId);
  }
  requireCondition(timestamp(record.completedAt) >= timestamp(estimate.submittedAt), '完成时间早于重量确认。');
  requireCondition(record.environment && integer(record.environment.viewportWidth, 1) && integer(record.environment.viewportHeight, 1), '缺少有效的实验视口信息。');
}
