import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

export async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return null;
  }
  return session.user;
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(message = 'Internal server error') {
  console.error('[API Error]', message);
  return NextResponse.json({ error: message }, { status: 500 });
}

export function rateLimitError() {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429 }
  );
}

export function success<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

// Simple in-memory rate limiter (per-process; use Redis for production cluster)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number = 30,
  windowMs: number = 60000
): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

export async function getUserSubscription(userId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
  });
  return sub || { tier: 'FREE' as const, status: 'ACTIVE' as const };
}
