import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { serverError, success, unauthorized } from '@/lib/api-utils';
import { getDesktopCaller } from '@/lib/desktop-auth';
import { getUsageSummary } from '@/lib/usage';

export const dynamic = 'force-dynamic';

// Account, plan and usage for the signed-in desktop app.
export async function GET(req: NextRequest) {
  try {
    const caller = await getDesktopCaller(req);
    if (!caller) return unauthorized();

    const [user, device, usage] = await Promise.all([
      prisma.user.findUnique({ where: { id: caller.userId }, select: { name: true, email: true } }),
      prisma.device.findUnique({ where: { id: caller.deviceId }, select: { id: true, name: true, createdAt: true } }),
      getUsageSummary(caller.userId),
    ]);
    if (!user || !device) return unauthorized();

    return success({ user, device, usage });
  } catch (error) {
    console.error('[GET /api/desktop/me]', error);
    return serverError();
  }
}
