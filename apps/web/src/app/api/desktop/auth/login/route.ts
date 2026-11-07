import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, rateLimitError, serverError, success } from '@/lib/api-utils';
import { clientIp, issueDeviceToken } from '@/lib/desktop-auth';
import { AccountError, SignInFields, verifyPasswordAccount } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

const LoginInput = z.object({ ...SignInFields, deviceName: z.string().trim().min(1).max(100) });

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

    const user = await verifyPasswordAccount(email, password);
    const { token, deviceId } = await issueDeviceToken(user.id, deviceName);
    return success({ token, deviceId, user: { name: user.name, email: user.email } });
  } catch (error) {
    if (error instanceof AccountError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[POST /api/desktop/auth/login]', error);
    return serverError();
  }
}
