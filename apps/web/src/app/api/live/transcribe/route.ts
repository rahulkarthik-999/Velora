import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitError, serverError, unauthorized } from '@/lib/api-utils';
import { getDesktopCaller } from '@/lib/desktop-auth';
import { recordTranscription } from '@/lib/ai/ledger';
import { MAX_AUDIO_BYTES, TranscribeInput, transcribeModel, transcriptionCostUsd, wavDurationSec } from '@/lib/live';
import { getUsageSummary } from '@/lib/usage';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Transcribes one short speech clip from a live session with OpenAI
 * gpt-4o-mini-transcribe. Audio is forwarded and never stored. Clips don't
 * use AI credits, but an account with no credits left can't transcribe
 * either. Each clip's duration, cost estimate and latency go to the ledger.
 */
export async function POST(req: NextRequest) {
  let userId: string | undefined;
  const model = transcribeModel();
  let audioSec = 0;
  const started = Date.now();
  const fail = (errorCode: string) =>
    userId ? recordTranscription({ userId, model, audioSec, latencyMs: Date.now() - started, estimatedCostUsd: 0, errorCode }) : undefined;
  try {
    const caller = await getDesktopCaller(req);
    if (!caller) return unauthorized();
    userId = caller.userId;
    // A clip arrives after every sentence; allow a fast-talking conversation.
    if (!checkRateLimit(`transcribe:${caller.userId}`, 90, 60_000)) return rateLimitError();

    const parsed = TranscribeInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    const audio = Buffer.from(parsed.data.audio, 'base64');
    if (audio.length > MAX_AUDIO_BYTES || audio.subarray(0, 4).toString('ascii') !== 'RIFF') {
      return NextResponse.json({ error: 'Audio must be a WAV clip under 30 seconds.' }, { status: 400 });
    }
    audioSec = wavDurationSec(audio);

    const usage = await getUsageSummary(caller.userId);
    if (usage.creditsRemaining < 1) {
      return NextResponse.json(
        { error: `You've used all ${usage.monthlyAICredits} AI credits for this month. Upgrade your plan or wait for next month.` },
        { status: 402 }
      );
    }

    const form = new FormData();
    form.append('file', new Blob([audio], { type: 'audio/wav' }), 'clip.wav');
    form.append('model', model);
    form.append('response_format', 'json');
    if (parsed.data.prompt) form.append('prompt', parsed.data.prompt);
    if (parsed.data.language) form.append('language', parsed.data.language);

    const res = await fetch(`${process.env.AI_BASE_URL || 'https://api.openai.com/v1'}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.AI_API_KEY || ''}` },
      body: form,
      // A clip is at most ~8 s of speech and normally transcribes in 1-2 s.
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // OpenAI error bodies describe the error, not the audio.
      console.error('[live:transcribe] provider error', res.status, (await res.text().catch(() => '')).slice(0, 300));
      await fail(res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'server_error' : `http_${res.status}`);
      // 503 for overload and outages so the app retries once; anything else is final.
      const retryable = res.status === 429 || res.status >= 500;
      return NextResponse.json({ error: 'Cloud transcription is unavailable right now.' }, { status: retryable ? 503 : 502 });
    }
    const data = (await res.json()) as { text?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    await recordTranscription({
      userId: caller.userId,
      model,
      audioSec,
      latencyMs: Date.now() - started,
      estimatedCostUsd: transcriptionCostUsd(audioSec),
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    });
    return NextResponse.json({ text: (data.text || '').trim() });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      await fail('timeout');
      return NextResponse.json({ error: 'Cloud transcription timed out.' }, { status: 504 });
    }
    console.error('[live:transcribe]', error instanceof Error ? error.message : error);
    await fail('server_error');
    return serverError();
  }
}
