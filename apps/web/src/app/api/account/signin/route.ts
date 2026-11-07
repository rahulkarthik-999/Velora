import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, rateLimitError, serverError } from '@/lib/api-utils';
import { clientIp } from '@/lib/desktop-auth';
import { AccountError, SignInFields, verifyPasswordAccount } from '@/lib/accounts';
import { safeCallback, sameOrigin, startWebSession } from '@/lib/web-session';

export const dynamic = 'force-dynamic';

const Input = z.object({ ...SignInFields, callbackUrl: z.string().max(500).optional() });

// Email + password sign-in on the website.
export async function POST(req: NextRequest) {
  try {
    if (!sameOrigin(req)) return NextResponse.json({ error: 'Sign in from veloraweb.online.' }, { status: 403 });
    const parsed = Input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    const { email, password, callbackUrl } = parsed.data;
    // Per address and per network, shared with the desktop sign-in limits.
    if (
      !checkRateLimit(`desktop-login:${email}`, 8, 15 * 60_000) ||
      !checkRateLimit(`desktop-login-ip:${clientIp(req)}`, 30, 15 * 60_000)
    ) {
      return rateLimitError();
    }
    const user = await verifyPasswordAccount(email, password);
    return startWebSession(NextResponse.json({ ok: true, redirect: safeCallback(callbackUrl) }), user.id);
  } catch (error) {
    if (error instanceof AccountError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[POST /api/account/signin]', error);
    return serverError();
  }
}
