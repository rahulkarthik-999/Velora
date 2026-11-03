import { afterEach, describe, expect, it, vi } from 'vitest';
import { availableModels, estimateCostUsd, planRoute, routeTable } from '@/lib/ai/models';
import { AIProviderError, AIRouter, type AIMessage } from '@/lib/ai/provider';

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const OPENAI_ONLY = env({ AI_API_KEY: 'sk-test' });
const ALL = env({ AI_API_KEY: 'sk-test', DEEPSEEK_API_KEY: 'ds-test', GROQ_API_KEY: 'gsk-test' });

const ids = (route: { id: string }[]) => route.map((m) => m.id);
const user: AIMessage[] = [{ role: 'user', content: 'Hi' }];

describe('routing', () => {
  it('uses gpt-4o-mini for everyday requests', () => {
    expect(ids(planRoute({ task: 'chat', env: OPENAI_ONLY }))).toEqual(['gpt-4o-mini']);
    expect(ids(planRoute({ task: 'chat', env: ALL }))).toEqual(['gpt-4o-mini', 'deepseek-flash']);
  });

  it('sends live answers to Groq with an OpenAI fallback, or straight to gpt-4o-mini without a Groq key', () => {
    expect(ids(planRoute({ task: 'realtime', env: ALL, needsJson: true }))).toEqual(['openai/gpt-oss-120b', 'gpt-4o-mini']);
    expect(ids(planRoute({ task: 'realtime', env: OPENAI_ONLY }))).toEqual(['gpt-4o-mini']);
  });

  it('sends reasoning to DeepSeek and falls back to OpenAI', () => {
    expect(ids(planRoute({ task: 'reasoning', env: ALL }))).toEqual(['deepseek-flash', 'gpt-4o-mini']);
    expect(ids(planRoute({ task: 'reasoning', env: OPENAI_ONLY }))).toEqual(['gpt-4o-mini']);
  });

  it('sends images to gpt-4o and never to a text-only model, even if pinned', () => {
    expect(ids(planRoute({ task: 'chat', hasImages: true, env: ALL }))).toEqual(['gpt-4o', 'gpt-4o-mini']);
    expect(ids(planRoute({ task: 'chat', hasImages: true, model: 'deepseek-flash', env: ALL }))).toEqual(['gpt-4o', 'gpt-4o-mini']);
  });

  it('honours a pinned model and keeps one fallback on another provider', () => {
    expect(ids(planRoute({ task: 'chat', model: 'gpt-4o', env: ALL }))).toEqual(['gpt-4o', 'deepseek-flash']);
    expect(ids(planRoute({ task: 'realtime', model: 'deepseek-v4-pro', env: ALL }))).toEqual(['deepseek-v4-pro', 'openai/gpt-oss-120b']);
  });

  it('skips providers without a key and returns nothing when none is configured', () => {
    expect(ids(planRoute({ task: 'chat', model: 'openai/gpt-oss-20b', env: OPENAI_ONLY }))).toEqual(['gpt-4o-mini']);
    expect(planRoute({ task: 'chat', env: env({}) })).toEqual([]);
  });

  it('ignores env overrides that are not allowlisted for that provider', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const table = routeTable(env({ AI_MODEL: 'gpt-5', GROQ_MODEL: 'gpt-4o', DEEPSEEK_MODEL: 'deepseek-v4-pro' }));
    expect(table.chat[0]).toBe('gpt-4o-mini');
    expect(table.realtime[0]).toBe('openai/gpt-oss-120b');
    expect(table.reasoning[0]).toBe('deepseek-v4-pro');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('only offers premium models to paid plans', () => {
    expect(availableModels('FREE', ALL).map((m) => m.id)).not.toContain('gpt-4o');
    expect(availableModels('PLUS', ALL).map((m) => m.id)).toContain('gpt-4o');
    expect(availableModels('PRO', OPENAI_ONLY).map((m) => m.provider)).toEqual(['openai', 'openai']);
  });
});

describe('cost', () => {
  it('prices tokens per model', () => {
    expect(estimateCostUsd('gpt-4o-mini', 1_000, 500)).toBeCloseTo(0.00045, 9);
    expect(estimateCostUsd('gpt-4o', 1_000_000, 1_000_000)).toBeCloseTo(12.5, 6);
    expect(estimateCostUsd('deepseek-flash', 2_000, 1_000)).toBeCloseTo(0.0018, 9);
    expect(estimateCostUsd('openai/gpt-oss-120b', 1_000, 1_000)).toBeCloseTo(0.00075, 9);
  });

  it('matches dated snapshot IDs returned by OpenAI and prices unknown models at 0', () => {
    expect(estimateCostUsd('gpt-4o-mini-2024-07-18', 1_000, 500)).toBeCloseTo(0.00045, 9);
    expect(estimateCostUsd('gpt-4o-2024-08-06', 1_000_000, 0)).toBeCloseTo(2.5, 6);
    expect(estimateCostUsd('some-other-model', 1_000, 1_000)).toBe(0);
  });
});

// ============================================================================
// Router with a mocked fetch
// ============================================================================

function ok(content: string, model = 'm', usage = { prompt_tokens: 100, completion_tokens: 50 }) {
  return new Response(JSON.stringify({ model, choices: [{ message: { content }, finish_reason: 'stop' }], usage }), { status: 200 });
}

function fail(status: number, headers: Record<string, string> = {}) {
  return new Response('{"error":"nope"}', { status, headers });
}

function mockFetch(...responses: Array<Response | Error>) {
  const fn = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra call');
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const urlOf = (fn: ReturnType<typeof mockFetch>, i: number) => (fn.mock.calls[i] as unknown as [string])[0];
const bodyOf = (fn: ReturnType<typeof mockFetch>, i: number) =>
  JSON.parse((fn.mock.calls[i] as unknown as [string, RequestInit])[1].body as string);

describe('router fallback', () => {
  afterEach(() => vi.unstubAllGlobals());
  const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('answers from the primary with one call and reports provider, cost and latency', async () => {
    const fetch = mockFetch(ok('{"a":1}', 'openai/gpt-oss-120b'));
    const router = new AIRouter(ALL);
    const r = await router.generateStructuredOutput<{ a: number }>({ messages: user, task: 'realtime', schema: '{}' });
    expect(r).toMatchObject({ data: { a: 1 }, provider: 'groq', attempts: 1, inputTokens: 100, outputTokens: 50 });
    expect(r.fallbackFrom).toBeUndefined();
    expect(r.estimatedCostUsd).toBeCloseTo(estimateCostUsd('openai/gpt-oss-120b', 100, 50), 9);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(urlOf(fetch, 0)).toBe('https://api.groq.com/openai/v1/chat/completions');
    const body = bodyOf(fetch, 0);
    expect(body).toMatchObject({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', response_format: { type: 'json_object' } });
    expect(body.max_tokens).toBe(4096 + 600);
  });

  it.each([
    ['5xx', fail(503)],
    ['429', fail(429)],
    ['timeout', Object.assign(new Error('aborted'), { name: 'AbortError' })],
    ['network error', new TypeError('fetch failed')],
    ['retired model', fail(404)],
  ])('falls back once to another provider on %s', async (_label, first) => {
    const warn = quiet();
    const fetch = mockFetch(first, ok('hello', 'gpt-4o-mini-2024-07-18'));
    const r = await new AIRouter(ALL).generateText({ messages: user, task: 'realtime' });
    expect(r).toMatchObject({ content: 'hello', provider: 'openai', attempts: 2, fallbackFrom: 'openai/gpt-oss-120b' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(urlOf(fetch, 1)).toBe('https://api.openai.com/v1/chat/completions');
    warn.mockRestore();
  });

  it('does not fall back on a 400: the request itself is wrong', async () => {
    const warn = quiet();
    const fetch = mockFetch(fail(400));
    await expect(new AIRouter(ALL).generateText({ messages: user, task: 'realtime' })).rejects.toMatchObject({
      code: 'bad_request',
      attempts: 1,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('stops after two attempts when both providers fail', async () => {
    const warn = quiet();
    const fetch = mockFetch(fail(500), fail(502));
    const err = await new AIRouter(ALL).generateText({ messages: user, task: 'reasoning' }).catch((e) => e);
    expect(err).toBeInstanceOf(AIProviderError);
    expect(err).toMatchObject({ code: 'server_error', attempts: 2, provider: 'openai', model: 'gpt-4o-mini' });
    expect(fetch).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('falls back on invalid JSON and counts the wasted tokens', async () => {
    const warn = quiet();
    mockFetch(ok('not json', 'deepseek-flash'), ok('{"ok":true}', 'gpt-4o-mini'));
    const r = await new AIRouter(ALL).generateStructuredOutput<{ ok: boolean }>({ messages: user, task: 'reasoning', schema: '{}' });
    expect(r).toMatchObject({ data: { ok: true }, attempts: 2, inputTokens: 200, outputTokens: 100, fallbackFrom: 'deepseek-flash' });
    expect(r.estimatedCostUsd).toBeCloseTo(
      estimateCostUsd('deepseek-flash', 100, 50) + estimateCostUsd('gpt-4o-mini', 100, 50),
      9
    );
    warn.mockRestore();
  });

  it('treats a blank answer as a failure', async () => {
    const warn = quiet();
    mockFetch(ok('   ', 'deepseek-flash'), ok('{"ok":true}', 'gpt-4o-mini'));
    const r = await new AIRouter(ALL).generateStructuredOutput({ messages: user, task: 'reasoning', schema: '{}' });
    expect(r.provider).toBe('openai');
    warn.mockRestore();
  });

  it('skips a provider in cooldown instead of hitting it on every request', async () => {
    const warn = quiet();
    let now = 1_000_000;
    const router = new AIRouter(ALL, () => now);
    const fetch = mockFetch(fail(429, { 'retry-after': '20' }), ok('a'), ok('b'), ok('c', 'openai/gpt-oss-120b'));

    await router.generateText({ messages: user, task: 'realtime' });
    expect(fetch).toHaveBeenCalledTimes(2);

    await router.generateText({ messages: user, task: 'realtime' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(urlOf(fetch, 2)).toContain('api.openai.com');

    now += 21_000;
    const r = await router.generateText({ messages: user, task: 'realtime' });
    expect(r.provider).toBe('groq');
    warn.mockRestore();
  });

  it('routes image messages to gpt-4o', async () => {
    const fetch = mockFetch(ok('a screenshot', 'gpt-4o'));
    const messages: AIMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'What is this?' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] },
    ];
    const r = await new AIRouter(ALL).generateText({ messages, task: 'realtime' });
    expect(r.model).toBe('gpt-4o');
    expect(bodyOf(fetch, 0).model).toBe('gpt-4o');
  });

  it('fails cleanly when no provider is configured', async () => {
    const fetch = mockFetch();
    await expect(new AIRouter(env({})).generateText({ messages: user })).rejects.toMatchObject({ code: 'no_provider' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never sends a key to another provider', async () => {
    const fetch = mockFetch(fail(503), ok('x'));
    const warn = quiet();
    await new AIRouter(ALL).generateText({ messages: user, task: 'realtime' });
    const auth = (i: number) => ((fetch.mock.calls[i] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization;
    expect(auth(0)).toBe('Bearer gsk-test');
    expect(auth(1)).toBe('Bearer sk-test');
    warn.mockRestore();
  });
});
