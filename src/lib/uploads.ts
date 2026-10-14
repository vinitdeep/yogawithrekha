/**
 * Demo uploads: video files chosen in the admin are kept as in-memory object URLs for the
 * current browser session only (they are too large for local storage). Production uploads go
 * straight to the configured video host (e.g. via a direct-upload URL issued by the server).
 */
export const sessionUploads = new Map<string, string>();
