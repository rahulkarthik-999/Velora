import { z } from 'zod';

// ============================================================================
// Task States
// ============================================================================

export const TaskStatus = z.enum([
  'DRAFT',
  'PLANNING',
  'READY',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
  'BLOCKED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const StepStatus = z.enum([
  'PENDING',
  'READY',
  'RUNNING',
  'WAITING_FOR_APPROVAL',
  'COMPLETED',
  'FAILED',
  'SKIPPED',
  'BLOCKED',
]);
export type StepStatus = z.infer<typeof StepStatus>;

// Valid task state transitions
export const VALID_TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  DRAFT: ['PLANNING', 'CANCELLED'],
  PLANNING: ['READY', 'FAILED', 'CANCELLED'],
  READY: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_FOR_USER', 'BLOCKED', 'COMPLETED', 'FAILED', 'CANCELLED'],
  WAITING_FOR_USER: ['IN_PROGRESS', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED', 'FAILED'],
  COMPLETED: ['IN_PROGRESS'], // reopen
  FAILED: ['PLANNING', 'CANCELLED'], // retry
  CANCELLED: [], // terminal
};

// Valid step state transitions
export const VALID_STEP_TRANSITIONS: Record<StepStatus, StepStatus[]> = {
  PENDING: ['READY', 'SKIPPED', 'BLOCKED'],
  READY: ['RUNNING', 'SKIPPED'],
  RUNNING: ['WAITING_FOR_APPROVAL', 'COMPLETED', 'FAILED'],
  WAITING_FOR_APPROVAL: ['RUNNING', 'COMPLETED', 'SKIPPED'],
  COMPLETED: [],
  FAILED: ['READY', 'SKIPPED'], // retry
  SKIPPED: [],
  BLOCKED: ['READY', 'SKIPPED'],
};

export function isValidTaskTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isValidStepTransition(from: StepStatus, to: StepStatus): boolean {
  return VALID_STEP_TRANSITIONS[from]?.includes(to) ?? false;
}

// ============================================================================
// Step Types
// ============================================================================

export const StepType = z.enum([
  'GENERATE_TEXT',
  'DRAFT_EMAIL',
  'SUMMARIZE_DOCUMENT',
  'EXTRACT_INFORMATION',
  'ANALYZE_IMAGE',
  'GENERATE_CHECKLIST',
  'COMPARE_INFORMATION',
  'CREATE_REPORT',
  'PRODUCE_PLAN',
  'REQUEST_USER_INPUT',
  'REQUEST_APPROVAL',
  'MARK_COMPLETE',
  'VERIFY_ARTIFACT',
]);
export type StepType = z.infer<typeof StepType>;

// ============================================================================
// Priority
// ============================================================================

export const TaskPriority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export type TaskPriority = z.infer<typeof TaskPriority>;

// ============================================================================
// Workflow Step Schema
// ============================================================================

export const WorkflowStepSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).default(''),
  stepType: StepType,
  order: z.number().int().min(0),
  status: StepStatus.default('PENDING'),
  dependencies: z.array(z.string().uuid()).default([]),
  inputRequirements: z.string().max(2000).optional(),
  executionStrategy: z.string().max(2000).optional(),
  expectedOutput: z.string().max(2000).optional(),
  actualOutput: z.string().optional(),
  artifactId: z.string().uuid().optional(),
  errorDetails: z.string().optional(),
  retryCount: z.number().int().default(0),
  maxRetries: z.number().int().default(3),
  requiresApproval: z.boolean().default(false),
  verificationMethod: z.string().max(1000).optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

// ============================================================================
// Task Schema
// ============================================================================

export const TaskSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  title: z.string().min(1).max(500),
  originalGoal: z.string().min(1).max(10000),
  normalizedObjective: z.string().max(5000).optional(),
  deadline: z.string().datetime().optional(),
  priority: TaskPriority.default('MEDIUM'),
  status: TaskStatus.default('DRAFT'),
  completionCriteria: z.string().max(5000).optional(),
  context: z.string().max(10000).optional(),
  workflowVersion: z.number().int().default(1),
  progressPercent: z.number().min(0).max(100).default(0),
  finalOutcome: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});
export type Task = z.infer<typeof TaskSchema>;

// ============================================================================
// Create/Update DTOs
// ============================================================================

export const CreateTaskInputSchema = z.object({
  goal: z.string().min(1, 'Please describe what you want to accomplish').max(10000),
  deadline: z.string().datetime().optional(),
  priority: TaskPriority.default('MEDIUM'),
  attachmentIds: z.array(z.string().uuid()).default([]),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export const UpdateTaskInputSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  deadline: z.string().datetime().optional().nullable(),
  priority: TaskPriority.optional(),
  status: TaskStatus.optional(),
  finalOutcome: z.string().optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export const UpdateStepInputSchema = z.object({
  status: StepStatus.optional(),
  actualOutput: z.string().optional(),
});
export type UpdateStepInput = z.infer<typeof UpdateStepInputSchema>;

// ============================================================================
// AI Workflow Generation Schema
// ============================================================================

export const AIGeneratedStepSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000),
  stepType: StepType,
  order: z.number().int().min(0),
  dependencies: z.array(z.number().int().min(0)).default([]), // indexes
  inputRequirements: z.string().optional(),
  executionStrategy: z.string().optional(),
  expectedOutput: z.string().optional(),
  requiresApproval: z.boolean().default(false),
  verificationMethod: z.string().optional(),
});

