import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ default: {} }));
vi.mock('@/lib/desktop-auth', () => ({ getDesktopCaller: vi.fn(async () => ({ userId: 'u1' })) }));
const billing = vi.hoisted(() => ({
  ent: { active: true, plan: { id: 'PRO_MONTHLY', modelTier: 'PRO' } as { id: string; modelTier: string }, remaining: { aiCredits: 50 } },
  reserveUsage: vi.fn(async (..._args: unknown[]) => 'r1'),
  settleUsage: vi.fn(async (..._args: unknown[]) => {}),
  releaseUsage: vi.fn(async (..._args: unknown[]) => {}),
  exhausted: false,
}));
vi.mock('@/lib/billing/entitlements', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing/entitlements')>('@/lib/billing/entitlements');
  return {
    QuotaError: actual.QuotaError,
    getEntitlement: vi.fn(async () => billing.ent),
    reserveUsage: vi.fn(async (...args: unknown[]) => {
      if (billing.exhausted) throw new actual.QuotaError('out of credits', 402, 'credits');
      return billing.reserveUsage(...args);
    }),
    settleUsage: billing.settleUsage,
    releaseUsage: billing.releaseUsage,
  };
});

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
    billing.ent = { active: true, plan: { id: 'STARTER', modelTier: 'FREE' }, remaining: { aiCredits: 50 } };
    billing.exhausted = false;
    billing.reserveUsage.mockClear();
    billing.settleUsage.mockClear();
    billing.releaseUsage.mockClear();
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
    expect(await res.json()).toMatchObject({ provider: 'groq', model: 'openai/gpt-oss-120b', creditsUsed: 1, creditsRemaining: 49 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(billing.reserveUsage).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', endpoint: 'live-answer', kind: 'answer', credits: 1 }));
    const [id, outcome] = billing.settleUsage.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(id).toBe('r1');
    expect(JSON.stringify(outcome)).not.toContain('What is Rust?');
  });

  it('rejects models outside the allowlist without calling a provider', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const res = await live({ question: 'What is Rust?', model: 'gpt-5' });
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('needs a paid plan before any AI call', async () => {
    billing.ent = { active: false, plan: null as never, remaining: { aiCredits: 0 } };
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const res = await live({ question: 'What is Rust?' });
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: 'no_plan' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps premium models for higher plans and models without a key unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await live({ question: 'What is Rust?', model: 'gpt-4o' })).status).toBe(403);
    expect((await live({ question: 'What is Rust?', model: 'deepseek-flash' })).status).toBe(403);
  });

  it('uses the model the user picked, charging what that model costs', async () => {
    billing.ent = { active: true, plan: { id: 'PRO_MONTHLY', modelTier: 'PRO' }, remaining: { aiCredits: 50 } };
    const fetch = vi.fn(async () => new Response(JSON.stringify({ model: 'gpt-4o', choices: [{ message: { content: JSON.stringify(answer) } }] })));
    vi.stubGlobal('fetch', fetch);
    const res = await live({ question: 'What is Rust?', model: 'gpt-4o' });
    expect(res.status).toBe(200);
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).model).toBe('gpt-4o');
    expect(billing.reserveUsage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'complex', credits: 3 }));
  });

  it('refuses when the monthly credits are used up', async () => {
    billing.exhausted = true;
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
    expect(billing.settleUsage).not.toHaveBeenCalled();
    expect(billing.releaseUsage).toHaveBeenCalledWith('r1', 'server_error', expect.objectContaining({ code: 'server_error', attempts: 2 }));
    warn.mockRestore();
    error.mockRestore();
  });
});
