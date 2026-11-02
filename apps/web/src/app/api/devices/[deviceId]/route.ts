import prisma from '@/lib/db';
import { getAuthenticatedUser, notFound, serverError, success, unauthorized } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// Signs a desktop app out remotely. Its token stops working immediately.
export async function DELETE(_req: Request, { params }: { params: { deviceId: string } }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();
    // Scoped by userId so one user can never revoke another's device.
    const result = await prisma.device.updateMany({
      where: { id: params.deviceId, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) return notFound('Device not found');
    return success({ ok: true });
  } catch (error) {
    console.error('[DELETE /api/devices/:id]', error);
    return serverError();
  }
}
