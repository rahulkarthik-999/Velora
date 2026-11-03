// ============================================================================
// Public site URL, resilient to a localhost value copied into production env
// ============================================================================

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i;

/** The deployed site's origin on Vercel production, e.g. https://veloraweb.online. */
function vercelProductionOrigin(): string | null {
  if (process.env.VERCEL_ENV !== 'production') return null;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : null;
}

/**
 * A configured URL, unless it points at localhost while running in production,
 * in which case the production origin is used instead (a common copy-paste mistake
 * from .env that breaks Google sign-in and desktop sign-in links).
 */
export function resolvePublicUrl(configured: string | undefined, fallback?: string): string | undefined {
  const prod = vercelProductionOrigin();
  if (configured && !(prod && LOCAL.test(configured))) return configured.replace(/\/$/, '');
  return prod ?? fallback;
}

/** Fixes NEXTAUTH_URL before NextAuth reads it. Called from the auth route. */
export function ensureNextAuthUrl(): void {
  const fixed = resolvePublicUrl(process.env.NEXTAUTH_URL);
  if (fixed && fixed !== process.env.NEXTAUTH_URL) {
    console.warn(`[auth] NEXTAUTH_URL points at localhost in production; using ${fixed}. Fix it in Vercel.`);
    process.env.NEXTAUTH_URL = fixed;
  }
}
