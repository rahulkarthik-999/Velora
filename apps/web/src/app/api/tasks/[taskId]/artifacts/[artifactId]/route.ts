import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthenticatedUser, unauthorized, notFound, badRequest, serverError, success } from '@/lib/api-utils';

// PATCH /api/tasks/:taskId/artifacts/:artifactId
export async function PATCH(
  req: NextRequest,
  { params }: { params: { taskId: string; artifactId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    const artifact = await prisma.taskArtifact.findUnique({
      where: { id: params.artifactId },
    });
    if (!artifact) return notFound('Artifact not found');
    if (artifact.userId !== user.id) return unauthorized();
    if (artifact.taskId !== params.taskId) return badRequest('Artifact does not belong to this task');

    const body = await req.json();
    const { content, title } = body;

    if (!content && !title) return badRequest('content or title is required');

    const updated = await prisma.taskArtifact.update({
      where: { id: params.artifactId },
      data: {
        ...(content ? { content, isEdited: true, version: { increment: 1 } } : {}),
        ...(title ? { title } : {}),
      },
    });

    return success(updated);
  } catch (error) {
    console.error('[PATCH artifact]', error);
    return serverError();
  }
}
