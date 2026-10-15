// Razorpay → POST webhook. Deploy with --no-verify-jwt (Razorpay can't send a Supabase JWT);
// authenticity comes from the HMAC signature instead.
//
//  1. Verify X-Razorpay-Signature over the RAW body with RAZORPAY_WEBHOOK_SECRET. Reject otherwise.
//  2. Record X-Razorpay-Event-Id once (unique) — repeats are acknowledged and ignored.
//  3. Fulfil via public.fulfil_order(), which checks amount + currency against the stored order
//     and creates at most one enrollment. Out-of-order "failed" events never undo a payment.
//  4. If fulfilment throws, answer 500 so Razorpay retries; nothing is half-granted (one transaction).
import { admin, ConfigError, env, log } from '../_shared/http.ts';
import { decideWebhook, verifyWebhookSignature } from '../_shared/razorpay.ts';
import { sendPurchaseEmail } from '../_shared/email.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const secret = env('RAZORPAY_WEBHOOK_SECRET');
    const raw = await req.text();
    if (!(await verifyWebhookSignature(raw, req.headers.get('x-razorpay-signature'), secret))) {
      log('webhook.bad_signature');
      return new Response('Invalid signature', { status: 401 });
    }
    const body = JSON.parse(raw);
    const eventId = req.headers.get('x-razorpay-event-id') ?? `${body.event}:${body?.payload?.payment?.entity?.id ?? body.created_at}`;
    const decision = decideWebhook(body);
    const db = admin();

    // Idempotency: one row per provider event id.
    const { error: dup } = await db.from('payment_events').insert({ provider: 'razorpay', event_id: eventId, event_type: String(body.event ?? ''), outcome: 'received' });
    if (dup) {
      if (dup.code === '23505') { log('webhook.duplicate', { eventId }); return new Response('ok'); }
      throw new Error(`event insert failed: ${dup.code}`);
    }

    if (decision.kind === 'ignore') {
      await db.from('payment_events').update({ outcome: `ignored: ${decision.reason}` }).eq('provider', 'razorpay').eq('event_id', eventId);
      return new Response('ok');
    }

    const { data: order } = await db.from('orders').select('id').eq('provider_order_id', decision.providerOrderId).maybeSingle();
    if (!order) {
      await db.from('payment_events').update({ outcome: 'unknown-order' }).eq('provider', 'razorpay').eq('event_id', eventId);
      log('webhook.unknown_order', { eventId });
      return new Response('ok');
    }

    let outcome: string;
    if (decision.kind === 'fulfil') {
      const { data, error } = await db.rpc('fulfil_order', { p_order: order.id, p_payment_id: decision.paymentId, p_amount_minor: decision.amount, p_currency: decision.currency });
      if (error) {
        // Let Razorpay retry: remove our event marker so the retry is processed.
        await db.from('payment_events').delete().eq('provider', 'razorpay').eq('event_id', eventId);
        throw new Error(`fulfil failed: ${error.code}`);
      }
      outcome = String(data);
      if (outcome === 'fulfilled') await sendPurchaseEmail(db, order.id).catch((e) => log('email.failed', { order: order.id, message: (e as Error).message }));
    } else {
      const { data } = await db.rpc('fail_order', { p_order: order.id });
      outcome = String(data);
    }
    await db.from('payment_events').update({ outcome, order_id: order.id }).eq('provider', 'razorpay').eq('event_id', eventId);
    log('webhook.processed', { eventId, order: order.id, outcome });
    if (outcome === 'amount-mismatch' || outcome === 'paid-already-enrolled') log('webhook.needs_review', { order: order.id, outcome });
    return new Response('ok');
  } catch (e) {
    if (e instanceof ConfigError) { log('config.missing', { variable: e.variable }); return new Response('Not configured', { status: 503 }); }
    log('webhook.error', { message: (e as Error).message });
    return new Response('Error', { status: 500 });
  }
});
