import { beforeEach, describe, expect, it } from 'vitest';
import * as E from '../src/lib/demo/engine';
import { createSeedState, DEMO_ACCOUNTS } from '../src/lib/seed';
import { accessStatus, currentEnrollment, progressStats, resumeLesson } from '../src/lib/access';
import type { AppState } from '../src/lib/types';

/**
 * Demo engine rules. These mirror the production database rules, but remember: in the DEMO the
 * whole state lives in the visitor's browser, so these checks are a simulation, not security.
 * Production security is tested against the real SQL in tests/sql/.
 */

let s: AppState;
const signIn = (who: 'student' | 'admin') => {
  const r = E.login(s, DEMO_ACCOUNTS[who].email, DEMO_ACCOUNTS[who].password);
  expect(r.result.ok).toBe(true);
  s = r.state;
};
const daily = () => s.courses.find((c) => c.id === 'c-daily')!;
const firstLesson = (cid = 'c-daily') => s.courses.find((c) => c.id === cid)!.modules[0].lessons[0];

beforeEach(() => { s = createSeedState(); });

describe('sign-in', () => {
  it('accepts the demo student and rejects a wrong password with a generic message', () => {
    const bad = E.login(s, DEMO_ACCOUNTS.student.email, 'wrong-password');
    expect(bad.result).toEqual({ ok: false, error: 'That email and password combination was not recognised.' });
    const unknown = E.login(s, 'nobody@example.com', 'whatever1');
    expect(unknown.result).toEqual(bad.result); // no account enumeration
    signIn('student');
    expect(E.sessionUser(s)?.email).toBe(DEMO_ACCOUNTS.student.email);
    s = E.logout(s);
    expect(E.sessionUser(s)).toBeNull();
  });

  it('throttles repeated failures', () => {
    for (let i = 0; i < 5; i++) s = E.login(s, DEMO_ACCOUNTS.student.email, 'nope').state;
    const r = E.login(s, DEMO_ACCOUNTS.student.email, DEMO_ACCOUNTS.student.password);
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.error).toMatch(/too many/i);
  });

  it('sample students cannot be signed into at all', () => {
    expect(E.login(s, 'sample.a@example.com', 'sample-not-loginable').result.ok).toBe(false);
  });

  it('sessions expire', () => {
    signIn('student');
    const later = new Date(Date.now() + (E.SESSION_HOURS + 1) * 3_600_000);
    expect(E.sessionUser(s, later)).toBeNull();
    expect(E.setLessonComplete(s, 'c-release', firstLesson('c-release').id, true, later).result.ok).toBe(false);
  });

  it('registration always creates a student, never an admin', () => {
    const r = E.register(s, 'New Person', 'new@example.com', 'abcdefg1');
    expect(r.result.ok && r.result.data.role).toBe('student');
  });

  it('password reset gives the same answer for unknown emails and the link works once', () => {
    expect(E.requestPasswordReset(s, 'nobody@example.com').result).toEqual({ ok: true, data: null });
    const r = E.requestPasswordReset(s, DEMO_ACCOUNTS.student.email);
    s = r.state;
    const token = r.result.ok ? r.result.data! : '';
    const reset = E.resetPassword(s, token, 'newpass123');
    expect(reset.result.ok).toBe(true);
    s = reset.state;
    expect(E.resetPassword(s, token, 'again1234').result.ok).toBe(false);
    expect(E.login(s, DEMO_ACCOUNTS.student.email, 'newpass123').result.ok).toBe(true);
  });
});

describe('roles', () => {
  it('a student cannot change their own role through a profile update', () => {
    signIn('student');
    const r = E.updateProfile(s, { name: 'Demo Student', role: 'admin', id: 'u-admin' });
    expect(r.result.ok).toBe(true);
    expect(E.sessionUser(r.state)?.role).toBe('student');
    expect(r.state.users.find((u) => u.id === 'u-admin')?.name).toBe('Demo Admin');
  });

  it('students and guests are refused every admin action', () => {
    const tryAll = (st: AppState) => [
      E.saveCourse(st, { ...daily(), title: 'Hacked' }).result,
      E.createCourse(st).result,
      E.deleteCourse(st, 'c-daily').result,
      E.grantAccess(st, 'u-demo', 'c-daily', 'because').result,
      E.revokeAccess(st, 'enr-1041', 'because').result,
      E.extendAccess(st, 'enr-1041', 3, 'because').result,
      E.saveSettingsDraft(st, { ...st.settings, brandName: 'Hacked' }).result,
      E.publishSettings({ ...st, settingsDraft: { ...st.settings, brandName: 'Hacked' } }).result,
    ];
    for (const r of tryAll(s)) expect(r.ok).toBe(false); // guest
    signIn('student');
    for (const r of tryAll(s)) expect(r.ok).toBe(false);
  });
});

