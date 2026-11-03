import type { NextRequest } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-utils';
import { getDesktopCaller } from '@/lib/desktop-auth';

/** The signed-in user from the desktop app's device token or a website session. */
export async function billingCaller(req: NextRequest): Promise<string | null> {
  const desktop = await getDesktopCaller(req);
  if (desktop) return desktop.userId;
  const user = await getAuthenticatedUser();
  return user?.id ?? null;
}
