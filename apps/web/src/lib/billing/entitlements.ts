import type { Subscription } from '@prisma/client';
import prisma from '@/lib/db';
import { allowanceWindow } from './period';
import { PLANS, isPlanId, type Allowances, type Plan, type PlanId } from './plans';

// ============================================================================
// Entitlements: who may use the paid copilot, and atomic usage reservations
// ============================================================================
//
// The backend is the only source of truth. Every billable request reserves its
// credits / audio seconds / screenshot inside a transaction holding a per-user
// lock, so concurrent requests can't overspend. A request that then fails is
// released, so failures and retries never cost the customer.

export type AccessReason = 'active' | 'no_plan' | 'payment_issue' | 'expired' | 'cancelled' | 'refunded';

export interface UsageTotals {
  aiCredits: number;
  transcriptionSeconds: number;
  screenshots: number;
}

export interface Entitlement {
  active: boolean;
  reason: AccessReason;
  plan: Plan | null;
  status: Subscription['status'] | null;
  /** When the current allowance window started and when it resets. */
  window: { start: Date; resetsAt: Date } | null;
  renewsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  allowances: Allowances | null;
  used: UsageTotals;
  remaining: { aiCredits: number; transcriptionMinutes: number; screenshots: number } | null;
  subscriptionId: string | null;
}

const NONE: UsageTotals = { aiCredits: 0, transcriptionSeconds: 0, screenshots: 0 };

/** Whether a subscription currently grants access, and why not if it doesn't. */
export function accessFor(sub: Pick<Subscription, 'plan' | 'status' | 'currentPeriodEnd'> | null, now = new Date()): AccessReason {
  if (!sub?.plan || !isPlanId(sub.plan)) return 'no_plan';
  const lifetime = sub.plan === 'LIFETIME';
  const periodOk = lifetime || (sub.currentPeriodEnd !== null && sub.currentPeriodEnd > now);
  switch (sub.status) {
    case 'ACTIVE':
      // A renewal that hasn't arrived yet: allow until the end of the paid period.
      return periodOk ? 'active' : 'expired';
    case 'CANCELLED':
      // Cancelled, but the customer keeps what they paid for until the period ends.
      return periodOk && !lifetime ? 'active' : 'cancelled';
    case 'PAST_DUE':
      return 'payment_issue';
    default:
      return 'expired';
  }
}

async function usageSince(tx: Pick<typeof prisma, 'usageLedger'>, userId: string, start: Date, end: Date): Promise<UsageTotals> {
  const [sums, shots] = await Promise.all([
    tx.usageLedger.aggregate({
      where: { userId, createdAt: { gte: start, lt: end } },
      _sum: { creditsUsed: true, audioSeconds: true },
    }),
    tx.usageLedger.count({ where: { userId, kind: 'screenshot', status: { not: 'error' }, createdAt: { gte: start, lt: end } } }),
  ]);
  return { aiCredits: sums._sum.creditsUsed ?? 0, transcriptionSeconds: sums._sum.audioSeconds ?? 0, screenshots: shots };
}

function anchorOf(sub: Pick<Subscription, 'allowanceAnchorAt' | 'currentPeriodStart'>): Date {
  return sub.allowanceAnchorAt ?? sub.currentPeriodStart;
}

export async function getEntitlement(userId: string, now = new Date()): Promise<Entitlement> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const reason = accessFor(sub, now);
  const plan = sub?.plan && isPlanId(sub.plan) ? PLANS[sub.plan] : null;
  if (!sub || !plan) {
    return {
      active: false, reason, plan: null, status: sub?.status ?? null, window: null, renewsAt: null,
      cancelAtPeriodEnd: false, allowances: null, used: NONE, remaining: null, subscriptionId: sub?.id ?? null,
    };
  }
  const { start, end } = allowanceWindow(anchorOf(sub), now);
  const used = await usageSince(prisma, userId, start, end);
  const a = plan.allowances;
  return {
    active: reason === 'active',
    reason,
    plan,
    status: sub.status,
    window: { start, resetsAt: end },
    renewsAt: plan.id === 'LIFETIME' ? null : sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    allowances: a,
    used,
    remaining: {
      aiCredits: Math.max(0, a.aiCredits - used.aiCredits),
      transcriptionMinutes: Math.max(0, Math.floor((a.transcriptionMinutes * 60 - used.transcriptionSeconds) / 60)),
      screenshots: Math.max(0, a.screenshots - used.screenshots),
    },
    subscriptionId: sub.id,
  };
}

// ----------------------------------------------------------------------------
// Reservations
// ----------------------------------------------------------------------------

export class QuotaError extends Error {
  constructor(
    message: string,
    readonly status: 402 | 409,
    readonly code: 'no_plan' | 'payment_issue' | 'expired' | 'credits' | 'transcription' | 'screenshots' | 'duplicate'
  ) {
    super(message);
  }
}

