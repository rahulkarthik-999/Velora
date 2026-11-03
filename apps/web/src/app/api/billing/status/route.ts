import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { serverError, unauthorized } from '@/lib/api-utils';
import { billingCaller } from '@/lib/billing/caller';
import { getEntitlement } from '@/lib/billing/entitlements';
import { PLAN_IDS, PLANS } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

/** Plan, allowances, usage this month, renewal and payment history for the signed-in user. */
export async function GET(req: NextRequest) {
  try {
    const userId = await billingCaller(req);
    if (!userId) return unauthorized();
    const [ent, payments] = await Promise.all([
      getEntitlement(userId),
      prisma.payment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 24,
        select: { externalId: true, plan: true, amount: true, currency: true, status: true, refundedAmount: true, createdAt: true },
      }),
    ]);
    return NextResponse.json({
      entitlement: {
        active: ent.active,
        reason: ent.reason,
        plan: ent.plan && { id: ent.plan.id, name: ent.plan.name, interval: ent.plan.interval, priceUsd: ent.plan.priceUsd },
        status: ent.status,
        renewsAt: ent.renewsAt,
        cancelAtPeriodEnd: ent.cancelAtPeriodEnd,
        resetsAt: ent.window?.resetsAt ?? null,
        allowances: ent.allowances,
        used: {
          aiCredits: ent.used.aiCredits,
          transcriptionMinutes: Math.ceil(ent.used.transcriptionSeconds / 60),
          screenshots: ent.used.screenshots,
        },
        remaining: ent.remaining,
      },
      payments,
      plans: PLAN_IDS.map((id) => {
        const p = PLANS[id];
        return { id, name: p.name, priceUsd: p.priceUsd, interval: p.interval, allowances: p.allowances, features: p.features };
      }),
    });
  } catch (error) {
    console.error('[GET /api/billing/status]', error);
    return serverError();
  }
}
