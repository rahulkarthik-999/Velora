import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { handlePractice } from '@/lib/practice';
import { LiveAnswerInput, LiveAnswerOutput, liveAnswerPrompt } from '@/lib/live';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function POST(req: NextRequest) {
  // Latency-sensitive: routed to Groq when configured, else gpt-4o-mini.
  return handlePractice(req, 'live-answer', LiveAnswerInput, LiveAnswerOutput, liveAnswerPrompt, 'realtime');
}

/**
 * Warm-up, called by the desktop app when a live session starts: it wakes this function
 * and its database connection so the first real answer doesn't wait for a cold start.
 * Returns nothing about anyone and needs no sign-in.
 */
export async function GET() {
  await prisma.$queryRaw`SELECT 1`.catch(() => undefined);
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
