import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { getAuthenticatedUser, unauthorized, serverError, success } from '@/lib/api-utils';
import { TIER_LIMITS, type SubscriptionTier } from '@velora/schemas';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    const tier: SubscriptionTier = (sub?.tier as SubscriptionTier) || 'FREE';
    const limits = TIER_LIMITS[tier];

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [monthlyUsage, activeTaskCount, totalTaskCount] = await Promise.all([
      prisma.usageLedger.aggregate({
        where: { userId: user.id, createdAt: { gte: startOfMonth } },
        _sum: { creditsUsed: true, inputTokens: true, outputTokens: true },
        _count: true,
      }),
      prisma.task.count({
        where: {
          userId: user.id,
          status: { in: ['DRAFT', 'PLANNING', 'READY', 'IN_PROGRESS', 'WAITING_FOR_USER', 'BLOCKED'] },
        },
      }),
      prisma.task.count({ where: { userId: user.id } }),
    ]);

    return success({
      tier,
      subscription: sub,
      limits,
      usage: {
        creditsUsed: monthlyUsage._sum.creditsUsed || 0,
        creditsRemaining: limits.monthlyAICredits - (monthlyUsage._sum.creditsUsed || 0),
        totalTokens: (monthlyUsage._sum.inputTokens || 0) + (monthlyUsage._sum.outputTokens || 0),
        requestCount: monthlyUsage._count,
      },
      tasks: {
        active: activeTaskCount,
        total: totalTaskCount,
        maxActive: limits.maxActiveTasks,
      },
    });
  } catch (error) {
    console.error('[GET /api/usage]', error);
    return serverError();
  }
}