describe('checkout', () => {
  it('a successful payment creates exactly one order and one enrollment, even if repeated', () => {
    signIn('student');
    const o = E.createOrder(s, 'c-daily', 'INR');
    expect(o.result.ok).toBe(true);
    s = o.state;
    const order = o.result.ok ? o.result.data : null!;
    expect(order.amount).toBe(daily().prices.INR); // price comes from the course
    // A double click before payment reuses the same pending order.
    const again = E.createOrder(s, 'c-daily', 'INR');
    expect(again.result.ok && again.result.data.id).toBe(order.id);
    s = E.settleOrder(s, order.id, 'paid').state;
    s = E.settleOrder(s, order.id, 'paid').state; // repeated notification
    s = E.settleOrder(s, order.id, 'failed').state; // late, out-of-order failure
    expect(s.orders.filter((x) => x.id === order.id)[0].status).toBe('paid');
    expect(s.enrollments.filter((e) => e.orderId === order.id)).toHaveLength(1);
    expect(s.enrollments.filter((e) => e.userId === 'u-demo' && e.courseId === 'c-daily')).toHaveLength(1);
    // Buying again while enrolled is refused.
    expect(E.createOrder(s, 'c-daily', 'INR').result.ok).toBe(false);
  });

  it('a failed payment grants nothing', () => {
    signIn('student');
    const o = E.createOrder(s, 'c-daily', 'USD');
    s = o.state;
    s = E.settleOrder(s, o.result.ok ? o.result.data.id : '', 'failed').state;
    expect(accessStatus(currentEnrollment(s.enrollments, 'u-demo', 'c-daily'))).toBe('none');
    expect(E.canOpenLesson(s, 'c-daily', daily().modules[1].lessons[0].id).ok).toBe(false);
  });

  it('refuses draft courses, currencies that are not offered and admins', () => {
    signIn('student');
    expect(E.createOrder(s, 'c-daily', 'CAD').result.ok).toBe(false);
    s = { ...s, courses: s.courses.map((c) => (c.id === 'c-daily' ? { ...c, status: 'draft' as const } : c)) };
    expect(E.createOrder(s, 'c-daily', 'INR').result.ok).toBe(false);
    s = E.logout(s);
    signIn('admin');
    expect(E.createOrder(s, 'c-release', 'INR').result.ok).toBe(false);
  });
});

describe('learning', () => {
  it('opening a lesson never completes it; Mark complete does, once', () => {
    signIn('student');
    const l = s.courses.find((c) => c.id === 'c-release')!.modules[2].lessons[0];
    const before = progressStats(s.courses.find((c) => c.id === 'c-release')!, s.progress['u-demo:c-release']);
    s = E.setLastLesson(s, 'c-release', l.id);
    expect(s.progress['u-demo:c-release'].completed[l.id]).toBeUndefined();
    expect(s.progress['u-demo:c-release'].lastLessonId).toBe(l.id);
    s = E.setLessonComplete(s, 'c-release', l.id, true).state;
    s = E.setLessonComplete(s, 'c-release', l.id, true).state;
    const after = progressStats(s.courses.find((c) => c.id === 'c-release')!, s.progress['u-demo:c-release']);
    expect(after.done).toBe(before.done + 1);
    expect(after.pct).toBe(Math.round(((before.done + 1) / before.total) * 100));
  });

  it('resume goes to the last lesson opened', () => {
    signIn('student');
    const c = s.courses.find((x) => x.id === 'c-release')!;
    const target = c.modules[1].lessons[2];
    s = E.setLastLesson(s, c.id, target.id);
    expect(resumeLesson(c, s.progress['u-demo:c-release'])?.id).toBe(target.id);
  });

  it('progress ignores unpublished lessons', () => {
    const c = daily();
    expect(c.modules.flatMap((m) => m.lessons).length).toBe(11);
    expect(progressStats(c, undefined).total).toBe(10);
  });

  it('expired and revoked access block paid lessons but keep progress', () => {
    signIn('student');
    const mindful = s.courses.find((c) => c.id === 'c-mindful')!;
    expect(accessStatus(currentEnrollment(s.enrollments, 'u-demo', 'c-mindful'))).toBe('expired');
    const paid = mindful.modules[1].lessons[0];
    expect(E.canOpenLesson(s, 'c-mindful', paid.id).ok).toBe(false);
    expect(E.setLessonComplete(s, 'c-mindful', paid.id, true).result.ok).toBe(false);
    expect(Object.keys(s.progress['u-demo:c-mindful'].completed)).toHaveLength(2); // kept
    // Preview lessons stay open to everyone.
    expect(E.canOpenLesson(s, 'c-mindful', mindful.modules[0].lessons[0].id).ok).toBe(true);

    // Revoke the active course as admin, then check the student is blocked.
    const enr = currentEnrollment(s.enrollments, 'u-demo', 'c-release')!;
    s = E.logout(s); signIn('admin');
    expect(E.revokeAccess(s, enr.id, '').result.ok).toBe(false); // reason required
    s = E.revokeAccess(s, enr.id, 'Refund agreed by email').state;
    s = E.logout(s); signIn('student');
    const paidRelease = s.courses.find((c) => c.id === 'c-release')!.modules[1].lessons[0];
    expect(E.canOpenLesson(s, 'c-release', paidRelease.id).ok).toBe(false);
  });

  it('students cannot open lessons from a course they did not buy', () => {
    signIn('student');
    expect(E.canOpenLesson(s, 'c-daily', daily().modules[1].lessons[0].id).ok).toBe(false);
  });
});

