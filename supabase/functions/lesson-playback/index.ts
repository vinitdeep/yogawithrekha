// POST { courseId, lessonId } → { url } — a SHORT-LIVED signed URL for a lesson video.
// Checked on every request, on the server, against the current time:
//   preview lesson of a published course → anyone; otherwise → admin, or ACTIVE enrollment.
// Paid videos live in the private `lesson-videos` bucket and have no permanent public URL.
// (No platform can fully stop screen recording; this prevents casual link sharing.)
import { admin, json, log, requireUser, cors } from '../_shared/http.ts';

const TTL_SECONDS = 60 * 60 * 2; // long enough to watch a 20-minute lesson with pauses

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' });
  try {
    const body = await req.json().catch(() => ({}));
    const lessonId = String(body.lessonId ?? '');
    if (!/^[0-9a-f-]{36}$/.test(lessonId)) return json(req, 400, { error: 'Invalid request.' });

    const db = admin();
    const { data: lesson } = await db.from('lessons').select('id, course_id, preview, published, courses(status)').eq('id', lessonId).maybeSingle();
    const courseStatus = (lesson as { courses?: { status?: string } } | null)?.courses?.status;
    if (!lesson || !lesson.published || courseStatus === 'draft') return json(req, 404, { error: 'Lesson not found.' });

    let allowed = lesson.preview && courseStatus === 'published';
    if (!allowed) {
      const user = await requireUser(req);
      if (!user) return json(req, 401, { error: 'Please sign in to watch this lesson.' });
      const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role === 'admin') allowed = true;
      else {
        const { data: ok } = await db.rpc('has_active_access', { p_user: user.id, p_course: lesson.course_id });
        allowed = ok === true;
      }
    }
    if (!allowed) return json(req, 403, { error: 'Your access to this course is not active.' });

    const { data: media } = await db.from('lesson_media').select('video_kind, video_ref').eq('lesson_id', lessonId).maybeSingle();
    if (!media?.video_kind || !media.video_ref) return json(req, 200, { url: null });
    if (media.video_kind === 'url') return json(req, 200, { url: media.video_ref });

    const { data: signed, error } = await db.storage.from('lesson-videos').createSignedUrl(media.video_ref, TTL_SECONDS);
    if (error || !signed) throw new Error('could not sign video url');
    return json(req, 200, { url: signed.signedUrl });
  } catch (e) {
    log('playback.error', { message: (e as Error).message });
    return json(req, 500, { error: 'The video could not be loaded. Please try again.' });
  }
});
