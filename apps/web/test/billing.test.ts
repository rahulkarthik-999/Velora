import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ default: {} }));

const { allowanceWindow } = await import('@/lib/billing/period');
const { PLANS, creditCost, planForProduct } = await import('@/lib/billing/plans');
const { signWebhook, verifyWebhook } = await import('@/lib/billing/dodo');
const { accessFor } = await import('@/lib/billing/entitlements');
const { applyDodoEvent, mapStatus } = await import('@/lib/billing/webhook');
const { operationFor } = await import('@/lib/practice');

const saved = { ...process.env };
beforeEach(() => {
  Object.assign(process.env, {
    DODO_PRODUCT_STARTER: 'pdt_starter',
    DODO_PRODUCT_PRO_MONTHLY: 'pdt_pro_m',
    DODO_PRODUCT_PRO_QUARTERLY: 'pdt_pro_q',
    DODO_PRODUCT_PRO_ANNUAL: 'pdt_pro_y',
    DODO_PRODUCT_LIFETIME: 'pdt_life',
  });
});
afterEach(() => {
  process.env = { ...saved };
});

describe('plans', () => {
  it('match the published prices and monthly allowances', () => {
    expect([PLANS.STARTER.priceUsd, PLANS.PRO_MONTHLY.priceUsd, PLANS.PRO_QUARTERLY.priceUsd, PLANS.PRO_ANNUAL.priceUsd, PLANS.LIFETIME.priceUsd]).toEqual([9, 29, 69, 149, 299]);
    expect(PLANS.STARTER.allowances).toEqual({ transcriptionMinutes: 30, aiCredits: 150, screenshots: 10 });
    expect(PLANS.PRO_ANNUAL.allowances).toEqual({ transcriptionMinutes: 150, aiCredits: 750, screenshots: 50 });
    expect(PLANS.LIFETIME.allowances).toEqual({ transcriptionMinutes: 60, aiCredits: 300, screenshots: 20 });
    expect(PLANS.PRO_QUARTERLY.interval).toBe('quarter');
    expect(PLANS.LIFETIME.interval).toBe('one_time');
  });

  it('map Dodo products to plans and never grant for unknown ones', () => {
    expect(planForProduct('pdt_pro_q')).toBe('PRO_QUARTERLY');
    expect(planForProduct('pdt_other')).toBeNull();
    expect(planForProduct(undefined)).toBeNull();
    delete process.env.DODO_PRODUCT_LIFETIME;
    expect(planForProduct('pdt_life')).toBeNull();
  });

  it('use configurable credit costs', () => {
    expect([creditCost('answer'), creditCost('advanced'), creditCost('screenshot'), creditCost('complex')]).toEqual([1, 2, 3, 3]);
    process.env.CREDIT_COST_ADVANCED = '4';
    expect(creditCost('advanced')).toBe(4);
    process.env.CREDIT_COST_ADVANCED = 'lots';
    expect(creditCost('advanced')).toBe(2);
  });
});

