import { NextRequest } from 'next/server';
import {
  handleCareerEndpoint,
  ReportEvaluateInput,
  ReportEvaluateModelOutput,
  reportEvaluatePrompt,
  computeObjectiveSpeechMetrics,
} from '@/lib/career';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  let speechMetrics = undefined;
  try {
    const raw = await cloned.json();
    const parsed = ReportEvaluateInput.safeParse(raw);
    if (parsed.success) {
      speechMetrics = computeObjectiveSpeechMetrics(parsed.data.turns);
    }
  } catch {
    // handled by handleCareerEndpoint
  }

  return handleCareerEndpoint(
    req,
    'career-report-evaluate',
    ReportEvaluateInput,
    ReportEvaluateModelOutput,
    reportEvaluatePrompt,
    'reasoning',
    speechMetrics ? { speechMetrics } : undefined
  );
}
