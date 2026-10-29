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
