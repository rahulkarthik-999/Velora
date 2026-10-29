import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorized, serverError, checkRateLimit } from '@/lib/api-utils';
import { getWorkflowEngine, EngineError } from '@/lib/engine/workflow-engine';
import { NextResponse } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string; stepId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    if (!checkRateLimit(`exec-step:${user.id}`, 20, 60000)) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const engine = getWorkflowEngine();

    const result = await engine.executeStep(
      params.stepId,
      user.id,
      body.userInput
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EngineError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error('[POST execute step]', error);
    return serverError();
  }
}
