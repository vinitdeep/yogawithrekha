// POST { courseId, currency } with the student's Authorization header.
// Creates (or reuses) a pending order whose amount comes from the DATABASE price, then a matching
// Razorpay order. The browser never supplies a price. Access is granted later, only by the webhook.
import { admin, ConfigError, env, json, log, requireUser, cors } from '../_shared/http.ts';
import { createRazorpayOrder } from '../_shared/razorpay.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' });
  try {
    const keyId = env('RAZORPAY_KEY_ID');
    const keySecret = env('RAZORPAY_KEY_SECRET');
    const user = await requireUser(req);
    if (!user) return json(req, 401, { error: 'Please sign in again.' });

    const body = await req.json().catch(() => ({}));
    const courseId = String(body.courseId ?? '');
    const currency = String(body.currency ?? '').toUpperCase();
    if (!/^[0-9a-f-]{36}$/.test(courseId) || !['INR', 'USD', 'CAD'].includes(currency)) return json(req, 400, { error: 'Invalid request.' });

    const db = admin();
    const [{ data: profile }, { data: course }, { data: price }, { data: settings }] = await Promise.all([
      db.from('profiles').select('id, name, email, role').eq('id', user.id).single(),
      db.from('courses').select('id, title, status').eq('id', courseId).single(),
      db.from('course_prices').select('amount_minor').eq('course_id', courseId).eq('currency', currency).maybeSingle(),
      db.from('site_settings').select('data').eq('id', 'published').single(),
    ]);
    if (!profile || profile.role !== 'student') return json(req, 403, { error: 'Only student accounts can enroll.' });
    if (!course || course.status !== 'published') return json(req, 404, { error: 'This course is not available for enrollment.' });
    if (!(settings?.data?.displayCurrencies ?? []).includes(currency)) return json(req, 400, { error: 'That currency is not offered.' });
    if (!price || price.amount_minor <= 0) return json(req, 400, { error: `This course has no ${currency} price yet.` });

    const { data: live } = await db.from('enrollments').select('id').eq('user_id', user.id).eq('course_id', courseId)
      .eq('revoked', false).gt('expires_at', new Date().toISOString()).limit(1);
    if (live?.length) return json(req, 409, { error: 'You are already enrolled in this course.' });

    // Reuse a recent pending order for the same course/currency/amount (double clicks, retries).
    const since = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data: open } = await db.from('orders').select('*').eq('user_id', user.id).eq('course_id', courseId).eq('currency', currency)
      .eq('amount_minor', price.amount_minor).eq('status', 'pending').gt('created_at', since).not('provider_order_id', 'is', null)
      .order('created_at', { ascending: false }).limit(1);
    if (open?.length) return json(req, 200, { order: open[0], keyId, providerOrderId: open[0].provider_order_id });

    const reference = `YWR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { data: order, error } = await db.from('orders').insert({
      user_id: user.id, course_id: courseId, course_title: course.title, customer_name: profile.name, customer_email: profile.email,
      amount_minor: price.amount_minor, currency, provider: 'razorpay', reference,
    }).select('*').single();
    if (error || !order) throw new Error('order insert failed');

    const rz = await createRazorpayOrder(keyId, keySecret, price.amount_minor, currency, reference, { order_id: order.id });
    const { data: updated } = await db.from('orders').update({ provider_order_id: rz.id }).eq('id', order.id).select('*').single();
    log('order.created', { order: order.id, currency, amount: price.amount_minor });
    return json(req, 200, { order: updated, keyId, providerOrderId: rz.id });
  } catch (e) {
    if (e instanceof ConfigError) { log('config.missing', { variable: e.variable }); return json(req, 503, { error: 'Payments are not configured yet.' }); }
    log('order.error', { message: (e as Error).message });
    return json(req, 500, { error: 'We couldn’t start the payment. Please try again.' });
  }
});
