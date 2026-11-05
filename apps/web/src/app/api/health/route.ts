import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { classifyDbError, dbHost, safeDbMessage } from '@/lib/db-health';
import { resolvePublicUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

function host(url: string | undefined): string | null {
  try {
    return url ? new URL(url).host : null;
  } catch {
    return 'invalid';
  }
}

/**
 * Deployment health for diagnosing sign-in problems. Reports only whether things are
 * configured and reachable, never secret values.
 */
export async function GET() {
  let database: { ok: boolean; error?: string; problem?: string; detail?: string; host?: string | null } = { ok: true, host: dbHost() };
  try {
    // Touches the tables sign-in needs, so a database without the schema shows up too.
    await prisma.$transaction([prisma.user.count({ take: 1 }), prisma.deviceAuthRequest.count({ take: 1 })]);
  } catch (e) {
    const err = e as { code?: string; name?: string; errorCode?: string; message?: string };
    database = {
      ok: false,
      error: err.code || err.errorCode || err.name || 'unknown',
      problem: classifyDbError(err.message ?? ''),
      detail: safeDbMessage(err.message ?? ''),
      host: dbHost(),
    };
  }

  const configuredAuthUrl = process.env.NEXTAUTH_URL;
  const auth = {
    nextAuthUrlHost: host(configuredAuthUrl),
    effectiveAuthUrlHost: host(resolvePublicUrl(configuredAuthUrl)),
    nextAuthSecretSet: Boolean(process.env.NEXTAUTH_SECRET),
    googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    appUrlHost: host(process.env.APP_URL),
  };
  const ai = { openAiKeySet: Boolean(process.env.AI_API_KEY) };
  const ok = database.ok && auth.nextAuthSecretSet && auth.googleConfigured && ai.openAiKeySet;

  return NextResponse.json(
    { ok, database, auth, ai, nodeEnv: process.env.NODE_ENV, vercelEnv: process.env.VERCEL_ENV ?? null },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
