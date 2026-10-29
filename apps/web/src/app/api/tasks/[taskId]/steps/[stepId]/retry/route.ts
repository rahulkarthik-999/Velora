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
    const result = await engine.retryStep(params.stepId, user.id);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EngineError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error('[POST retry step]', error);
    return serverError();
  }
}
