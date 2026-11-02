import { NextRequest } from 'next/server';
import { handlePractice } from '@/lib/practice';
import { LiveAnswerInput, LiveAnswerOutput, liveAnswerPrompt } from '@/lib/live';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function POST(req: NextRequest) {
  return handlePractice(req, 'live-answer', LiveAnswerInput, LiveAnswerOutput, liveAnswerPrompt);
}
