import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { checkRateLimit, rateLimitError, serverError, success } from '@/lib/api-utils';
import { clientIp, issueDeviceToken } from '@/lib/desktop-auth';
import { EmailSchema, dummyVerify, verifyPassword } from '@/lib/password';

export const dynamic = 'force-dynamic';

const LoginInput = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Enter your password').max(200),
  deviceName: z.string().trim().min(1).max(100),
});

const INVALID = "That email and password don't match an account.";

// Email + password sign-in from the desktop app. Google accounts use the browser sign-in.
export async function POST(req: NextRequest) {
  try {
    const parsed = LoginInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    const { email, password, deviceName } = parsed.data;
    // Per address and per network: slows guessing one account from many IPs, or many accounts from one.
    if (
      !checkRateLimit(`desktop-login:${email}`, 8, 15 * 60_000) ||
      !checkRateLimit(`desktop-login-ip:${clientIp(req)}`, 30, 15 * 60_000)
    ) {
      return rateLimitError();
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, passwordHash: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      await dummyVerify(password);
      return NextResponse.json({ error: INVALID }, { status: 401 });
    }
    if (!user.passwordHash) {
      await dummyVerify(password);
      return NextResponse.json({ error: 'This account signs in with Google. Choose "Continue with Google".' }, { status: 401 });
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: INVALID }, { status: 401 });
    }

    const { token, deviceId } = await issueDeviceToken(user.id, deviceName);
    return success({ token, deviceId, user: { name: user.name, email: user.email } });
  } catch (error) {
    console.error('[POST /api/desktop/auth/login]', error);
    return serverError();
  }
}
