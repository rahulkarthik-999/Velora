import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { badRequest, checkRateLimit, rateLimitError, serverError, success } from '@/lib/api-utils';
import {
  DEVICE_AUTH_TTL_MS,
  DEVICE_POLL_INTERVAL_S,
  clientIp,
  newDeviceCode,
  newUserCode,
  sha256,
} from '@/lib/desktop-auth';

export const dynamic = 'force-dynamic';

const StartInput = z.object({ deviceName: z.string().trim().min(1).max(100) });

// Starts a desktop sign-in. No session needed: the user approves on the website.
export async function POST(req: NextRequest) {
  try {
    if (!checkRateLimit(`desktop-start:${clientIp(req)}`, 10, 60_000)) return rateLimitError();

    const parsed = StartInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest('deviceName is required');

    const deviceCode = newDeviceCode();
    // Retry on the (unlikely) user-code collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      const userCode = newUserCode();
      try {
        await prisma.deviceAuthRequest.create({
          data: {
            deviceCodeHash: sha256(deviceCode),
            userCode,
            deviceName: parsed.data.deviceName,
            expiresAt: new Date(Date.now() + DEVICE_AUTH_TTL_MS),
          },
        });
        const origin = process.env.APP_URL || req.nextUrl.origin;
        return success({
          deviceCode,
          userCode,
          verificationUrl: `${origin}/desktop/link?code=${encodeURIComponent(userCode)}`,
          interval: DEVICE_POLL_INTERVAL_S,
          expiresIn: DEVICE_AUTH_TTL_MS / 1000,
        });
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e;
      }
    }
    return serverError('Could not create a sign-in code');
  } catch (error) {
    console.error('[POST /api/desktop/auth/start]', error);
    return serverError();
  }
}
