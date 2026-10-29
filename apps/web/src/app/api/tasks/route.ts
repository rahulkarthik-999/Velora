import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthenticatedUser, unauthorized, badRequest, serverError, success, checkRateLimit } from '@/lib/api-utils';
import { CreateTaskInputSchema } from '@velora/schemas';
import { generateWorkflow } from '@/lib/ai/planner';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

// GET /api/tasks — List user's tasks
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = { userId: user.id };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { originalGoal: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where: where as any,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          steps: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              title: true,
              status: true,
              order: true,
              stepType: true,
            },
          },
          _count: {
            select: {
              artifacts: true,
              attachments: true,
            },
          },
        },
      }),
      prisma.task.count({ where: where as any }),
    ]);

    return success({
      data: tasks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[GET /api/tasks]', error);
    return serverError();
  }
}

// POST /api/tasks — Create a new task and generate workflow
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    if (!checkRateLimit(`create-task:${user.id}`, 10, 60000)) {
      return NextResponse.json(
        { error: 'Too many task creation requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = CreateTaskInputSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map(i => i.message).join(', '));
    }

    const { goal, deadline, priority, attachmentIds } = parsed.data;

    // Check active task limits
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    const tier = (sub?.tier || 'FREE') as 'FREE' | 'PLUS' | 'PRO';
    const { TIER_LIMITS } = await import('@velora/schemas');
    const limits = TIER_LIMITS[tier];

    const activeCount = await prisma.task.count({
      where: {
        userId: user.id,
        status: { in: ['DRAFT', 'PLANNING', 'READY', 'IN_PROGRESS', 'WAITING_FOR_USER', 'BLOCKED'] },
      },
    });

    if (activeCount >= limits.maxActiveTasks) {
      return badRequest(`Active task limit reached (${limits.maxActiveTasks}). Complete or cancel existing tasks to create new ones.`);
    }

    // Collect attachment info for AI context
    let attachmentInfo: string | undefined;
    if (attachmentIds.length > 0) {
      const attachments = await prisma.taskAttachment.findMany({
        where: { id: { in: attachmentIds }, userId: user.id },
      });
      if (attachments.length > 0) {
        attachmentInfo = attachments
          .map(a => `${a.fileName} (${a.fileType})${a.extractedText ? `: ${a.extractedText.slice(0, 1000)}` : ''}`)
          .join('\n');
      }
    }

    // Create task in PLANNING status
    const task = await prisma.task.create({
      data: {
        userId: user.id,
        title: goal.slice(0, 100),
        originalGoal: goal,
        priority,
        deadline: deadline ? new Date(deadline) : undefined,
        status: 'PLANNING',
      },
    });

    // Link attachments to task
    if (attachmentIds.length > 0) {
      await prisma.taskAttachment.updateMany({
        where: { id: { in: attachmentIds }, userId: user.id },
        data: { taskId: task.id },
      });
    }

    // Log event
    await prisma.taskEvent.create({
      data: {
        taskId: task.id,
        type: 'TASK_CREATED',
        message: 'Task created and workflow generation started',
      },
    });

    // Generate workflow using AI
    try {
      const { workflow, usage } = await generateWorkflow(goal, undefined, attachmentInfo);

      // Check if clarification is needed
      if (workflow.clarificationNeeded && workflow.clarificationQuestion) {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            title: workflow.title,
            normalizedObjective: workflow.normalizedObjective,
            status: 'WAITING_FOR_USER',
            context: workflow.clarificationQuestion,
          },
        });

        // Record usage
        await prisma.usageLedger.create({
          data: {
            userId: user.id,
            taskId: task.id,
            provider: process.env.AI_PROVIDER || 'openai',
            model: usage.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            creditsUsed: 1,
            estimatedCostUsd: (usage.inputTokens * 0.000005) + (usage.outputTokens * 0.000015),
          },
        });

        const fullTask = await prisma.task.findUnique({
          where: { id: task.id },
          include: { steps: { orderBy: { order: 'asc' } }, attachments: true },
        });

        return success(fullTask, 201);
      }

      // Create workflow steps
      const stepIds: string[] = [];
      for (const step of workflow.steps) {
        const stepId = uuid();
        stepIds.push(stepId);
      }

      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        const depIds = step.dependencies
          .filter(depIdx => depIdx >= 0 && depIdx < stepIds.length)
          .map(depIdx => stepIds[depIdx]);

        await prisma.workflowStep.create({
          data: {
            id: stepIds[i],
            taskId: task.id,
            title: step.title,
            description: step.description,
            stepType: step.stepType,
            order: step.order,
            status: step.dependencies.length === 0 ? 'READY' : 'PENDING',
            dependencies: depIds,
            inputRequirements: step.inputRequirements,
            executionStrategy: step.executionStrategy,
            expectedOutput: step.expectedOutput,
            requiresApproval: step.requiresApproval,
            verificationMethod: step.verificationMethod,
          },
        });
      }

      // Update task
      await prisma.task.update({
        where: { id: task.id },
        data: {
          title: workflow.title,
          normalizedObjective: workflow.normalizedObjective,
          completionCriteria: workflow.completionCriteria,
          context: workflow.context,
          status: 'READY',
        },
      });

      // Record usage
      await prisma.usageLedger.create({
        data: {
          userId: user.id,
          taskId: task.id,
          provider: process.env.AI_PROVIDER || 'openai',
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          creditsUsed: 1,
          estimatedCostUsd: (usage.inputTokens * 0.000005) + (usage.outputTokens * 0.000015),
        },
      });

      // Track analytics
      await prisma.analyticsEvent.create({
        data: {
          userId: user.id,
          eventType: 'WORKFLOW_GENERATED',
          properties: { taskId: task.id, stepCount: workflow.steps.length },
        },
      });

      const fullTask = await prisma.task.findUnique({
        where: { id: task.id },
        include: {
          steps: { orderBy: { order: 'asc' } },
          attachments: true,
          _count: { select: { artifacts: true } },
        },
      });

      return success(fullTask, 201);
    } catch (aiError) {
      // AI failed, but task exists — mark as FAILED
      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'FAILED' },
      });

      await prisma.taskEvent.create({
        data: {
          taskId: task.id,
          type: 'WORKFLOW_GENERATION_FAILED',
          message: `Workflow generation failed: ${aiError instanceof Error ? aiError.message : 'Unknown error'}`,
        },
      });

      return serverError('Failed to generate workflow. Please try again.');
    }
  } catch (error) {
    console.error('[POST /api/tasks]', error);
    return serverError();
  }
}
