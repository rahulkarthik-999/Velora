import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { checkRateLimit, rateLimitError, serverError, unauthorized } from '@/lib/api-utils';
import { billingCaller } from '@/lib/billing/caller';
import { DodoError, createCheckout } from '@/lib/billing/dodo';
import { accessFor } from '@/lib/billing/entitlements';
import { PLAN_IDS, PLANS, productIdFor } from '@/lib/billing/plans';
import { resolvePublicUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

const CheckoutInput = z.object({ plan: z.enum(PLAN_IDS as [string, ...string[]]) });

// Starts a Dodo checkout for one plan. Access is granted only by the verified
// webhook that follows the payment, never by returning from checkout.
export async function POST(req: NextRequest) {
  try {
    const userId = await billingCaller(req);
    if (!userId) return unauthorized();
    if (!checkRateLimit(`checkout:${userId}`, 10, 60_000)) return rateLimitError();

    const parsed = CheckoutInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Choose a valid plan.' }, { status: 400 });
    const plan = PLANS[parsed.data.plan as keyof typeof PLANS];

    const productId = productIdFor(plan.id);
    if (!productId) {
      console.error(`[checkout] ${plan.productEnv} is not set`);
      return NextResponse.json({ error: 'This plan is not available yet.' }, { status: 503 });
    }

    const [user, sub] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } }),
      prisma.subscription.findUnique({ where: { userId } }),
    ]);
    if (!user?.email) return NextResponse.json({ error: 'Your account needs an email address to check out.' }, { status: 400 });

    // Switching between recurring plans happens in the billing portal, so nobody pays twice.
    const active = accessFor(sub) === 'active';
    if (active && sub?.plan === 'LIFETIME') {
      return NextResponse.json({ error: 'You already have Velora Lifetime.' }, { status: 409 });
    }
    if (active && plan.interval !== 'one_time') {
      return NextResponse.json(
        { error: 'You already have an active plan. Change or cancel it from Manage subscription.', code: 'has_plan' },
        { status: 409 }
      );
    }

    const origin = resolvePublicUrl(process.env.APP_URL, req.nextUrl.origin) ?? req.nextUrl.origin;
    const { checkoutUrl, sessionId } = await createCheckout({
      productId,
      customer: sub?.externalCustomerId ? { customerId: sub.externalCustomerId } : { email: user.email, name: user.name || user.email },
      metadata: { userId, plan: plan.id },
      returnUrl: `${origin}/billing/success`,
    });
    return NextResponse.json({ checkoutUrl, sessionId });
  } catch (error) {
    if (error instanceof DodoError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[POST /api/billing/checkout]', error);
    return serverError();
  }
}
