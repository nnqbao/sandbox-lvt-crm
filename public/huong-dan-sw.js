// Service worker of the user guide (registered by docs/guide/guide.js with scope /huong-dan, so it
// controls /huong-dan-su-dung.html — also inside the "?" help panel iframe — and never the app).
//
// It keeps every tutorial video and poster on this device for 24 hours, so replaying a video or
// jumping between chapters does not download it from Convex again. Guide media are public,
// fictional content (convex/guideVideos.ts); no other request is intercepted.
//
// A file is downloaded once, from the start, and stored only when it arrived complete. While
// it downloads, the player reads from the bytes already received (byte ranges included). Only a
// seek far ahead of the download goes to the network directly.
const CACHE = 'lvt-guide-media-v1';
const TTL_MS = 24 * 60 * 60 * 1000;
const MEDIA = /^\/huong-dan\/video\/[a-z0-9-]{2,60}\.(mp4|webp)$/;
const STAMP = 'X-Lvt-Cached-At';
/** A seek this far beyond the downloaded bytes reads from the network instead of waiting. */
const AHEAD_BYTES = 4 * 1024 * 1024;
const downloads = new Map();

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('lvt-guide-media-') && name !== CACHE) await caches.delete(name);
    }
    await purgeExpired();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // ?direct=1: the guide's fallback after a playback error through this worker (docs/guide/guide.js).
  if (url.origin !== self.location.origin || !MEDIA.test(url.pathname) || url.searchParams.has('direct')) return;
  event.respondWith(serve(event, `${url.origin}${url.pathname}`));
});

async function serve(event, key) {
  const { request } = event;
  const header = request.headers.get('range');
  try {
    const cache = await caches.open(CACHE);
    const hit = await freshEntry(cache, key);
    if (hit) return await fromBlob(await hit.blob(), hit.headers.get('Content-Type'), header);

    let download = downloads.get(key);
    if (!download) {
      download = new Download(key, cache);
      downloads.set(key, download);
      event.waitUntil(download.done.finally(() => downloads.delete(key)));
    }
    if (!(await download.ready)) return fetch(request);
    const range = parseByteRange(header, download.size);
    if (range?.unsatisfiable) return unsatisfiable(download.size);
    const start = range ? range.start : 0;
    const end = range ? range.end : download.size - 1;
    if (start > download.received + AHEAD_BYTES) return fetch(request);
    return partial(download.stream(start, end), download.type, download.size, range && { start, end });
  } catch {
    // Storage unavailable (private mode, quota, eviction): behave as if there were no worker.
    return fetch(request);
  }
}

/** One full download of a guide file; readers stream from the bytes received so far. */
class Download {
  constructor(key, cache) {
    this.key = key;
    this.cache = cache;
    this.chunks = [];
    this.offsets = [];
    this.received = 0;
    this.size = 0;
    this.type = key.endsWith('.webp') ? 'image/webp' : 'video/mp4';
    this.finished = false;
    this.failed = false;
    this.waiters = new Set();
    let resolveReady;
    this.ready = new Promise((resolve) => { resolveReady = resolve; });
    this.done = this.run(resolveReady);
  }

  async run(resolveReady) {
    try {
      const response = await fetch(this.key, { mode: 'cors', credentials: 'omit' });
      this.size = Number(response.headers.get('Content-Length')) || 0;
      if (response.status !== 200 || !response.body || !this.size) throw new Error('GUIDE_MEDIA_UNAVAILABLE');
      this.type = response.headers.get('Content-Type') || this.type;
      resolveReady(true);
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        this.offsets.push(this.received);
        this.chunks.push(value);
        this.received += value.byteLength;
        this.wake();
      }
      if (this.received !== this.size) throw new Error('GUIDE_MEDIA_INCOMPLETE');
      this.finished = true;
      this.wake();
      const headers = { 'Content-Type': this.type, 'Content-Length': String(this.size), [STAMP]: String(Date.now()) };
      await this.cache.put(this.key, new Response(new Blob(this.chunks, { type: this.type }), { headers }));
      await purgeExpired();
    } catch {
      this.failed = true;
      resolveReady(false);
      this.wake();
    }
  }

  wake() {
    for (const wake of this.waiters) wake();
    this.waiters.clear();
  }

  /** Bytes [start, end] as a stream that waits for the download to reach them. */
  stream(start, end) {
    let position = start;
    let index = 0;
    return new ReadableStream({
      pull: async (controller) => {
        while (position >= this.received && !this.finished && !this.failed) {
          await new Promise((resolve) => this.waiters.add(resolve));
        }
        if (position >= this.received) {
          if (this.failed) controller.error(new Error('GUIDE_MEDIA_INCOMPLETE'));
          else controller.close();
          return;
        }
        while (index + 1 < this.offsets.length && this.offsets[index + 1] <= position) index += 1;
        while (index > 0 && this.offsets[index] > position) index -= 1;
        const chunk = this.chunks[index];
        const from = position - this.offsets[index];
        const to = Math.min(chunk.byteLength, end + 1 - this.offsets[index]);
        controller.enqueue(chunk.slice(from, to));
        position = this.offsets[index] + to;
        if (position > end) controller.close();
      },
    });
  }
}

async function freshEntry(cache, key) {
  const hit = await cache.match(key);
  if (!hit) return null;
  if (Date.now() - Number(hit.headers.get(STAMP) || 0) < TTL_MS) return hit;
  await cache.delete(key);
  return null;
}

async function purgeExpired() {
  const cache = await caches.open(CACHE);
  for (const request of await cache.keys()) await freshEntry(cache, request.url);
}

async function fromBlob(blob, type, header) {
  const range = parseByteRange(header, blob.size);
  if (range?.unsatisfiable) return unsatisfiable(blob.size);
  const body = range ? blob.slice(range.start, range.end + 1) : blob;
  return partial(body, type, blob.size, range);
}

function partial(body, type, size, range) {
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  if (!range) return new Response(body, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
  headers['Content-Length'] = String(range.end - range.start + 1);
  headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
  return new Response(body, { status: 206, headers });
}

function unsatisfiable(size) {
  return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
}

/** Same rules as scripts/lib/static-range.mjs (a worker script cannot import it). */
function parseByteRange(header, size) {
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
