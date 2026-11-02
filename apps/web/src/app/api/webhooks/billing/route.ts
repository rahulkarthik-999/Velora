import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature =
      req.headers.get('x-webhook-signature') ||
      req.headers.get('webhook-signature') ||
      '';
    const webhookSecret = process.env.DODO_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[Billing Webhook] DODO_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    if (!signature) {
      return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 });
    }

    // Verify HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);

    // Guard against timingSafeEqual throw on length mismatch
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.warn('[Billing Webhook] Signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(body);
    const eventId = event.id || event.event_id;

    // Idempotency check: duplicate event rejection
    if (eventId) {
      const existing = await prisma.subscriptionEvent.findUnique({
        where: { externalEventId: eventId },
      });
      if (existing) {
        return NextResponse.json({ received: true, duplicate: true });
      }
    }

    const eventType = event.type || event.event_type;

    switch (eventType) {
      case 'subscription.active':
      case 'subscription.created': {
        const customerId = event.data?.customer_id || event.customer_id;
        const subscriptionId = event.data?.subscription_id || event.subscription_id;
        const productId = event.data?.product_id || event.product_id;
        const metadataUserId = event.data?.metadata?.userId || event.metadata?.userId;

        const tier = getProductTier(productId);
        if (!tier) {
          console.warn(`[Billing Webhook] Unknown or invalid product ID: ${productId}. No tier granted.`);
          return NextResponse.json({ error: 'Unrecognized product ID' }, { status: 400 });
        }

        // Find subscription by customer ID or user ID
        const sub = await prisma.subscription.findFirst({
          where: {
            OR: [
              ...(customerId ? [{ externalCustomerId: customerId }] : []),
              ...(metadataUserId ? [{ userId: metadataUserId }] : []),
            ],
          },
        });

        if (sub) {
          await prisma.$transaction([
            prisma.subscription.update({
              where: { id: sub.id },
              data: {
                tier,
                status: 'ACTIVE',
                externalId: subscriptionId || sub.externalId,
                externalCustomerId: customerId || sub.externalCustomerId,
                currentPeriodStart: new Date(),
              },
            }),
            ...(eventId
              ? [
                  prisma.subscriptionEvent.create({
                    data: {
                      subscriptionId: sub.id,
                      externalEventId: eventId,
                      type: eventType,
                      payload: event,
                    },
                  }),
                ]
              : []),
          ]);
        }
        break;
      }

      case 'subscription.cancelled':
      case 'subscription.expired': {
        const subscriptionId = event.data?.subscription_id || event.subscription_id;
        if (subscriptionId) {
          const sub = await prisma.subscription.findFirst({
            where: { externalId: subscriptionId },
          });

          if (sub) {
            await prisma.$transaction([
              prisma.subscription.update({
                where: { id: sub.id },
                data: {
                  tier: 'FREE',
                  status: eventType === 'subscription.cancelled' ? 'CANCELLED' : 'EXPIRED',
                  cancelledAt: new Date(),
                },
              }),
              ...(eventId
                ? [
                    prisma.subscriptionEvent.create({
                      data: {
                        subscriptionId: sub.id,
                        externalEventId: eventId,
                        type: eventType,
                        payload: event,
                      },
                    }),
                  ]
                : []),
            ]);
          }
        }
        break;
      }

      case 'payment.failed': {
        const subscriptionId = event.data?.subscription_id || event.subscription_id;
        if (subscriptionId) {
          const sub = await prisma.subscription.findFirst({
            where: { externalId: subscriptionId },
          });
          if (sub) {
            await prisma.subscription.update({
              where: { id: sub.id },
              data: { status: 'PAST_DUE' },
            });
          }
        }
        break;
      }

      default:
        console.log(`[Billing Webhook] Handled informational event: ${eventType}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Billing Webhook Exception]', error);
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 500 });
  }
}

/**
 * Strict product ID mapping.
 * Never grant a tier to an unknown or missing product ID.
 */
function getProductTier(productId: string | undefined): 'PLUS' | 'PRO' | null {
  if (!productId) return null;
  if (process.env.DODO_PRODUCT_PLUS && productId === process.env.DODO_PRODUCT_PLUS) return 'PLUS';
  if (process.env.DODO_PRODUCT_PRO && productId === process.env.DODO_PRODUCT_PRO) return 'PRO';
  return null;
}