describe('admin access management', () => {
  it('grant / extend / restore are recorded with actor and reason, and duplicates are prevented', () => {
    signIn('admin');
    const g = E.grantAccess(s, 'u-demo', 'c-daily', 'Workshop participant');
    expect(g.result.ok).toBe(true);
    s = g.state;
    expect(E.grantAccess(s, 'u-demo', 'c-daily', 'Again please').result.ok).toBe(false);
    const enr = g.result.ok ? g.result.data : null!;
    expect(enr.orderId).toBeUndefined(); // complimentary access never fakes an order
    const ext = E.extendAccess(s, enr.id, 2, 'Travelling for a month');
    s = ext.state;
    const after = s.enrollments.find((e) => e.id === enr.id)!;
    expect(new Date(after.expiresAt) > new Date(enr.expiresAt)).toBe(true);
    expect(after.history.map((h) => h.by)).toEqual(['admin@example.com', 'admin@example.com']);
    expect(s.audit.map((a) => a.action)).toEqual(['access.extend', 'access.grant']);
    expect(s.audit[0].reason).toBe('Travelling for a month');
  });

  it('changing a course price or access length never rewrites existing orders or access', () => {
    signIn('admin');
    const ordersBefore = JSON.stringify(s.orders);
    const enrBefore = JSON.stringify(s.enrollments);
    const r = E.saveCourse(s, { ...daily(), prices: { INR: 499900, USD: 7900 }, accessMonths: 12 });
    expect(r.result.ok).toBe(true);
    s = r.state;
    expect(JSON.stringify(s.orders)).toBe(ordersBefore);
    expect(JSON.stringify(s.enrollments)).toBe(enrBefore);
    expect(s.audit.map((a) => a.action)).toEqual(expect.arrayContaining(['course.price', 'course.access_duration']));
  });

  it('validates courses: slug, prices, publishing rules, lessons with progress', () => {
    signIn('admin');
    expect(E.saveCourse(s, { ...daily(), slug: 'face-neck-and-shoulder-release' }).result.ok).toBe(false); // duplicate
    expect(E.saveCourse(s, { ...daily(), slug: 'Bad Slug' }).result.ok).toBe(false);
    expect(E.saveCourse(s, { ...daily(), prices: { INR: -1, USD: 100 } }).result.ok).toBe(false);
    expect(E.saveCourse(s, { ...daily(), prices: { INR: 100 } }).result.ok).toBe(false); // USD offered but missing
    expect(E.saveCourse(s, { ...daily(), accessMonths: 0 }).result.ok).toBe(false);
    // Removing a lesson students completed is refused (unpublish instead)
    const c = daily();
    const withoutFirst = { ...c, modules: [{ ...c.modules[0], lessons: c.modules[0].lessons.slice(1) }, ...c.modules.slice(1)] };
    expect(E.saveCourse(s, withoutFirst).result.ok).toBe(false);
    // Courses with orders can't be deleted
    expect(E.deleteCourse(s, 'c-daily').result.ok).toBe(false);
  });

  it('draft courses and draft settings stay unpublished until published', () => {
    signIn('admin');
    s = E.saveCourse(s, { ...daily(), status: 'draft' }).state;
    expect(s.courses.filter((c) => c.status === 'published').map((c) => c.id)).not.toContain('c-daily');
    const draft = { ...s.settings, heroHeadline: 'A brand new headline.', heroAccent: '' };
    s = E.saveSettingsDraft(s, draft).state;
    expect(s.settings.heroHeadline).not.toBe('A brand new headline.');
    s = E.publishSettings(s).state;
    expect(s.settings.heroHeadline).toBe('A brand new headline.');
    expect(s.settingsDraft).toBeNull();
    expect(s.audit[0].action).toBe('settings.publish');
  });

  it('validates settings', () => {
    const bad = E.validateSettings({ ...createSeedState().settings, supportEmail: 'nope', instagramUrl: 'http://x', heroAccent: 'missing', whatsappVerified: true, whatsappNumber: '123', displayCurrencies: [] });
    expect(Object.keys(bad)).toEqual(expect.arrayContaining(['supportEmail', 'instagramUrl', 'heroAccent', 'whatsappNumber', 'displayCurrencies']));
  });
});
