import { NextRequest } from 'next/server';
import { FeedbackInput, FeedbackOutput, handlePractice, feedbackPrompt } from '@/lib/practice';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function POST(req: NextRequest) {
  return handlePractice(req, 'feedback', FeedbackInput, FeedbackOutput, feedbackPrompt);
}
