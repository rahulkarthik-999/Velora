import { z } from 'zod';
import prisma from '@/lib/db';
import { EmailSchema, PasswordSchema, dummyVerify, hashPassword, verifyPassword } from '@/lib/password';

// Email + password accounts, shared by the website and the desktop app.

export const SignUpFields = {
  name: z.string().trim().min(1, 'Enter your name').max(100),
  email: EmailSchema,
  password: PasswordSchema,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Accept the Terms and Privacy Policy to continue' }) }),
};

export const SignInFields = {
  email: EmailSchema,
  password: z.string().min(1, 'Enter your password').max(200),
};

export const ACCOUNT_EXISTS = 'An account with this email already exists. Sign in instead, or continue with Google.';
export const INVALID_LOGIN = "That email and password don't match an account.";
export const GOOGLE_ONLY = 'This account signs in with Google. Choose "Continue with Google".';

export class AccountError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Creates the user with the same defaults as a Google sign-up (see authOptions.events.createUser). */
export async function createPasswordAccount(input: { name: string; email: string; password: string; source: 'web' | 'desktop' }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new AccountError(ACCOUNT_EXISTS, 409);

  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash } });
      await tx.userProfile.create({ data: { userId: created.id, termsAcceptedAt: new Date() } });
      await tx.subscription.create({ data: { userId: created.id, tier: 'FREE', status: 'ACTIVE' } });
      await tx.analyticsEvent.create({
        data: { userId: created.id, eventType: 'ACCOUNT_CREATED', properties: { source: input.source } },
      });
      return created;
    });
  } catch (error) {
    // Two sign-ups for the same address at once.
    if ((error as { code?: string }).code === 'P2002') throw new AccountError(ACCOUNT_EXISTS, 409);
    throw error;
  }
}

/** Checks an email + password; unknown emails take as long as wrong passwords. */
export async function verifyPasswordAccount(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, passwordHash: true, deletedAt: true },
  });
  if (!user || user.deletedAt) {
    await dummyVerify(password);
    throw new AccountError(INVALID_LOGIN, 401);
  }
  if (!user.passwordHash) {
    await dummyVerify(password);
    throw new AccountError(GOOGLE_ONLY, 401);
  }
  if (!(await verifyPassword(password, user.passwordHash))) throw new AccountError(INVALID_LOGIN, 401);
  return user;
}
