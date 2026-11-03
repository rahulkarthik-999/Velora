import type { Prisma, PrismaClient, SubscriptionStatus } from '@prisma/client';
import { PLANS, planForProduct, type PlanId } from './plans';

// ============================================================================
// Dodo webhook events -> subscription, payment and entitlement state
// ============================================================================
//
// Only verified webhooks change entitlements; a checkout redirect never does.
// Each delivery is applied exactly once: its webhook id is stored first, in the same
// transaction as its effects, so a retried or duplicated delivery changes nothing.

export interface DodoEvent {
  type: string;
  timestamp?: string;
  data: Record<string, unknown>;
}

type Tx = Pick<PrismaClient, 'subscription' | 'subscriptionEvent' | 'payment' | 'user'>;

export type ApplyResult = 'applied' | 'duplicate' | 'ignored';

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const date = (v: unknown): Date | null => {
  const s = str(v);
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** Dodo subscription status -> ours. */
export function mapStatus(status: unknown): SubscriptionStatus | null {
  switch (status) {
    case 'active':
      return 'ACTIVE';
    case 'on_hold':
    case 'past_due':
    case 'paused':
    case 'failed':
      return 'PAST_DUE';
    case 'cancelled':
      return 'CANCELLED';
    case 'expired':
      return 'EXPIRED';
    default:
      return null;
  }
}

const SUBSCRIPTION_STATUS_EVENTS: Record<string, SubscriptionStatus> = {
  'subscription.on_hold': 'PAST_DUE',
  'subscription.past_due': 'PAST_DUE',
  'subscription.paused': 'PAST_DUE',
  'subscription.failed': 'PAST_DUE',
  'subscription.cancelled': 'CANCELLED',
  'subscription.expired': 'EXPIRED',
};

const ACTIVATION_EVENTS = new Set([
  'subscription.active',
  'subscription.renewed',
  'subscription.updated',
  'subscription.plan_changed',
  'subscription.unpaused',
]);

function customerOf(data: Record<string, unknown>): { id: string | null; email: string | null } {
  const c = (data.customer ?? {}) as Record<string, unknown>;
  return { id: str(c.customer_id), email: str(c.email)?.toLowerCase() ?? null };
}

function metadataUserId(data: Record<string, unknown>): string | null {
  return str((data.metadata as Record<string, unknown> | undefined)?.userId);
}

function cartProduct(data: Record<string, unknown>): string | null {
  const cart = data.product_cart as Array<{ product_id?: unknown }> | null | undefined;
  return str(data.product_id) ?? str(cart?.[0]?.product_id);
}

/** The user an event belongs to: checkout metadata first, then the Dodo customer, then the email. */
async function resolveUserId(tx: Tx, data: Record<string, unknown>): Promise<string | null> {
  const fromMeta = metadataUserId(data);
  if (fromMeta && (await tx.user.findUnique({ where: { id: fromMeta }, select: { id: true } }))) return fromMeta;
  const customer = customerOf(data);
  if (customer.id) {
    const sub = await tx.subscription.findFirst({ where: { externalCustomerId: customer.id }, select: { userId: true } });
    if (sub) return sub.userId;
  }
  if (customer.email) {
    const user = await tx.user.findUnique({ where: { email: customer.email }, select: { id: true } });
    if (user) return user.id;
  }
  return null;
}

/** Applies one verified webhook delivery inside the caller's transaction. */
export async function applyDodoEvent(tx: Tx, webhookId: string, event: DodoEvent): Promise<ApplyResult> {
  const data = event.data ?? {};
  const userId = await resolveUserId(tx, data);
  if (!userId) {
    console.warn('[billing] webhook for an unknown customer', event.type);
    return 'ignored';
  }

  const sub = await tx.subscription.upsert({
    where: { userId },
    create: { userId, tier: 'FREE', status: 'EXPIRED' },
    update: {},
  });

  // Idempotency: this insert fails on a repeated webhook id, rolling back everything after it.
  try {
    await tx.subscriptionEvent.create({
      data: { subscriptionId: sub.id, externalEventId: webhookId, type: event.type.slice(0, 100), payload: event as unknown as Prisma.InputJsonValue },
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return 'duplicate';
    throw e;
  }

  const customer = customerOf(data);
  const subscriptionId = str(data.subscription_id);
  const now = new Date();

  // --- Subscriptions -------------------------------------------------------
  if (event.type.startsWith('subscription.')) {
    // A lifetime purchase isn't affected by events about an old recurring subscription.
    if (sub.plan === 'LIFETIME') return 'applied';
    // Events about a subscription the customer has since replaced are only recorded.
    const isCurrent = !sub.externalId || sub.externalId === subscriptionId;

    if (ACTIVATION_EVENTS.has(event.type)) {
      const plan = planForProduct(str(data.product_id));
      if (!plan) {
        console.warn('[billing] subscription for an unknown product; nothing granted');
        return 'applied';
      }
      const status = mapStatus(data.status) ?? 'ACTIVE';
      // A replaced subscription can't take access away from the current one.
      if (!isCurrent && status !== 'ACTIVE') return 'applied';
      const periodStart = date(data.previous_billing_date) ?? now;
      const samePlanRunning = sub.plan === plan && sub.externalId === subscriptionId && sub.allowanceAnchorAt;
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          plan,
          tier: PLANS[plan].tier,
          billingInterval: PLANS[plan].interval,
          status,
          externalId: subscriptionId ?? sub.externalId,
          externalCustomerId: customer.id ?? sub.externalCustomerId,
          currentPeriodStart: periodStart,
          currentPeriodEnd: date(data.next_billing_date) ?? sub.currentPeriodEnd,
          cancelAtPeriodEnd: data.cancel_at_next_billing_date === true,
          // Monthly allowances keep their day through renewals; a new or changed plan starts a new cycle.
          allowanceAnchorAt: samePlanRunning ? sub.allowanceAnchorAt : periodStart,
          cancelledAt: status === 'CANCELLED' ? date(data.cancelled_at) ?? now : null,
        },
      });
      return 'applied';
    }

    const next = SUBSCRIPTION_STATUS_EVENTS[event.type];
    if (next && isCurrent) {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: next,
          externalCustomerId: customer.id ?? sub.externalCustomerId,
          cancelledAt: next === 'CANCELLED' ? date(data.cancelled_at) ?? now : sub.cancelledAt,
          // A cancelled subscription stays usable until the end of the period already paid for.
          currentPeriodEnd: next === 'CANCELLED' ? date(data.next_billing_date) ?? sub.currentPeriodEnd : sub.currentPeriodEnd,
        },
      });
    }
    return 'applied';
  }

  // --- Payments ------------------------------------------------------------
  if (event.type.startsWith('payment.')) {
    const paymentId = str(data.payment_id);
    if (!paymentId) return 'applied';
    const productId = cartProduct(data);
    const plan = planForProduct(productId);
    const status = event.type.slice('payment.'.length);
    await tx.payment.upsert({
      where: { externalId: paymentId },
      create: {
        subscriptionId: sub.id,
        userId,
        externalId: paymentId,
        externalSubscriptionId: subscriptionId,
        productId,
        plan,
        amount: typeof data.total_amount === 'number' ? data.total_amount : 0,
        currency: str(data.currency) ?? 'USD',
        status,
      },
      update: { status },
    });

    // Lifetime is a one-time purchase: it's granted on the successful payment itself.
    if (event.type === 'payment.succeeded' && plan === 'LIFETIME' && !subscriptionId) {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          plan: 'LIFETIME',
          tier: PLANS.LIFETIME.tier,
          billingInterval: 'one_time',
          status: 'ACTIVE',
          externalCustomerId: customer.id ?? sub.externalCustomerId,
          currentPeriodStart: now,
          currentPeriodEnd: null,
          allowanceAnchorAt: now,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
        },
      });
    }
    return 'applied';
  }

  // --- Refunds and chargebacks -------------------------------------------
  if (event.type === 'refund.succeeded' || event.type.startsWith('dispute.')) {
    const paymentId = str(data.payment_id);
    const payment = paymentId ? await tx.payment.findUnique({ where: { externalId: paymentId } }) : null;
    if (!payment) return 'applied';

    if (event.type === 'refund.succeeded') {
      const amount = typeof data.amount === 'number' ? data.amount : payment.amount;
      const partial = data.is_partial === true;
      await tx.payment.update({
        where: { id: payment.id },
        data: { refundedAmount: Math.min(payment.amount, payment.refundedAmount + amount), status: partial ? 'partially_refunded' : 'refunded' },
      });
      if (!partial && revokesCurrentPlan(sub, payment)) await revoke(tx, sub.id);
      return 'applied';
    }

    if (event.type === 'dispute.opened') {
      await tx.payment.update({ where: { id: payment.id }, data: { disputed: true, status: 'disputed' } });
      if (revokesCurrentPlan(sub, payment)) await revoke(tx, sub.id);
    } else if (event.type === 'dispute.won' || event.type === 'dispute.cancelled') {
      await tx.payment.update({ where: { id: payment.id }, data: { disputed: false, status: 'succeeded' } });
      // Restore access the dispute took away, if the plan is still within its paid period.
      if (revokesCurrentPlan(sub, payment) && sub.status === 'EXPIRED') {
        await tx.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE' } });
      }
    } else if (event.type === 'dispute.lost') {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'chargeback' } });
    }
    return 'applied';
  }

  return 'applied';
}

/** Whether refunding or disputing this payment should end the customer's current plan. */
function revokesCurrentPlan(
  sub: { plan: string | null; externalId: string | null },
  payment: { plan: string | null; externalSubscriptionId: string | null }
): boolean {
  if (payment.plan === 'LIFETIME') return sub.plan === 'LIFETIME';
  return Boolean(payment.externalSubscriptionId && payment.externalSubscriptionId === sub.externalId);
}

async function revoke(tx: Tx, subscriptionId: string) {
  await tx.subscription.update({ where: { id: subscriptionId }, data: { status: 'EXPIRED' } });
}

export type { PlanId };
