import type { SubscriptionTier } from '@velora/schemas';

// ============================================================================
// Velora desktop copilot plans: prices, billing, monthly allowances
// ============================================================================
//
// Prices here are what the app displays. What a customer is actually charged is set on
// the Dodo product; each plan maps to a Dodo product id from the environment, so the two
// must be kept in step by whoever manages Dodo. Allowances are always issued monthly,
// whatever the billing interval, and never roll over.

export type PlanId = 'STARTER' | 'PRO_MONTHLY' | 'PRO_QUARTERLY' | 'PRO_ANNUAL' | 'LIFETIME';
export type BillingInterval = 'month' | 'quarter' | 'year' | 'one_time';

export interface Allowances {
  transcriptionMinutes: number;
  aiCredits: number;
  screenshots: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  priceUsd: number;
  interval: BillingInterval;
  /** Subscription tier stored for the web app's existing features. */
  tier: Extract<SubscriptionTier, 'PLUS' | 'PRO'>;
  /** Which models a user may pick by hand (routing is unaffected). Starter gets standard models only. */
  modelTier: SubscriptionTier;
  allowances: Allowances;
  /** Env var holding the Dodo product id. */
  productEnv: string;
  features: string[];
}

const STARTER_FEATURES = [
  'Core Live Interview Copilot',
  'Resume upload and context',
  'AI answer suggestions',
  'Interview session history',
  'Standard AI model routing',
];

const PRO_FEATURES = [
  'Everything in Starter',
  'Advanced technical answers',
  'Coding, SQL and system design help',
  'Interview context memory',
  'Transcript and notes exports',
];

const PRO_ALLOWANCES: Allowances = { transcriptionMinutes: 150, aiCredits: 750, screenshots: 50 };

export const PLANS: Record<PlanId, Plan> = {
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    priceUsd: 9,
    interval: 'month',
    tier: 'PLUS',
    modelTier: 'FREE',
    allowances: { transcriptionMinutes: 30, aiCredits: 150, screenshots: 10 },
    productEnv: 'DODO_PRODUCT_STARTER',
    features: STARTER_FEATURES,
  },
  PRO_MONTHLY: {
    id: 'PRO_MONTHLY',
    name: 'Pro Monthly',
    priceUsd: 29,
    interval: 'month',
    tier: 'PRO',
    modelTier: 'PRO',
    allowances: PRO_ALLOWANCES,
    productEnv: 'DODO_PRODUCT_PRO_MONTHLY',
    features: PRO_FEATURES,
  },
  PRO_QUARTERLY: {
    id: 'PRO_QUARTERLY',
    name: 'Pro Quarterly',
    priceUsd: 69,
    interval: 'quarter',
    tier: 'PRO',
    modelTier: 'PRO',
    allowances: PRO_ALLOWANCES,
    productEnv: 'DODO_PRODUCT_PRO_QUARTERLY',
    features: PRO_FEATURES,
  },
  PRO_ANNUAL: {
    id: 'PRO_ANNUAL',
    name: 'Pro Annual',
    priceUsd: 149,
    interval: 'year',
    tier: 'PRO',
    modelTier: 'PRO',
    allowances: PRO_ALLOWANCES,
    productEnv: 'DODO_PRODUCT_PRO_ANNUAL',
    features: PRO_FEATURES,
  },
  LIFETIME: {
    id: 'LIFETIME',
    name: 'Lifetime',
    priceUsd: 299,
    interval: 'one_time',
    tier: 'PRO',
    modelTier: 'PRO',
    allowances: { transcriptionMinutes: 60, aiCredits: 300, screenshots: 20 },
    productEnv: 'DODO_PRODUCT_LIFETIME',
    features: ['Core premium Live Copilot features', 'Monthly fair-use allowances', 'No recurring charges'],
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && value in PLANS;
}

export function productIdFor(plan: PlanId, env: NodeJS.ProcessEnv = process.env): string | null {
  return env[PLANS[plan].productEnv]?.trim() || null;
}

/** The plan sold as this Dodo product, or null for an unknown product (never grant anything for it). */
export function planForProduct(productId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): PlanId | null {
  if (!productId) return null;
  return PLAN_IDS.find((id) => productIdFor(id, env) === productId) ?? null;
}

// ----------------------------------------------------------------------------
// Credit costs per operation (overridable per deployment)
// ----------------------------------------------------------------------------

export type Operation = 'answer' | 'advanced' | 'screenshot' | 'complex';

const DEFAULT_CREDIT_COSTS: Record<Operation, number> = { answer: 1, advanced: 2, screenshot: 3, complex: 3 };

/** Credits per operation; CREDIT_COST_ANSWER etc. override the defaults. */
export function creditCost(op: Operation, env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env[`CREDIT_COST_${op.toUpperCase()}`]);
  return Number.isInteger(raw) && raw >= 0 && raw <= 50 ? raw : DEFAULT_CREDIT_COSTS[op];
}
