import { randomBytes } from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// Email + password sign-in on the website. NextAuth's Credentials provider can't create
// database sessions, so these routes create the same Session row NextAuth would and set
// NextAuth's own session cookie. Everything else (useSession, getServerSession, sign-out)
// then works exactly as it does for a Google sign-in.

export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60; // matches authOptions.session.maxAge

/** NextAuth uses the __Secure- prefix whenever the site URL is https. */
export function sessionCookieName(): string {
  const url = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? '';
  return url.startsWith('https://') ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
}

/**
 * Login CSRF: a form on another site must not be able to sign a visitor into an attacker's
 * account. Browsers always send Origin on cross-site POSTs, so it must match this host.
 */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function startWebSession(res: NextResponse, userId: string): Promise<NextResponse> {
  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_MAX_AGE_S * 1000);
  await prisma.session.create({ data: { sessionToken, userId, expires } });
  const name = sessionCookieName();
  res.cookies.set(name, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: name.startsWith('__Secure-'),
    expires,
  });
  return res;
}

/** Only same-site paths, so a crafted link can't bounce a new session to another site. */
export function safeCallback(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/dashboard';
  return raw;
}
