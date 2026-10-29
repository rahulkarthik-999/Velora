// ============================================================================
// AI Provider — Abstraction Layer
// ============================================================================

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIGenerateOptions {
  messages: AIMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
  timeoutMs?: number;
}

export interface AIGenerateResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  finishReason: string;
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
// OpenAI-Compatible Provider
// ============================================================================

export class OpenAICompatibleProvider implements AIProvider {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private fallbackModel: string;

  constructor(config?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    fallbackModel?: string;
  }) {
    this.apiKey = config?.apiKey || process.env.AI_API_KEY || '';
    this.baseUrl = config?.baseUrl || process.env.AI_BASE_URL || 'https://api.openai.com/v1';
    this.defaultModel = config?.model || process.env.AI_MODEL || 'gpt-4o';
    this.fallbackModel = config?.fallbackModel || process.env.AI_FALLBACK_MODEL || 'gpt-4o-mini';

    if (!this.apiKey) {
      console.warn('[AI Provider] No API key configured. AI features will not work.');
    }
  }

  supportsImages(): boolean {
    return true;
  }

  supportsStructuredOutput(): boolean {
    return true;
  }

  async generateText(options: AIGenerateOptions): Promise<AIGenerateResult> {
    const model = options.model || this.defaultModel;
    const timeoutMs = options.timeoutMs || 60000;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: Record<string, unknown> = {
        model,
        messages: options.messages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
      };

      if (options.responseFormat === 'json') {
        body.response_format = { type: 'json_object' };
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        // Try fallback model for rate limit or model errors
        if (
          (response.status === 429 || response.status === 404) &&
          model !== this.fallbackModel
        ) {
          console.warn(`[AI] Primary model failed (${response.status}), trying fallback`);
          return this.generateText({
            ...options,
            model: this.fallbackModel,
          });
        }
        throw new AIProviderError(
          `AI provider error (${response.status}): ${errorText}`,
          response.status
        );
      }

      const data = await response.json();
      const choice = data.choices?.[0];

      if (!choice?.message?.content) {
        throw new AIProviderError('AI provider returned empty response', 500);
      }

      return {
        content: choice.message.content,
        model: data.model || model,
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        finishReason: choice.finish_reason || 'stop',
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AIProviderError('AI request timed out', 408);
      }
      throw new AIProviderError(
        `AI provider error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateStructuredOutput<T>(
    options: AIGenerateOptions & { schema: string }
  ): Promise<{ data: T } & Omit<AIGenerateResult, 'content'>> {
    const result = await this.generateText({
      ...options,
      responseFormat: 'json',
      messages: [
        ...options.messages,
        {
          role: 'system',
          content: `Respond ONLY with valid JSON matching this schema. No markdown, no explanation:\n${options.schema}`,
        },
      ],
    });

    try {
      // Strip markdown code blocks if present
      let jsonStr = result.content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      const data = JSON.parse(jsonStr) as T;
      return {
        data,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        finishReason: result.finishReason,
      };
    } catch {
      throw new AIProviderError('AI returned invalid JSON', 500);
    }
  }
}

// ============================================================================
// Error class
// ============================================================================

export class AIProviderError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

// ============================================================================
// Singleton
// ============================================================================

let providerInstance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!providerInstance) {
    const provider = process.env.AI_PROVIDER || 'openai';
    switch (provider) {
      case 'openai':
      default:
        providerInstance = new OpenAICompatibleProvider();
    }
  }
  return providerInstance;
}
