import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { serverError, success, unauthorized } from '@/lib/api-utils';
import { getDesktopCaller } from '@/lib/desktop-auth';

export const dynamic = 'force-dynamic';

// Signs this desktop app out by revoking its own token.
export async function POST(req: NextRequest) {
  try {
    const caller = await getDesktopCaller(req);
    if (!caller) return unauthorized();
    await prisma.device.update({ where: { id: caller.deviceId }, data: { revokedAt: new Date() } });
    return success({ ok: true });
  } catch (error) {
    console.error('[POST /api/desktop/auth/logout]', error);
    return serverError();
  }
}
