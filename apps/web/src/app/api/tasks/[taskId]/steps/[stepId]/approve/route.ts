import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorized, badRequest, serverError } from '@/lib/api-utils';
import { getWorkflowEngine, EngineError } from '@/lib/engine/workflow-engine';

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string; stepId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    const body = await req.json();
    if (typeof body.approved !== 'boolean') {
      return badRequest('approved field is required');
    }

    const engine = getWorkflowEngine();
    await engine.approveStep(params.stepId, user.id, body.approved, body.response);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof EngineError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error('[POST approve step]', error);
    return serverError();
  }
}
