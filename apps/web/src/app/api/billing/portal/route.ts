import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { checkRateLimit, rateLimitError, serverError, unauthorized } from '@/lib/api-utils';
import { billingCaller } from '@/lib/billing/caller';
import { DodoError, createPortalLink } from '@/lib/billing/dodo';

export const dynamic = 'force-dynamic';

// A link to Dodo's customer portal: payment method, invoices, plan changes, cancellation.
export async function POST(req: NextRequest) {
  try {
    const userId = await billingCaller(req);
    if (!userId) return unauthorized();
    if (!checkRateLimit(`portal:${userId}`, 10, 60_000)) return rateLimitError();

    const sub = await prisma.subscription.findUnique({ where: { userId }, select: { externalCustomerId: true } });
    if (!sub?.externalCustomerId) {
      return NextResponse.json({ error: 'There is no billing account yet. Choose a plan first.' }, { status: 404 });
    }
    return NextResponse.json({ url: await createPortalLink(sub.externalCustomerId) });
  } catch (error) {
    if (error instanceof DodoError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[POST /api/billing/portal]', error);
    return serverError();
  }
}
