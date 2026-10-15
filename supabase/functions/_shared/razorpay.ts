/**
 * Razorpay helpers shared by the Edge Functions. Pure Web-Crypto code (no Deno or Node APIs) so
 * it runs in Supabase Edge Functions and is unit-tested in tests/payments.test.ts.
 *
 * Razorpay signs webhooks with HMAC-SHA256(raw request body, WEBHOOK SECRET) in the
 * `X-Razorpay-Signature` header (hex). Each delivery carries `X-Razorpay-Event-Id`, which repeats
 * when Razorpay retries — we store it to make processing idempotent.
 */

const enc = new TextEncoder();

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison so the check doesn't leak how many characters matched. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(expected, signature.trim().toLowerCase());
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;   // minor units
  currency: string;
  status: string;
}

export type WebhookDecision =
  | { kind: 'fulfil'; providerOrderId: string; paymentId: string; amount: number; currency: string }
  | { kind: 'fail'; providerOrderId: string }
  | { kind: 'ignore'; reason: string };

/** Decide what a (signature-verified) webhook means for our order. */
export function decideWebhook(body: unknown): WebhookDecision {
  const b = body as { event?: string; payload?: { payment?: { entity?: RazorpayPayment } } };
  const p = b?.payload?.payment?.entity;
  if (!b?.event) return { kind: 'ignore', reason: 'no event' };
  if (!p?.order_id) return { kind: 'ignore', reason: `event ${b.event} has no order` };
  if (b.event === 'payment.captured' || b.event === 'order.paid') {
    if (p.status !== 'captured') return { kind: 'ignore', reason: `payment status ${p.status}` };
    if (!Number.isInteger(p.amount) || !p.currency) return { kind: 'ignore', reason: 'missing amount' };
    return { kind: 'fulfil', providerOrderId: p.order_id, paymentId: p.id, amount: p.amount, currency: p.currency.toUpperCase() };
  }
  if (b.event === 'payment.failed') return { kind: 'fail', providerOrderId: p.order_id };
  return { kind: 'ignore', reason: `unhandled event ${b.event}` };
}

/** Create a Razorpay order for an amount the SERVER calculated. */
export async function createRazorpayOrder(keyId: string, keySecret: string, amount: number, currency: string, receipt: string, notes: Record<string, string>) {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}` },
    body: JSON.stringify({ amount, currency, receipt, notes }),
  });
  if (!res.ok) throw new Error(`Razorpay order creation failed (${res.status})`);
  return (await res.json()) as { id: string; amount: number; currency: string };
}
