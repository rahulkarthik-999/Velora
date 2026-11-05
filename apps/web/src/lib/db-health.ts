// Diagnoses DATABASE_URL problems for /api/health without revealing the URL.

/** The database server's host name (no user, password or database name). */
export function dbHost(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.hostname || 'invalid'}:${u.port || '5432'}${u.searchParams.has('pgbouncer') ? ' (pgbouncer)' : ''}`;
  } catch {
    return 'invalid';
  }
}

/** Which of the usual DATABASE_URL mistakes this is, from Prisma's message (never echoed). */
export function classifyDbError(message: string): string {
  if (/Environment variable not found: DATABASE_URL/i.test(message) || !process.env.DATABASE_URL) return 'DATABASE_URL is not set';
  if (/must start with the protocol|invalid port number|invalid database string/i.test(message)) return 'DATABASE_URL is not a valid postgresql:// URL';
  if (/Authentication failed|password authentication failed/i.test(message)) return 'database rejected the username or password';
  if (/tenant\/user .* not found|Tenant or user not found/i.test(message)) return 'pooler username must be postgres.<project-ref>';
  if (/Can't reach database server|timed out|ENOTFOUND|ECONNREFUSED/i.test(message)) return 'database server is unreachable';
  if (/does not exist in the current database|relation .* does not exist/i.test(message)) return 'database has no Velora tables; run prisma db push';
  if (/database .* does not exist/i.test(message)) return 'database name in DATABASE_URL does not exist';
  if (/SSL|TLS|certificate/i.test(message)) return 'SSL connection failed; add ?sslmode=require';
  return 'other';
}

/** Prisma's first error line with any connection string or password removed. */
export function safeDbMessage(message: string): string {
  return (message.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('Invalid `')) ?? '')
    .replace(/postgres(ql)?:\/\/[^\s`'"]+/gi, '<url>')
    .replace(/password[^\s,]*/gi, 'password<redacted>')
    .slice(0, 200);
}
