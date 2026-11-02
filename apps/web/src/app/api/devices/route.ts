import prisma from '@/lib/db';
import { getAuthenticatedUser, serverError, success, unauthorized } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// Desktop apps signed in to the current user's account.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();
    const devices = await prisma.device.findMany({
      where: { userId: user.id, revokedAt: null },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return success({ devices });
  } catch (error) {
    console.error('[GET /api/devices]', error);
    return serverError();
  }
}
