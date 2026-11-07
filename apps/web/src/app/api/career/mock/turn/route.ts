import { NextRequest } from 'next/server';
import {
  handleCareerEndpoint,
  MockTurnInput,
  MockTurnOutput,
  mockTurnPrompt,
} from '@/lib/career';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handleCareerEndpoint(
    req,
    'career-mock-turn',
    MockTurnInput,
    MockTurnOutput,
    mockTurnPrompt,
    'chat'
  );
}
