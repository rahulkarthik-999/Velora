import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// In-memory stand-in for the tables the email sign-in touches.
const db = vi.hoisted(() => {
  const users: Array<{ id: string; name: string | null; email: string; passwordHash: string | null; deletedAt: Date | null }> = [];
  const sessions: Array<{ sessionToken: string; userId: string; expires: Date }> = [];
  const user = {
    findUnique: vi.fn(async ({ where }: { where: { email: string } }) => users.find((u) => u.email === where.email) ?? null),
    create: vi.fn(async ({ data }: { data: { name: string; email: string; passwordHash: string } }) => {
      const u = { id: `u${users.length + 1}`, deletedAt: null, ...data };
      users.push(u);
      return u;
    }),
  };
  const tx = {
    user,
    userProfile: { create: vi.fn(async () => ({})) },
    subscription: { create: vi.fn(async () => ({})) },
    analyticsEvent: { create: vi.fn(async () => ({})) },
  };
  return {
    users,
    sessions,
    prisma: {
      ...tx,
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      session: {
        create: vi.fn(async ({ data }: { data: { sessionToken: string; userId: string; expires: Date } }) => {
          sessions.push(data);
          return data;
        }),
      },
    },
  };
});
vi.mock('@/lib/db', () => ({ default: db.prisma }));

const signup = (await import('@/app/api/account/signup/route')).POST;
const signin = (await import('@/app/api/account/signin/route')).POST;
const { safeCallback } = await import('@/lib/web-session');

let ip = 0;
function req(path: string, body: unknown, origin = 'https://www.veloraweb.online') {
  return new NextRequest(`https://www.veloraweb.online${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin, host: 'www.veloraweb.online', 'x-forwarded-for': `10.0.0.${++ip}` },
  });
}

const account = { name: 'Asha', email: 'Asha@Example.com', password: 'secret123', acceptTerms: true };

describe('website email sign-up and sign-in', () => {
  beforeEach(() => {
    db.users.length = 0;
    db.sessions.length = 0;
    vi.stubEnv('NEXTAUTH_URL', 'https://www.veloraweb.online');
  });

  it('sign-up creates the account and a NextAuth database session cookie', async () => {
    const res = await signup(req('/api/account/signup', { ...account, callbackUrl: '/dashboard?tab=resume' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, redirect: '/dashboard?tab=resume' });
    expect(db.users).toHaveLength(1);
    expect(db.users[0].email).toBe('asha@example.com');
    expect(db.users[0].passwordHash).toMatch(/^scrypt\$/);
    const cookie = res.cookies.get('__Secure-next-auth.session-token');
    expect(cookie?.value).toBe(db.sessions[0].sessionToken);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(db.sessions[0].userId).toBe(db.users[0].id);
  });

  it('sign-in with the right password starts a session; wrong password does not', async () => {
    await signup(req('/api/account/signup', account));
    db.sessions.length = 0;

    const bad = await signin(req('/api/account/signin', { email: account.email, password: 'wrong999' }));
    expect(bad.status).toBe(401);
    expect(db.sessions).toHaveLength(0);

    const good = await signin(req('/api/account/signin', { email: 'asha@example.com', password: 'secret123' }));
    expect(good.status).toBe(200);
    expect(db.sessions).toHaveLength(1);
    expect(good.cookies.get('__Secure-next-auth.session-token')?.value).toBe(db.sessions[0].sessionToken);
  });

  it('rejects a duplicate email, weak passwords and missing consent with a clear message', async () => {
    await signup(req('/api/account/signup', account));
    const dup = await signup(req('/api/account/signup', account));
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toMatch(/already exists/);

    const weak = await signup(req('/api/account/signup', { ...account, email: 'b@example.com', password: 'short' }));
    expect(weak.status).toBe(400);
    expect((await weak.json()).error).toMatch(/at least 8/);

    const noTerms = await signup(req('/api/account/signup', { ...account, email: 'c@example.com', acceptTerms: false }));
    expect(noTerms.status).toBe(400);
    expect((await noTerms.json()).error).toMatch(/Terms/);
  });

  it('Google-only accounts are told to use Google', async () => {
    db.users.push({ id: 'g1', name: 'G', email: 'g@example.com', passwordHash: null, deletedAt: null });
    const res = await signin(req('/api/account/signin', { email: 'g@example.com', password: 'anything1' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/Google/);
  });

  it('refuses cross-site requests (login CSRF)', async () => {
    const res = await signin(req('/api/account/signin', { email: 'a@example.com', password: 'x' }, 'https://evil.example'));
    expect(res.status).toBe(403);
    expect(db.sessions).toHaveLength(0);
  });

  it('only redirects to same-site paths after sign-in', () => {
    expect(safeCallback('/dashboard/settings')).toBe('/dashboard/settings');
    expect(safeCallback('https://evil.example')).toBe('/dashboard');
    expect(safeCallback('//evil.example')).toBe('/dashboard');
    expect(safeCallback(undefined)).toBe('/dashboard');
  });
});
