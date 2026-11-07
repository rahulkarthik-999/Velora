import { NextRequest } from 'next/server';
import { handlePractice } from '@/lib/practice';
import { LiveScreenInput, LiveAnswerOutput, liveScreenPrompt } from '@/lib/live';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function POST(req: NextRequest) {
  return handlePractice(req, 'live-screen', LiveScreenInput, LiveAnswerOutput, liveScreenPrompt, 'vision');
}
