import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Lesson } from '../lib/types';
import { useStore } from '../lib/store';
import { IS_DEMO } from '../lib/config';
import { Icon } from './Icon';
import { isDriveEmbed, isYouTubeEmbed } from '../lib/videoLinks';

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

  if (src) return <ProtectedPlayer lesson={lesson} src={src} />;

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

/**
 * Player wrapper with copy deterrents. It CANNOT stop screen recording (no browser lets a page
 * detect or block that) or guarantee a determined person can't obtain the file. It:
 *  - overlays a slowly moving watermark with the viewer's email + date, so recordings are traceable;
 *  - covers the YouTube title/share/"Watch on YouTube" links and Drive's "open in new window" button,
 *    so the video can't be opened outside the site from the player;
 *  - blocks the right-click menu and the native download / picture-in-picture controls;
 *  - keeps fullscreen inside this wrapper (embed fullscreen is disabled) so the watermark stays visible.
 */
function ProtectedPlayer({ lesson, src }: { lesson: Lesson; src: string }) {
  const { user } = useStore();
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(0);
  const [isFull, setIsFull] = useState(false);
  const [started, setStarted] = useState(false);
  const youtube = isYouTubeEmbed(src);
  const drive = isDriveEmbed(src);
  const direct = !youtube && !drive && (/\.(mp4|webm|ogg|m4v|mov)(\?|$)/i.test(src) || src.startsWith('blob:') || /\/storage\/v1\/object\/sign\//.test(src));

  // Move the watermark every 7 seconds so it can't simply be cropped out.
  useEffect(() => {
    const t = window.setInterval(() => setPos((p) => (p + 1) % 4), 7000);
    return () => window.clearInterval(t);
  }, []);
  // Clicking into the embed moves focus into the iframe: treat that as "playback started" and shrink
  // the covers so YouTube's own controls (play, volume, captions) stay usable.
  useEffect(() => {
    setStarted(false);
    const on = () => window.setTimeout(() => { if (document.activeElement?.tagName === 'IFRAME' && box.current?.contains(document.activeElement)) setStarted(true); }, 0);
    window.addEventListener('blur', on);
    return () => window.removeEventListener('blur', on);
  }, [src]);
  useEffect(() => {
    const on = () => setIsFull(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.current?.requestFullscreen?.();
  };
  const block = (e: MouseEvent) => e.preventDefault();
  const stamp = `${user?.email ?? 'Preview'} · ${new Date().toLocaleDateString('en-IN')}`;

  return (
    <div ref={box} className={`player player-protected ${isFull ? 'is-full' : ''}`} onContextMenu={block} onDragStart={block}>
      {direct ? (
        <video key={src} src={src} controls playsInline preload="metadata" controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
          disablePictureInPicture disableRemotePlayback aria-label={`Video: ${lesson.title}`} crossOrigin={lesson.captionsUrl ? 'anonymous' : undefined}>
          {lesson.captionsUrl && <track kind="captions" src={lesson.captionsUrl} srcLang="en" label="English" default />}
        </video>
      ) : (
        // No allowFullScreen: fullscreen goes through our button so the watermark stays on top.
        <iframe key={src} src={src} title={`Video: ${lesson.title}`} allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" />
      )}
      {/* Shields over the links that would open the video outside this site */}
      {(youtube || drive) && <span className="player-shield player-shield-top" aria-hidden="true" />}
      {drive && <span className="player-shield player-shield-drive" aria-hidden="true" />}
      {youtube && <span className="player-shield player-shield-ytlogo" aria-hidden="true" />}
      {youtube && !started && <span className="player-shield player-shield-watchon" aria-hidden="true" />}
      {youtube && !started && <span className="player-shield player-shield-copylink" aria-hidden="true" />}
      <span className={`player-watermark wm-${pos}`} aria-hidden="true">{stamp}</span>
      <button type="button" className="player-fs" onClick={toggleFull} aria-label={isFull ? 'Exit full screen' : 'Full screen'}>
        {isFull
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" /></svg>
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" /></svg>}
      </button>
    </div>
  );
}
