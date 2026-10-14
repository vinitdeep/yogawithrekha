/** Resolve a site-relative asset path against the deploy base (works at / or in a sub-folder). */
export const asset = (p?: string): string | undefined =>
  !p || /^(data:|blob:|https?:)/.test(p) ? p : import.meta.env.BASE_URL + p.replace(/^\//, '');

/**
 * Demo uploads: video files chosen in the admin are kept as in-memory object URLs for the
 * current browser session only (they are too large for local storage). Production uploads go
 * straight to the configured video host (e.g. via a direct-upload URL issued by the server).
 */
export const sessionUploads = new Map<string, string>();
