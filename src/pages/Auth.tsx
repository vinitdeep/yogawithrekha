import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { DEMO_ACCOUNTS } from '../lib/seed';
import { DEMO_MODE } from '../components/Layout';
import { Field, Notice, PasswordField, emailOk, usePageTitle, useToast } from '../components/ui';

/** Only allow same-site relative redirects. */
const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : null);

export function LoginForm({ onDone, compact }: { onDone: (role: 'student' | 'admin') => void; compact?: boolean }) {
  const { login } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const er: typeof errors = {};
    if (!emailOk(email)) er.email = 'Enter the email address you registered with.';
    if (!password) er.password = 'Enter your password.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setTimeout(() => {
      const r = login(email, password);
      setBusy(false);
      if (!r.ok) { setErrors({ form: r.error }); return; }
      onDone(r.data.role);
    }, 450);
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      {errors.form && <Notice kind="err">{errors.form} <Link to="/forgot-password">Forgot your password?</Link></Notice>}
      <Field label="Email address" type="email" autoComplete="email" required value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
      <PasswordField label="Password" autoComplete="current-password" required value={password} error={errors.password} onChange={(e) => setPassword(e.target.value)} />
      {!compact && <div className="row-between small"><span /><Link to="/forgot-password">Forgot password?</Link></div>}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? <><span className="spinner" aria-hidden="true" /> Signing in…</> : 'Sign in'}
      </button>
      {DEMO_MODE && (
        <div className="demo-creds">
          <strong>Demo accounts</strong> (simulated sign-in):<br />
          Student: <code>{DEMO_ACCOUNTS.student.email}</code> / <code>{DEMO_ACCOUNTS.student.password}</code>
          {!compact && <><br />Admin: <code>{DEMO_ACCOUNTS.admin.email}</code> / <code>{DEMO_ACCOUNTS.admin.password}</code></>}
        </div>
      )}
    </form>
  );
}

export function RegisterForm({ onDone }: { onDone: () => void }) {
  const { register } = useStore();
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (f.name.trim().length < 2) er.name = 'Please enter your full name.';
    if (!emailOk(f.email)) er.email = 'Please enter a valid email address, like name@example.com.';
    if (f.password.length < 8) er.password = 'Use at least 8 characters.';
    else if (!/[a-zA-Z]/.test(f.password) || !/\d/.test(f.password)) er.password = 'Include at least one letter and one number.';
    if (f.confirm !== f.password) er.confirm = 'The passwords do not match.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setTimeout(() => {
      const r = register(f.name, f.email, f.password);
      setBusy(false);
      if (!r.ok) { setErrors({ email: r.error }); return; }
      onDone();
    }, 500);
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field label="Full name" autoComplete="name" required value={f.name} error={errors.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <Field label="Email address" type="email" autoComplete="email" required value={f.email} error={errors.email} hint="Your receipt and access details are sent here." onChange={(e) => setF({ ...f, email: e.target.value })} />
      <PasswordField label="Create a password" autoComplete="new-password" required value={f.password} error={errors.password} hint="At least 8 characters, including a letter and a number." onChange={(e) => setF({ ...f, password: e.target.value })} />
      <PasswordField label="Confirm password" autoComplete="new-password" required value={f.confirm} error={errors.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? <><span className="spinner" aria-hidden="true" /> Creating account…</> : 'Create account'}
      </button>
    </form>
  );
}

export function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  usePageTitle('Student Login');
  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <h1 style={{ fontSize: '1.9rem' }}>Welcome back</h1>
        <p className="muted">Sign in to continue your lessons.</p>
        <LoginForm onDone={(role) => { toast('You are signed in'); nav(safeNext(params.get('next')) ?? (role === 'admin' ? '/admin' : '/dashboard')); }} />
        <p className="center small" style={{ marginTop: 20, marginBottom: 0 }}>New here? <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}>Create an account</Link></p>
      </div>
    </div>
  );
}

export function Register() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  usePageTitle('Create an account');
  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <h1 style={{ fontSize: '1.9rem' }}>Create your account</h1>
        <p className="muted">You’ll use this account to access your courses and track your progress.</p>
        {DEMO_MODE && <Notice kind="demo">Demo: accounts are stored only in this browser.</Notice>}
        <div style={{ marginTop: 16 }}><RegisterForm onDone={() => { toast('Your account has been created'); nav(safeNext(params.get('next')) ?? '/dashboard'); }} /></div>
        <p className="center small" style={{ marginTop: 20, marginBottom: 0 }}>Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const { requestPasswordReset } = useStore();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ token: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  usePageTitle('Reset your password');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!emailOk(email)) { setError('Please enter a valid email address.'); return; }
    setError('');
    setBusy(true);
    setTimeout(() => {
      const r = requestPasswordReset(email);
      setBusy(false);
      setSent({ token: r.ok ? r.data : null });
    }, 600);
  };

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <h1 style={{ fontSize: '1.9rem' }}>Reset your password</h1>
        {sent ? (
          <div className="stack">
            <Notice kind="ok">If an account exists for <strong>{email}</strong>, a password reset link has been sent. The link is valid for one hour.</Notice>
            {DEMO_MODE && (
              <Notice kind="demo" title="Demo: no email service connected">
                {sent.token
                  ? <>In production this link arrives by email. For the demo, use it here: <Link to={`/reset-password/${sent.token}`}>Open reset link</Link></>
                  : <>No demo account uses that email, so no link was created.</>}
              </Notice>
            )}
            <Link to="/login" className="btn btn-secondary btn-block">Back to sign in</Link>
          </div>
        ) : (
          <>
            <p className="muted">Enter your account email and we’ll send you a link to choose a new password.</p>
            <form className="form" onSubmit={submit} noValidate>
              <Field label="Email address" type="email" autoComplete="email" required value={email} error={error} onChange={(e) => setEmail(e.target.value)} />
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? <><span className="spinner" aria-hidden="true" /> Sending…</> : 'Send reset link'}</button>
            </form>
            <p className="center small" style={{ marginTop: 20, marginBottom: 0 }}><Link to="/login">Back to sign in</Link></p>
          </>
        )}
      </div>
    </div>
  );
}

export function ResetPassword() {
  const { token = '' } = useParams();
  const { resetPassword } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  usePageTitle('Choose a new password');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (pw.length < 8 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) er.pw = 'Use at least 8 characters, including a letter and a number.';
    if (confirm !== pw) er.confirm = 'The passwords do not match.';
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = resetPassword(token, pw);
    if (!r.ok) { setErrors({ form: r.error }); return; }
    toast('Your password has been updated. Please sign in.');
    nav('/login');
  };

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <h1 style={{ fontSize: '1.9rem' }}>Choose a new password</h1>
        <form className="form" onSubmit={submit} noValidate>
          {errors.form && <Notice kind="err">{errors.form} <Link to="/forgot-password">Request a new link</Link></Notice>}
          <PasswordField label="New password" autoComplete="new-password" required value={pw} error={errors.pw} onChange={(e) => setPw(e.target.value)} />
          <PasswordField label="Confirm new password" autoComplete="new-password" required value={confirm} error={errors.confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-block">Update password</button>
        </form>
      </div>
    </div>
  );
}