describe('allowanceWindow', () => {
  const d = (s: string) => new Date(s);

  it('resets monthly on the anchor day, whatever the billing interval', () => {
    const w = allowanceWindow(d('2026-01-15T10:00:00Z'), d('2026-04-20T00:00:00Z'));
    expect(w.start.toISOString()).toBe('2026-04-15T10:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-05-15T10:00:00.000Z');
  });

  it('is still in the previous window just before the anchor time', () => {
    const w = allowanceWindow(d('2026-01-15T10:00:00Z'), d('2026-04-15T09:59:59Z'));
    expect(w.start.toISOString()).toBe('2026-03-15T10:00:00.000Z');
  });

  it('clamps an anchor on the 31st to shorter months', () => {
    const w = allowanceWindow(d('2026-01-31T00:00:00Z'), d('2026-02-28T12:00:00Z'));
    expect(w.start.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-03-31T00:00:00.000Z');
  });

  it('crosses year ends', () => {
    const w = allowanceWindow(d('2025-11-10T00:00:00Z'), d('2026-01-05T00:00:00Z'));
    expect(w.start.toISOString()).toBe('2025-12-10T00:00:00.000Z');
  });
});

describe('verifyWebhook (Standard Webhooks)', () => {
  const secret = 'whsec_' + Buffer.from('test-secret-key-0123456789').toString('base64');
  const body = '{"type":"subscription.active","data":{}}';
  const now = 1_800_000_000;

  it('accepts a valid signature, including during secret rotation', () => {
    const sig = signWebhook(secret, 'msg_1', now, body);
    expect(verifyWebhook(secret, { id: 'msg_1', timestamp: String(now), signature: `v1,${sig}` }, body, now)).toEqual({ ok: true, id: 'msg_1' });
    expect(verifyWebhook(secret, { id: 'msg_1', timestamp: String(now), signature: `v1,bogus v1,${sig}` }, body, now).ok).toBe(true);
  });

  it('rejects tampering, replays and missing headers', () => {
    const sig = signWebhook(secret, 'msg_1', now, body);
    const h = { id: 'msg_1', timestamp: String(now), signature: `v1,${sig}` };
    expect(verifyWebhook(secret, h, body.replace('active', 'expired'), now).ok).toBe(false);
    expect(verifyWebhook(secret, { ...h, id: 'msg_2' }, body, now).ok).toBe(false);
    expect(verifyWebhook(secret, h, body, now + 10 * 60).ok).toBe(false);
    expect(verifyWebhook(secret, { ...h, signature: null }, body, now).ok).toBe(false);
  });
});

describe('accessFor', () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);

  it('requires a paid plan', () => {
    expect(accessFor(null)).toBe('no_plan');
    expect(accessFor({ plan: null, status: 'ACTIVE', currentPeriodEnd: future })).toBe('no_plan');
  });

  it('allows active and cancelled-but-paid periods, not lapsed or failed ones', () => {
    expect(accessFor({ plan: 'PRO_MONTHLY', status: 'ACTIVE', currentPeriodEnd: future })).toBe('active');
    expect(accessFor({ plan: 'PRO_MONTHLY', status: 'CANCELLED', currentPeriodEnd: future })).toBe('active');
    expect(accessFor({ plan: 'PRO_MONTHLY', status: 'CANCELLED', currentPeriodEnd: past })).toBe('cancelled');
    expect(accessFor({ plan: 'PRO_MONTHLY', status: 'ACTIVE', currentPeriodEnd: past })).toBe('expired');
    expect(accessFor({ plan: 'STARTER', status: 'PAST_DUE', currentPeriodEnd: future })).toBe('payment_issue');
    expect(accessFor({ plan: 'STARTER', status: 'EXPIRED', currentPeriodEnd: future })).toBe('expired');
  });

  it('never expires an active lifetime plan', () => {
    expect(accessFor({ plan: 'LIFETIME', status: 'ACTIVE', currentPeriodEnd: null })).toBe('active');
  });
});

describe('operationFor', () => {
  it('charges by what was asked, and more for hand-picked expensive models', () => {
    expect(operationFor('realtime', undefined)).toBe('answer');
    expect(operationFor('reasoning', undefined)).toBe('advanced');
    expect(operationFor('vision', undefined)).toBe('screenshot');
    expect(operationFor('chat', 'gpt-4o')).toBe('complex');
  });
});

// ---------------------------------------------------------------------------
// Webhook lifecycle against an in-memory database
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> & { id: string };

