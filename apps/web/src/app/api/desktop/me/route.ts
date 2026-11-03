import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { serverError, success, unauthorized } from '@/lib/api-utils';
import { getDesktopCaller } from '@/lib/desktop-auth';
import { getEntitlement } from '@/lib/billing/entitlements';

export const dynamic = 'force-dynamic';

// Account, plan and usage for the signed-in desktop app.
export async function GET(req: NextRequest) {
  try {
    const caller = await getDesktopCaller(req);
    if (!caller) return unauthorized();

    const [user, device, ent] = await Promise.all([
      prisma.user.findUnique({ where: { id: caller.userId }, select: { name: true, email: true } }),
      prisma.device.findUnique({ where: { id: caller.deviceId }, select: { id: true, name: true, createdAt: true } }),
      getEntitlement(caller.userId),
    ]);
    if (!user || !device) return unauthorized();

    const allowances = ent.allowances;
    return success({
      user,
      device,
      entitlement: {
        active: ent.active,
        reason: ent.reason,
        plan: ent.plan && { id: ent.plan.id, name: ent.plan.name, interval: ent.plan.interval },
        renewsAt: ent.renewsAt,
        cancelAtPeriodEnd: ent.cancelAtPeriodEnd,
        resetsAt: ent.window?.resetsAt ?? null,
        allowances,
        used: {
          aiCredits: ent.used.aiCredits,
          transcriptionMinutes: Math.ceil(ent.used.transcriptionSeconds / 60),
          screenshots: ent.used.screenshots,
        },
        remaining: ent.remaining,
      },
      // Kept for desktop app versions before 0.4.
      usage: {
        tier: ent.plan?.name ?? 'No plan',
        monthlyAICredits: allowances?.aiCredits ?? 0,
        creditsUsed: ent.used.aiCredits,
        creditsRemaining: ent.remaining?.aiCredits ?? 0,
        periodStart: ent.window?.start ?? null,
      },
    });
  } catch (error) {
    console.error('[GET /api/desktop/me]', error);
    return serverError();
  }
}
