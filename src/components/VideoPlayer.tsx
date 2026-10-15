import { useEffect, useState } from 'react';
import type { Lesson } from '../lib/types';
import { useStore } from '../lib/store';
import { IS_DEMO } from '../lib/config';
import { Icon } from './Icon';

/**
 * Lesson video.
 *
 * The playable `src` always comes from the backend's `playbackUrl()`:
 *  - Demo: the attached link, or a file chosen this session (simulated upload).
 *  - Production: a short-lived signed URL issued by the `lesson-playback` Edge Function only after
 *    it has verified — on the server, at that moment — that the viewer may watch this lesson.
 *    Paid videos live in a private bucket and have no permanent public URL.
 *
 * No player can fully prevent screen recording or copying, so we do not promise that.
 * Opening or playing a lesson never marks it complete — that is always an explicit action.
 */
export function VideoPlayer({ lesson, src, loading, label }: { lesson: Lesson; src?: string | null; loading?: boolean; label?: string }) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);

  useEffect(() => { setPlaying(false); setPos(0); }, [lesson.id]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setPos((p) => (p >= 100 ? 100 : p + 0.5)), 300);
    return () => clearInterval(t);
  }, [playing]);

  if (loading) {
    return <div className="player"><div className="player-ph" role="status"><span className="spinner" aria-hidden="true" /><p>Loading video…</p></div></div>;
  }

  if (src) {
    const direct = /\.(mp4|webm|ogg|m4v|mov)(\?|$)/i.test(src) || src.startsWith('blob:') || /\/storage\/v1\/object\/sign\//.test(src);
    return (
      <div className="player">
        {direct ? (
          <video key={src} src={src} controls playsInline preload="metadata" controlsList="nodownload" aria-label={`Video: ${lesson.title}`} crossOrigin={lesson.captionsUrl ? 'anonymous' : undefined}>
            {lesson.captionsUrl && <track kind="captions" src={lesson.captionsUrl} srcLang="en" label="English" default />}
          </video>
        ) : (
          <iframe key={src} src={src} title={`Video: ${lesson.title}`} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen />
        )}
      </div>
    );
  }

  const total = lesson.durationMin * 60;
  const elapsed = Math.round((pos / 100) * total);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const v = lesson.video;

  return (
    <div className="player">
      <span className="player-tag badge badge-sand">{label ?? (IS_DEMO ? 'Video placeholder' : 'Video coming soon')}</span>
      <div className="player-ph">
        {IS_DEMO && (
          <button type="button" className="play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause simulated playback' : 'Play simulated playback'}>
            {playing ? (
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
            ) : <Icon name="play" size={28} style={{ marginLeft: 4 }} />}
          </button>
        )}
        <strong>{lesson.title}</strong>
        <p>{v?.kind === 'upload'
          ? `Demo upload “${v.fileName}” is only playable in the browser session it was attached in.`
          : IS_DEMO ? 'Placeholder: Rekha’s edited lesson video will be attached here. Playback in this demo is simulated.' : 'This lesson’s video will be available soon.'}</p>
      </div>
      {IS_DEMO && (
        <div className="player-bar" aria-hidden="true">
          <span>{mmss(elapsed)}</span>
          <div className="player-track"><span style={{ width: `${pos}%` }} /></div>
          <span>{mmss(total)}</span>
        </div>
      )}
    </div>
  );
}

/** Resolve a playable URL for a lesson the current viewer may open (e.g. a public preview). */
export function usePlayback(courseId: string | undefined, lesson: Lesson | undefined) {
  const { playbackUrl } = useStore();
  const [res, setRes] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!courseId || !lesson) return;
    let live = true;
    void playbackUrl(courseId, lesson.id).then((r) => { if (live) setRes({ id: lesson.id, url: r.ok ? r.data : null }); });
    return () => { live = false; };
  }, [courseId, lesson?.id, lesson?.video?.src]); // eslint-disable-line react-hooks/exhaustive-deps
  return { src: res?.id === lesson?.id ? res?.url : undefined, loading: !res || res.id !== lesson?.id };
}