function fakeTx() {
  const users: Row[] = [{ id: 'u1', email: 'me@example.com' }];
  const subs: Row[] = [];
  const events: Row[] = [];
  const payments: Row[] = [];
  let n = 0;
  const id = () => `id${++n}`;
  const match = (row: Row, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => row[k] === v);
  const tx = {
    user: { findUnique: async ({ where }: { where: Record<string, unknown> }) => users.find((u) => match(u, where)) ?? null },
    subscription: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => subs.find((s) => match(s, where)) ?? null,
      upsert: async ({ where, create }: { where: { userId: string }; create: Record<string, unknown> }) => {
        let s = subs.find((x) => x.userId === where.userId);
        if (!s) {
          s = { id: id(), plan: null, externalId: null, externalCustomerId: null, allowanceAnchorAt: null, currentPeriodEnd: null, cancelledAt: null, ...create };
          subs.push(s);
        }
        return s;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(subs.find((s) => s.id === where.id)!, data),
    },
    subscriptionEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (events.some((e) => e.externalEventId === data.externalEventId)) throw Object.assign(new Error('dup'), { code: 'P2002' });
        const e = { id: id(), ...data };
        events.push(e);
        return e;
      },
    },
    payment: {
      upsert: async ({ where, create, update }: { where: { externalId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const p = payments.find((x) => x.externalId === where.externalId);
        if (p) return Object.assign(p, update);
        const row = { id: id(), refundedAmount: 0, disputed: false, ...create };
        payments.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { externalId: string } }) => payments.find((p) => p.externalId === where.externalId) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(payments.find((p) => p.id === where.id)!, data),
    },
  };
  return { tx: tx as never, subs, events, payments };
}

const subData = (over: Record<string, unknown> = {}) => ({
  subscription_id: 'sub_1',
  product_id: 'pdt_pro_q',
  status: 'active',
  customer: { customer_id: 'cus_1', email: 'me@example.com', name: 'Me' },
  metadata: { userId: 'u1' },
  previous_billing_date: '2026-01-15T10:00:00Z',
  next_billing_date: '2026-04-15T10:00:00Z',
  cancel_at_next_billing_date: false,
  ...over,
});

