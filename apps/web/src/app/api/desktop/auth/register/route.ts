import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { checkRateLimit, rateLimitError, serverError, success } from '@/lib/api-utils';
import { clientIp, issueDeviceToken } from '@/lib/desktop-auth';
import { EmailSchema, PasswordSchema, hashPassword } from '@/lib/password';

export const dynamic = 'force-dynamic';

const RegisterInput = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  email: EmailSchema,
  password: PasswordSchema,
  deviceName: z.string().trim().min(1).max(100),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Accept the Terms and Privacy Policy to continue' }) }),
});

const EXISTS = 'An account with this email already exists. Sign in instead, or continue with Google.';

// Creates an email + password account from the desktop app and signs this device in.
export async function POST(req: NextRequest) {
  try {
    if (!checkRateLimit(`desktop-register:${clientIp(req)}`, 5, 10 * 60_000)) return rateLimitError();

    const parsed = RegisterInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    const { name, email, password, deviceName } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return NextResponse.json({ error: EXISTS }, { status: 409 });

    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { name, email, passwordHash } });
      // Same defaults as a Google sign-up (see authOptions.events.createUser).
      await tx.userProfile.create({ data: { userId: created.id, termsAcceptedAt: new Date() } });
      await tx.subscription.create({ data: { userId: created.id, tier: 'FREE', status: 'ACTIVE' } });
      await tx.analyticsEvent.create({
        data: { userId: created.id, eventType: 'ACCOUNT_CREATED', properties: { source: 'desktop' } },
      });
      return created;
    });

    const { token, deviceId } = await issueDeviceToken(user.id, deviceName);
    return success({ token, deviceId, user: { name: user.name, email: user.email } }, 201);
  } catch (error) {
    // Two sign-ups for the same address at once.
    if ((error as { code?: string }).code === 'P2002') return NextResponse.json({ error: EXISTS }, { status: 409 });
    console.error('[POST /api/desktop/auth/register]', error);
    return serverError();
  }
}
