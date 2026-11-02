import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitError, serverError, unauthorized } from '@/lib/api-utils';
import { getDesktopCaller } from '@/lib/desktop-auth';
import { MAX_AUDIO_BYTES, TranscribeInput, transcribeModel } from '@/lib/live';
import { getUsageSummary } from '@/lib/usage';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Transcribes one short speech clip from a live session with OpenAI.
 * Audio is forwarded and never stored. Clips don't use AI credits, but an
 * account with no credits left can't use the cloud transcriber either.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await getDesktopCaller(req);
    if (!caller) return unauthorized();
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

    const usage = await getUsageSummary(caller.userId);
    if (usage.creditsRemaining < 1) {
      return NextResponse.json(
        { error: `You've used all ${usage.monthlyAICredits} AI credits for this month. Switch to on-device transcription or upgrade.` },
        { status: 402 }
      );
    }

    const form = new FormData();
    form.append('file', new Blob([audio], { type: 'audio/wav' }), 'clip.wav');
    form.append('model', transcribeModel());
    form.append('response_format', 'json');
    if (parsed.data.prompt) form.append('prompt', parsed.data.prompt);
    if (parsed.data.language) form.append('language', parsed.data.language);

    const res = await fetch(`${process.env.AI_BASE_URL || 'https://api.openai.com/v1'}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.AI_API_KEY || ''}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error('[live:transcribe] provider error', res.status, (await res.text().catch(() => '')).slice(0, 300));
      return NextResponse.json({ error: 'Cloud transcription is unavailable right now.' }, { status: 502 });
    }
    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ text: (data.text || '').trim() });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Cloud transcription timed out.' }, { status: 504 });
    }
    console.error('[live:transcribe]', error);
    return serverError();
  }
}
