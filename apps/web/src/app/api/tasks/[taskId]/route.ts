import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { getAuthenticatedUser, unauthorized, badRequest, notFound, serverError, success } from '@/lib/api-utils';
import { UpdateTaskInputSchema, isValidTaskTransition } from '@velora/schemas';

export const dynamic = 'force-dynamic';

// GET /api/tasks/:taskId
export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    const task = await prisma.task.findUnique({
      where: { id: params.taskId },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          include: {
            artifact: true,
            approvals: { where: { status: 'PENDING' } },
          },
        },
        artifacts: { orderBy: { createdAt: 'desc' } },
        attachments: true,
        events: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!task) return notFound('Task not found');
    if (task.userId !== user.id) return unauthorized();

    return success(task);
  } catch (error) {
    console.error('[GET /api/tasks/:id]', error);
    return serverError();
  }
}

// PATCH /api/tasks/:taskId
export async function PATCH(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    const task = await prisma.task.findUnique({ where: { id: params.taskId } });
    if (!task) return notFound('Task not found');
    if (task.userId !== user.id) return unauthorized();

    const body = await req.json();
    const parsed = UpdateTaskInputSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map(i => i.message).join(', '));
    }

    const updates: Record<string, unknown> = {};

    if (parsed.data.title) updates.title = parsed.data.title;
    if (parsed.data.deadline !== undefined) {
      updates.deadline = parsed.data.deadline ? new Date(parsed.data.deadline) : null;
    }
    if (parsed.data.priority) updates.priority = parsed.data.priority;
    if (parsed.data.finalOutcome) updates.finalOutcome = parsed.data.finalOutcome;

    if (parsed.data.status) {
      if (!isValidTaskTransition(task.status as any, parsed.data.status)) {
        return badRequest(`Cannot transition from ${task.status} to ${parsed.data.status}`);
      }
      updates.status = parsed.data.status;
      if (parsed.data.status === 'COMPLETED') {
        updates.completedAt = new Date();
      }
    }

    const updated = await prisma.task.update({
      where: { id: params.taskId },
      data: updates,
      include: {
        steps: { orderBy: { order: 'asc' } },
        attachments: true,
      },
    });

    await prisma.taskEvent.create({
      data: {
        taskId: task.id,
        type: 'TASK_UPDATED',
        message: `Task updated: ${Object.keys(updates).join(', ')}`,
        metadata: JSON.parse(JSON.stringify(updates)),
      },
    });

    return success(updated);
  } catch (error) {
    console.error('[PATCH /api/tasks/:id]', error);
    return serverError();
  }
}

// DELETE /api/tasks/:taskId
export async function DELETE(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    const task = await prisma.task.findUnique({ where: { id: params.taskId } });
    if (!task) return notFound('Task not found');
    if (task.userId !== user.id) return unauthorized();

    await prisma.task.delete({ where: { id: params.taskId } });

    return success({ deleted: true });
  } catch (error) {
    console.error('[DELETE /api/tasks/:id]', error);
    return serverError();
  }
}
