import { useEffect, useState } from 'react';
import type { Lesson } from '../lib/types';
import { Icon } from './Icon';
import { sessionUploads } from '../lib/uploads';

/**
 * Lesson video.
 *  - Hosted URL: direct files (.mp4/.webm) play in a <video>; other URLs are treated as an
 *    embeddable player (e.g. a video host's iframe URL).
 *  - Demo upload: plays from an in-memory object URL during the session it was chosen.
 *  - Otherwise: a clearly labelled placeholder with a simulated playback bar.
 *
 * Production: paid lessons should be served through a video host's protected playback
 * (signed/expiring URLs or tokens, domain restrictions). No player can fully prevent screen
 * recording or copying, so we do not promise that.
 */
export function VideoPlayer({ lesson, label }: { lesson: Lesson; label?: string }) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);

  useEffect(() => { setPlaying(false); setPos(0); }, [lesson.id]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setPos((p) => (p >= 100 ? 100 : p + 0.5)), 300);
    return () => clearInterval(t);
  }, [playing]);

  const v = lesson.video;
  const uploaded = v?.kind === 'upload' ? sessionUploads.get(lesson.id) : undefined;
  const src = v?.kind === 'url' ? v.src : uploaded;

  if (src) {
    const direct = /\.(mp4|webm|ogg|m4v)(\?|$)/i.test(src) || src.startsWith('blob:');
    return (
      <div className="player">
        {direct ? (
          <video key={src} src={src} controls playsInline preload="metadata" controlsList="nodownload" aria-label={`Video: ${lesson.title}`} />
        ) : (
          <iframe key={src} src={src} title={`Video: ${lesson.title}`} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen />
        )}
      </div>
    );
  }

  const total = lesson.durationMin * 60;
  const elapsed = Math.round((pos / 100) * total);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="player">
      <span className="player-tag badge badge-sand">{label ?? 'Video placeholder'}</span>
      <div className="player-ph">
        <button type="button" className="play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause simulated playback' : 'Play simulated playback'}>
          {playing ? (
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
          ) : <Icon name="play" size={28} style={{ marginLeft: 4 }} />}
        </button>
        <strong>{lesson.title}</strong>
        <p>{v?.kind === 'upload'
          ? `Demo upload “${v.fileName}” is only playable in the browser session it was attached in.`
          : 'Rekha’s edited lesson video will be attached here. Playback in this demo is simulated.'}</p>
      </div>
      <div className="player-bar" aria-hidden="true">
        <span>{mmss(elapsed)}</span>
        <div className="player-track"><span style={{ width: `${pos}%` }} /></div>
        <span>{mmss(total)}</span>
      </div>
    </div>
  );
}
