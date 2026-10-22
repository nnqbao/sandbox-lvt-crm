// Framing policy for static files served from dist/.
// Every response starts with `X-Frame-Options: DENY` (applySecurityHeaders).
// The only exception is the public user guide, which the web app shows inside
// its "?" help panel (an iframe on the same origin). Private files, the SPA and
// the design library stay unframeable.

/** dist-relative paths (leading slash) that same-origin pages may embed. */
export const SAME_ORIGIN_FRAMEABLE_PATHS = Object.freeze(['/huong-dan-su-dung.html']);

/**
 * @param {string} servedPath path of the file actually served, relative to dist/ with a leading slash
 * @returns {{ name: string, value: string }[]} headers to set (overriding the DENY default)
 */
export function staticFrameHeaders(servedPath) {
  if (!SAME_ORIGIN_FRAMEABLE_PATHS.includes(servedPath)) return [];
  return [
    { name: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { name: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  ];
}
