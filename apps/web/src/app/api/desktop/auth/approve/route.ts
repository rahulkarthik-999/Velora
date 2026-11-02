import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import {
  badRequest,
  checkRateLimit,
  getAuthenticatedUser,
  notFound,
  rateLimitError,
  serverError,
  success,
  unauthorized,
} from '@/lib/api-utils';
import { normaliseUserCode } from '@/lib/desktop-auth';

export const dynamic = 'force-dynamic';

const ApproveInput = z.object({ userCode: z.string(), approve: z.boolean() });

// Called from /desktop/link by a signed-in user to approve or deny a desktop sign-in.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();
    if (!checkRateLimit(`desktop-approve:${user.id}`, 10, 60_000)) return rateLimitError();

    const parsed = ApproveInput.safeParse(await req.json().catch(() => null));
    const userCode = parsed.success ? normaliseUserCode(parsed.data.userCode) : null;
    if (!parsed.success || !userCode) return badRequest('Enter the 8-character code shown in the Velora app');

    const request = await prisma.deviceAuthRequest.findUnique({ where: { userCode } });
    if (!request || request.status !== 'pending' || request.expiresAt < new Date()) {
      return notFound('This code is invalid or has expired. Start sign-in again from the app.');
    }

    // Only flip a still-pending request, so two approvals can't race.
    const updated = await prisma.deviceAuthRequest.updateMany({
      where: { id: request.id, status: 'pending' },
      data: { status: parsed.data.approve ? 'approved' : 'denied', userId: user.id },
    });
    if (updated.count === 0) return notFound('This code has already been used.');

    return success({ status: parsed.data.approve ? 'approved' : 'denied', deviceName: request.deviceName });
  } catch (error) {
    console.error('[POST /api/desktop/auth/approve]', error);
    return serverError();
  }
}