describe('applyDodoEvent', () => {
  it('activates a quarterly plan, renews it without moving the monthly reset day', async () => {
    const db = fakeTx();
    expect(await applyDodoEvent(db.tx, 'wh_1', { type: 'subscription.active', data: subData() })).toBe('applied');
    expect(db.subs[0]).toMatchObject({ plan: 'PRO_QUARTERLY', billingInterval: 'quarter', status: 'ACTIVE', tier: 'PRO', externalId: 'sub_1', externalCustomerId: 'cus_1' });
    expect((db.subs[0].allowanceAnchorAt as Date).toISOString()).toBe('2026-01-15T10:00:00.000Z');

    await applyDodoEvent(db.tx, 'wh_2', {
      type: 'subscription.renewed',
      data: subData({ previous_billing_date: '2026-04-15T10:00:00Z', next_billing_date: '2026-07-15T10:00:00Z' }),
    });
    expect((db.subs[0].currentPeriodEnd as Date).toISOString()).toBe('2026-07-15T10:00:00.000Z');
    expect((db.subs[0].allowanceAnchorAt as Date).toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('applies a duplicated delivery once', async () => {
    const db = fakeTx();
    await applyDodoEvent(db.tx, 'wh_1', { type: 'subscription.active', data: subData() });
    expect(await applyDodoEvent(db.tx, 'wh_1', { type: 'subscription.expired', data: subData({ status: 'expired' }) })).toBe('duplicate');
    expect(db.subs[0].status).toBe('ACTIVE');
  });

  it('grants nothing for an unknown product', async () => {
    const db = fakeTx();
    await applyDodoEvent(db.tx, 'wh_1', { type: 'subscription.active', data: subData({ product_id: 'pdt_unknown' }) });
    expect(db.subs[0].plan).toBeNull();
  });

  it('keeps access after cancellation until the paid period ends, then expires', async () => {
    const db = fakeTx();
    await applyDodoEvent(db.tx, 'wh_1', { type: 'subscription.active', data: subData() });
    await applyDodoEvent(db.tx, 'wh_2', { type: 'subscription.cancelled', data: subData({ status: 'cancelled' }) });
    expect(db.subs[0].status).toBe('CANCELLED');
    expect((db.subs[0].currentPeriodEnd as Date).toISOString()).toBe('2026-04-15T10:00:00.000Z');
    await applyDodoEvent(db.tx, 'wh_3', { type: 'subscription.expired', data: subData({ status: 'expired' }) });
    expect(db.subs[0].status).toBe('EXPIRED');
  });

  it('suspends on a failed renewal (on hold)', async () => {
    const db = fakeTx();
    await applyDodoEvent(db.tx, 'wh_1', { type: 'subscription.active', data: subData() });
    await applyDodoEvent(db.tx, 'wh_2', { type: 'subscription.on_hold', data: subData({ status: 'on_hold' }) });
    expect(db.subs[0].status).toBe('PAST_DUE');
  });

  it('grants lifetime on a one-time payment, and ignores later recurring events', async () => {
    const db = fakeTx();
    await applyDodoEvent(db.tx, 'wh_1', {
      type: 'payment.succeeded',
      data: { payment_id: 'pay_1', product_cart: [{ product_id: 'pdt_life', quantity: 1 }], total_amount: 29900, currency: 'USD', customer: { customer_id: 'cus_1', email: 'me@example.com' }, metadata: { userId: 'u1' } },
    });
    expect(db.subs[0]).toMatchObject({ plan: 'LIFETIME', status: 'ACTIVE', billingInterval: 'one_time', currentPeriodEnd: null });
    expect(db.payments[0]).toMatchObject({ externalId: 'pay_1', plan: 'LIFETIME', amount: 29900, status: 'succeeded' });

    await applyDodoEvent(db.tx, 'wh_2', { type: 'subscription.expired', data: subData({ status: 'expired' }) });
    expect(db.subs[0].status).toBe('ACTIVE');
  });

  it('revokes on a full refund but not a partial one', async () => {
    const db = fakeTx();
    const pay = { payment_id: 'pay_1', product_cart: [{ product_id: 'pdt_life', quantity: 1 }], total_amount: 29900, currency: 'USD', metadata: { userId: 'u1' } };
    await applyDodoEvent(db.tx, 'wh_1', { type: 'payment.succeeded', data: pay });
    await applyDodoEvent(db.tx, 'wh_2', { type: 'refund.succeeded', data: { payment_id: 'pay_1', amount: 1000, is_partial: true, metadata: { userId: 'u1' } } });
    expect(db.subs[0].status).toBe('ACTIVE');
    expect(db.payments[0]).toMatchObject({ refundedAmount: 1000, status: 'partially_refunded' });
    await applyDodoEvent(db.tx, 'wh_3', { type: 'refund.succeeded', data: { payment_id: 'pay_1', amount: 28900, is_partial: false, metadata: { userId: 'u1' } } });
    expect(db.subs[0].status).toBe('EXPIRED');
    expect(db.payments[0]).toMatchObject({ refundedAmount: 29900, status: 'refunded' });
  });

  it('suspends on a chargeback and restores if the dispute is won', async () => {
    const db = fakeTx();
    await applyDodoEvent(db.tx, 'wh_1', { type: 'subscription.active', data: subData() });
    await applyDodoEvent(db.tx, 'wh_2', {
      type: 'payment.succeeded',
      data: { payment_id: 'pay_1', subscription_id: 'sub_1', product_cart: [{ product_id: 'pdt_pro_q', quantity: 1 }], total_amount: 6900, currency: 'USD', metadata: { userId: 'u1' } },
    });
    await applyDodoEvent(db.tx, 'wh_3', { type: 'dispute.opened', data: { payment_id: 'pay_1', metadata: { userId: 'u1' } } });
    expect(db.subs[0].status).toBe('EXPIRED');
    await applyDodoEvent(db.tx, 'wh_4', { type: 'dispute.won', data: { payment_id: 'pay_1', metadata: { userId: 'u1' } } });
    expect(db.subs[0].status).toBe('ACTIVE');
  });

  it('finds the user by customer email when metadata is missing, and ignores strangers', async () => {
    const db = fakeTx();
    await applyDodoEvent(db.tx, 'wh_1', { type: 'subscription.active', data: subData({ metadata: {} }) });
    expect(db.subs[0].plan).toBe('PRO_QUARTERLY');
    expect(await applyDodoEvent(db.tx, 'wh_2', { type: 'subscription.active', data: subData({ metadata: {}, customer: { customer_id: 'cus_x', email: 'nobody@x.com' } }) })).toBe('ignored');
  });

  it('maps Dodo statuses', () => {
    expect(['active', 'on_hold', 'cancelled', 'expired', 'pending'].map(mapStatus)).toEqual(['ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', null]);
  });
});
