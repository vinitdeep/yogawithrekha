// Purchase / access confirmation email via Resend (https://resend.com). Optional: when
// RESEND_API_KEY or EMAIL_FROM is not set, nothing is sent and the event is logged.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { log } from './http.ts';

const fmtMoney = (minor: number, currency: string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(minor / 100);
const fmtEnd = (iso: string) =>
  `${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso))} IST`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function sendPurchaseEmail(db: SupabaseClient, orderId: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
  if (!key || !from) { log('email.skipped', { reason: 'not configured' }); return; }

  const { data: o } = await db.from('orders').select('customer_name, customer_email, course_title, amount_minor, currency, reference').eq('id', orderId).single();
  const { data: e } = await db.from('enrollments').select('expires_at').eq('order_id', orderId).maybeSingle();
  if (!o || !e) return;

  const html = `<p>Hi ${esc(o.customer_name.split(' ')[0] || 'there')},</p>
<p>Thank you — your enrollment in <strong>${esc(o.course_title)}</strong> is confirmed.</p>
<p>Amount: ${fmtMoney(o.amount_minor, o.currency)}<br>Reference: ${esc(o.reference)}<br>Access until: ${fmtEnd(e.expires_at)}</p>
<p><a href="${site}/dashboard">Open your dashboard</a> to start learning.</p>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `purchase-${orderId}` },
    body: JSON.stringify({ from, to: [o.customer_email], subject: `You’re enrolled: ${o.course_title}`, html }),
  });
  if (!res.ok) throw new Error(`email provider returned ${res.status}`);
  log('email.sent', { order: orderId });
}
