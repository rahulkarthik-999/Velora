import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorized, serverError } from '@/lib/api-utils';
import { getWorkflowEngine, EngineError } from '@/lib/engine/workflow-engine';

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string; stepId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    const engine = getWorkflowEngine();
    await engine.skipStep(params.stepId, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof EngineError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error('[POST skip step]', error);
    return serverError();
  }
}
