// ============================================================================
// Workflow Execution Engine
// ============================================================================

import prisma from '@/lib/db';
import { getHandler, type StepHandlerInput } from '@/lib/ai/handlers';
import { isValidTaskTransition, isValidStepTransition, TIER_LIMITS, type SubscriptionTier } from '@velora/schemas';

export class WorkflowEngine {
  // --------------------------------------------------------------------------
  // Execute a single step
  // --------------------------------------------------------------------------
  async executeStep(
    stepId: string,
    userId: string,
    userInput?: string
  ): Promise<{
    success: boolean;
    output?: string;
    artifactId?: string;
    error?: string;
  }> {
    // 1. Fetch step with task and validate ownership
    const step = await prisma.workflowStep.findUnique({
      where: { id: stepId },
      include: {
        task: {
          include: {
            steps: { orderBy: { order: 'asc' } },
            attachments: true,
          },
        },
      },
    });

    if (!step) throw new EngineError('Step not found', 404);
    if (step.task.userId !== userId) throw new EngineError('Unauthorized', 403);

    // 2. Check dependencies are satisfied
    if (step.dependencies.length > 0) {
      const depSteps = step.task.steps.filter((s) =>
        step.dependencies.includes(s.id)
      );
      const unmetDeps = depSteps.filter((s) => s.status !== 'COMPLETED');
      if (unmetDeps.length > 0) {
        throw new EngineError(
          `Dependencies not met: ${unmetDeps.map((s) => s.title).join(', ')}`,
          400
        );
      }
    }

    // 3. Check usage limits
    await this.checkUsageLimits(userId);

    // 4. Validate state transition
    if (!isValidStepTransition(step.status, 'RUNNING')) {
      throw new EngineError(
        `Cannot run step in status ${step.status}`,
        400
      );
    }

    // 5. Update step to RUNNING
    await prisma.workflowStep.update({
      where: { id: stepId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        retryCount: step.status === 'FAILED' ? step.retryCount + 1 : step.retryCount,
      },
    });

    // Ensure task is IN_PROGRESS
    if (step.task.status !== 'IN_PROGRESS') {
      if (isValidTaskTransition(step.task.status, 'IN_PROGRESS')) {
        await prisma.task.update({
          where: { id: step.task.id },
          data: { status: 'IN_PROGRESS' },
        });
      }
    }

    try {
      // 6. Get handler
      const handler = getHandler(step.stepType);
      if (!handler) {
        throw new EngineError(`No handler for step type: ${step.stepType}`, 400);
      }

      // 7. Collect context from previous completed steps
      const previousOutputs = step.task.steps
        .filter((s) => s.status === 'COMPLETED' && s.order < step.order && s.actualOutput)
        .map((s) => ({ title: s.title, output: s.actualOutput! }));

      // Collect attachment text
      const attachmentTexts = step.task.attachments
        .filter((a) => a.extractedText)
        .map((a) => `[${a.fileName}]: ${a.extractedText!}`);

      // 8. Execute
      const input: StepHandlerInput = {
        stepTitle: step.title,
        stepDescription: step.description,
        inputRequirements: step.inputRequirements || undefined,
        executionStrategy: step.executionStrategy || undefined,
        expectedOutput: step.expectedOutput || undefined,
        taskGoal: step.task.originalGoal,
        taskContext: step.task.context || undefined,
        previousStepOutputs: previousOutputs,
        attachmentTexts,
        userInput,
      };

      const result = await handler(input);

      // 9. Create artifact if output exists
      let artifactId: string | undefined;
      if (result.output && result.artifactType) {
        const artifact = await prisma.taskArtifact.create({
          data: {
            taskId: step.task.id,
            stepId: step.id,
            userId,
            title: result.artifactTitle || step.title,
            type: (result.artifactType as 'TEXT' | 'MARKDOWN' | 'EMAIL_DRAFT' | 'CHECKLIST' | 'REPORT' | 'SUMMARY' | 'PLAN' | 'EXTRACTED_DATA' | 'ANALYSIS'),
            content: result.output,
          },
        });
        artifactId = artifact.id;
      }

      // 10. Determine final status
      const finalStatus = step.requiresApproval ? 'WAITING_FOR_APPROVAL' : 'COMPLETED';

      // 11. Update step
      await prisma.workflowStep.update({
        where: { id: stepId },
        data: {
          status: finalStatus,
          actualOutput: result.output,
          artifactId,
          completedAt: finalStatus === 'COMPLETED' ? new Date() : undefined,
        },
      });

      // 12. Record usage
      if (result.usage.inputTokens > 0 || result.usage.outputTokens > 0) {
        await prisma.usageLedger.create({
          data: {
            userId,
            taskId: step.task.id,
            stepId: step.id,
            provider: process.env.AI_PROVIDER || 'openai',
            model: result.usage.model,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            creditsUsed: 1,
            estimatedCostUsd: this.estimateCost(result.usage.inputTokens, result.usage.outputTokens),
          },
        });
      }

      // 13. Create event
      await prisma.taskEvent.create({
        data: {
          taskId: step.task.id,
          type: 'STEP_COMPLETED',
          message: `Step "${step.title}" ${finalStatus === 'COMPLETED' ? 'completed' : 'awaiting approval'}`,
          metadata: { stepId: step.id, status: finalStatus },
        },
      });

      // 14. Update readiness of dependent steps
      await this.updateDependentSteps(step.task.id, step.id);

      // 15. Update task progress
      await this.updateTaskProgress(step.task.id);

      // 16. If step needs approval, set task to WAITING_FOR_USER
      if (finalStatus === 'WAITING_FOR_APPROVAL') {
        await prisma.approvalRequest.create({
          data: {
            taskId: step.task.id,
            stepId: step.id,
            description: `Approve output for: ${step.title}`,
          },
        });
        await prisma.task.update({
          where: { id: step.task.id },
          data: { status: 'WAITING_FOR_USER' },
        });
      }

      return { success: true, output: result.output, artifactId };
    } catch (error) {
      // Handle failure
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      await prisma.workflowStep.update({
        where: { id: stepId },
        data: {
          status: 'FAILED',
          errorDetails: errorMsg,
        },
      });

      await prisma.taskEvent.create({
        data: {
          taskId: step.task.id,
          type: 'STEP_FAILED',
          message: `Step "${step.title}" failed: ${errorMsg}`,
          metadata: { stepId: step.id },
        },
      });

      if (error instanceof EngineError) throw error;
      throw new EngineError(`Step execution failed: ${errorMsg}`, 500);
    }
  }

