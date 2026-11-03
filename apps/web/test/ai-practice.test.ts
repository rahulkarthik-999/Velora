import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ default: {} }));
vi.mock('@/lib/desktop-auth', () => ({ getDesktopCaller: vi.fn(async () => ({ userId: 'u1' })) }));
const { usage, recordAIUsage, recordAIFailure } = vi.hoisted(() => ({
  usage: { tier: 'FREE', monthlyAICredits: 50, creditsUsed: 0, creditsRemaining: 50, periodStart: new Date() },
  recordAIUsage: vi.fn(async (..._args: unknown[]) => {}),
  recordAIFailure: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock('@/lib/usage', () => ({ getUsageSummary: vi.fn(async () => usage) }));
vi.mock('@/lib/ai/ledger', () => ({ recordAIUsage, recordAIFailure }));

const { handlePractice } = await import('@/lib/practice');
const { LiveAnswerInput, LiveAnswerOutput, liveAnswerPrompt } = await import('@/lib/live');

const answer = { question: 'q', answer: 'a', keyPoints: [], sources: [], followUps: [] };

function post(body: unknown) {
  return new NextRequest('http://localhost/api/live/answer', { method: 'POST', body: JSON.stringify(body) });
}

const live = (body: unknown) => handlePractice(post(body), 'live-answer', LiveAnswerInput, LiveAnswerOutput, liveAnswerPrompt, 'realtime');

describe('handlePractice routing, model choice and quota', () => {
  beforeEach(() => {
    vi.stubEnv('AI_API_KEY', 'sk-test');
    vi.stubEnv('GROQ_API_KEY', 'gsk-test');
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    usage.tier = 'FREE';
    usage.creditsRemaining = 50;
    recordAIUsage.mockClear();
    recordAIFailure.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('answers live questions from Groq and records usage without prompt contents', async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ model: 'openai/gpt-oss-120b', choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }))
    );
    vi.stubGlobal('fetch', fetch);
    const res = await live({ question: 'What is Rust?' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ provider: 'groq', model: 'openai/gpt-oss-120b', creditsRemaining: 49 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [rec, outcome] = recordAIUsage.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(rec).toEqual({ userId: 'u1', endpoint: 'live-answer', creditsUsed: 1 });
    expect(JSON.stringify(outcome)).not.toContain('What is Rust?');
  });

  it('rejects models outside the allowlist without calling a provider', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const res = await live({ question: 'What is Rust?', model: 'gpt-5' });
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps premium models for paid plans and models without a key unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await live({ question: 'What is Rust?', model: 'gpt-4o' })).status).toBe(403);
    expect((await live({ question: 'What is Rust?', model: 'deepseek-flash' })).status).toBe(403);
  });

  it('uses the model the user picked', async () => {
    usage.tier = 'PLUS';
    const fetch = vi.fn(async () => new Response(JSON.stringify({ model: 'gpt-4o', choices: [{ message: { content: JSON.stringify(answer) } }] })));
    vi.stubGlobal('fetch', fetch);
    const res = await live({ question: 'What is Rust?', model: 'gpt-4o' });
    expect(res.status).toBe(200);
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).model).toBe('gpt-4o');
  });

  it('refuses when the monthly credits are used up', async () => {
    usage.creditsRemaining = 0;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await live({ question: 'What is Rust?' })).status).toBe(402);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records a failed request without charging a credit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    const res = await live({ question: 'What is Rust?' });
    expect(res.status).toBe(502);
    expect(recordAIUsage).not.toHaveBeenCalled();
    expect(recordAIFailure).toHaveBeenCalledWith({ userId: 'u1', endpoint: 'live-answer' }, expect.objectContaining({ code: 'server_error', attempts: 2 }));
    warn.mockRestore();
    error.mockRestore();
  });
});
