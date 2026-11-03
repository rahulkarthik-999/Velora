import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Adapter } from 'next-auth/adapters';
import prisma from '@/lib/db';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Lets someone who signed up in the desktop app with email + password also use Google.
      // Google verifies the address; see events.linkAccount for what happens to the password.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl + '/dashboard';
    },
  },
  events: {
    // Desktop sign-ups don't verify their email. When Google later proves who owns the
    // address, a password set before that proof is removed and its devices are signed out,
    // so whoever registered the address first can't keep access to the real owner's account.
    async linkAccount({ user, account }) {
      if (account.provider !== 'google') return;
      const existing = await prisma.user.findUnique({
        where: { id: user.id },
        select: { emailVerified: true, passwordHash: true },
      });
      if (existing?.passwordHash && !existing.emailVerified) {
        await prisma.$transaction([
          prisma.user.update({ where: { id: user.id }, data: { passwordHash: null, emailVerified: new Date() } }),
          prisma.device.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
        ]);
      } else if (existing && !existing.emailVerified) {
        await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
      }
    },
    async createUser({ user }) {
      // Create default profile and free subscription
      await prisma.$transaction([
        prisma.userProfile.create({
          data: {
            userId: user.id,
          },
        }),
        prisma.subscription.create({
          data: {
            userId: user.id,
            tier: 'FREE',
            status: 'ACTIVE',
          },
        }),
        prisma.analyticsEvent.create({
          data: {
            userId: user.id,
            eventType: 'ACCOUNT_CREATED',
            properties: {},
          },
        }),
      ]);
    },
  },
};
