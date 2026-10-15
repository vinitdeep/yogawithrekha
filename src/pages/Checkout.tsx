import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { accessStatus, courseLessons, isLive, useStore } from '../lib/store';
import { IS_DEMO, PAYMENTS_ENABLED } from '../lib/config';
import type { Order } from '../lib/types';
import { Icon } from '../components/Icon';
import { CourseArt, CurrencyToggle, ProvisionalBadge, formatMoney, useCurrency } from '../components/brand';
import { Notice, usePageTitle, useToast } from '../components/ui';
import { LoginForm, RegisterForm } from './Auth';
import { formatAccessDate, formatAccessEnd } from '../lib/dates';
import NotFound from './NotFound';

declare global {
  interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open(): void; on(ev: string, cb: (r: unknown) => void): void } }
}

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function Checkout() {
  const { slug } = useParams();
  const { state, site, user, enrollmentFor, startCheckout, simulatePayment, logout } = useStore();
  const { currency } = useCurrency();
  const nav = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<'register' | 'login'>('register');
  const [terms, setTerms] = useState(false);
  const [termsError, setTermsError] = useState('');
  const [outcome, setOutcome] = useState<'paid' | 'failed'>('paid');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const course = state.courses.find((c) => c.slug === slug && c.status === 'published');
  usePageTitle('Checkout');
  if (!course) return <NotFound />;

  const enr = user ? enrollmentFor(user.id, course.id) : undefined;
  const alreadyEnrolled = isLive(accessStatus(enr));
  const amount = course.prices[currency];
  const canPay = IS_DEMO || PAYMENTS_ENABLED;

  const pay = async () => {
    if (lock.current) return; // ignore double clicks while a payment is in progress
    if (!terms) { setTermsError('Please accept the terms to continue.'); document.getElementById('terms')?.focus(); return; }
    setTermsError('');
    setError('');
    lock.current = true;
    setProcessing(true);
    const release = () => { lock.current = false; setProcessing(false); };

    // The server (or demo engine) calculates the amount from the course record.
    const r = await startCheckout(course.id, currency);
    if (!r.ok) { setError(r.error); release(); return; }
    const { order, provider } = r.data;

    if (provider.name === 'simulated') {
      const done = await simulatePayment!(order.id, outcome);
      nav(`/checkout/result/${order.id}`, { replace: true });
      if (!done.ok) toast(done.error, 'err');
      return;
    }

    // Production: open the provider's secure checkout. Access is granted only when the server
    // receives and verifies the provider's signed notification — never from this page.
    if (!(await loadRazorpay()) || !window.Razorpay) { setError('The payment window could not be loaded. Check your connection or disable content blockers, then try again.'); release(); return; }
    const rzp = new window.Razorpay({
      key: provider.keyId,
      order_id: provider.providerOrderId,
      amount: order.amount,
      currency: order.currency,
      name: site.brandName,
      description: course.title,
      prefill: { name: user?.name, email: user?.email },
      notes: { order_reference: order.reference },
      theme: { color: '#3f6b4b' },
      handler: () => nav(`/checkout/result/${order.id}`, { replace: true }),
      modal: { ondismiss: () => { release(); setError('The payment window was closed before payment was completed. You have not been charged — you can try again.'); } },
    });
    rzp.on('payment.failed', () => { /* the provider shows its own error; the webhook records the failure */ });
    rzp.open();
  };

  return (
    <section className="section-tight">
      <div className="wrap">
        <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/courses">Courses</Link> / <Link to={`/courses/${course.slug}`}>{course.title}</Link> / <span aria-current="page">Checkout</span></nav>
        <h1 style={{ fontSize: 'clamp(1.8rem, 1.4rem + 1.5vw, 2.4rem)' }}>Checkout</h1>
        {IS_DEMO && (
          <Notice kind="demo" title="Simulated checkout">
            No real payment is taken and no card details are requested. Choose the outcome you want to demonstrate below.
          </Notice>
        )}

        <div className="checkout-grid" style={{ marginTop: 28 }}>
          <div className="stack" style={{ display: 'grid', gap: 24 }}>
            {/* Step 1: account */}
            <div className="card">
              <h2 style={{ fontSize: '1.3rem' }}>1. Your account</h2>
              {user ? (
                <div className="row-between">
                  <div>
                    <strong>{user.name}</strong><br /><span className="muted">{user.email}</span>
                  </div>
                  <button type="button" className="link-btn small" onClick={() => logout()} disabled={processing}>Not you? Sign out</button>
                </div>
              ) : (
                <>
                  <p className="muted">Create an account or sign in so your course access and progress are saved to you.</p>
                  <div className="tabs" role="tablist" aria-label="Account">
                    <button type="button" role="tab" id="tab-reg" aria-selected={tab === 'register'} aria-controls="panel-acct" onClick={() => setTab('register')}>Create account</button>
                    <button type="button" role="tab" id="tab-login" aria-selected={tab === 'login'} aria-controls="panel-acct" onClick={() => setTab('login')}>Sign in</button>
                  </div>
                  <div id="panel-acct" role="tabpanel" aria-labelledby={tab === 'register' ? 'tab-reg' : 'tab-login'}>
                    {tab === 'register'
                      ? <RegisterForm onDone={() => toast('Account created — you can complete your enrollment now')} />
                      : <LoginForm compact onDone={() => toast('Signed in')} />}
                  </div>
                </>
              )}
            </div>

            {/* Step 2: payment */}
            <div className="card" aria-disabled={!user} style={!user ? { opacity: 0.6 } : undefined}>
              <h2 style={{ fontSize: '1.3rem' }}>2. Payment</h2>
              {!user ? (
                <p className="muted" style={{ margin: 0 }}>Complete step 1 to continue.</p>
              ) : user.role === 'admin' ? (
                <Notice kind="info">You’re signed in as an administrator. To test enrollment, use a student account — or grant access from Admin → Students.</Notice>
              ) : alreadyEnrolled && enr ? (
                <div className="stack">
                  <Notice kind="ok" title="You’re already enrolled in this course">
                    {accessStatus(enr) === 'scheduled' ? <>Your access opens on {formatAccessDate(enr.startAt)}.</> : <>Your access runs until {formatAccessEnd(enr.expiresAt)}. There’s no need to pay again.</>}
                  </Notice>
                  <Link to="/dashboard" className="btn btn-primary">Go to my dashboard</Link>
                </div>
              ) : !canPay ? (
                <Notice kind="info" title="Online enrollment isn’t open yet">
                  Payments haven’t been switched on for this site. Please <Link to="/contact">contact us</Link> and we’ll let you know as soon as enrollment opens.
                </Notice>
              ) : amount === undefined ? (
                <Notice kind="warn">This course doesn’t have a price in {currency} yet. Please choose another currency above.</Notice>
              ) : (
                <div className="form">
                  {IS_DEMO && (
                    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                      <legend className="label" style={{ fontWeight: 600, marginBottom: 10 }}>Simulated payment outcome</legend>
                      <div className="radio-cards">
                        <label className="radio-card">
                          <input type="radio" name="outcome" checked={outcome === 'paid'} onChange={() => setOutcome('paid')} disabled={processing} />
                          <span><strong>Payment succeeds</strong><span className="muted small">Creates one demo order and enrollment, then opens your course.</span></span>
                        </label>
                        <label className="radio-card">
                          <input type="radio" name="outcome" checked={outcome === 'failed'} onChange={() => setOutcome('failed')} disabled={processing} />
                          <span><strong>Payment fails</strong><span className="muted small">Shows the failure screen with a retry option. No access is granted.</span></span>
                        </label>
                      </div>
                    </fieldset>
                  )}
                  <label className="check" htmlFor="terms">
                    <input id="terms" type="checkbox" checked={terms} disabled={processing} aria-invalid={!!termsError} aria-describedby={termsError ? 'terms-err' : undefined} onChange={(e) => { setTerms(e.target.checked); if (e.target.checked) setTermsError(''); }} />
                    <span>I agree to the <Link to="/policies/terms" target="_blank">{site.policies.terms.title}</Link> and <Link to="/policies/refund" target="_blank">{site.policies.refund.title}</Link>{site.policies.terms.draft || site.policies.refund.draft ? ' (drafts)' : ''} and understand that access lasts {course.accessMonths} calendar months from enrollment.</span>
                  </label>
                  {termsError && <span id="terms-err" className="error" style={{ color: 'var(--err)', fontSize: '0.85rem' }}>{termsError}</span>}
                  {error && <Notice kind="err">{error}</Notice>}
                  <button type="button" className="btn btn-primary btn-block" onClick={pay} disabled={processing} aria-busy={processing}>
                    {processing
                      ? <><span className="spinner" aria-hidden="true" /> {IS_DEMO ? 'Processing payment…' : 'Opening secure payment…'}</>
                      : <>Pay {formatMoney(amount, currency)}{IS_DEMO && <span className="small" style={{ fontWeight: 500 }}> (simulated)</span>}</>}
                  </button>
                  <p className="muted small" style={{ margin: 0 }}>
                    {IS_DEMO ? 'In production you’ll pay on the payment provider’s secure page. ' : 'You’ll pay on our payment provider’s secure page — card details never touch this website. '}
                    Available payment methods can depend on your country and card issuer; the currency shown does not guarantee that a method will be available.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          <aside className="card checkout-summary" aria-labelledby="sum-h">
            <h2 id="sum-h" style={{ fontSize: '1.3rem' }}>Order summary</h2>
            <div style={{ borderRadius: 'var(--r)', overflow: 'hidden', margin: '12px 0 16px' }}><CourseArt course={course} label={false} /></div>
            <ProvisionalBadge show={course.titleProvisional} children="Sample title" />
            <h3 style={{ marginTop: 8 }}>{course.title}</h3>
            <div className="summary-line"><span>Lessons</span><span>{courseLessons(course).length} prerecorded</span></div>
            <div className="summary-line"><span>Access</span><span>{course.accessMonths} months from enrollment</span></div>
            <div className="summary-line"><span>Currency</span><CurrencyToggle /></div>
            <div className="summary-total"><span>Total</span><span>{amount !== undefined ? formatMoney(amount, currency) : '—'}</span></div>
            {course.pricesSample && <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>Sample price — final pricing and any applicable taxes will be confirmed before launch.</p>}
          </aside>
        </div>
      </div>
    </section>
  );
}

export function CheckoutResult() {
  const { orderId } = useParams();
  const { state, user, simulatePayment, refreshOrder } = useStore();
  const toast = useToast();
  const [order, setOrder] = useState<Order | undefined>(() => state.orders.find((o) => o.id === orderId));
  const [timedOut, setTimedOut] = useState(false);
  const course = order && state.courses.find((c) => c.id === order.courseId);
  const enr = order && state.enrollments.find((e) => e.orderId === order.id);
  usePageTitle(order?.status === 'paid' ? 'Enrollment confirmed' : order?.status === 'failed' ? 'Payment unsuccessful' : 'Confirming payment');

  useEffect(() => { const o = state.orders.find((x) => x.id === orderId); if (o) setOrder(o); }, [state.orders, orderId]);

  // Production: wait for the server to verify the payment (webhook). Poll for up to 2 minutes.
  useEffect(() => {
    if (!orderId || (order && order.status !== 'pending')) return;
    let n = 0;
    const t = window.setInterval(async () => {
      n += 1;
      const r = await refreshOrder(orderId);
      if (r.ok) setOrder(r.data);
      if ((r.ok && r.data.status !== 'pending') || n >= 40) { window.clearInterval(t); if (n >= 40) setTimedOut(true); }
    }, 3000);
    return () => window.clearInterval(t);
  }, [orderId, order, refreshOrder]);

  if (!order || !course || (user && order.userId !== user.id && user.role !== 'admin')) return <NotFound />;
  const first = courseLessons(course)[0];

  return (
    <section className="section">
      <div className="wrap" style={{ maxWidth: 620 }}>
        <div className="card center">
          {order.status === 'pending' ? (
            <>
              <div className="result-icon wait"><span className="spinner" style={{ width: 32, height: 32 }} aria-hidden="true" /></div>
              <h1 style={{ fontSize: '1.8rem' }}>Confirming your payment…</h1>
              <p className="muted" role="status">This usually takes a few seconds. You can keep this page open.</p>
              {timedOut && (
                <Notice kind="info">Your payment is still being confirmed. Access is granted only once the payment is verified — we’ll email you, and it will appear on your dashboard. If you were charged and nothing appears within an hour, contact support with reference <strong>{order.reference}</strong>.</Notice>
              )}
            </>
          ) : order.status === 'paid' ? (
            <>
              <div className="result-icon ok"><Icon name="check" size={36} /></div>
              <h1 style={{ fontSize: '1.8rem' }}>You’re enrolled!</h1>
              <p className="lead" style={{ margin: '0 auto 20px' }}>Welcome to <strong>{course.title}</strong>.</p>
              <dl className="kv" style={{ textAlign: 'left', marginBottom: 20 }}>
                <div><dt>Amount</dt><dd>{formatMoney(order.amount, order.currency)}</dd></div>
                <div><dt>Reference</dt><dd style={{ wordBreak: 'break-all' }}>{order.reference}</dd></div>
                {enr && <div><dt>Access until</dt><dd>{formatAccessEnd(enr.expiresAt)}</dd></div>}
              </dl>
              {!enr && <Notice kind="warn">Your payment was received, but you already had access to this course, so no new access period was added. Please contact support about this payment.</Notice>}
              {IS_DEMO
                ? <Notice kind="demo">Simulated payment. In production a receipt and access confirmation would be emailed to {order.customerEmail}.</Notice>
                : <p className="muted small">A confirmation has been sent to {order.customerEmail}.</p>}
              <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
                {first && enr && <Link to={`/learn/${course.slug}/${first.id}`} className="btn btn-primary">Start the first lesson</Link>}
                <Link to="/dashboard" className="btn btn-secondary">Go to my dashboard</Link>
              </div>
              {IS_DEMO && simulatePayment && (
                <details style={{ marginTop: 24, textAlign: 'left' }} className="small muted">
                  <summary style={{ cursor: 'pointer' }}>Demo: replay the payment notification</summary>
                  <p style={{ marginTop: 8 }}>Payment providers can send the same notification more than once. Replaying it should not create a second enrollment.</p>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={async () => {
                    await simulatePayment(order.id, 'paid');
                    toast('Notification replayed — no new enrollment was created', 'info');
                  }}>Replay notification</button>
                </details>
              )}
            </>
          ) : (
            <>
              <div className="result-icon err"><Icon name="x" size={36} /></div>
              <h1 style={{ fontSize: '1.8rem' }}>Payment unsuccessful</h1>
              <p className="muted">Your payment for <strong>{course.title}</strong> didn’t go through, and no access has been granted.</p>
              <p className="muted small">Reference: {order.reference}</p>
              <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
                <Link to={`/checkout/${course.slug}`} className="btn btn-primary"><Icon name="refresh" size={18} /> Try again</Link>
                <Link to="/contact" className="btn btn-secondary">Contact support</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
