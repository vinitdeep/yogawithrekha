import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { accessStatus, courseLessons, isLive, useStore } from '../lib/store';
import { Icon } from '../components/Icon';
import { CourseArt, CurrencyToggle, ProvisionalBadge, formatMoney, useCurrency } from '../components/brand';
import { Notice, usePageTitle, useToast } from '../components/ui';
import { LoginForm, RegisterForm } from './Auth';
import { formatDate } from '../lib/dates';
import NotFound from './NotFound';

export function Checkout() {
  const { slug } = useParams();
  const { state, user, enrollmentFor, createOrder, completeOrder, logout } = useStore();
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

  const pay = () => {
    if (lock.current) return; // prevents double submission
    if (!terms) { setTermsError('Please accept the terms to continue.'); document.getElementById('terms')?.focus(); return; }
    setTermsError('');
    setError('');
    const r = createOrder(course.id, currency);
    if (!r.ok) { setError(r.error); return; }
    lock.current = true;
    setProcessing(true);
    // Production: redirect to / open the payment provider; access is granted only after the
    // server verifies the payment (webhook + signature), never from the browser.
    setTimeout(() => {
      completeOrder(r.data.id, outcome);
      nav(`/checkout/result/${r.data.id}`, { replace: true });
    }, 1800);
  };

  return (
    <section className="section-tight">
      <div className="wrap">
        <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/courses">Courses</Link> / <Link to={`/courses/${course.slug}`}>{course.title}</Link> / <span aria-current="page">Checkout</span></nav>
        <h1 style={{ fontSize: 'clamp(1.8rem, 1.4rem + 1.5vw, 2.4rem)' }}>Checkout</h1>
        <Notice kind="demo" title="Simulated checkout">
          No real payment is taken and no card details are requested. Choose the outcome you want to demonstrate below.
        </Notice>

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
                  <button type="button" className="link-btn small" onClick={() => logout()}>Not you? Sign out</button>
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
              ) : alreadyEnrolled && enr ? (
                <div className="stack">
                  <Notice kind="ok" title="You’re already enrolled in this course">
                    {accessStatus(enr) === 'scheduled' ? <>Your access opens on {formatDate(enr.startAt)}.</> : <>Your access runs until {formatDate(enr.expiresAt)}. There’s no need to pay again.</>}
                  </Notice>
                  <Link to="/dashboard" className="btn btn-primary">Go to my dashboard</Link>
                </div>
              ) : (
                <div className="form">
                  <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend className="label" style={{ fontWeight: 600, marginBottom: 10 }}>Simulated payment outcome</legend>
                    <div className="radio-cards">
                      <label className="radio-card">
                        <input type="radio" name="outcome" checked={outcome === 'paid'} onChange={() => setOutcome('paid')} disabled={processing} />
                        <span><strong>Payment succeeds</strong><span className="muted small">Creates a demo enrollment and opens the student dashboard.</span></span>
                      </label>
                      <label className="radio-card">
                        <input type="radio" name="outcome" checked={outcome === 'failed'} onChange={() => setOutcome('failed')} disabled={processing} />
                        <span><strong>Payment fails</strong><span className="muted small">Shows the failure screen with a retry option. No access is granted.</span></span>
                      </label>
                    </div>
                  </fieldset>
                  <label className="check" htmlFor="terms">
                    <input id="terms" type="checkbox" checked={terms} disabled={processing} aria-invalid={!!termsError} aria-describedby={termsError ? 'terms-err' : undefined} onChange={(e) => { setTerms(e.target.checked); if (e.target.checked) setTermsError(''); }} />
                    <span>I agree to the <Link to="/policies/terms" target="_blank">Terms</Link> and <Link to="/policies/refund" target="_blank">Refund Policy</Link> (drafts) and understand that access lasts {course.accessMonths} months from enrollment.</span>
                  </label>
                  {termsError && <span id="terms-err" className="error" style={{ color: 'var(--err)', fontSize: '0.85rem' }}>{termsError}</span>}
                  {error && <Notice kind="err">{error}</Notice>}
                  <button type="button" className="btn btn-primary btn-block" onClick={pay} disabled={processing} aria-live="polite">
                    {processing ? <><span className="spinner" aria-hidden="true" /> Processing payment…</> : <>Pay {formatMoney(amount, currency)} <span className="small" style={{ fontWeight: 500 }}>(simulated)</span></>}
                  </button>
                  <p className="muted small" style={{ margin: 0 }}>
                    In production you’ll be taken to a secure payment page. Availability of payment methods can depend on your country and card issuer; the currency shown does not guarantee a method will be available.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          <aside className="card" aria-labelledby="sum-h" style={{ position: 'sticky', top: 96 }}>
            <h2 id="sum-h" style={{ fontSize: '1.3rem' }}>Order summary</h2>
            <div style={{ borderRadius: 'var(--r)', overflow: 'hidden', margin: '12px 0 16px' }}><CourseArt course={course} label={false} /></div>
            <ProvisionalBadge show={course.titleProvisional} children="Sample title" />
            <h3 style={{ marginTop: 8 }}>{course.title}</h3>
            <div className="summary-line"><span>Lessons</span><span>{courseLessons(course).length} prerecorded</span></div>
            <div className="summary-line"><span>Access</span><span>{course.accessMonths} months from enrollment</span></div>
            <div className="summary-line"><span>Currency</span><CurrencyToggle /></div>
            <div className="summary-total"><span>Total</span><span>{formatMoney(amount, currency)}</span></div>
            {course.pricesSample && <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>Sample price — final pricing and any applicable taxes will be confirmed before launch.</p>}
          </aside>
        </div>
      </div>
    </section>
  );
}

