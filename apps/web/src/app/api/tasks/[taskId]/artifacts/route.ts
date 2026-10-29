import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthenticatedUser, unauthorized, notFound, badRequest, serverError, success } from '@/lib/api-utils';

// GET /api/tasks/:taskId/artifacts
export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    const task = await prisma.task.findUnique({ where: { id: params.taskId } });
    if (!task || task.userId !== user.id) return unauthorized();

    const artifacts = await prisma.taskArtifact.findMany({
      where: { taskId: params.taskId },
      orderBy: { createdAt: 'desc' },
    });

    return success(artifacts);
  } catch (error) {
    console.error('[GET artifacts]', error);
    return serverError();
  }
}
