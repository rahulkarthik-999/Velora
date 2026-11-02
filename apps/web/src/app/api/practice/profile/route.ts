import { NextRequest } from 'next/server';
import { ProfileInput, ProfileOutput, handlePractice, profilePrompt } from '@/lib/practice';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function POST(req: NextRequest) {
  return handlePractice(req, 'profile', ProfileInput, ProfileOutput, profilePrompt);
}
