/**
 * YouTube (unlisted) and Google Drive lesson videos.
 *
 * We store only the video / file ID and build the embed URL ourselves, so a pasted link can't
 * inject arbitrary pages into the player.
 *
 * Honest limits: embeds from YouTube or Drive can't be made download-proof, and no website can
 * block screen recording. The player adds deterrents (watermark with the student's email, hidden
 * "open on YouTube/Drive" links, no right-click, in-site fullscreen) — it does not make copying impossible.
 */

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{20,}$/;

/** Accepts youtube.com/watch?v=, youtu.be/, /shorts/, /live/, /embed/ links or a bare 11-character ID. */
export function parseYouTube(input: string): string | null {
  const v = input.trim();
  if (YT_ID.test(v)) return v;
  let u: URL;
  try { u = new URL(v); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1] ?? null;
  }
  return id && YT_ID.test(id) ? id : null;
}

/** Accepts drive.google.com/file/d/<id>/view, open?id=<id>, uc?id=<id> links or a bare file ID. */
export function parseDrive(input: string): string | null {
  const v = input.trim();
  if (DRIVE_ID.test(v) && !v.includes('/')) return v;
  let u: URL;
  try { u = new URL(v); } catch { return null; }
  if (u.hostname !== 'drive.google.com' && u.hostname !== 'docs.google.com') return null;
  const id = u.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? u.searchParams.get('id');
  return id && DRIVE_ID.test(id) ? id : null;
}

export function youTubeEmbed(id: string): string {
  // nocookie domain, no related videos from other channels, no annotations, and fs=0 so fullscreen
  // goes through our own button (keeping the watermark on screen).
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&iv_load_policy=3&playsinline=1&fs=0&disablekb=0`;
}

export function driveEmbed(id: string): string {
  return `https://drive.google.com/file/d/${id}/preview`;
}

export const isYouTubeEmbed = (src: string) => /^https:\/\/www\.youtube-nocookie\.com\/embed\//.test(src);
export const isDriveEmbed = (src: string) => /^https:\/\/drive\.google\.com\/file\/d\/[^/]+\/preview$/.test(src);
