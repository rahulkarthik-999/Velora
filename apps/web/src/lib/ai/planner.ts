import { getAIProvider } from './provider';
import { AIWorkflowResponseSchema, type AIWorkflowResponse } from '@velora/schemas';

const WORKFLOW_PLANNER_SYSTEM_PROMPT = `You are Velora's workflow planner. Your job is to analyze a user's goal and create a structured, actionable workflow.

RULES:
1. Break the goal into clear, sequential steps.
2. Each step must be independently executable.
3. Use appropriate step types from: GENERATE_TEXT, DRAFT_EMAIL, SUMMARIZE_DOCUMENT, EXTRACT_INFORMATION, ANALYZE_IMAGE, GENERATE_CHECKLIST, COMPARE_INFORMATION, CREATE_REPORT, PRODUCE_PLAN, REQUEST_USER_INPUT, REQUEST_APPROVAL, MARK_COMPLETE, VERIFY_ARTIFACT
4. Mark steps that need user approval (sending emails, publishing, etc.) with requiresApproval: true
5. Keep workflows practical — 3 to 12 steps typically.
6. Define clear dependencies using step order indexes (0-based).
7. If the goal is too vague, set clarificationNeeded to true and provide a clarificationQuestion.
8. Each step should have a clear expectedOutput description.
9. Distinguish between what Velora can generate and what requires user action.
10. Do NOT create unnecessary steps. Be efficient.

Respond ONLY with valid JSON matching the specified schema.`;

export async function generateWorkflow(
  goal: string,
  context?: string,
  attachmentInfo?: string
): Promise<{ workflow: AIWorkflowResponse; usage: { inputTokens: number; outputTokens: number; model: string } }> {
  const provider = getAIProvider();

  const userMessage = [
    `USER GOAL: ${goal}`,
    context ? `ADDITIONAL CONTEXT: ${context}` : '',
    attachmentInfo ? `ATTACHED FILES: ${attachmentInfo}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const schemaDescription = JSON.stringify({
    title: 'string (max 500 chars)',
    normalizedObjective: 'string — clear restatement of the goal',
    completionCriteria: 'string — how to know the task is done',
    context: 'string (optional) — relevant background',
    clarificationNeeded: 'boolean',
    clarificationQuestion: 'string (optional)',
    steps: [
      {
        title: 'string',
        description: 'string',
        stepType: 'one of the step types listed',
        order: 'number (0-based)',
        dependencies: 'array of step order indexes this depends on',
        inputRequirements: 'string (optional)',
        executionStrategy: 'string (optional)',
        expectedOutput: 'string (optional)',
        requiresApproval: 'boolean',
        verificationMethod: 'string (optional)',
      },
    ],
  });

  const result = await provider.generateStructuredOutput<AIWorkflowResponse>({
    messages: [
      { role: 'system', content: WORKFLOW_PLANNER_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    schema: schemaDescription,
    temperature: 0.4,
    maxTokens: 4096,
  });

  // Validate against Zod schema
  const parsed = AIWorkflowResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    // Attempt repair: retry once with error feedback
    const retryResult = await provider.generateStructuredOutput<AIWorkflowResponse>({
      messages: [
        { role: 'system', content: WORKFLOW_PLANNER_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
        {
          role: 'system',
          content: `Your previous response had validation errors: ${JSON.stringify(parsed.error.flatten().fieldErrors)}. Please fix and respond with valid JSON.`,
        },
      ],
      schema: schemaDescription,
      temperature: 0.3,
      maxTokens: 4096,
    });

    const retryParsed = AIWorkflowResponseSchema.safeParse(retryResult.data);
    if (!retryParsed.success) {
      throw new Error(`Workflow generation failed validation after retry: ${JSON.stringify(retryParsed.error.flatten().fieldErrors)}`);
    }

    return {
      workflow: retryParsed.data,
      usage: {
        inputTokens: result.inputTokens + retryResult.inputTokens,
        outputTokens: result.outputTokens + retryResult.outputTokens,
        model: retryResult.model,
      },
    };
  }

  return {
    workflow: parsed.data,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      model: result.model,
    },
  };
}
