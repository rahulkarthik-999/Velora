import { NextRequest } from 'next/server';
import {
  handleCareerEndpoint,
  JobMatchInput,
  JobMatchOutput,
  jobMatchPrompt,
} from '@/lib/career';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handleCareerEndpoint(
    req,
    'career-job-match',
    JobMatchInput,
    JobMatchOutput,
    jobMatchPrompt,
    'chat'
  );
}
