import prisma from '@/lib/db';
import { TIER_LIMITS, type SubscriptionTier } from '@velora/schemas';

export interface UsageSummary {
  tier: SubscriptionTier;
  monthlyAICredits: number;
  creditsUsed: number;
  creditsRemaining: number;
  periodStart: Date;
}

export function startOfMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Credits left this month for a user, from the usage ledger. Enforced server-side. */
export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  // PAST_DUE keeps paid limits as a grace period until the provider cancels or expires it.
  const active = sub && (sub.status === 'ACTIVE' || sub.status === 'TRIALING' || sub.status === 'PAST_DUE');
  const tier: SubscriptionTier = active ? (sub.tier as SubscriptionTier) : 'FREE';
  const limits = TIER_LIMITS[tier];
  const periodStart = startOfMonth();

  const used = await prisma.usageLedger.aggregate({
    where: { userId, createdAt: { gte: periodStart } },
    _sum: { creditsUsed: true },
  });
  const creditsUsed = used._sum.creditsUsed || 0;
  return {
    tier,
    monthlyAICredits: limits.monthlyAICredits,
    creditsUsed,
    creditsRemaining: Math.max(0, limits.monthlyAICredits - creditsUsed),
    periodStart,
  };
}
