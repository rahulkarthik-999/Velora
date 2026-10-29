import { describe, it, expect } from 'vitest';
import {
  isValidTaskTransition,
  isValidStepTransition,
  TaskSchema,
  WorkflowStepSchema,
  TIER_LIMITS,
  CreateTaskInputSchema,
} from '../src/index';

describe('Workflow Schema & State Transitions', () => {
  it('validates allowed task state transitions', () => {
    expect(isValidTaskTransition('DRAFT', 'PLANNING')).toBe(true);
    expect(isValidTaskTransition('PLANNING', 'READY')).toBe(true);
    expect(isValidTaskTransition('READY', 'IN_PROGRESS')).toBe(true);
    expect(isValidTaskTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(isValidTaskTransition('COMPLETED', 'IN_PROGRESS')).toBe(true); // reopen
  });

  it('rejects illegal task state transitions', () => {
    expect(isValidTaskTransition('DRAFT', 'COMPLETED')).toBe(false);
    expect(isValidTaskTransition('CANCELLED', 'IN_PROGRESS')).toBe(false);
    expect(isValidTaskTransition('PLANNING', 'COMPLETED')).toBe(false);
  });

  it('validates allowed step transitions', () => {
    expect(isValidStepTransition('PENDING', 'READY')).toBe(true);
    expect(isValidStepTransition('READY', 'RUNNING')).toBe(true);
    expect(isValidStepTransition('RUNNING', 'COMPLETED')).toBe(true);
    expect(isValidStepTransition('RUNNING', 'WAITING_FOR_APPROVAL')).toBe(true);
    expect(isValidStepTransition('FAILED', 'READY')).toBe(true); // retry
  });

  it('rejects illegal step transitions', () => {
    expect(isValidStepTransition('COMPLETED', 'RUNNING')).toBe(false);
    expect(isValidStepTransition('PENDING', 'COMPLETED')).toBe(false);
  });

  it('enforces tier limits and entitlements correctly', () => {
    expect(TIER_LIMITS.FREE.monthlyAICredits).toBe(50);
    expect(TIER_LIMITS.PLUS.monthlyAICredits).toBe(500);
    expect(TIER_LIMITS.PRO.monthlyAICredits).toBe(2000);

    expect(TIER_LIMITS.FREE.maxActiveTasks).toBe(3);
    expect(TIER_LIMITS.PRO.maxActiveTasks).toBe(50);
  });

  it('validates CreateTaskInput schema', () => {
    const valid = CreateTaskInputSchema.safeParse({
      goal: 'Prepare a job application',
      priority: 'HIGH',
      attachmentIds: [],
    });
    expect(valid.success).toBe(true);

    const empty = CreateTaskInputSchema.safeParse({
      goal: '',
    });
    expect(empty.success).toBe(false);
  });
});
