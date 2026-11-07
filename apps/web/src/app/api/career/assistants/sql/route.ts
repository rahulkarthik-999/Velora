import { NextRequest } from 'next/server';
import {
  handleCareerEndpoint,
  SqlAssistantInput,
  SqlAssistantOutput,
  sqlAssistantPrompt,
} from '@/lib/career';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handleCareerEndpoint(
    req,
    'career-assistant-sql',
    SqlAssistantInput,
    SqlAssistantOutput,
    sqlAssistantPrompt,
    'reasoning'
  );
}