export interface ReserveRequest {
  userId: string;
  endpoint: string;
  kind: 'answer' | 'advanced' | 'screenshot' | 'complex' | 'transcription';
  credits?: number;
  audioSeconds?: number;
  /** Supplying the same id twice reserves once. */
  requestId?: string;
  sessionId?: string;
}

const NO_PLAN_MESSAGE = 'Velora needs an active plan for this. Choose one at veloraweb.online/pricing.';

function denial(reason: AccessReason): QuotaError {
  switch (reason) {
    case 'payment_issue':
      return new QuotaError('Your last payment didn’t go through. Update your payment method to keep using Velora.', 402, 'payment_issue');
    case 'no_plan':
      return new QuotaError(NO_PLAN_MESSAGE, 402, 'no_plan');
    default:
      return new QuotaError('Your Velora plan has ended. Renew it at veloraweb.online/pricing to continue.', 402, 'expired');
  }
}

/** Reserves usage for one request, or throws QuotaError. Returns the ledger row id to settle or release. */
export async function reserveUsage(req: ReserveRequest, now = new Date()): Promise<string> {
  try {
    return await prisma.$transaction(async (tx) => {
      // Serialises this user's reservations; other users are unaffected.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.userId}))`;
      const sub = await tx.subscription.findUnique({ where: { userId: req.userId } });
      const reason = accessFor(sub, now);
      if (reason !== 'active' || !sub?.plan || !isPlanId(sub.plan)) throw denial(reason);

      const plan = PLANS[sub.plan as PlanId];
      const { start, end } = allowanceWindow(anchorOf(sub), now);
      const used = await usageSince(tx, req.userId, start, end);
      const credits = req.credits ?? 0;
      const audio = Math.ceil(req.audioSeconds ?? 0);
      const reset = end.toISOString().slice(0, 10);

      if (credits > 0 && used.aiCredits + credits > plan.allowances.aiCredits) {
        throw new QuotaError(`You've used this month's ${plan.allowances.aiCredits} AI credits. They reset on ${reset}.`, 402, 'credits');
      }
      if (audio > 0 && used.transcriptionSeconds + audio > plan.allowances.transcriptionMinutes * 60) {
        throw new QuotaError(
          `You've used this month's ${plan.allowances.transcriptionMinutes} transcription minutes. They reset on ${reset}.`,
          402,
          'transcription'
        );
      }
      if (req.kind === 'screenshot' && used.screenshots + 1 > plan.allowances.screenshots) {
        throw new QuotaError(`You've used this month's ${plan.allowances.screenshots} screenshot analyses. They reset on ${reset}.`, 402, 'screenshots');
      }

      const row = await tx.usageLedger.create({
        data: {
          userId: req.userId,
          provider: 'pending',
          model: 'pending',
          creditsUsed: credits,
          audioSeconds: audio || null,
          kind: req.kind,
          endpoint: req.endpoint,
          requestId: req.requestId ?? null,
          sessionId: req.sessionId ?? null,
          subscriptionId: sub.id,
          status: 'reserved',
        },
        select: { id: true },
      });
      return row.id;
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      throw new QuotaError('This request was already processed.', 409, 'duplicate');
    }
    throw error;
  }
}

export interface SettleOutcome {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
  attempts?: number;
  fallbackFrom?: string | null;
}

/** Marks a reservation as used, recording what it actually cost. */
export async function settleUsage(id: string, outcome: SettleOutcome): Promise<void> {
  await prisma.usageLedger.update({
    where: { id },
    data: {
      provider: outcome.provider.slice(0, 50),
      model: outcome.model.slice(0, 100),
      inputTokens: outcome.inputTokens ?? 0,
      outputTokens: outcome.outputTokens ?? 0,
      estimatedCostUsd: outcome.estimatedCostUsd ?? 0,
      latencyMs: outcome.latencyMs ?? null,
      attempts: outcome.attempts ?? null,
      fallbackFrom: outcome.fallbackFrom ?? null,
      status: 'ok',
    },
  });
}

/** Gives a reservation back after a failure: nothing is charged, the error is kept for cost tracking. */
export async function releaseUsage(id: string, errorCode: string, partial?: Partial<SettleOutcome>): Promise<void> {
  await prisma.usageLedger
    .update({
      where: { id },
      data: {
        creditsUsed: 0,
        audioSeconds: 0,
        status: 'error',
        errorCode: errorCode.slice(0, 50),
        ...(partial?.provider ? { provider: partial.provider.slice(0, 50) } : {}),
        ...(partial?.model ? { model: partial.model.slice(0, 100) } : {}),
        inputTokens: partial?.inputTokens ?? 0,
        outputTokens: partial?.outputTokens ?? 0,
        estimatedCostUsd: partial?.estimatedCostUsd ?? 0,
        latencyMs: partial?.latencyMs ?? null,
        attempts: partial?.attempts ?? null,
      },
    })
    .catch((e) => console.error('[billing] could not release usage', id, (e as Error).message));
}
