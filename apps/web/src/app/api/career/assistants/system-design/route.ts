import { NextRequest } from 'next/server';
import {
  handleCareerEndpoint,
  SystemDesignInput,
  SystemDesignOutput,
  systemDesignPrompt,
} from '@/lib/career';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handleCareerEndpoint(
    req,
    'career-assistant-system-design',
    SystemDesignInput,
    SystemDesignOutput,
    systemDesignPrompt,
    'reasoning'
  );
}
