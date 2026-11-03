import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyWebhook } from '@/lib/billing/dodo';
import { applyDodoEvent, type DodoEvent } from '@/lib/billing/webhook';

export const dynamic = 'force-dynamic';

// Dodo Payments webhook (Standard Webhooks signatures). Point Dodo at
// https://veloraweb.online/api/webhooks/billing.
export async function POST(req: NextRequest) {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[billing webhook] DODO_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const body = await req.text();
  const check = verifyWebhook(
    secret,
    {
      id: req.headers.get('webhook-id'),
      timestamp: req.headers.get('webhook-timestamp'),
      signature: req.headers.get('webhook-signature'),
    },
    body
  );
  if (!check.ok) {
    console.warn('[billing webhook] rejected:', check.reason);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: DodoEvent;
  try {
    event = JSON.parse(body);
    if (typeof event?.type !== 'string') throw new Error('no type');
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction((tx) => applyDodoEvent(tx, check.id, event));
    return NextResponse.json({ received: true, result });
  } catch (error) {
    // A 5xx makes Dodo retry; the stored webhook id keeps the retry from applying twice.
    console.error('[billing webhook]', event.type, (error as Error).message);
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 500 });
  }
}
