// ============================================================================
// AI model registry, per-token prices and request routing
// ============================================================================
//
// Only these providers are allowed: OpenAI (GPT-4o family), DeepSeek and Groq.
// All keys stay on the server; a provider without a key is skipped.

import type { SubscriptionTier } from '@velora/schemas';

export type ProviderId = 'openai' | 'deepseek' | 'groq';

/**
 * What a request needs, which decides the model.
 * - chat: everyday requests (practice questions, feedback, resume extraction, task steps)
 * - realtime: latency-sensitive conversation (live interview answers)
 * - reasoning: cost-efficient reasoning and coding (workflow planning, coding feedback)
 * - vision: screenshots and other images
 */
export type TaskClass = 'chat' | 'realtime' | 'reasoning' | 'vision';

export interface ModelInfo {
  id: string;
  provider: ProviderId;
  label: string;
  vision: boolean;
  /** Accepts response_format {"type":"json_object"}. */
  json: boolean;
  /** USD per 1M input tokens (cache miss). */
  inputPerM: number;
  /** USD per 1M output tokens (includes reasoning tokens). */
  outputPerM: number;
  /** Lowest plan that may pick this model manually. Routing ignores it. */
  minTier: SubscriptionTier;
  /** Reasoning models spend part of max_tokens thinking; added to the caller's budget. */
  reasoningAllowance?: number;
  /** Extra request fields this model needs. */
  extraBody?: Record<string, unknown>;
}

// Prices are list prices checked on 2026-11-03 and must be re-confirmed before
// relying on cost reports:
// - OpenAI: gpt-4o-mini $0.15 / $0.60, gpt-4o $2.50 / $10.00 (platform.openai.com/docs/pricing)
// - DeepSeek: peak-hour cache-miss rates, the higher of peak and off-peak
//   (api-docs.deepseek.com/quick_start/pricing)
// - Groq: console.groq.com/docs/models
// Cached-input discounts are ignored, so estimates err high.
export const MODELS: readonly ModelInfo[] = [
  { id: 'gpt-4o-mini', provider: 'openai', label: 'GPT-4o mini', vision: true, json: true, inputPerM: 0.15, outputPerM: 0.6, minTier: 'FREE' },
  { id: 'gpt-4o', provider: 'openai', label: 'GPT-4o', vision: true, json: true, inputPerM: 2.5, outputPerM: 10, minTier: 'PLUS' },
  { id: 'deepseek-flash', provider: 'deepseek', label: 'DeepSeek Flash', vision: false, json: true, inputPerM: 0.3, outputPerM: 1.2, minTier: 'FREE' },
  { id: 'deepseek-v4-pro', provider: 'deepseek', label: 'DeepSeek V4 Pro', vision: false, json: true, inputPerM: 1.32, outputPerM: 3.96, minTier: 'PLUS' },
  {
    id: 'openai/gpt-oss-120b',
    provider: 'groq',
    label: 'GPT-OSS 120B (Groq)',
    vision: false,
    json: true,
    inputPerM: 0.15,
    outputPerM: 0.6,
    minTier: 'FREE',
    reasoningAllowance: 600,
    extraBody: { reasoning_effort: 'low' },
  },
  {
    id: 'openai/gpt-oss-20b',
    provider: 'groq',
    label: 'GPT-OSS 20B (Groq)',
    vision: false,
    json: true,
    inputPerM: 0.075,
    outputPerM: 0.3,
    minTier: 'FREE',
    reasoningAllowance: 600,
    extraBody: { reasoning_effort: 'low' },
  },
];

export function getModel(id: string | undefined): ModelInfo | undefined {
  return id ? MODELS.find((m) => m.id === id) : undefined;
}

// ============================================================================
// Provider configuration (server-side env only)
// ============================================================================

export interface ProviderConfig {
  id: ProviderId;
  apiKey: string;
  baseUrl: string;
}