export const AIWorkflowResponseSchema = z.object({
  title: z.string().min(1).max(500),
  normalizedObjective: z.string().max(5000),
  completionCriteria: z.string().max(5000),
  context: z.string().max(10000).optional(),
  steps: z.array(AIGeneratedStepSchema).min(1).max(20),
  clarificationNeeded: z.boolean().default(false),
  clarificationQuestion: z.string().max(1000).optional(),
});
export type AIWorkflowResponse = z.infer<typeof AIWorkflowResponseSchema>;

// ============================================================================
// Artifact Schema
// ============================================================================

export const ArtifactTypeEnum = z.enum([
  'TEXT',
  'MARKDOWN',
  'EMAIL_DRAFT',
  'CHECKLIST',
  'REPORT',
  'SUMMARY',
  'PLAN',
  'EXTRACTED_DATA',
  'ANALYSIS',
]);
export type ArtifactType = z.infer<typeof ArtifactTypeEnum>;

export const TaskArtifactSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  stepId: z.string().uuid().optional(),
  userId: z.string(),
  title: z.string().min(1).max(500),
  type: ArtifactTypeEnum,
  content: z.string(),
  version: z.number().int().default(1),
  isEdited: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TaskArtifact = z.infer<typeof TaskArtifactSchema>;

// ============================================================================
// File Attachment Schema
// ============================================================================

export const AllowedFileTypes = z.enum([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export const TaskAttachmentSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  userId: z.string(),
  fileName: z.string().min(1).max(255),
  fileType: z.string(),
  fileSize: z.number().int().min(1).max(MAX_FILE_SIZE),
  storageKey: z.string(),
  extractedText: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type TaskAttachment = z.infer<typeof TaskAttachmentSchema>;

// ============================================================================
// Subscription & Usage
// ============================================================================

export const SubscriptionTier = z.enum(['FREE', 'PLUS', 'PRO']);
export type SubscriptionTier = z.infer<typeof SubscriptionTier>;

export const SubscriptionStatus = z.enum([
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
  'EXPIRED',
  'TRIALING',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const TIER_LIMITS: Record<SubscriptionTier, {
  monthlyAICredits: number;
  maxActiveTasks: number;
  maxSavedTasks: number;
  maxFileSize: number;
  maxFilesPerTask: number;
  maxWorkflowSteps: number;
  maxRetriesPerStep: number;
}> = {
  FREE: {
    monthlyAICredits: 50,
    maxActiveTasks: 3,
    maxSavedTasks: 10,
    maxFileSize: 5 * 1024 * 1024,
    maxFilesPerTask: 3,
    maxWorkflowSteps: 8,
    maxRetriesPerStep: 2,
  },
  PLUS: {
    monthlyAICredits: 500,
    maxActiveTasks: 15,
    maxSavedTasks: 100,
    maxFileSize: 15 * 1024 * 1024,
    maxFilesPerTask: 10,
    maxWorkflowSteps: 15,
    maxRetriesPerStep: 3,
  },
  PRO: {
    monthlyAICredits: 2000,
    maxActiveTasks: 50,
    maxSavedTasks: 500,
    maxFileSize: 20 * 1024 * 1024,
    maxFilesPerTask: 20,
    maxWorkflowSteps: 20,
    maxRetriesPerStep: 5,
  },
};

export const UsageLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  taskId: z.string().uuid().optional(),
  stepId: z.string().uuid().optional(),
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number().int().default(0),
  outputTokens: z.number().int().default(0),
  creditsUsed: z.number().default(1),
  estimatedCostUsd: z.number().default(0),
  createdAt: z.string().datetime(),
});
export type UsageLedgerEntry = z.infer<typeof UsageLedgerEntrySchema>;

// ============================================================================
// API Response Types
// ============================================================================

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: PaginationSchema,
  });

// ============================================================================
// Analytics Events
// ============================================================================

export const AnalyticsEventType = z.enum([
  'ACCOUNT_CREATED',
  'FIRST_GOAL_SUBMITTED',
  'WORKFLOW_GENERATED',
  'WORKFLOW_EDITED',
  'FIRST_STEP_COMPLETED',
  'ARTIFACT_GENERATED',
  'TASK_COMPLETED',
  'TASK_REOPENED',
  'USER_RETURNED',
  'UPGRADE_INITIATED',
  'PAYMENT_SUCCEEDED',
  'SUBSCRIPTION_CANCELLED',
]);
export type AnalyticsEventType = z.infer<typeof AnalyticsEventType>;

export const AnalyticsEventSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  eventType: AnalyticsEventType,
  properties: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
});
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
