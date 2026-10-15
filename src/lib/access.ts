import type { AccessStatus, Course, CourseProgress, Enrollment, Lesson } from './types';

/**
 * Pure access and progress rules shared by the demo engine and the UI.
 * Production enforces the same rules in the database (see supabase/migrations) — the browser
 * copy is only used to decide what to SHOW, never to grant anything.
 */

export function accessStatus(e: Enrollment | undefined, at = new Date()): AccessStatus {
  if (!e) return 'none';
  if (e.revoked) return 'revoked';
  if (new Date(e.startAt) > at) return 'scheduled';
  if (new Date(e.expiresAt) < at) return 'expired';
  return 'active';
}

/** Active now, or paid for and waiting for the configured start date. Used to block duplicate enrollments. */
export const isLive = (st: AccessStatus) => st === 'active' || st === 'scheduled';

/** The enrollment that decides access: a live one if there is one, otherwise the most recent. */
export function currentEnrollment(all: Enrollment[], userId: string, courseId: string, at = new Date()): Enrollment | undefined {
  const mine = all.filter((e) => e.userId === userId && e.courseId === courseId).sort((a, b) => b.startAt.localeCompare(a.startAt));
  return mine.find((e) => isLive(accessStatus(e, at))) ?? mine[0];
}

export function courseLessons(c: Course, includeUnpublished = false): Lesson[] {
  return c.modules.flatMap((m) => m.lessons).filter((l) => includeUnpublished || l.published);
}

/**
 * Progress = completed PUBLISHED lessons ÷ published lessons.
 * If Rekha later adds lessons, the denominator grows (percentages can go down); if a lesson is
 * unpublished or removed, its completion is kept but no longer counted.
 */
export function progressStats(c: Course, p?: CourseProgress): { done: number; total: number; pct: number } {
  const lessons = courseLessons(c);
  const done = p ? lessons.filter((l) => p.completed[l.id]).length : 0;
  const total = lessons.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

export const progressPercent = (c: Course, p?: CourseProgress) => progressStats(c, p).pct;

export function courseMinutes(c: Course): number {
  return courseLessons(c).reduce((s, l) => s + l.durationMin, 0);
}

/** Where "Continue learning" should go: the last lesson opened, else the first unfinished, else the first. */
export function resumeLesson(c: Course, p?: CourseProgress): Lesson | undefined {
  const lessons = courseLessons(c);
  return lessons.find((l) => l.id === p?.lastLessonId)
    ?? lessons.find((l) => !p?.completed[l.id])
    ?? lessons[0];
}

/** Slug rule shared by the editor and the database check constraint. */
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
