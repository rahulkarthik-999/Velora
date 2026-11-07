import { NextRequest } from 'next/server';
import {
  handleCareerEndpoint,
  CodingAssistantInput,
  CodingAssistantOutput,
  codingAssistantPrompt,
} from '@/lib/career';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handleCareerEndpoint(
    req,
    'career-assistant-coding',
    CodingAssistantInput,
    CodingAssistantOutput,
    codingAssistantPrompt,
    'reasoning'
  );
}
