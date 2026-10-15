import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { decideWebhook, hmacSha256Hex, timingSafeEqual, verifyWebhookSignature } from '../supabase/functions/_shared/razorpay';

/** The webhook's pure logic (signature + decision). The database side is tested in tests/sql. */

const SECRET = 'test_webhook_secret';
const event = (name: string, entity: Record<string, unknown>) => JSON.stringify({ event: name, payload: { payment: { entity } } });
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex');

describe('webhook signature', () => {
  const body = event('payment.captured', { id: 'pay_1', order_id: 'order_1', amount: 349900, currency: 'INR', status: 'captured' });

  it('matches Node’s HMAC-SHA256', async () => {
    expect(await hmacSha256Hex(SECRET, body)).toBe(sign(body));
  });

  it('accepts a correctly signed body', async () => {
    expect(await verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a wrong secret, a tampered body, or a missing signature', async () => {
    expect(await verifyWebhookSignature(body, sign(body, 'other'), SECRET)).toBe(false);
    expect(await verifyWebhookSignature(body.replace('349900', '100'), sign(body), SECRET)).toBe(false);
    expect(await verifyWebhookSignature(body, null, SECRET)).toBe(false);
    expect(await verifyWebhookSignature(body, sign(body), '')).toBe(false);
  });

  it('compares in constant time', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('webhook decisions', () => {
  it('captured payment → fulfil with the provider’s amount and currency (checked against the order later)', () => {
    expect(decideWebhook(JSON.parse(event('payment.captured', { id: 'pay_1', order_id: 'order_1', amount: 5900, currency: 'usd', status: 'captured' }))))
      .toEqual({ kind: 'fulfil', providerOrderId: 'order_1', paymentId: 'pay_1', amount: 5900, currency: 'USD' });
  });
  it('failed payment → fail (which never overrides a successful one)', () => {
    expect(decideWebhook(JSON.parse(event('payment.failed', { id: 'pay_2', order_id: 'order_1', amount: 5900, currency: 'USD', status: 'failed' })))).toEqual({ kind: 'fail', providerOrderId: 'order_1' });
  });
  it('authorized-but-not-captured, unknown events and malformed bodies are ignored', () => {
    expect(decideWebhook(JSON.parse(event('payment.captured', { id: 'p', order_id: 'o', amount: 1, currency: 'INR', status: 'authorized' }))).kind).toBe('ignore');
    expect(decideWebhook(JSON.parse(event('refund.created', { id: 'p', order_id: 'o', amount: 1, currency: 'INR', status: 'processed' }))).kind).toBe('ignore');
    expect(decideWebhook({}).kind).toBe('ignore');
    expect(decideWebhook(null).kind).toBe('ignore');
  });
});
