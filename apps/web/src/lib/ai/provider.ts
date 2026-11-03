// ============================================================================
// AI Provider — Abstraction Layer
// ============================================================================

import {
  estimateCostUsd,
  getModel,
  planRoute,
  providerConfig,
  type ModelInfo,
  type ProviderConfig,
  type ProviderId,
  type TaskClass,
} from './models';

export type AIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AIContentPart[];
}

export interface AIGenerateOptions {
  messages: AIMessage[];
  /** Pin a model (must be allowlisted in ./models). Otherwise `task` decides. */
  model?: string;
  /** What the request needs; defaults to everyday chat. */
  task?: TaskClass;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
  /** Total budget for the request, across the primary call and any fallback. */
  timeoutMs?: number;
}

export interface AIGenerateResult {
  content: string;
  model: string;
  provider: ProviderId;
  inputTokens: number;
  outputTokens: number;
  finishReason: string;
  /** Wall time for the whole request, including a failed first attempt. */
  latencyMs: number;
  /** Calls made: 1, or 2 when the fallback answered. */
  attempts: number;
  /** Model that failed before the fallback answered. */
  fallbackFrom?: string;
  estimatedCostUsd: number;
}

export interface AIProvider {
  generateText(options: AIGenerateOptions): Promise<AIGenerateResult>;
  generateStructuredOutput<T>(
    options: AIGenerateOptions & { schema: string }
  ): Promise<{ data: T } & Omit<AIGenerateResult, 'content'>>;
  supportsImages(): boolean;
  supportsStructuredOutput(): boolean;
}

// ============================================================================
// Error class
// ============================================================================

export type AIErrorCode =
  | 'timeout'
  | 'rate_limited'
  | 'server_error'
  | 'network'
  | 'auth'
  | 'not_found'
  | 'bad_request'
  | 'empty_response'
  | 'invalid_json'
  | 'no_provider';

export class AIProviderError extends Error {
  public code: AIErrorCode;
  public provider?: ProviderId;
  public model?: string;
  /** Seconds the provider asked us to wait (429 Retry-After). */
  public retryAfterSec?: number;
  /** Filled in by the router once every attempt has failed. */
  public attempts = 1;
  public latencyMs = 0;
  public inputTokens = 0;
  public outputTokens = 0;

  constructor(
    message: string,
    public statusCode: number,
    code?: AIErrorCode
  ) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code ?? codeForStatus(statusCode);
  }
}

function codeForStatus(status: number): AIErrorCode {
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server_error';
  return 'bad_request';
}

/**
 * Worth one call to another provider: outages, overload, timeouts, a missing
 * or retired model, a bad key on that provider, or unusable output. A 400 is
 * our request's fault and would fail the same way elsewhere.
 */
export function isFallbackWorthy(error: AIProviderError): boolean {
  return error.code !== 'bad_request';
}

// ============================================================================
// OpenAI-compatible client: one call to one provider, no retries
// ============================================================================

export class OpenAICompatibleProvider {
  constructor(private config: ProviderConfig) {}

