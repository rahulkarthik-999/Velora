import { NextRequest } from 'next/server';
import {
  handleCareerEndpoint,
  RoadmapGenerateInput,
  RoadmapGenerateOutput,
  roadmapGeneratePrompt,
} from '@/lib/career';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handleCareerEndpoint(
    req,
    'career-roadmap-generate',
    RoadmapGenerateInput,
    RoadmapGenerateOutput,
    roadmapGeneratePrompt,
    'reasoning'
  );
}
