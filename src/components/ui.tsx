import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { getLenis } from '../lib/motion';
import { useStore } from '../lib/store';

/* ---------------- Toasts ---------------- */

type Toast = { id: number; kind: 'ok' | 'err' | 'info'; text: string };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <Icon name={t.kind === 'err' ? 'alert' : t.kind === 'info' ? 'info' : 'checkCircle'} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------------- Dialog ---------------- */

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  description?: string;
}

export function Dialog({ open, onClose, title, children, footer, size = 'md', description }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  // Keep the latest onClose without re-running the focus effect on every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () =>
      Array.from(node?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])
        .filter((el) => !el.hasAttribute('disabled'));
    // Focus the first form control if there is one, otherwise the dialog itself.
    const first = focusables().find((el) => el.matches('input, select, textarea')) ?? node;
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      const overlays = document.querySelectorAll('.overlay');
      if (overlays[overlays.length - 1] !== node?.parentElement) return; // a dialog on top of this one handles keys
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    getLenis()?.stop();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      // Only restart smooth scrolling if no other dialog is still open.
      if (!document.querySelector('.overlay')) getLenis()?.start();
      if (prev && document.contains(prev)) prev.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="overlay" data-lenis-prevent onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current(); }}>
      <div
        ref={ref} className={`dialog ${size === 'lg' ? 'dialog-lg' : ''}`} role="dialog" aria-modal="true"
        aria-labelledby={titleId} aria-describedby={description ? descId : undefined} tabIndex={-1}
      >
        <div className="dialog-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descId} className="muted small" style={{ margin: '6px 0 0' }}>{description}</p>}
          </div>
          <button type="button" className="icon-btn icon-btn-sm" onClick={onClose} aria-label="Close dialog"><Icon name="x" size={18} /></button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onCancel }: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  return (
    <Dialog
      open={open} onClose={onCancel} title={title}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={run} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
        </>
      }
    >
      <div className="muted">{message}</div>
    </Dialog>
  );
}

/** Confirmation for sensitive admin changes: a written reason is required and recorded in the audit history. */
export function ReasonDialog({ open, title, message, confirmLabel, danger, onConfirm, onCancel, defaultReason = '', children }: Omit<ConfirmProps, 'onConfirm'> & { onConfirm: (reason: string) => Promise<string | null> | string | null; defaultReason?: string; children?: ReactNode }) {
  const [reason, setReason] = useState(defaultReason);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setReason(defaultReason); setError(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async () => {
    if (busy) return;
    if (reason.trim().length < 4) { setError('Please give a short reason (at least 4 characters). It is saved in the audit history.'); return; }
    setBusy(true);
    try {
      const err = await onConfirm(reason.trim());
      if (err) setError(err);
    } finally { setBusy(false); }
  };
  return (
    <Dialog
      open={open} onClose={onCancel} title={title}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={run} disabled={busy}>{busy ? 'Saving…' : confirmLabel}</button>
        </>
      }
    >
      <div className="muted" style={{ marginBottom: 16 }}>{message}</div>
      {children}
      <TextArea label="Reason" required value={reason} error={error} style={{ minHeight: 80 }}
        hint="For example: “Refund agreed by email on 3 March” or “Complimentary access for a workshop participant”."
        onChange={(e) => { setReason(e.target.value); if (error) setError(''); }} />
    </Dialog>
  );
}

/* ---------------- Accordion ---------------- */

export function AccordionItem({ title, children, defaultOpen = false }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="acc-item">
      <h3 style={{ margin: 0, fontFamily: 'var(--sans)', fontSize: '1rem' }}>
        <button type="button" className="acc-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          <span>{title}</span>
          <Icon name="chevronDown" />
        </button>
      </h3>
      <div id={id} className="acc-panel" hidden={!open}>{children}</div>
    </div>
  );
}

/* ---------------- Form fields ---------------- */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function Field({ label, error, hint, id, ...input }: FieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = [hint ? `${fid}-hint` : '', error ? `${fid}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}{input.required && <span aria-hidden="true" style={{ color: 'var(--rose-deep)' }}> *</span>}</label>
      <input id={fid} className="input" aria-invalid={!!error} aria-describedby={describedBy} {...input} />
      {hint && <span id={`${fid}-hint`} className="hint">{hint}</span>}
      {error && <span id={`${fid}-err`} className="error"><Icon name="alert" size={15} />{error}</span>}
    </div>
  );
}

interface AreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextArea({ label, error, hint, id, ...rest }: AreaProps) {
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = [hint ? `${fid}-hint` : '', error ? `${fid}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}{rest.required && <span aria-hidden="true" style={{ color: 'var(--rose-deep)' }}> *</span>}</label>
      <textarea id={fid} className="textarea" aria-invalid={!!error} aria-describedby={describedBy} {...rest} />
      {hint && <span id={`${fid}-hint`} className="hint">{hint}</span>}
      {error && <span id={`${fid}-err`} className="error"><Icon name="alert" size={15} />{error}</span>}
    </div>
  );
}

export function PasswordField({ label, error, hint, id, ...input }: FieldProps) {
  const [show, setShow] = useState(false);
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = [hint ? `${fid}-hint` : '', error ? `${fid}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}{input.required && <span aria-hidden="true" style={{ color: 'var(--rose-deep)' }}> *</span>}</label>
      <div className="pw-wrap">
        <input id={fid} className="input" type={show ? 'text' : 'password'} aria-invalid={!!error} aria-describedby={describedBy} {...input} />
        <button type="button" className="icon-btn icon-btn-sm" style={{ border: 0, background: 'transparent' }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </div>
      {hint && <span id={`${fid}-hint`} className="hint">{hint}</span>}
      {error && <span id={`${fid}-err`} className="error"><Icon name="alert" size={15} />{error}</span>}
    </div>
  );
}

export const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/* ---------------- Misc ---------------- */

export function Notice({ kind = 'info', children, title }: { kind?: 'info' | 'warn' | 'ok' | 'err' | 'demo'; children: ReactNode; title?: string }) {
  const icon = kind === 'ok' ? 'checkCircle' : kind === 'err' || kind === 'warn' ? 'alert' : 'info';
  return (
    <div className={`notice notice-${kind}`} role={kind === 'err' ? 'alert' : undefined}>
      <Icon name={icon} />
      <div>
        {title && <strong style={{ display: 'block', marginBottom: 2 }}>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="progress-label"><span>{label}</span><strong>{value}%</strong></div>
      <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function SampleBadge({ children = 'Sample' }: { children?: ReactNode }) {
  return <span className="badge badge-outline">{children}</span>;
}

/** Sets the document title and description for each page (basic SEO / screen-reader context). */
export function usePageTitle(title: string, description?: string) {
  const { site } = useStore();
  useEffect(() => {
    document.title = title ? `${title} · ${site.brandName}` : `${site.brandName} — ${site.courseBrand}`;
    if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description, site.brandName, site.courseBrand]);
}
