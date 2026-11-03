import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { estimateCostUsd } from './models';
import type { AIGenerateResult, AIProviderError } from './provider';

// ============================================================================
// Usage ledger: tokens, provider, model, cost, latency and errors per request
// ============================================================================
//
// Never records prompt or answer contents: the user's resume, notes and
// transcripts stay on their device.

export interface UsageRecord {
  userId: string;
  taskId?: string;
  stepId?: string;
  /** Which feature made the call, e.g. "live-answer". */
  endpoint: string;
  creditsUsed: number;
}

type Outcome = Pick<
  AIGenerateResult,
  'provider' | 'model' | 'inputTokens' | 'outputTokens' | 'latencyMs' | 'attempts' | 'fallbackFrom' | 'estimatedCostUsd'
>;

// The metrics columns are new and nullable. Until `prisma db push` adds them,
// writing them fails with P2022, so fall back to the original columns.
let metricsColumns = true;

type Base = Prisma.UsageLedgerUncheckedCreateInput;
type Metrics = Pick<Base, 'endpoint' | 'latencyMs' | 'attempts' | 'fallbackFrom' | 'status' | 'errorCode'>;

async function write(base: Base, metrics: Metrics) {
  if (metricsColumns) {
    try {
      await prisma.usageLedger.create({ data: { ...base, ...metrics } });
      return;
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2022') throw error;
      metricsColumns = false;
      console.warn('[AI] UsageLedger metrics columns missing; run prisma db push. Recording basic usage only.');
    }
  }
  await prisma.usageLedger.create({ data: base });
}

export async function recordAIUsage(rec: UsageRecord, result: Outcome): Promise<void> {
  await write(
    {
      userId: rec.userId,
      taskId: rec.taskId,
      stepId: rec.stepId,
      provider: result.provider,
      model: result.model.slice(0, 100),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      creditsUsed: rec.creditsUsed,
      estimatedCostUsd: result.estimatedCostUsd,
    },
    {
      endpoint: rec.endpoint,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
      fallbackFrom: result.fallbackFrom ?? null,
      status: 'ok',
    }
  );
}

/** A request where every attempt failed: no credit is charged, but the error is kept per user. */
export async function recordAIFailure(rec: Omit<UsageRecord, 'creditsUsed'>, error: AIProviderError): Promise<void> {
  if (!metricsColumns) return;
  await write(
    {
      userId: rec.userId,
      taskId: rec.taskId,
      stepId: rec.stepId,
      provider: error.provider ?? 'none',
      model: (error.model ?? 'none').slice(0, 100),
      inputTokens: error.inputTokens,
      outputTokens: error.outputTokens,
      creditsUsed: 0,
      estimatedCostUsd: error.model ? estimateCostUsd(error.model, error.inputTokens, error.outputTokens) : 0,
    },
    {
      endpoint: rec.endpoint,
      latencyMs: error.latencyMs,
      attempts: error.attempts,
      status: 'error',
      errorCode: error.code,
    }
  ).catch((e) => console.error('[AI] failed to record AI failure', (e as Error).message));
}