  async call(
    model: ModelInfo,
    options: AIGenerateOptions,
    timeoutMs: number
  ): Promise<Omit<AIGenerateResult, 'latencyMs' | 'attempts' | 'fallbackFrom' | 'estimatedCostUsd'>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: Record<string, unknown> = {
        model: model.id,
        messages: options.messages,
        max_tokens: (options.maxTokens || 4096) + (model.reasoningAllowance ?? 0),
        temperature: options.temperature ?? 0.7,
        ...model.extraBody,
      };
      if (options.responseFormat === 'json') {
        body.response_format = { type: 'json_object' };
      }

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Provider error bodies describe the error, not the prompt; keep them short anyway.
        const errorText = (await response.text().catch(() => '')).slice(0, 300);
        const error = new AIProviderError(`AI provider error (${response.status}): ${errorText}`, response.status);
        const retryAfter = Number(response.headers.get('retry-after'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterSec = retryAfter;
        throw error;
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      const inputTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;

      // DeepSeek blanks JSON-mode output it can't parse; treat blank as a failure.
      if (!choice?.message?.content?.trim()) {
        const error = new AIProviderError('AI provider returned empty response', 502, 'empty_response');
        error.inputTokens = inputTokens;
        error.outputTokens = outputTokens;
        throw error;
      }

      return {
        content: choice.message.content,
        model: data.model || model.id,
        provider: this.config.id,
        inputTokens,
        outputTokens,
        finishReason: choice.finish_reason || 'stop',
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AIProviderError('AI request timed out', 408, 'timeout');
      }
      throw new AIProviderError(
        `AI provider error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        503,
        'network'
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ============================================================================
// Router: picks the model, falls back once, keeps failing providers cool
// ============================================================================

/** How long a provider is skipped after it fails, so a down provider isn't hit on every request. */
const COOLDOWN_MS: Partial<Record<AIErrorCode, number>> = {
  rate_limited: 30_000,
  server_error: 30_000,
  timeout: 30_000,
  network: 30_000,
  auth: 10 * 60_000,
};

export function parseJsonContent<T>(content: string): T {
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    throw new AIProviderError('AI returned invalid JSON', 502, 'invalid_json');
  }
}

function hasImages(messages: AIMessage[]): boolean {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'));
}

export class AIRouter implements AIProvider {
  private cooldownUntil = new Map<ProviderId, number>();

  constructor(
    private env: NodeJS.ProcessEnv = process.env,
    private now: () => number = Date.now
  ) {}

  supportsImages(): boolean {
    return planRoute({ task: 'vision', hasImages: true, env: this.env }).length > 0;
  }

  supportsStructuredOutput(): boolean {
    return true;
  }

  /** Providers in cooldown are only tried when nothing else is available. */
  private plan(options: AIGenerateOptions): ModelInfo[] {
    const route = planRoute({
      task: options.task ?? 'chat',
      model: getModel(options.model)?.id,
      hasImages: hasImages(options.messages),
      needsJson: options.responseFormat === 'json',
      env: this.env,
    });
    const now = this.now();
    const warm = route.filter((m) => (this.cooldownUntil.get(m.provider) ?? 0) <= now);
    return warm.length > 0 ? warm : route.slice(0, 1);
  }

  private async run<T>(
    options: AIGenerateOptions,
    finish: (content: string) => T
  ): Promise<{ value: T; result: AIGenerateResult }> {
    const route = this.plan(options);
    if (route.length === 0) {
      throw new AIProviderError('No AI provider is configured for this request', 503, 'no_provider');
    }

    const started = this.now();
    const budget = options.timeoutMs || 60_000;
    let spentIn = 0;
    let spentOut = 0;
    let spentUsd = 0;
    let attempts = 0;
    let lastError: AIProviderError | undefined;

    for (let i = 0; i < route.length; i++) {
      const model = route[i];
      const remaining = budget - (this.now() - started);
      if (remaining < 1_000) break;
      // Leave the fallback a fair share of the budget.
      const timeoutMs = i < route.length - 1 ? Math.ceil(remaining * 0.6) : remaining;
      const config = providerConfig(model.provider, this.env)!;
      attempts++;

      try {
        const call = await new OpenAICompatibleProvider(config).call(model, options, timeoutMs);
        // Count tokens before parsing: unusable output was still paid for.
        spentIn += call.inputTokens;
        spentOut += call.outputTokens;
        spentUsd += estimateCostUsd(call.model, call.inputTokens, call.outputTokens);
        const value = finish(call.content);
        this.cooldownUntil.delete(model.provider);
        return {
          value,
          result: {
            ...call,
            inputTokens: spentIn,
            outputTokens: spentOut,
            latencyMs: this.now() - started,
            attempts,
            fallbackFrom: i > 0 ? route[0].id : undefined,
            estimatedCostUsd: roundUsd(spentUsd),
          },
        };
      } catch (error) {
        const err =
          error instanceof AIProviderError
            ? error
            : new AIProviderError(error instanceof Error ? error.message : 'Unknown error', 500, 'server_error');
        err.provider = model.provider;
        err.model = model.id;
        // Blank responses still report usage; parse failures were counted above.
        if (err.code === 'empty_response') {
          spentIn += err.inputTokens;
          spentOut += err.outputTokens;
          spentUsd += estimateCostUsd(model.id, err.inputTokens, err.outputTokens);
        }
        const cooldown = COOLDOWN_MS[err.code];
        if (cooldown) {
          const wait = err.retryAfterSec ? Math.min(err.retryAfterSec * 1000, 5 * 60_000) : cooldown;
          this.cooldownUntil.set(model.provider, this.now() + wait);
        }
        console.warn(`[AI] ${model.provider}/${model.id} failed: ${err.code} (${err.statusCode})`);
        lastError = err;
        if (!isFallbackWorthy(err)) break;
      }
    }

    const err = lastError ?? new AIProviderError('AI request timed out', 408, 'timeout');
    err.attempts = attempts;
    err.latencyMs = this.now() - started;
    err.inputTokens = spentIn;
    err.outputTokens = spentOut;
    throw err;
  }

  async generateText(options: AIGenerateOptions): Promise<AIGenerateResult> {
    const { result } = await this.run(options, (content) => content);
    return result;
  }

  async generateStructuredOutput<T>(
    options: AIGenerateOptions & { schema: string }
  ): Promise<{ data: T } & Omit<AIGenerateResult, 'content'>> {
    const { value, result } = await this.run(
      {
        ...options,
        responseFormat: 'json',
        messages: [
          ...options.messages,
          {
            role: 'system',
            content: `Respond ONLY with valid JSON matching this schema. No markdown, no explanation:\n${options.schema}`,
          },
        ],
      },
      (content) => parseJsonContent<T>(content)
    );
    const rest: Omit<AIGenerateResult, 'content'> & { content?: string } = { ...result };
    delete rest.content;
    return { data: value, ...rest };
  }
}

function roundUsd(usd: number): number {
  return Math.round(usd * 1_000_000) / 1_000_000;
}

// ============================================================================
// Singleton
// ============================================================================

let providerInstance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!providerInstance) {
    providerInstance = new AIRouter();
  }
  return providerInstance;
}
