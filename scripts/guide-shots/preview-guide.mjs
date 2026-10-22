#!/usr/bin/env node
// Screenshot the BUILT guide (public/huong-dan-su-dung.html) for visual review.
//
//   node scripts/guide-shots/preview-guide.mjs --out <dir outside the repo> [--anchor topic-id ...]
//        [--widths 1280,390] [--search "điểm danh"] [--print]
//
// Writes <dir>/guide-<width>-<anchor|top>.png and reports horizontal overflow.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './cdp.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(repoRoot, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.css': 'text/css', '.js': 'text/javascript' };

const args = { out: '', anchors: [], widths: [1280, 390], search: '', print: false, full: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--out') args.out = resolve(argv[++i]);
  else if (argv[i] === '--anchor') args.anchors.push(argv[++i]);
  else if (argv[i] === '--widths') args.widths = argv[++i].split(',').map(Number);
  else if (argv[i] === '--search') args.search = argv[++i];
  else if (argv[i] === '--print') args.print = true;
  else if (argv[i] === '--full') args.full = true;
}
if (!args.out) throw new Error('--out <dir> is required (keep previews outside the repo)');
// Compare whole path segments: a sibling such as <repo>-verify is outside the repository.
if (args.out === repoRoot || args.out.startsWith(repoRoot + sep)) throw new Error('--out must be outside the repository');
mkdirSync(args.out, { recursive: true });

const server = createServer((req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = normalize(join(publicDir, pathname === '/' ? 'huong-dan-su-dung.html' : pathname));
  if (!file.startsWith(publicDir) || !existsSync(file)) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/huong-dan-su-dung.html`;

const chrome = await launchChrome();
const page = await chrome.newPage();
await page.init();
try {
  for (const width of args.widths) {
    const mobile = width <= 480;
    await page.setViewport({ width, height: mobile ? 800 : 900, deviceScaleFactor: 1, mobile });
    await page.goto(base);
    await page.evaluate('document.fonts.ready.then(() => true)');
    if (args.print) await page.send('Emulation.setEmulatedMedia', { media: 'print' });
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }).catch(() => {});
    const overflow = await page.evaluate('document.documentElement.scrollWidth - window.innerWidth');
    const broken = await page.evaluate(`Promise.all([...document.images].map((img) => { img.loading = 'eager'; return img.decode().then(() => null, () => img.getAttribute('src')); })).then((list) => list.filter(Boolean))`);
    console.log(`${width}px: tràn ngang ${overflow}px; ảnh lỗi: ${broken.length ? broken.join(', ') : 'không'}`);
    const targets = args.anchors.length ? args.anchors : ['top'];
    for (const anchor of targets) {
      if (args.search) {
        await page.evaluate(`(() => { const i = document.getElementById('guide-search'); i.value = ${JSON.stringify(args.search)}; i.dispatchEvent(new Event('input')); })()`);
        await new Promise((r) => setTimeout(r, 300));
      }
      if (anchor !== 'top') {
        await page.evaluate(`document.getElementById(${JSON.stringify(anchor)}).scrollIntoView({ block: 'start', behavior: 'instant' })`);
      }
      await new Promise((r) => setTimeout(r, 400));
      let clip = await page.evaluate('({ x: 0, y: window.scrollY, width: window.innerWidth, height: window.innerHeight })');
      if (args.full && anchor !== 'top') {
        clip = await page.evaluate(`(() => { const r = document.getElementById(${JSON.stringify(anchor)}).getBoundingClientRect(); return { x: 0, y: r.top + scrollY - 8, width: innerWidth, height: Math.min(r.height + 16, 6000) }; })()`);
      }
      const png = await page.screenshot({ format: 'png', clip });
      const name = `guide-${width}-${anchor}${args.search ? '-search' : ''}${args.print ? '-print' : ''}.png`;
      writeFileSync(join(args.out, name), png);
      console.log(`  → ${join(args.out, name)}`);
    }
  }
} finally {
  await chrome.close();
  server.close();
}