  // --------------------------------------------------------------------------
  // Update dependent steps to READY when dependencies are met
  // --------------------------------------------------------------------------
  private async updateDependentSteps(taskId: string, completedStepId: string) {
    const allSteps = await prisma.workflowStep.findMany({
      where: { taskId },
    });

    for (const step of allSteps) {
      if (
        step.dependencies.includes(completedStepId) &&
        (step.status === 'PENDING' || step.status === 'BLOCKED')
      ) {
        const allDependenciesMet = step.dependencies.every((depId) => {
          const dep = allSteps.find((s) => s.id === depId);
          return dep?.status === 'COMPLETED';
        });

        if (allDependenciesMet) {
          await prisma.workflowStep.update({
            where: { id: step.id },
            data: { status: 'READY' },
          });
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Update task progress percentage
  // --------------------------------------------------------------------------
  async updateTaskProgress(taskId: string) {
    const steps = await prisma.workflowStep.findMany({
      where: { taskId },
    });

    const total = steps.length;
    const completed = steps.filter(
      (s) => s.status === 'COMPLETED' || s.status === 'SKIPPED'
    ).length;

    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    const allDone = steps.every(
      (s) => s.status === 'COMPLETED' || s.status === 'SKIPPED'
    );

    await prisma.task.update({
      where: { id: taskId },
      data: {
        progressPercent,
        ...(allDone
          ? { status: 'COMPLETED', completedAt: new Date() }
          : {}),
      },
    });
  }

  // --------------------------------------------------------------------------
  // Check usage limits
  // --------------------------------------------------------------------------
  private async checkUsageLimits(userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    const tier: SubscriptionTier = (subscription?.tier as SubscriptionTier) || 'FREE';
    const limits = TIER_LIMITS[tier];

    // Check monthly usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyUsage = await prisma.usageLedger.aggregate({
      where: {
        userId,
        createdAt: { gte: startOfMonth },
      },
      _sum: { creditsUsed: true },
    });

    const used = monthlyUsage._sum.creditsUsed || 0;
    if (used >= limits.monthlyAICredits) {
      throw new EngineError(
        `Monthly usage limit reached (${used}/${limits.monthlyAICredits} credits). Upgrade your plan for more.`,
        429
      );
    }
  }

  // --------------------------------------------------------------------------
  // Estimate cost
  // --------------------------------------------------------------------------
  private estimateCost(inputTokens: number, outputTokens: number): number {
    // Rough estimate based on typical pricing
    return (inputTokens * 0.000005) + (outputTokens * 0.000015);
  }

  // --------------------------------------------------------------------------
  // Approve a step
  // --------------------------------------------------------------------------
  async approveStep(
    stepId: string,
    userId: string,
    approved: boolean,
    response?: string
  ) {
    const step = await prisma.workflowStep.findUnique({
      where: { id: stepId },
      include: { task: true },
    });

    if (!step) throw new EngineError('Step not found', 404);
    if (step.task.userId !== userId) throw new EngineError('Unauthorized', 403);
    if (step.status !== 'WAITING_FOR_APPROVAL') {
      throw new EngineError('Step is not awaiting approval', 400);
    }

    // Update approval request
    await prisma.approvalRequest.updateMany({
      where: { stepId, status: 'PENDING' },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        response,
        respondedAt: new Date(),
      },
    });

    if (approved) {
      await prisma.workflowStep.update({
        where: { id: stepId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      await this.updateDependentSteps(step.task.id, stepId);
      await this.updateTaskProgress(step.task.id);

      // Move task back to IN_PROGRESS if it was waiting
      if (step.task.status === 'WAITING_FOR_USER') {
        await prisma.task.update({
          where: { id: step.task.id },
          data: { status: 'IN_PROGRESS' },
        });
      }
    } else {
      // Rejected — move back to READY for re-execution
      await prisma.workflowStep.update({
        where: { id: stepId },
        data: { status: 'READY', actualOutput: null, artifactId: null },
      });

      if (step.task.status === 'WAITING_FOR_USER') {
        await prisma.task.update({
          where: { id: step.task.id },
          data: { status: 'IN_PROGRESS' },
        });
      }
    }

    await prisma.taskEvent.create({
      data: {
        taskId: step.task.id,
        type: approved ? 'STEP_APPROVED' : 'STEP_REJECTED',
        message: `Step "${step.title}" was ${approved ? 'approved' : 'rejected'}${response ? `: ${response}` : ''}`,
        metadata: { stepId },
      },
    });
  }

  // --------------------------------------------------------------------------
  // Skip a step
  // --------------------------------------------------------------------------
  async skipStep(stepId: string, userId: string) {
    const step = await prisma.workflowStep.findUnique({
      where: { id: stepId },
      include: { task: true },
    });

    if (!step) throw new EngineError('Step not found', 404);
    if (step.task.userId !== userId) throw new EngineError('Unauthorized', 403);

    if (!isValidStepTransition(step.status, 'SKIPPED')) {
      throw new EngineError(`Cannot skip step in status ${step.status}`, 400);
    }

    await prisma.workflowStep.update({
      where: { id: stepId },
      data: { status: 'SKIPPED', completedAt: new Date() },
    });

    await this.updateDependentSteps(step.task.id, stepId);
    await this.updateTaskProgress(step.task.id);

    await prisma.taskEvent.create({
      data: {
        taskId: step.task.id,
        type: 'STEP_SKIPPED',
        message: `Step "${step.title}" was skipped`,
        metadata: { stepId },
      },
    });
  }

  // --------------------------------------------------------------------------
  // Retry a failed step
  // --------------------------------------------------------------------------
  async retryStep(stepId: string, userId: string) {
    const step = await prisma.workflowStep.findUnique({
      where: { id: stepId },
      include: { task: true },
    });

    if (!step) throw new EngineError('Step not found', 404);
    if (step.task.userId !== userId) throw new EngineError('Unauthorized', 403);
    if (step.status !== 'FAILED') {
      throw new EngineError('Can only retry failed steps', 400);
    }
    if (step.retryCount >= step.maxRetries) {
      throw new EngineError(
        `Maximum retries (${step.maxRetries}) reached`,
        400
      );
    }

    // Move to READY, then execute
    await prisma.workflowStep.update({
      where: { id: stepId },
      data: { status: 'READY' },
    });

    return this.executeStep(stepId, userId);
  }
}

export class EngineError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

// Singleton
let engineInstance: WorkflowEngine | null = null;

export function getWorkflowEngine(): WorkflowEngine {
  if (!engineInstance) {
    engineInstance = new WorkflowEngine();
  }
  return engineInstance;
}
