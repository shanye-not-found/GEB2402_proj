import { readFileSync } from 'node:fs';
import { createSession, transition } from '../src/domain/experiment';
import { EXPERIMENT } from '../src/config/experiment';
import type { Catalog, SessionState } from '../src/domain/types';

export const time = Date.UTC(2026, 10, 17, 2);
export const source = JSON.parse(readFileSync(new URL('../public/data/products.json', import.meta.url), 'utf8')) as Catalog;

export function started(price = 499): SessionState {
  const catalog: Catalog = { ...source, products: [{ ...source.products[0], unitPriceFen: price }], uniqueProductCount: 1, missingProductCount: 29, readyForExperiment: false };
  let state = createSession(EXPERIMENT, 'demo');
  state = transition(state, { type: 'CONSENT', sessionId: '1f12b86a-0101-4011-8000-111111111111', now: time - 1000 });
  state = transition(state, { type: 'NAME_DRAFT', value: '测试参与者', now: time - 900 });
  state = transition(state, { type: 'CONFIRM_NAME', now: time - 800 });
  return transition(state, { type: 'START', catalog, publicKey: { keyId: 'test', spki: '', purpose: 'demo', algorithm: 'RSA-OAEP-256', modulusLength: 3072 }, viewport: { viewportWidth: 390, viewportHeight: 844 }, now: time });
}

export function questionnaireReady(price = 10000): SessionState {
  let state = started(price);
  state = transition(state, { type: 'ADD', productId: source.products[0].id, phase: 'initial', now: time + 100 });
  state = transition(state, { type: 'CHECKOUT', phase: 'initial', now: time + 500 });
  state = transition(state, { type: 'PRICE_DRAFT', value: '30', now: time + 1000 });
  state = transition(state, { type: 'SUBMIT_PRICE', now: time + 1100 });
  state = transition(state, { type: 'WEIGHT_DRAFT', value: '1800', now: time + 1200 });
  state = transition(state, { type: 'EDIT_PRICE', now: time + 1300 });
  state = transition(state, { type: 'PRICE_DRAFT', value: '35', now: time + 1400 });
  state = transition(state, { type: 'SUBMIT_PRICE', now: time + 1500 });
  state = transition(state, { type: 'BUDGET_PERCEPTION_DRAFT', value: 'no', now: time + 1550 });
  return transition(state, { type: 'SUBMIT_WEIGHT', now: time + 1600 });
}

export function completed(): SessionState {
  let state = questionnaireReady();
  state = transition(state, { type: 'ANSWER', questionId: 'price-value', value: 'expensive', now: time + 1700 });
  state = transition(state, { type: 'ANSWER', questionId: 'repurchase', value: '3', now: time + 1710 });
  state = transition(state, { type: 'ANSWER', questionId: 'purchase-ranking', value: ['C', 'A', 'F'], now: time + 1720 });
  return transition(state, { type: 'COMPLETE', now: time + 1800 });
}