export function providerConfig(id: ProviderId, env: NodeJS.ProcessEnv = process.env): ProviderConfig | null {
  const raw =
    id === 'openai'
      ? { apiKey: env.AI_API_KEY, baseUrl: env.AI_BASE_URL || 'https://api.openai.com/v1' }
      : id === 'deepseek'
        ? { apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com' }
        : { apiKey: env.GROQ_API_KEY, baseUrl: env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1' };
  const apiKey = raw.apiKey?.trim();
  return apiKey ? { id, apiKey, baseUrl: raw.baseUrl.replace(/\/+$/, '') } : null;
}

export function isConfigured(model: ModelInfo, env: NodeJS.ProcessEnv = process.env): boolean {
  return providerConfig(model.provider, env) !== null;
}

/** Models a user could pick right now: allowlisted, key configured, plan allows it. */
export function availableModels(tier: SubscriptionTier, env: NodeJS.ProcessEnv = process.env): ModelInfo[] {
  return MODELS.filter((m) => isConfigured(m, env) && tierAllows(tier, m.minTier));
}

const TIER_ORDER: SubscriptionTier[] = ['FREE', 'PLUS', 'PRO'];

export function tierAllows(tier: SubscriptionTier, min: SubscriptionTier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(min);
}

// ============================================================================
// Routing
// ============================================================================

/** An env override only counts when it names an allowlisted model of the right provider. */
function envModel(name: string | undefined, provider: ProviderId, fallback: string): string {
  const m = getModel(name?.trim());
  if (name?.trim() && (!m || m.provider !== provider)) {
    console.warn(`[AI] Ignoring model "${name}": not an allowed ${provider} model`);
  }
  return m && m.provider === provider ? m.id : fallback;
}

/** Ordered preference per task class: first configured entry is primary. */
export function routeTable(env: NodeJS.ProcessEnv = process.env): Record<TaskClass, string[]> {
  const everyday = envModel(env.AI_MODEL, 'openai', 'gpt-4o-mini');
  const deepseek = envModel(env.DEEPSEEK_MODEL, 'deepseek', 'deepseek-flash');
  const groq = envModel(env.GROQ_MODEL, 'groq', 'openai/gpt-oss-120b');
  return {
    chat: [everyday, deepseek, groq],
    realtime: [groq, 'gpt-4o-mini', deepseek],
    reasoning: [deepseek, everyday, groq],
    vision: ['gpt-4o', 'gpt-4o-mini'],
  };
}

export interface RouteOptions {
  task: TaskClass;
  /** A model the caller picked; already validated against the allowlist. */
  model?: string;
  hasImages?: boolean;
  needsJson?: boolean;
  env?: NodeJS.ProcessEnv;
}

/**
 * The models to try, in order: a primary and at most one fallback on another
 * provider where possible. Never more than two calls per request.
 */
export function planRoute(opts: RouteOptions): ModelInfo[] {
  const env = opts.env ?? process.env;
  const task: TaskClass = opts.hasImages ? 'vision' : opts.task;
  const usable = (m: ModelInfo | undefined): m is ModelInfo =>
    !!m && isConfigured(m, env) && (!opts.hasImages || m.vision) && (!opts.needsJson || m.json);

  const preferred = routeTable(env)[task].map(getModel).filter(usable);
  const pinned = getModel(opts.model);
  const ordered = usable(pinned) ? [pinned, ...preferred.filter((m) => m.id !== pinned.id)] : preferred;

  const unique = ordered.filter((m, i) => ordered.findIndex((o) => o.id === m.id) === i);
  const primary = unique[0];
  if (!primary) return [];
  const fallback = unique.find((m) => m.provider !== primary.provider) ?? unique[1];
  return fallback ? [primary, fallback] : [primary];
}

// ============================================================================
// Cost
// ============================================================================

/** Estimated USD cost of one call, rounded to 1e-6. Unknown models cost 0. */
export function estimateCostUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const m = getModel(modelId) ?? MODELS.find((x) => modelId.startsWith(`${x.id}-`));
  if (!m) return 0;
  const cost = (inputTokens * m.inputPerM + outputTokens * m.outputPerM) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
