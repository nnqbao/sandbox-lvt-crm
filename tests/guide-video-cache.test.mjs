import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const ORIGIN = 'https://lvt.example';
const VIDEO = `${ORIGIN}/huong-dan/video/lh-lop-hoc.mp4`;
const HOUR = 60 * 60 * 1000;

/** Runs public/huong-dan-sw.js against an in-memory Cache API and a scripted network. */
function loadWorker({ bytes = Uint8Array.from({ length: 1000 }, (_, i) => i % 251), chunk = 100, status = 200, declared } = {}) {
  const clock = { now: 1_000_000 };
  const stores = new Map();
  const listeners = {};
  const network = { full: 0, passthrough: 0, gate: null };
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async match(url) {
        const row = store.get(String(url));
        return row ? new Response(row.body, { headers: row.headers }) : undefined;
      },
      async put(url, response) {
        store.set(String(url), { body: new Uint8Array(await response.arrayBuffer()), headers: Object.fromEntries(response.headers) });
      },
      async delete(url) { return store.delete(String(url)); },
      async keys() { return [...store.keys()].map((url) => ({ url })); },
    };
  };
  const caches = {
    open: async (name) => cacheFor(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  async function fetch(input, init = {}) {
    if (input instanceof Request) {
      network.passthrough += 1;
      return new Response('network', { status: 206 });
    }
    assert.equal(init.mode, 'cors');
    network.full += 1;
    if (status !== 200) return new Response('missing', { status });
    let offset = 0;
    const body = new ReadableStream({
      async pull(controller) {
        if (network.gate) await network.gate;
        if (offset >= bytes.length) return controller.close();
        controller.enqueue(bytes.slice(offset, offset + chunk));
        offset += chunk;
      },
    });
    return new Response(body, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(declared ?? bytes.length) } });
  }
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting() {},
    clients: { claim: async () => {} },
  };
  const context = vm.createContext({
    self, caches, fetch, Request, Response, ReadableStream, Blob, URL, Promise, Number, String, Map, Set, Error,
    Date: { now: () => clock.now },
  });
  vm.runInContext(read('public/huong-dan-sw.js'), context);

  function request(url, range) {
    const event = {
      request: new Request(url, { headers: range ? { range } : {} }),
      response: null,
      lifetime: [],
      respondWith(promise) { this.response = promise; },
      waitUntil(promise) { this.lifetime.push(promise); },
    };
    listeners.fetch(event);
    return event;
  }
  return { clock, stores, network, request, bytes, settle: (event) => Promise.all(event.lifetime) };
}

async function body(response) {
  return new Uint8Array(await response.arrayBuffer());
}

test('a guide video is downloaded once, streamed while it arrives, then replayed from the device', async () => {
  const sw = loadWorker();
  const first = sw.request(VIDEO, 'bytes=0-');
  const response = await first.response;
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 0-999/1000');
  assert.deepEqual(await body(response), sw.bytes);
  await sw.settle(first);
  assert.equal(sw.network.full, 1);
  const stored = sw.stores.get('lvt-guide-media-v1').get(VIDEO);
  assert.equal(stored.body.length, 1000);

  // Chapter jump an hour later: answered from the cache, no network at all.
  sw.clock.now += HOUR;
  const seek = await sw.request(`${VIDEO}?x=1`, 'bytes=250-499').response;
  assert.equal(seek.status, 206);
  assert.equal(seek.headers.get('Content-Range'), 'bytes 250-499/1000');
  assert.deepEqual(await body(seek), sw.bytes.slice(250, 500));
  const whole = await sw.request(VIDEO).response;
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('Content-Length'), '1000');
  assert.equal((await sw.request(VIDEO, 'bytes=1000-').response).status, 416);
  assert.deepEqual(sw.network, { full: 1, passthrough: 0, gate: null });
});

