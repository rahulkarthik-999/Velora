import { getAIProvider, AIProviderError } from './provider';
import type { StepType } from '@velora/schemas';

// ============================================================================
// Step Handler Registry
// ============================================================================

export interface StepHandlerInput {
  stepTitle: string;
  stepDescription: string;
  inputRequirements?: string;
  executionStrategy?: string;
  expectedOutput?: string;
  taskGoal: string;
  taskContext?: string;
  previousStepOutputs: Array<{ title: string; output: string }>;
  attachmentTexts?: string[];
  userInput?: string;
}

export interface StepHandlerResult {
  output: string;
  artifactTitle?: string;
  artifactType?: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    model: string;
  };
}

type StepHandler = (input: StepHandlerInput) => Promise<StepHandlerResult>;

const handlers: Record<string, StepHandler> = {};

function registerHandler(type: StepType, handler: StepHandler) {
  handlers[type] = handler;
}

export function getHandler(type: string): StepHandler | undefined {
  return handlers[type];
}

// ============================================================================
// Shared helper
// ============================================================================

function buildContext(input: StepHandlerInput): string {
  const parts: string[] = [
    `TASK GOAL: ${input.taskGoal}`,
  ];
  if (input.taskContext) parts.push(`CONTEXT: ${input.taskContext}`);
  if (input.previousStepOutputs.length > 0) {
    parts.push('PREVIOUS STEP RESULTS:');
    for (const prev of input.previousStepOutputs) {
      parts.push(`- ${prev.title}: ${prev.output.slice(0, 2000)}`);
    }
  }
  if (input.attachmentTexts && input.attachmentTexts.length > 0) {
    parts.push('ATTACHED DOCUMENTS:');
    for (const text of input.attachmentTexts) {
      parts.push(text.slice(0, 5000));
    }
  }
  if (input.userInput) {
    parts.push(`USER INPUT: ${input.userInput}`);
  }
  return parts.join('\n\n');
}

async function generateForStep(
  input: StepHandlerInput,
  systemPrompt: string,
  artifactType: string
): Promise<StepHandlerResult> {
  const provider = getAIProvider();
  const context = buildContext(input);

  const result = await provider.generateText({
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `${context}\n\nSTEP: ${input.stepTitle}\nDESCRIPTION: ${input.stepDescription}\n${input.executionStrategy ? `STRATEGY: ${input.executionStrategy}` : ''}\n${input.expectedOutput ? `EXPECTED OUTPUT: ${input.expectedOutput}` : ''}`,
      },
    ],
    temperature: 0.6,
    maxTokens: 4096,
  });

  return {
    output: result.content,
    artifactTitle: input.stepTitle,
    artifactType,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      model: result.model,
    },
  };
}

// ============================================================================
// Register all handlers
// ============================================================================

registerHandler('GENERATE_TEXT', async (input) => {
  return generateForStep(
    input,
    'You are a professional writer. Generate clear, well-structured content based on the task requirements. Use appropriate formatting with headings, bullet points, and sections where helpful. Write in a professional but accessible tone.',
    'TEXT'
  );
});

registerHandler('DRAFT_EMAIL', async (input) => {
  return generateForStep(
    input,
    'You are an expert email writer. Draft a professional email based on the requirements. Include a clear subject line, appropriate greeting, well-structured body, and professional closing. Format as:\n\nSubject: [subject]\n\n[email body]',
    'EMAIL_DRAFT'
  );
});

registerHandler('SUMMARIZE_DOCUMENT', async (input) => {
  return generateForStep(
    input,
    'You are an expert at summarizing documents. Create a clear, comprehensive summary that captures key points, main arguments, important details, and action items. Use structured formatting with sections and bullet points.',
    'SUMMARY'
  );
});

registerHandler('EXTRACT_INFORMATION', async (input) => {
  return generateForStep(
    input,
    'You are an expert at extracting and organizing information. Analyze the provided content and extract the requested information in a clear, structured format. Use tables, lists, or categories as appropriate.',
    'EXTRACTED_DATA'
  );
});

registerHandler('ANALYZE_IMAGE', async (input) => {
  return generateForStep(
    input,
    'You are an expert at analyzing visual content. Based on the description and context provided, provide a detailed analysis. Note: If actual image analysis is needed, describe what you would look for and any information that can be derived from the attached document descriptions.',
    'ANALYSIS'
  );
});

registerHandler('GENERATE_CHECKLIST', async (input) => {
  return generateForStep(
    input,
    'You are an expert at creating actionable checklists. Generate a comprehensive, ordered checklist with clear, specific items. Group related items together. Each item should be actionable and verifiable. Use checkbox formatting:\n- [ ] Item description',
    'CHECKLIST'
  );
});

registerHandler('COMPARE_INFORMATION', async (input) => {
  return generateForStep(
    input,
    'You are an expert at comparative analysis. Compare the provided items/options based on relevant criteria. Use a structured format with categories, pros/cons, or a comparison table. Provide a clear recommendation.',
    'ANALYSIS'
  );
});

registerHandler('CREATE_REPORT', async (input) => {
  return generateForStep(
    input,
    'You are an expert report writer. Create a professional, well-structured report with:\n- Executive summary\n- Key findings\n- Detailed analysis\n- Recommendations\n- Next steps\n\nUse clear headings, data points, and professional formatting.',
    'REPORT'
  );
});

registerHandler('PRODUCE_PLAN', async (input) => {
  return generateForStep(
    input,
    'You are an expert planner. Create a detailed, actionable plan with:\n- Clear objectives\n- Timeline or phases\n- Required resources\n- Milestones\n- Risk considerations\n- Success criteria\n\nBe specific and realistic.',
    'PLAN'
  );
});

registerHandler('REQUEST_USER_INPUT', async (input) => {
  return {
    output: `**User input needed:** ${input.stepDescription}\n\n${input.inputRequirements || 'Please provide the requested information to continue.'}`,
    artifactTitle: input.stepTitle,
    artifactType: 'TEXT',
    usage: { inputTokens: 0, outputTokens: 0, model: 'none' },
  };
});

registerHandler('REQUEST_APPROVAL', async (input) => {
  return {
    output: `**Approval required:** ${input.stepDescription}\n\nPlease review and approve to proceed.`,
    artifactTitle: input.stepTitle,
    artifactType: 'TEXT',
    usage: { inputTokens: 0, outputTokens: 0, model: 'none' },
  };
});

registerHandler('MARK_COMPLETE', async (input) => {
  return {
    output: `Step "${input.stepTitle}" has been marked as complete.`,
    artifactType: 'TEXT',
    usage: { inputTokens: 0, outputTokens: 0, model: 'none' },
  };
});

registerHandler('VERIFY_ARTIFACT', async (input) => {
  return generateForStep(
    input,
    'You are a quality reviewer. Verify the previous outputs against the expected criteria. Provide:\n- Verification status (PASS/NEEDS REVISION)\n- What was checked\n- Any issues found\n- Suggestions for improvement',
    'ANALYSIS'
  );
});
