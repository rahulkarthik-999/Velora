import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { getAuthenticatedUser, unauthorized, serverError, success } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// GET /api/user — Get current user profile
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        profile: true,
        subscription: true,
      },
    });

    if (!profile) return unauthorized();

    return success({
      id: profile.id,
      name: profile.name,
      email: profile.email,
      image: profile.image,
      profile: profile.profile,
      subscription: profile.subscription,
    });
  } catch (error) {
    console.error('[GET /api/user]', error);
    return serverError();
  }
}

// DELETE /api/user — Delete account
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorized();

    // Delete user and cascade all related data
    await prisma.user.delete({ where: { id: user.id } });

    return success({ deleted: true });
  } catch (error) {
    console.error('[DELETE /api/user]', error);
    return serverError();
  }
}
