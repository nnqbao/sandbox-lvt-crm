#!/usr/bin/env node
// Capture user-guide screenshots from the real React screens with fictional data.
//
//   npm run guide:shots                         # every shot in scripts/guide-shots/shots/*.mjs
//   npm run guide:shots -- --only duties,work   # only these shot files
//   npm run guide:shots -- --id gv-lich-          # only shot ids starting with this prefix
//   npm run guide:shots -- --preview /tmp/x     # also write PNG copies there for review
//   --port 5321  (vite port)   --keep-going (do not stop on the first failing shot)
//
// Output: public/huong-dan/<id>.webp. No backend, no network: convex/react is mocked.
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { launchChrome } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const outDir = join(repoRoot, 'public/huong-dan');

function parseArgs(argv) {
  const args = { only: [], ids: [], port: 5321, preview: '', keepGoing: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--only') args.only.push(...argv[++i].split(','));
    else if (arg === '--id') args.ids.push(...argv[++i].split(','));
    else if (arg === '--port') args.port = Number(argv[++i]);
    else if (arg === '--preview') args.preview = resolve(argv[++i]);
    else if (arg === '--keep-going') args.keepGoing = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return args;
}

async function loadShots(args) {
  const shotDir = join(here, 'shots');
  const files = readdirSync(shotDir).filter((file) => file.endsWith('.mjs')).sort();
  const shots = [];
  for (const file of files) {
    const group = basename(file, '.mjs');
    if (args.only.length && !args.only.includes(group)) continue;
    const mod = await import(pathToFileURL(join(shotDir, file)).href);
    for (const shot of mod.default || []) shots.push({ group, ...shot });
  }
  const seen = new Set();
  for (const shot of shots) {
    if (!/^[a-z0-9-]+$/.test(shot.id)) throw new Error(`Shot id must be kebab-case: ${shot.id}`);
    if (seen.has(shot.id)) throw new Error(`Duplicate shot id: ${shot.id}`);
    seen.add(shot.id);
  }
  return args.ids.length ? shots.filter((shot) => args.ids.some((prefix) => shot.id.startsWith(prefix))) : shots;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function captureShot(page, baseUrl, shot) {
  const width = shot.width || 1280;
  const mobile = width <= 480;
  const height = shot.height || (mobile ? 844 : 800);
  const deviceScaleFactor = shot.dpr || (mobile ? 2 : 1);
  await page.setViewport({ width, height, deviceScaleFactor, mobile });
  const guide = {
    scenario: shot.scenario || 'teacher',
    signedOut: shot.scenario === 'signedout',
    state: shot.state || {},
    overrides: shot.overrides || {},
    now: shot.now,
  };
  await page.setInitScript(`window.__GUIDE__ = ${JSON.stringify(guide)};`);
  await page.goto(`${baseUrl}${shot.path || '/'}`);
  const readySelector = shot.waitFor || (guide.signedOut || shot.scenario === 'mustchange' ? '.auth-page' : '.shell-main');
  await page.evaluate(`(async () => {
    const started = performance.now();
    while (!window.__guide || !window.__guide.resolve(${JSON.stringify(readySelector)})) {
      if (performance.now() - started > 15000) throw new Error('not ready: ' + ${JSON.stringify(JSON.stringify(readySelector))});
      await new Promise((r) => setTimeout(r, 50));
    }
    await document.fonts.ready;
  })()`);
  await sleep(shot.settle ?? 350);
  for (const action of shot.actions || []) {
    if (action.wait) {
      await sleep(action.wait);
    } else if (action.eval) {
      await page.evaluate(`(async () => { ${action.eval} })()`);
    } else {
      await page.evaluate(`window.__guide.act(${JSON.stringify(action)})`);
    }
    await sleep(action.after ?? 200);
  }
  await page.evaluate('document.fonts.ready.then(() => true)');
  await sleep(150);
  const covered = await page.evaluate(`window.__guide.callouts(${JSON.stringify(shot.callouts || [])})`);
  let clip;
  if (shot.clip && shot.clip !== 'viewport' && shot.clip !== 'full') {
    clip = await page.evaluate(`window.__guide.clipRect(${JSON.stringify(shot.clip)}, ${JSON.stringify(covered)})`);
  } else if (shot.clip === 'full') {
    const size = await page.evaluate('({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })');
    clip = { x: 0, y: 0, width: size.w, height: Math.min(size.h, shot.maxHeight || 2400) };
  } else {
    const scroll = await page.evaluate('({ x: window.scrollX, y: window.scrollY })');
    clip = { x: scroll.x, y: scroll.y, width, height };
  }
  if (shot.maxHeight && clip.height > shot.maxHeight) clip.height = shot.maxHeight;
  const quality = shot.quality || 78;
  const webp = await page.screenshot({ format: 'webp', quality, clip });
  const png = await page.screenshot({ format: 'png', clip }).catch(() => null);
  const missing = await page.evaluate('window.__guide.missing()');
  return { webp, png, clip, deviceScaleFactor, missing };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const shots = await loadShots(args);
  if (!shots.length) {
    console.log('Không có shot nào khớp điều kiện.');
    return;
  }
  mkdirSync(outDir, { recursive: true });
  if (args.preview) mkdirSync(args.preview, { recursive: true });

  const { default: harnessConfig } = await import(pathToFileURL(join(here, 'vite.config.mjs')).href);
  const server = await createServer({ ...harnessConfig, server: { ...harnessConfig.server, port: args.port } });
  await server.listen();
  const baseUrl = `http://127.0.0.1:${args.port}`;
  const chrome = await launchChrome();
  const page = await chrome.newPage();
  await page.init();

  let failures = 0;
  let totalBytes = 0;
  try {
    for (const shot of shots) {
      const started = Date.now();
      try {
        const { webp, png, clip, deviceScaleFactor, missing } = await captureShot(page, baseUrl, shot);
        writeFileSync(join(outDir, `${shot.id}.webp`), webp);
        if (args.preview && png) writeFileSync(join(args.preview, `${shot.id}.png`), png);
        totalBytes += webp.length;
        const px = `${Math.round(clip.width * deviceScaleFactor)}x${Math.round(clip.height * deviceScaleFactor)}`;
        console.log(`✓ ${shot.id.padEnd(34)} ${px.padEnd(10)} ${(webp.length / 1024).toFixed(0).padStart(4)} KB  ${Date.now() - started} ms`);
        if (missing.length) console.log(`    thiếu fixture: ${missing.join(', ')}`);
        const errors = page.consoleMessages.filter((line) => /^(error|exception)/.test(line));
        if (errors.length) console.log(`    console: ${errors.slice(0, 4).join(' | ').slice(0, 600)}`);
      } catch (error) {
        failures += 1;
        console.log(`✗ ${shot.id}: ${error.message}`);
        const errors = page.consoleMessages.filter((line) => /^(error|exception|warning)/.test(line));
        if (errors.length) console.log(`    console: ${errors.slice(0, 6).join(' | ').slice(0, 1200)}`);
        if (!args.keepGoing) break;
      }
    }
  } finally {
    await chrome.close();
    await server.close();
  }
  const files = readdirSync(outDir).map((file) => statSync(join(outDir, file)).size);
  console.log(`\n${shots.length - failures}/${shots.length} ảnh, lần này ${(totalBytes / 1024 / 1024).toFixed(2)} MB; thư mục public/huong-dan: ${files.length} file, ${(files.reduce((a, b) => a + b, 0) / 1024 / 1024).toFixed(2)} MB`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
