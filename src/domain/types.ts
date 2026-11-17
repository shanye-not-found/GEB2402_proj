export type Stage = 'consent' | 'name' | 'instructions' | 'shopping' | 'price' | 'weight' | 'questionnaire' | 'complete';
export type Phase = 'initial' | 'extension';
export type Mode = 'demo' | 'research';
export type BudgetPerceptionAnswer = 'yes' | 'no' | 'unsure';

export interface Product {
  id: string;
  name: string;
  brand: string;
  description: string;
  unitPriceFen: number;
  unitWeightGrams: number;
  saleUnitLabel: string;
  sortOrder: number;
  specLabel: string;
  imagePath: string;
  galleryImagePaths: string[];
  imageUrl: string;
  galleryImageUrls: string[];
}
export interface Catalog {
  schemaVersion: '1.0';
  catalogVersion: string;
  uniqueProductCount: number;
  requiredProductCount: number;
  missingProductCount: number;
  readyForExperiment: boolean;
  products: Product[];
}
export interface PublicKeyConfig {
  keyId: string;
  purpose: 'demo' | 'research';
  algorithm: 'RSA-OAEP-256';
  modulusLength: number;
  spki: string;
}
export interface Question {
  id: string;
  prompt: string;
  required: boolean;
  maxLength: number;
}
export interface ExperimentConfig {
  experimentId: 'GEB2402';
  appVersion: string;
  configVersion: string;
  noticeVersion: string;
  questionnaireVersion: string;
  questionnaireIsPlaceholder: boolean;
  budgetFen: number;
  initialDurationMs: number;
  extensionThresholdFen: number;
  extensionDurationMs: number;
  priceExpectationBasisWeightGrams: 500;
  questions: Question[];
}
export interface LineItem {
  productId: string;
  name: string;
  unitPriceFen: number;
  unitWeightGrams: number;
  quantity: number;
  subtotalPriceFen: number;
  subtotalWeightGrams: number;
}
export interface Summary {
  totalPriceFen: number;
  totalWeightGrams: number;
  totalQuantity: number;
  distinctProductCount: number;
  items: LineItem[];
}
export interface PhaseRecord extends Summary {
  phase: Phase;
  startedAt: string;
  deadlineAt: string;
  endedAt: string;
  endReason: 'manual' | 'timeout';
  elapsedMs: number;
}
export interface ShoppingState {
  startedAt: number;
  phase: Phase;
  phaseStartedAt: number;
  deadlineAt: number;
  quantities: Record<string, number>;
  phases: PhaseRecord[];
  extensionApplied: boolean;
  endedAt: number | null;
  final: Summary | null;
}
export interface PriceSubmission { revision: number; priceFen: number; submittedAt: string }
export interface Estimate { totalWeightGrams: number; priceExpectationRevision: number; submittedAt: string }
export interface BudgetPerception { answer: BudgetPerceptionAnswer; submittedAt: string }
export interface SessionState {
  storageVersion: '1.2';
  stage: Stage;
  mode: Mode;
  sessionId: string | null;
  consentAcceptedAt: string | null;
  nameDraft: string;
  config: ExperimentConfig;
  catalog: Catalog | null;
  publicKey: PublicKeyConfig | null;
  shopping: ShoppingState | null;
  priceDraft: string;
  weightDraft: string;
  priceSubmissions: PriceSubmission[];
  estimate: Estimate | null;
  budgetPerceptionDraft: BudgetPerceptionAnswer | '';
  budgetPerception: BudgetPerception | null;
  answers: Record<string, string>;
  completedAt: string | null;
  viewport: { viewportWidth: number; viewportHeight: number };
  error: string;
}
export interface ExperimentRecord {
  schemaVersion: '1.2';
  experimentId: 'GEB2402';
  mode: Mode;
  sessionId: string;
  appVersion: string;
  configVersion: string;
  catalogVersion: string;
  questionnaireVersion: string;
  participant: { realName: string };
  consent: { accepted: true; noticeVersion: string; acceptedAt: string };
  task: { budgetFen: number; initialDurationMs: number; extensionThresholdFen: number; extensionDurationMs: number; priceExpectationBasisWeightGrams: 500 };
  shopping: { startedAt: string; endedAt: string; extensionApplied: boolean; phases: PhaseRecord[]; final: Summary };
  priceExpectation: { basisWeightGrams: 500; priceFen: number; submissions: PriceSubmission[] };
  estimate: Estimate;
  budgetPerception: BudgetPerception;
  questionnaire: { questionId: string; prompt: string; answer: string }[];
  environment: { viewportWidth: number; viewportHeight: number };
  completedAt: string;
}

export type Event = { now: number } & (
  | { type: 'CONSENT'; sessionId: string }
  | { type: 'NAME_DRAFT'; value: string }
  | { type: 'CONFIRM_NAME' }
  | { type: 'BACK_TO_CONSENT' }
  | { type: 'START'; catalog: Catalog; publicKey: PublicKeyConfig; viewport: SessionState['viewport'] }
  | { type: 'ADD' | 'REMOVE'; productId: string; phase: Phase }
  | { type: 'CHECKOUT'; phase: Phase }
  | { type: 'TICK' }
  | { type: 'PRICE_DRAFT' | 'WEIGHT_DRAFT'; value: string }
  | { type: 'BUDGET_PERCEPTION_DRAFT'; value: BudgetPerceptionAnswer }
  | { type: 'SUBMIT_PRICE' | 'EDIT_PRICE' | 'SUBMIT_WEIGHT' | 'COMPLETE' }
  | { type: 'ANSWER'; questionId: string; value: string }
  | { type: 'ERROR'; message: string }
);
