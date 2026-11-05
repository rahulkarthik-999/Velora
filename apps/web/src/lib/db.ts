import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma gives up on a new connection after 5 s, but the first connection from a
 * serverless function to a pooled database in another region (Supabase in Sydney,
 * functions in the US) can take longer. Add generous defaults unless the URL sets its own.
 */
export function withConnectionDefaults(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has('connect_timeout')) u.searchParams.set('connect_timeout', '30');
    if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', '30');
    return u.toString();
  } catch {
    // Let Prisma report an invalid URL itself.
    return url;
  }
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasourceUrl: withConnectionDefaults(process.env.DATABASE_URL),
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
