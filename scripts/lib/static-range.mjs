// Byte ranges for static media (the guide's tutorial videos). Safari / iOS refuse to play an
// MP4 unless the server answers `Range: bytes=…` with 206 Partial Content.

/**
 * @param {string | undefined} header the request's Range header
 * @param {number} size file size in bytes
 * @returns {null | { start: number, end: number } | { unsatisfiable: true }}
 *   null = ignore (absent, malformed or multi-range: answer 200 with the whole file)
 */
export function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!suffix) return { unsatisfiable: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
    return { unsatisfiable: true };
  }
  return { start, end };
}

/** Weak validator for a static file that changes only when it is rebuilt. */
export function staticEtag(info) {
  return `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
}
