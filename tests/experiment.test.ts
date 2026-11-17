import { describe, expect, it } from 'vitest';
import { createSession, advanceClock, transition, parseHundredths, makeRecord } from '../src/domain/experiment';
import { EXPERIMENT } from '../src/config/experiment';
import { completed, source, started, time } from './fixtures';

describe('限时购物的阶段边界', () => {
  it('74.99元主动结账追加，75元直接完成购物', () => {
    for (const [price, expectedStage] of [[7499, 'shopping'], [7500, 'price']] as const) {
      let state = started(price);
      state = transition(state, { type: 'ADD', productId: source.products[0].id, phase: 'initial', now: time + 100 });
      state = transition(state, { type: 'CHECKOUT', phase: 'initial', now: time + 200 });
      expect(state.stage).toBe(expectedStage);
      expect(state.shopping?.phases[0].totalPriceFen).toBe(price);
      if (price === 7499) expect(state.shopping?.deadlineAt).toBe(time + 30200);
    }
  });
  it('到时触发追加时从原截止时间计30秒，恢复时两轮过期则全部结束', () => {
    const initial = started();
    const extended = advanceClock(initial, time + 65000);
    expect(extended.shopping?.deadlineAt).toBe(time + 90000);
    expect(extended.shopping?.phases[0].elapsedMs).toBe(60000);
    const final = advanceClock(initial, time + 100000);
    expect(final.stage).toBe('price');
    expect(final.shopping?.phases.map(phase => phase.elapsedMs)).toEqual([60000, 30000]);
    expect(final.shopping?.endedAt).toBe(time + 90000);
  });
  it('截止时刻的加购不被计入追加购物车', () => {
    const state = transition(started(), { type: 'ADD', productId: source.products[0].id, phase: 'initial', now: time + 60000 });
    expect(state.shopping?.phase).toBe('extension');
    expect(state.shopping?.quantities[source.products[0].id] ?? 0).toBe(0);
  });
  it('旧首轮结账事件不能跳过刚开启的追加轮', () => {
    const extended = transition(started(), { type: 'CHECKOUT', phase: 'initial', now: time + 100 });
    const repeated = transition(extended, { type: 'CHECKOUT', phase: 'initial', now: time + 101 });
    expect(repeated.stage).toBe('shopping');
    expect(repeated.shopping?.phase).toBe('extension');
    expect(repeated.shopping?.phases).toHaveLength(1);
  });
  it('空购物车只追加一次，第二次结账允许0元0克完成', () => {
    let state = transition(started(), { type: 'CHECKOUT', phase: 'initial', now: time + 100 });
    state = transition(state, { type: 'CHECKOUT', phase: 'extension', now: time + 200 });
    expect(state.stage).toBe('price');
    expect(state.shopping?.final?.totalWeightGrams).toBe(0);
    expect(state.shopping?.phases).toHaveLength(2);
  });
  it('超过150元仍可购买，并且减购不产生负数', () => {
    let state = started(10000);
    state = transition(state, { type: 'REMOVE', productId: source.products[0].id, phase: 'initial', now: time + 1 });
    for (let index = 0; index < 3; index += 1) state = transition(state, { type: 'ADD', productId: source.products[0].id, phase: 'initial', now: time + 10 + index });
    state = transition(state, { type: 'CHECKOUT', phase: 'initial', now: time + 100 });
    expect(state.shopping?.final?.totalPriceFen).toBe(30000);
    const frozen = transition(state, { type: 'ADD', productId: source.products[0].id, phase: 'initial', now: time + 200 });
    expect(frozen.shopping?.final?.totalPriceFen).toBe(30000);
  });
});

describe('价格修订与重量确认', () => {
  it('十进制金额用整数分解析，拒绝超精度及非有限数字', () => {
    expect(parseHundredths('7.19', false)).toBe(719);
    expect(parseHundredths('0', true)).toBe(0);
    for (const raw of ['', '-1', 'NaN', 'Infinity', '1.001', '1e9', '9007199254740993']) expect(parseHundredths(raw, true)).toBeNull();
    expect(parseHundredths('0', false)).toBeNull();
  });
  it('保留价格提交历史，最终重量只绑定最新价格，不自动换算', () => {
    const state = completed();
    const record = makeRecord(state);
    expect(record.priceExpectation.submissions.map(item => item.priceFen)).toEqual([3000, 3500]);
    expect(record.estimate).toMatchObject({ totalWeightGrams: 1800, priceExpectationRevision: 2 });
    expect(record.questionnaire[0].answer).toBe('测试回答');
    expect(record.mode).toBe('demo');
    expect(record.task).toMatchObject({ budgetFen: 15000, extensionThresholdFen: 7500 });
    expect(record.budgetPerception.answer).toBe('no');
  });
  it('未选择主观超预算判断不能继续，且不会根据真实金额自动回答', () => {
    let state = completed();
    state = { ...state, stage: 'weight', estimate: null, budgetPerception: null, budgetPerceptionDraft: '' };
    const blocked = transition(state, { type: 'SUBMIT_WEIGHT', now: time + 2000 });
    expect(blocked.stage).toBe('weight');
    expect(blocked.error).toContain('超预算');
    const answered = transition(blocked, { type: 'BUDGET_PERCEPTION_DRAFT', value: 'yes', now: time + 2100 });
    const confirmed = transition(answered, { type: 'SUBMIT_WEIGHT', now: time + 2200 });
    expect(confirmed.stage).toBe('questionnaire');
    expect(confirmed.budgetPerception?.answer).toBe('yes');
    expect(confirmed.shopping?.final?.totalPriceFen).toBeLessThan(15000);
  });
  it('未填姓名不能开始；重量页之外不能提交重量或重新打开商品页', () => {
    const initial = createSession(EXPERIMENT, 'demo');
    expect(transition(initial, { type: 'CONFIRM_NAME', now: time }).stage).toBe('consent');
    const state = completed();
    expect(transition(state, { type: 'EDIT_PRICE', now: time + 2000 }).stage).toBe('complete');
    expect(transition(state, { type: 'START', catalog: source, publicKey: state.publicKey!, viewport: state.viewport, now: time + 2000 }).stage).toBe('complete');
    expect(() => makeRecord(started())).toThrow();
  });
});
