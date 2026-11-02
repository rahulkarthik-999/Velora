import { NextRequest } from 'next/server';
import { QuestionsInput, QuestionsOutput, handlePractice, questionsPrompt } from '@/lib/practice';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function POST(req: NextRequest) {
  return handlePractice(req, 'questions', QuestionsInput, QuestionsOutput, questionsPrompt);
}
