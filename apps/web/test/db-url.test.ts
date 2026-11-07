import { describe, expect, it, vi } from 'vitest';

vi.mock('@prisma/client', () => ({ PrismaClient: class {} }));
const { withConnectionDefaults } = await import('@/lib/db');
const { classifyDbError, safeDbMessage } = await import('@/lib/db-health');

describe('withConnectionDefaults', () => {
  it('adds timeouts and keeps existing parameters and credentials', () => {
    const out = withConnectionDefaults('postgresql://postgres.ref:p%40ss@host:6543/postgres?pgbouncer=true&connection_limit=1')!;
    const u = new URL(out);
    expect(u.username).toBe('postgres.ref');
    expect(u.password).toBe('p%40ss');
    expect(u.searchParams.get('pgbouncer')).toBe('true');
    expect(u.searchParams.get('connect_timeout')).toBe('30');
    expect(u.searchParams.get('pool_timeout')).toBe('30');
  });

  it('respects timeouts already in the URL and leaves bad URLs to Prisma', () => {
    expect(new URL(withConnectionDefaults('postgresql://u@h/d?connect_timeout=10')!).searchParams.get('connect_timeout')).toBe('10');
    expect(withConnectionDefaults('not a url')).toBe('not a url');
    expect(withConnectionDefaults(undefined)).toBeUndefined();
  });
});

describe('db health messages', () => {
  it('names the Supabase pooler username mistake', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://x@h/d');
    expect(classifyDbError('FATAL: (ENOTFOUND) tenant/user postgres.x not found')).toBe('pooler username must be postgres.<project-ref>');
  });

  it('never returns a connection string', () => {
    expect(safeDbMessage('connect to postgresql://u:secret@h:1/d failed')).not.toContain('secret');
  });
});
