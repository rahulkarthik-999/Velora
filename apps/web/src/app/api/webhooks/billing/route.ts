import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import crypto from 'crypto';

// POST /api/webhooks/billing — Handle billing webhooks
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-webhook-signature') || req.headers.get('webhook-signature') || '';
    const webhookSecret = process.env.DODO_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[Webhook] DODO_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    if (!crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )) {
      console.warn('[Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(body);

    // Idempotency check
    const eventId = event.id || event.event_id;
    if (eventId) {
      const existing = await prisma.subscriptionEvent.findUnique({
        where: { externalEventId: eventId },
      });
      if (existing) {
        return NextResponse.json({ received: true, duplicate: true });
      }
    }

    // Process event
    const eventType = event.type || event.event_type;

    switch (eventType) {
      case 'subscription.active':
      case 'subscription.created': {
        const customerId = event.data?.customer_id || event.customer_id;
        const subscriptionId = event.data?.subscription_id || event.subscription_id;
        const productId = event.data?.product_id || event.product_id;

        const tier = getProductTier(productId);

        if (customerId) {
          const sub = await prisma.subscription.findFirst({
            where: { externalCustomerId: customerId },
          });

          if (sub) {
            await prisma.subscription.update({
              where: { id: sub.id },
              data: {
                tier,
                status: 'ACTIVE',
                externalId: subscriptionId,
                currentPeriodStart: new Date(),
              },
            });

            if (eventId) {
              await prisma.subscriptionEvent.create({
                data: {
                  subscriptionId: sub.id,
                  externalEventId: eventId,
                  type: eventType,
                  payload: event,
                },
              });
            }
          }
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
            await prisma.subscription.update({
              where: { id: sub.id },
              data: {
                tier: 'FREE',
                status: eventType === 'subscription.cancelled' ? 'CANCELLED' : 'EXPIRED',
                cancelledAt: new Date(),
              },
            });

            if (eventId) {
              await prisma.subscriptionEvent.create({
                data: {
                  subscriptionId: sub.id,
                  externalEventId: eventId,
                  type: eventType,
                  payload: event,
                },
              });
            }
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
        console.log(`[Webhook] Unhandled event type: ${eventType}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Webhook Error]', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

function getProductTier(productId: string | undefined): 'FREE' | 'PLUS' | 'PRO' {
  if (!productId) return 'FREE';
  if (productId === process.env.DODO_PRODUCT_PLUS) return 'PLUS';
  if (productId === process.env.DODO_PRODUCT_PRO) return 'PRO';
  return 'PLUS'; // Default to PLUS for unknown products
}
