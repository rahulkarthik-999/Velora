import { NextRequest } from 'next/server';
import {
  handleCareerEndpoint,
  ResumeAnalyzeInput,
  ResumeAnalyzeOutput,
  resumeAnalyzePrompt,
} from '@/lib/career';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handleCareerEndpoint(
    req,
    'career-resume-analyze',
    ResumeAnalyzeInput,
    ResumeAnalyzeOutput,
    resumeAnalyzePrompt,
    'chat'
  );
}
