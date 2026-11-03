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

const { transcribeModel, transcriptionCostUsd, wavDurationSec } = await import('@/lib/live');
const { POST } = await import('@/app/api/live/transcribe/route');

/** A silent 16 kHz mono 16-bit WAV of the given length. */
function wav(seconds: number): Buffer {
  const data = Math.round(seconds * 32_000);
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + data, 4);
  b.write('WAVEfmt ', 8, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16_000, 24);
  b.writeUInt32LE(32_000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(data, 40);
  return b;
}

const clip = (seconds = 3) =>
  new NextRequest('http://localhost/api/live/transcribe', {
    method: 'POST',
    body: JSON.stringify({ audio: wav(seconds).toString('base64'), language: 'en' }),
  });

describe('transcription model and cost', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('only ever uses gpt-4o-mini-transcribe or a dated snapshot of it', () => {
    expect(transcribeModel()).toBe('gpt-4o-mini-transcribe');
    vi.stubEnv('LIVE_TRANSCRIBE_MODEL', 'gpt-4o-mini-transcribe-2025-12-15');
    expect(transcribeModel()).toBe('gpt-4o-mini-transcribe-2025-12-15');
    for (const other of ['gpt-4o-transcribe', 'whisper-1', 'gpt-4o-mini-transcribe-latest', 'deepgram-nova']) {
      vi.stubEnv('LIVE_TRANSCRIBE_MODEL', other);
      expect(transcribeModel()).toBe('gpt-4o-mini-transcribe');
    }
  });

  it('reads clip length from the WAV header and prices it per minute', () => {
    expect(wavDurationSec(wav(3))).toBeCloseTo(3, 3);
    expect(wavDurationSec(Buffer.from('not a wav'))).toBe(0);
    expect(transcriptionCostUsd(60)).toBeCloseTo(0.003, 9);
    expect(transcriptionCostUsd(6)).toBeCloseTo(0.0003, 9);
  });
});

describe('POST /api/live/transcribe', () => {
  beforeEach(() => {
    vi.stubEnv('AI_API_KEY', 'sk-test');
    billing.exhausted = false;
    billing.reserveUsage.mockClear();
    billing.settleUsage.mockClear();
    billing.releaseUsage.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends the clip to OpenAI gpt-4o-mini-transcribe and records minutes, not audio or text', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ text: ' Tell me about yourself. ', usage: { input_tokens: 40, output_tokens: 6 } })));
    vi.stubGlobal('fetch', fetch);
    const res = await POST(clip(3));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'Tell me about yourself.' });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect((init.body as FormData).get('model')).toBe('gpt-4o-mini-transcribe');

    const reserved = billing.reserveUsage.mock.calls[0][0] as Record<string, unknown>;
    expect(reserved).toMatchObject({ userId: 'u1', kind: 'transcription', endpoint: 'live-transcribe' });
    expect(reserved.audioSeconds as number).toBeCloseTo(3, 3);
    const [id, rec] = billing.settleUsage.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(id).toBe('r1');
    expect(rec).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini-transcribe', inputTokens: 40, outputTokens: 6 });
    expect(rec.estimatedCostUsd as number).toBeCloseTo(0.00015, 9);
    expect(JSON.stringify(rec)).not.toContain('Tell me');
  });

  it('answers 503 on OpenAI overload so the app retries, and records the failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('slow down', { status: 429 })));
    const res = await POST(clip());
    expect(res.status).toBe(503);
    expect(billing.releaseUsage).toHaveBeenCalledWith('r1', 'rate_limited', expect.objectContaining({ provider: 'openai' }));
    expect(billing.settleUsage).not.toHaveBeenCalled();
  });

  it('answers 502 on a rejected request, which the app does not retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 400 })));
    expect((await POST(clip())).status).toBe(502);
  });

  it('refuses when the monthly minutes are used up, without calling OpenAI', async () => {
    billing.exhausted = true;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await POST(clip())).status).toBe(402);
    expect(fetch).not.toHaveBeenCalled();
  });
});
