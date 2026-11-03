import { createHmac, timingSafeEqual } from 'crypto';

// ============================================================================
// Dodo Payments: minimal REST client and webhook verification
// ============================================================================
//
// Endpoints and payloads follow Dodo's official SDK (dodopayments 2.61):
//   POST /checkouts                                   -> { session_id, checkout_url }
//   POST /customers/{customer_id}/customer-portal/session -> { link }
// Webhooks use the Standard Webhooks scheme (webhook-id, webhook-timestamp,
// webhook-signature: "v1,<base64 HMAC-SHA256 of id.timestamp.body>").

const BASE_URLS = {
  test_mode: 'https://test.dodopayments.com',
  live_mode: 'https://live.dodopayments.com',
} as const;

export class DodoError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Test mode unless DODO_ENVIRONMENT is explicitly "live_mode", so a missing setting can't charge real cards. */
export function dodoBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.DODO_ENVIRONMENT === 'live_mode' ? BASE_URLS.live_mode : BASE_URLS.test_mode;
}

async function dodo<T>(path: string, body: unknown): Promise<T> {
  const key = process.env.DODO_API_KEY;
  if (!key) throw new DodoError('Payments are not configured yet.', 503);
  const res = await fetch(`${dodoBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    // Dodo error bodies describe the request, not card data; keep a short excerpt for logs.
    console.error('[dodo]', path.replace(/cus_[A-Za-z0-9]+/, 'cus_…'), res.status, (await res.text().catch(() => '')).slice(0, 300));
    throw new DodoError('The payment provider is unavailable right now. Please try again.', 502);
  }
  return (await res.json()) as T;
}

export interface CheckoutRequest {
  productId: string;
  customer: { customerId: string } | { email: string; name: string };
  metadata: Record<string, string>;
  returnUrl: string;
}

export async function createCheckout(req: CheckoutRequest): Promise<{ sessionId: string; checkoutUrl: string }> {
  const customer = 'customerId' in req.customer ? { customer_id: req.customer.customerId } : req.customer;
  const out = await dodo<{ session_id: string; checkout_url?: string | null }>('/checkouts', {
    product_cart: [{ product_id: req.productId, quantity: 1 }],
    customer,
    metadata: req.metadata,
    return_url: req.returnUrl,
  });
  if (!out.checkout_url) throw new DodoError('The payment provider did not return a checkout link.', 502);
  return { sessionId: out.session_id, checkoutUrl: out.checkout_url };
}

export async function createPortalLink(customerId: string): Promise<string> {
  const out = await dodo<{ link: string }>(`/customers/${encodeURIComponent(customerId)}/customer-portal/session`, {});
  return out.link;
}

// ----------------------------------------------------------------------------
// Webhook verification (Standard Webhooks)
// ----------------------------------------------------------------------------

/** Reject deliveries older or newer than this, so a captured request can't be replayed later. */
export const WEBHOOK_TOLERANCE_SEC = 5 * 60;

function secretKey(secret: string): Buffer {
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  return Buffer.from(raw, 'base64');
}

export function signWebhook(secret: string, id: string, timestamp: number, body: string): string {
  return createHmac('sha256', secretKey(secret)).update(`${id}.${timestamp}.${body}`).digest('base64');
}

export type WebhookCheck = { ok: true; id: string } | { ok: false; reason: string };

export function verifyWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSec = Math.floor(Date.now() / 1000)
): WebhookCheck {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing headers' };
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSec - ts) > WEBHOOK_TOLERANCE_SEC) return { ok: false, reason: 'stale timestamp' };

  const expected = Buffer.from(signWebhook(secret, id, ts, body));
  // The header may carry several signatures ("v1,abc v1,def") during secret rotation.
  const match = signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  return match ? { ok: true, id } : { ok: false, reason: 'bad signature' };
}
