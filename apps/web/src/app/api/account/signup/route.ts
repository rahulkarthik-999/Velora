import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, rateLimitError, serverError } from '@/lib/api-utils';
import { clientIp } from '@/lib/desktop-auth';
import { AccountError, SignUpFields, createPasswordAccount } from '@/lib/accounts';
import { safeCallback, sameOrigin, startWebSession } from '@/lib/web-session';

export const dynamic = 'force-dynamic';

const Input = z.object({ ...SignUpFields, callbackUrl: z.string().max(500).optional() });

// Email + password sign-up on the website; signs the new account in.
export async function POST(req: NextRequest) {
  try {
    if (!sameOrigin(req)) return NextResponse.json({ error: 'Sign up from veloraweb.online.' }, { status: 403 });
    if (!checkRateLimit(`desktop-register:${clientIp(req)}`, 5, 10 * 60_000)) return rateLimitError();
    const parsed = Input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    const { name, email, password, callbackUrl } = parsed.data;
    const user = await createPasswordAccount({ name, email, password, source: 'web' });
    return startWebSession(NextResponse.json({ ok: true, redirect: safeCallback(callbackUrl) }, { status: 201 }), user.id);
  } catch (error) {
    if (error instanceof AccountError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[POST /api/account/signup]', error);
    return serverError();
  }
}