test('requests during the download share it; a far seek goes to the network', async () => {
  const sw = loadWorker({ bytes: Uint8Array.from({ length: 10 * 1024 * 1024 }, (_, i) => i % 7), chunk: 512 * 1024 });
  let release;
  sw.network.gate = new Promise((resolve) => { release = resolve; });
  const first = sw.request(VIDEO, 'bytes=0-1');
  const near = sw.request(VIDEO, 'bytes=1000-2999');
  const far = sw.request(VIDEO, 'bytes=9000000-');
  assert.equal((await far.response).status, 206);
  assert.equal(sw.network.passthrough, 1, 'a seek more than 4 MB ahead does not wait for the download');
  sw.network.gate = null;
  release();
  const probe = await first.response;
  assert.deepEqual(await body(probe), sw.bytes.slice(0, 2));
  assert.deepEqual(await body(await near.response), sw.bytes.slice(1000, 3000));
  await sw.settle(first);
  assert.equal(sw.network.full, 1, 'one download for every reader');
  assert.equal(sw.stores.get('lvt-guide-media-v1').get(VIDEO).body.length, sw.bytes.length);
});

test('the copy expires after 24 hours and is downloaded again', async () => {
  const sw = loadWorker();
  const first = sw.request(VIDEO);
  await body(await first.response);
  await sw.settle(first);
  sw.clock.now += 24 * HOUR - 1;
  await body(await sw.request(VIDEO).response);
  assert.equal(sw.network.full, 1, 'still fresh just before 24 h');
  sw.clock.now += 2;
  const again = sw.request(VIDEO);
  assert.deepEqual(await body(await again.response), sw.bytes);
  await sw.settle(again);
  assert.equal(sw.network.full, 2);
  assert.equal(sw.stores.get('lvt-guide-media-v1').get(VIDEO)['headers']['x-lvt-cached-at'], String(sw.clock.now));
});

test('an incomplete or missing file is never stored', async () => {
  const cut = loadWorker({ declared: 2000 });
  const event = cut.request(VIDEO);
  await assert.rejects(body(await event.response));
  await cut.settle(event);
  assert.equal(cut.stores.get('lvt-guide-media-v1')?.get(VIDEO), undefined);

  const missing = loadWorker({ status: 404 });
  const notFound = missing.request(VIDEO, 'bytes=0-');
  assert.equal(await (await notFound.response).text(), 'network', 'falls back to the network answer');
  await missing.settle(notFound);
  assert.equal(missing.stores.get('lvt-guide-media-v1')?.get(VIDEO), undefined);
});

test('only guide media of this origin are intercepted', () => {
  const sw = loadWorker();
  for (const url of [`${ORIGIN}/`, `${ORIGIN}/api/files/abc`, `${ORIGIN}/huong-dan/lh-lop-hoc.webp`, 'https://other.example/huong-dan/video/lh-lop-hoc.mp4', `${VIDEO}?direct=1`]) {
    assert.equal(sw.request(url).response, null, url);
  }
  assert.ok(sw.request(`${ORIGIN}/huong-dan/video/lh-lop-hoc.webp`).response, 'posters are cached too');
});

test('the guide registers the worker for /huong-dan only, and the redirect is not cached', () => {
  const guide = read('docs/guide/guide.js');
  assert.match(guide, /navigator\.serviceWorker\.register\('\/huong-dan-sw\.js', \{ scope: '\/huong-dan' \}\)/);
  assert.ok(read('public/huong-dan-su-dung.html').includes("register('/huong-dan-sw.js', { scope: '/huong-dan' })"), 'guide rebuilt');
  assert.match(guide, /video\.src = video\.getAttribute\('src'\)\.replace\(\/\\\.mp4\(\?=#\|\$\)\/, '\.mp4\?direct=1'\);/, 'a playback error retries without the worker');
  const worker = read('public/huong-dan-sw.js');
  assert.match(worker, /const TTL_MS = 24 \* 60 \* 60 \* 1000;/);
  assert.match(worker, /const MEDIA = \/\^\\\/huong-dan\\\/video\\\/\[a-z0-9-\]\{2,60\}\\\.\(mp4\|webp\)\$\/;/);
  assert.doesNotMatch(read('src/main.jsx'), /serviceWorker/, 'the app itself has no service worker');
  assert.match(read('scripts/serve-production.mjs'), /servedPath === '\/huong-dan-sw\.js' \? 'no-store' : 'no-cache'/, 'worker updates bypass the CDN');
});