export function CheckoutResult() {
  const { orderId } = useParams();
  const { state, user, completeOrder } = useStore();
  const toast = useToast();
  const order = state.orders.find((o) => o.id === orderId);
  const course = order && state.courses.find((c) => c.id === order.courseId);
  const enr = order && state.enrollments.find((e) => e.orderId === order.id);
  const [checking, setChecking] = useState(order?.status === 'pending');
  usePageTitle(order?.status === 'paid' ? 'Enrollment confirmed' : order?.status === 'failed' ? 'Payment unsuccessful' : 'Confirming payment');

  useEffect(() => {
    if (order?.status !== 'pending') { setChecking(false); return; }
    const t = setTimeout(() => setChecking(false), 1200);
    return () => clearTimeout(t);
  }, [order?.status]);

  if (!order || !course || (user && order.userId !== user.id && user.role !== 'admin')) return <NotFound />;

  const first = courseLessons(course)[0];

  return (
    <section className="section">
      <div className="wrap" style={{ maxWidth: 620 }}>
        <div className="card center">
          {order.status === 'pending' || checking ? (
            <>
              <div className="result-icon wait"><span className="spinner" style={{ width: 32, height: 32 }} aria-hidden="true" /></div>
              <h1 style={{ fontSize: '1.8rem' }}>Confirming your payment…</h1>
              <p className="muted" role="status">This usually takes a few seconds. Please don’t close this page.</p>
              {order.status === 'pending' && !checking && (
                <Notice kind="info">Your payment is still pending. We’ll email you as soon as it’s confirmed — access is granted only once the payment is verified.</Notice>
              )}
            </>
          ) : order.status === 'paid' ? (
            <>
              <div className="result-icon ok"><Icon name="check" size={36} /></div>
              <h1 style={{ fontSize: '1.8rem' }}>You’re enrolled!</h1>
              <p className="lead" style={{ margin: '0 auto 20px' }}>Welcome to <strong>{course.title}</strong>.</p>
              <div className="kv" style={{ textAlign: 'left', marginBottom: 20 }}>
                <div><dt>Amount</dt><dd>{formatMoney(order.amount, order.currency)}</dd></div>
                <div><dt>Reference</dt><dd style={{ wordBreak: 'break-all' }}>{order.reference}</dd></div>
                {enr && <div><dt>Access until</dt><dd>{formatDate(enr.expiresAt)}</dd></div>}
              </div>
              <Notice kind="demo">Simulated payment. In production a receipt and access confirmation email would be sent to {order.customerEmail}.</Notice>
              <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
                {first && <Link to={`/learn/${course.slug}/${first.id}`} className="btn btn-primary">Start the first lesson</Link>}
                <Link to="/dashboard" className="btn btn-secondary">Go to my dashboard</Link>
              </div>
              <details style={{ marginTop: 24, textAlign: 'left' }} className="small muted">
                <summary style={{ cursor: 'pointer' }}>Demo: replay the payment notification</summary>
                <p style={{ marginTop: 8 }}>Payment providers can send the same notification more than once. Replaying it here should not create a second enrollment.</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                  const before = state.enrollments.filter((e) => e.orderId === order.id).length;
                  completeOrder(order.id, 'paid');
                  toast(`Notification replayed — still ${before} enrollment for this order`, 'info');
                }}>Replay notification</button>
              </details>
            </>
          ) : (
            <>
              <div className="result-icon err"><Icon name="x" size={36} /></div>
              <h1 style={{ fontSize: '1.8rem' }}>Payment unsuccessful</h1>
              <p className="muted">Your payment for <strong>{course.title}</strong> didn’t go through, and you have not been charged. No access has been granted.</p>
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
