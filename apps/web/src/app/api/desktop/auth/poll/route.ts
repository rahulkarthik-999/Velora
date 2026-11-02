import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { badRequest, checkRateLimit, rateLimitError, serverError, success } from '@/lib/api-utils';
import { clientIp, newDeviceToken, sha256 } from '@/lib/desktop-auth';

export const dynamic = 'force-dynamic';

const PollInput = z.object({ deviceCode: z.string().min(20).max(200) });

// Polled by the desktop app until the user approves on the website.
export async function POST(req: NextRequest) {
  try {
    if (!checkRateLimit(`desktop-poll:${clientIp(req)}`, 60, 60_000)) return rateLimitError();

    const parsed = PollInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest('deviceCode is required');

    const request = await prisma.deviceAuthRequest.findUnique({
      where: { deviceCodeHash: sha256(parsed.data.deviceCode) },
    });
    if (!request || request.status === 'consumed' || request.expiresAt < new Date()) {
      return NextResponse.json({ status: 'expired' }, { status: 410 });
    }
    if (request.status === 'pending' || request.status === 'denied') {
      return success({ status: request.status });
    }

    // Approved: exchange it for a device token exactly once.
    const token = newDeviceToken();
    const device = await prisma.$transaction(async (tx) => {
      const claimed = await tx.deviceAuthRequest.updateMany({
        where: { id: request.id, status: 'approved' },
        data: { status: 'consumed' },
      });
      if (claimed.count === 0 || !request.userId) return null;
      return tx.device.create({
        data: { userId: request.userId, name: request.deviceName, tokenHash: sha256(token) },
      });
    });
    if (!device) return NextResponse.json({ status: 'expired' }, { status: 410 });

    return success({ status: 'approved', token, deviceId: device.id });
  } catch (error) {
    console.error('[POST /api/desktop/auth/poll]', error);
    return serverError();
  }
}
