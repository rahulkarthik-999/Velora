import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, rateLimitError, serverError, success } from '@/lib/api-utils';
import { clientIp, issueDeviceToken } from '@/lib/desktop-auth';
import { AccountError, SignUpFields, createPasswordAccount } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

const RegisterInput = z.object({ ...SignUpFields, deviceName: z.string().trim().min(1).max(100) });

// Creates an email + password account from the desktop app and signs this device in.
export async function POST(req: NextRequest) {
  try {
    if (!checkRateLimit(`desktop-register:${clientIp(req)}`, 5, 10 * 60_000)) return rateLimitError();

    const parsed = RegisterInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    const { name, email, password, deviceName } = parsed.data;
    const user = await createPasswordAccount({ name, email, password, source: 'desktop' });
    const { token, deviceId } = await issueDeviceToken(user.id, deviceName);
    return success({ token, deviceId, user: { name: user.name, email: user.email } }, 201);
  } catch (error) {
    if (error instanceof AccountError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[POST /api/desktop/auth/register]', error);
    return serverError();
  }
}
