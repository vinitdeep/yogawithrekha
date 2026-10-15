import { beforeEach, describe, expect, it } from 'vitest';
import * as E from '../src/lib/demo/engine';
import { createSeedState, DEMO_ACCOUNTS } from '../src/lib/seed';
import { accessStatus, currentEnrollment } from '../src/lib/access';
import type { AppState } from '../src/lib/types';

/** Access requests (students who pay directly) and admin password-reset emails — demo engine rules. */

let s: AppState;
const as = (who: 'student' | 'admin') => { s = E.logout(s); const r = E.login(s, DEMO_ACCOUNTS[who].email, DEMO_ACCOUNTS[who].password); expect(r.result.ok).toBe(true); s = r.state; };
const reqId = () => s.accessRequests.find((r) => r.userId === 'u-demo' && r.courseId === 'c-daily')!.id;

beforeEach(() => { s = createSeedState(); });

describe('access requests', () => {
  it('new sign-ups are students with no access until an admin acts', () => {
    const r = E.register(s, 'Fresh Student', 'fresh@example.com', 'abcdefg1');
    s = r.state;
    const u = s.users.find((x) => x.email === 'fresh@example.com')!;
    expect(u.role).toBe('student');
    expect(s.enrollments.filter((e) => e.userId === u.id)).toHaveLength(0);
  });

  it('student requests access once; admin approves → access granted and audited', () => {
    as('student');
    const r = E.requestAccess(s, 'c-daily', 'Paid by UPI, ref 123');
    expect(r.result.ok).toBe(true);
    s = r.state;
    expect(E.requestAccess(s, 'c-daily', 'again').result.ok).toBe(false); // one pending per course
    expect(E.decideAccessRequest(s, reqId(), true, 'Payment received').result.ok).toBe(false); // students can't approve
    as('admin');
    expect(E.decideAccessRequest(s, reqId(), true, '').result.ok).toBe(false); // reason required
    const d = E.decideAccessRequest(s, reqId(), true, 'Payment received');
    expect(d.result.ok).toBe(true);
    s = d.state;
    const req = s.accessRequests.find((x) => x.id === reqId())!;
    expect(req.status).toBe('approved');
    expect(req.decidedBy).toBe('admin@example.com');
    expect(accessStatus(currentEnrollment(s.enrollments, 'u-demo', 'c-daily'))).toBe('active');
    expect(s.audit.map((a) => a.action)).toEqual(expect.arrayContaining(['access.grant', 'request.approve']));
    expect(E.decideAccessRequest(s, reqId(), true, 'Again please').result.ok).toBe(false); // already answered
  });

  it('declining needs a reason and grants nothing', () => {
    as('student');
    s = E.requestAccess(s, 'c-daily', '').state;
    as('admin');
    s = E.decideAccessRequest(s, reqId(), false, 'Payment not found').state;
    expect(s.accessRequests.find((x) => x.id === reqId())!.status).toBe('declined');
    expect(accessStatus(currentEnrollment(s.enrollments, 'u-demo', 'c-daily'))).toBe('none');
  });

  it('granting access directly closes the student’s pending request', () => {
    as('student');
    s = E.requestAccess(s, 'c-daily', '').state;
    as('admin');
    s = E.grantAccess(s, 'u-demo', 'c-daily', 'Granted from the student list').state;
    expect(s.accessRequests.find((x) => x.id === reqId())!.status).toBe('approved');
  });

  it('refuses requests when already enrolled, for unpublished courses, in checkout-only mode, or from guests', () => {
    expect(E.requestAccess(s, 'c-daily', '').result.ok).toBe(false); // guest
    as('student');
    expect(E.requestAccess(s, 'c-release', '').result.ok).toBe(false); // already active
    s = { ...s, courses: s.courses.map((c) => (c.id === 'c-daily' ? { ...c, status: 'draft' as const } : c)) };
    expect(E.requestAccess(s, 'c-daily', '').result.ok).toBe(false);
    s = { ...s, settings: { ...s.settings, enrollmentMode: 'checkout' } };
    expect(E.requestAccess(s, 'c-morning', '').result.ok).toBe(false);
  });

  it('students can withdraw their own pending request', () => {
    as('student');
    s = E.requestAccess(s, 'c-daily', '').state;
    s = E.cancelAccessRequest(s, reqId()).state;
    expect(s.accessRequests.find((x) => x.id === reqId())!.status).toBe('cancelled');
    expect(E.requestAccess(s, 'c-daily', 'try again').result.ok).toBe(true);
  });
});

describe('password reset from admin', () => {
  it('only admins can send it; it never exposes a password; it is audited', () => {
    as('student');
    expect(E.adminSendPasswordReset(s, 'u-demo').result.ok).toBe(false);
    as('admin');
    const r = E.adminSendPasswordReset(s, 'u-demo');
    expect(r.result.ok).toBe(true);
    expect(JSON.stringify(r.result)).not.toContain('practice123');
    expect(r.state.audit[0].action).toBe('user.password_reset_sent');
    expect(E.adminSendPasswordReset(s, 'u-s1').result.ok).toBe(false); // fictional sample student
  });
});
