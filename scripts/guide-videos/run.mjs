#!/usr/bin/env node
// Record step-by-step tutorial videos from the real React screens with fictional data.
//
//   npm run guide:videos                          # every video in scripts/guide-videos/videos/*.mjs
//   npm run guide:videos -- --only tl-mon-hoc     # only these video ids
//   npm run guide:videos -- --frames /tmp/x       # keep the captured frames there for review
//   --port 5322 (vite port)
//
// Output: public/huong-dan/video/<id>.mp4 (H.264, 1920x1080, no audio) + <id>.webp poster.
// Same harness as guide:shots (scripts/guide-shots): convex/react is mocked, no network.
// A video is a timeline of still frames: each step paints the overlay (cursor, ripple,
// highlight, caption) and captures one or more frames with a display duration; ffmpeg
// turns the list into a constant-frame-rate MP4. Slow, readable pacing is the point.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { launchChrome } from '../guide-shots/cdp.mjs';
import { installVideoOverlay } from './overlay.js';
import { writeClick, writeMusic } from './sounds.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const outDir = join(repoRoot, 'public/huong-dan/video');
const WIDTH = 1280;
const HEIGHT = 720;
const SCALE = 1.5; // 1920x1080 frames: small text stays sharp
const FPS = 25;
const J = JSON.stringify;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const args = { only: [], port: 5322, frames: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--only') args.only.push(...argv[++i].split(','));
    else if (arg === '--port') args.port = Number(argv[++i]);
    else if (arg === '--frames') args.frames = resolve(argv[++i]);
    else throw new Error(`Unknown argument ${arg}`);
  }
  return args;
}

async function loadVideos(args) {
  const dir = join(here, 'videos');
  const videos = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.mjs')).sort()) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    videos.push(mod.default);
  }
  for (const video of videos) {
    if (!/^[a-z0-9-]+$/.test(video.id)) throw new Error(`Video id must be kebab-case: ${video.id}`);
  }
  return args.only.length ? videos.filter((video) => args.only.includes(video.id)) : videos;
}

/** Seconds a caption stays on screen before the next action: slow enough to read twice. */
export function readTime(text) {
  return Math.min(9, Math.max(3, 1.8 + String(text).length * 0.06));
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

class Recorder {
  /** voice: narration segment lengths (seconds) in caption order, or null for a silent video. */
  constructor(page, dir, voice = null) {
    this.page = page;
    this.dir = dir;
    this.frames = [];
    this.last = null;
    this.state = { step: '', caption: '', cursor: false };
    this.chapters = [];
    this.voice = voice;
    this.voiceIndex = 0;
    this.cues = []; // { index, at }: narration segment `index` starts at `at` seconds
    this.clicks = []; // seconds of each click (sound effect)
    this.speakUntil = 0;
  }

  /** Hold the current frame until the running narration segment (plus a breath) has finished. */
  async waitForVoice() {
    const missing = this.speakUntil - this.seconds;
    if (missing > 0 && this.last) this.last.duration += missing;
  }

  /** Start the next narration segment now; returns its length (0 when the video has no voice). */
  speak() {
    if (!this.voice) return 0;
    const index = this.voiceIndex;
    if (index >= this.voice.length) throw new Error(`video: thiếu đoạn giọng đọc số ${index}`);
    this.voiceIndex += 1;
    this.cues.push({ index, at: this.seconds });
    this.speakUntil = this.seconds + this.voice[index] + 0.5;
    return this.voice[index];
  }

  v(call) {
    return this.page.evaluate(`window.__video.${call}`);
  }

  async snap(seconds) {
    // Two animation frames: layout + paint settle (sticky bars repaint late after a scroll).
    await this.page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const { data } = await this.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    if (this.last && this.last.data === data) {
      this.last.duration += seconds;
      return;
    }
    const file = join(this.dir, `f${String(this.frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    this.last = { file, data, duration: seconds };
    this.frames.push(this.last);
  }

  get seconds() {
    return this.frames.reduce((sum, frame) => sum + frame.duration, 0);
  }

  async load(baseUrl, scene) {
    const guide = { scenario: scene.scenario || 'admin', state: scene.state || {}, overrides: scene.overrides || {}, now: scene.now };
    await this.page.setInitScript(`window.__GUIDE__ = ${J(guide)};`);
    await this.page.goto(`${baseUrl}${scene.path || '/'}`);
    const ready = scene.waitFor || '.shell-main';
    await this.page.evaluate(`(async () => {
      const started = performance.now();
      while (!window.__guide || !window.__guide.resolve(${J(ready)})) {
        if (performance.now() - started > 15000) throw new Error('not ready: ' + ${J(J(ready))});
        await new Promise((r) => setTimeout(r, 50));
      }
      await document.fonts.ready;
    })()`);
    await sleep(scene.settle ?? 400);
    await this.page.evaluate(`(${installVideoOverlay.toString()})()`);
    if (this.state.caption) await this.v(`caption(${J(this.state.step)}, ${J(this.state.caption)})`);
    if (this.state.cursor) await this.v('cursorShow(true)');
  }

  async moveTo(x, y, ms = 900) {
    const from = await this.v('cursorAt()');
    const distance = Math.hypot(x - from.x, y - from.y);
    const duration = Math.max(250, Math.min(ms, 300 + distance * 1.1));
    const steps = Math.max(6, Math.round(duration / 40));
    this.state.cursor = true;
    for (let i = 1; i <= steps; i += 1) {
      const t = ease(i / steps);
      await this.v(`cursorTo(${from.x + (x - from.x) * t}, ${from.y + (y - from.y) * t})`);
      await this.snap(duration / steps / 1000);
    }
  }

  async scroll(dy) {
    if (!dy) return;
    const steps = Math.max(6, Math.min(20, Math.round(Math.abs(dy) / 40)));
    let done = 0;
    for (let i = 1; i <= steps; i += 1) {
      const next = Math.round(dy * ease(i / steps));
      await this.v(`scrollStep(${next - done})`);
      done = next;
      await this.snap(0.04);
    }
  }

  /** Bring the target into view (smooth scroll) and glide the cursor onto it. */
  async reach(target, anchor) {
    const aim = await this.v(`aim(${J(target)}, ${J(anchor || 'center')})`);
    if (aim.scroll) await this.scroll(aim.scroll);
    const again = await this.v(`aim(${J(target)}, ${J(anchor || 'center')})`);
    await this.v(`placeCaption(${J(target)})`);
    await this.moveTo(again.x, again.y);
  }

  async press() {
    this.clicks.push(this.seconds);
    for (const size of [26, 44, 60]) {
      await this.v(`ripple(${size})`);
      await this.snap(0.07);
    }
  }

  async release() {
    await this.v('ripple(0)');
  }

  async run(step, baseUrl) {
    // A new caption or card waits for the previous narration, so chapters start on a clean cut.
    if (step.caption !== undefined || step.card || step.chapter) await this.waitForVoice();
    if (step.chapter) this.chapters.push({ title: step.chapter, start: Math.round(this.seconds * 10) / 10 });
    if (step.chapter && Object.keys(step).length === 1) return;
    if (step.scene) {
      await this.load(baseUrl, step.scene);
      await this.snap(step.hold ?? 0.6);
      return;
    }
    if (step.card) {
      await this.v(`card(${J(step.card.kicker || '')}, ${J(step.card.title)}, ${J(step.card.text || '')})`);
      await this.v('cursorShow(false)');
      const spoken = this.speak();
      await this.snap(Math.max(step.hold ?? 5, spoken ? spoken + 0.6 : 0));
      await this.v('card()');
      if (this.state.cursor) await this.v('cursorShow(true)');
      return;
    }
    if (step.clear) await this.v('clearHighlights()');
    if (step.caption !== undefined) {
      // A step badge stays until the next one is given (step: '' removes it).
      if (step.step !== undefined) this.state.step = step.step;
      this.state.caption = step.caption;
      await this.v(`caption(${J(this.state.step)}, ${J(step.caption)})`);
      const spoken = this.speak();
      if (!step.click && !step.type && !step.fill && !step.choose && !step.highlight && !step.point) {
        await this.v('placeCaption()');
        // With narration the next caption waits for the voice (waitForVoice); without it, reading time.
        await this.snap(step.hold ?? (spoken ? 0.6 : readTime(step.caption)));
        return;
      }
      await this.snap(spoken ? Math.min(readTime(step.caption) * 0.6, Math.max(0.8, spoken * 0.4)) : readTime(step.caption) * 0.6);
    }
    if (step.clear && step.caption === undefined && !step.highlight && !step.click && !step.type && !step.fill && !step.choose && !step.point) {
      await this.snap(0.2);
      return;
    }
    if (step.top) {
      const y = await this.v('useWindow()');
      await this.scroll(-y);
      await this.snap(step.hold ?? 0.4);
      return;
    }
    if (step.highlight) {
      if (!step.keep) await this.v('clearHighlights()');
      const aim = await this.v(`aim(${J(step.highlight)})`);
      if (aim.scroll) await this.scroll(aim.scroll);
      await this.v(`placeCaption(${J(step.highlight)})`);
      await this.v(`highlight(${J(step.highlight)}, ${J(step.label || '')})`);
      await this.snap(step.hold ?? 2.5);
      return;
    }
    if (step.point) {
      await this.reach(step.point, step.anchor);
      await this.snap(step.hold ?? 1.2);
      return;
    }
    if (step.click) {
      await this.reach(step.click, step.anchor);
      await this.press();
      await this.page.evaluate(`window.__guide.act(${J({ click: step.click })})`);
      await sleep(step.wait ?? 350);
      if (step.waitFor) await this.page.evaluate(`window.__guide.act(${J({ waitFor: step.waitFor })})`);
      await this.release();
      await this.snap(step.hold ?? 1.2);
      return;
    }
    if (step.type) {
      await this.reach(step.type, 'left');
      await this.press();
      await this.release();
      const text = String(step.text);
      const prefix = step.keep ? await this.page.evaluate(`window.__guide.resolve(${J(step.type)}).value`) : '';
      for (let i = 1; i <= text.length; i += 1) {
        await this.v(`typeValue(${J(step.type)}, ${J(prefix + text.slice(0, i))})`);
        if (i % 2 === 0 || i === text.length) await this.snap(0.11);
      }
      if (!step.keepFocus) await this.v('blur()');
      await sleep(150);
      await this.snap(step.hold ?? 1);
      return;
    }
    if (step.fill) {
      // Date / time / number inputs: one click, then the whole value at once.
      await this.reach(step.fill, 'left');
      await this.press();
      await this.release();
      await this.v(`typeValue(${J(step.fill)}, ${J(String(step.value))})`);
      await this.v('blur()');
      await sleep(150);
      await this.snap(step.hold ?? 1.4);
      return;
    }
    if (step.choose) {
      await this.reach(step.choose);
      await this.press();
      await this.release();
      const index = await this.v(`showDropdown(${J(step.choose)}, ${J(step.option)})`);
      await this.snap(0.8);
      const row = await this.v(`hoverDropdown(${index})`);
      if (row) await this.moveTo(row.x, row.y, 700);
      await this.snap(0.6);
      await this.press();
      await this.v(`selectIndex(${J(step.choose)}, ${index})`);
      await this.v('hideDropdown()');
      await sleep(250);
      await this.release();
      await this.snap(step.hold ?? 1.2);
      return;
    }
    if (step.js) {
      // Cosmetic stand-in for a server round trip the static fixtures cannot show (e.g. a row
      // turning red once its toggle is saved). Keep it to what the real screen does.
      await this.page.evaluate(`(() => { ${step.js} })()`);
      await sleep(step.wait ?? 200);
      await this.snap(step.hold ?? 1.2);
      return;
    }
    if (step.act) {
      await this.page.evaluate(`window.__guide.act(${J(step.act)})`);
      await sleep(step.wait ?? 300);
      await this.snap(step.hold ?? 0.8);
      return;
    }
    if (step.hold) {
      await this.snap(step.hold);
      return;
    }
    if (step.caption === undefined && !step.clear) throw new Error(`video: unknown step ${J(step)}`);
  }
}

const CLICK_VOLUME = 0.55;
const MUSIC_VOLUME = 0.2;

/**
 * Sound track for a narrated video: voice segments at their cues, a mouse click on every press and
 * the original background loop (sounds.mjs), ducked under the voice; muxed into the silent video.
 */
function addAudio({ videoFile, outFile, dir, voiceFile, segments, cues, clicks, seconds }) {
  const total = seconds.toFixed(3);
  const inputs = [];
  const parts = [];
  for (const [n, cue] of cues.entries()) {
    const { start, end } = segments[cue.index];
    const clip = join(dir, `voice-${n}.wav`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-to', String(end), '-i', voiceFile, '-ac', '1', '-ar', '48000', clip]);
    inputs.push('-i', clip);
    parts.push(`[${n}:a]adelay=${Math.round(cue.at * 1000)}:all=1[v${n}]`);
  }
  // Voice bus, split: one copy is heard, the other drives the music ducking.
  parts.push(`${cues.map((_, n) => `[v${n}]`).join('')}amix=inputs=${cues.length}:normalize=0:duration=longest,apad=whole_dur=${total},atrim=0:${total},asplit=2[voice][key]`);

  const music = join(dir, 'music.wav');
  writeMusic(music, seconds + 1);
  const musicInput = cues.length;
  inputs.push('-i', music);
  const fadeOut = Math.max(0, seconds - 3).toFixed(3);
  parts.push(`[${musicInput}:a]atrim=0:${total},highpass=f=90,volume=${MUSIC_VOLUME},afade=t=in:st=0:d=2,afade=t=out:st=${fadeOut}:d=3[bed]`);
  parts.push('[bed][key]sidechaincompress=threshold=0.015:ratio=5:attack=25:release=450:makeup=1[music]');

  const labels = ['[voice]', '[music]'];
  if (clicks.length) {
    const click = join(dir, 'click.wav');
    writeClick(click);
    const clickInput = cues.length + 1;
    inputs.push('-i', click);
    parts.push(`[${clickInput}:a]volume=${CLICK_VOLUME},asplit=${clicks.length}${clicks.map((_, n) => `[c${n}]`).join('')}`);
    for (const [n, at] of clicks.entries()) {
      parts.push(`[c${n}]adelay=${Math.round(at * 1000)}:all=1[k${n}]`);
      labels.push(`[k${n}]`);
    }
  }
  parts.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first,alimiter=limit=0.95[mix]`);
  const audio = join(dir, 'audio.m4a');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', parts.join(';'), '-map', '[mix]', '-c:a', 'aac', '-b:a', '128k', audio]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', videoFile, '-i', audio, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', '-shortest', outFile]);
}

function encode(frames, dir, outFile) {
  const list = frames.map((frame) => `file '${frame.file}'\nduration ${frame.duration.toFixed(3)}`);
  list.push(`file '${frames[frames.length - 1].file}'`); // concat demuxer drops the last duration otherwise
  const listFile = join(dir, 'frames.txt');
  writeFileSync(listFile, `${list.join('\n')}\n`);
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-tune', 'stillimage',
    '-crf', '28', '-g', String(FPS * 10), '-movflags', '+faststart', '-an', outFile,
  ], { stdio: 'inherit' });
}

function poster(frameFile, outFile) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', frameFile, '-vf', 'scale=1280:-1', '-c:v', 'libwebp', '-quality', '72', outFile], { stdio: 'inherit' });
}

/** Narration recorded for this video (npm run guide:voice), or null. */
function loadVoice(id) {
  const meta = join(here, 'voice', `${id}.json`);
  const file = join(here, 'voice', `${id}.m4a`);
  if (!existsSync(meta) || !existsSync(file)) return null;
  const { segments } = JSON.parse(readFileSync(meta, 'utf8'));
  const texts = JSON.parse(readFileSync(join(here, 'voiceover.json'), 'utf8'))[id] || [];
  if (segments.length !== texts.length) throw new Error(`${id}: ${segments.length} đoạn giọng nhưng voiceover.json có ${texts.length}`);
  return { file, segments, lengths: segments.map((row) => row.end - row.start) };
}

async function record(page, baseUrl, video, frameDir, voice) {
  const recorder = new Recorder(page, frameDir, voice?.lengths || null);
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: false });
  const [first, ...rest] = video.scenes;
  await recorder.load(baseUrl, first);
  await recorder.run({ card: { kicker: 'Hướng dẫn sử dụng · CRM Lê Văn Tám', title: video.title, text: video.intro } }, baseUrl);
  const posterFrame = recorder.frames[0].file;
  for (const [index, scene] of [first, ...rest].entries()) {
    if (index > 0) await recorder.run({ scene }, baseUrl);
    for (const step of scene.steps) await recorder.run(step, baseUrl);
  }
  recorder.state.caption = '';
  await recorder.v('caption()');
  await recorder.v('clearHighlights()');
  await recorder.run({ card: { kicker: 'Hoàn thành', title: video.title, text: video.outro || 'Cảm ơn thầy cô đã theo dõi. Xem thêm hướng dẫn chi tiết bên dưới video.' }, hold: 4 }, baseUrl);
  await recorder.waitForVoice();
  if (voice && recorder.voiceIndex !== voice.lengths.length) {
    throw new Error(`${video.id}: video có ${recorder.voiceIndex} câu phụ đề nhưng giọng đọc có ${voice.lengths.length} đoạn`);
  }
  return { frames: recorder.frames, posterFrame, seconds: recorder.seconds, chapters: recorder.chapters, cues: recorder.cues, clicks: recorder.clicks };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const videos = await loadVideos(args);
  if (!videos.length) {
    console.log('Không có video nào khớp điều kiện.');
    return;
  }
  mkdirSync(outDir, { recursive: true });
  const { default: harnessConfig } = await import(pathToFileURL(join(repoRoot, 'scripts/guide-shots/vite.config.mjs')).href);
  const server = await createServer({ ...harnessConfig, server: { ...harnessConfig.server, port: args.port } });
  await server.listen();
  const baseUrl = `http://127.0.0.1:${args.port}`;
  const chrome = await launchChrome();
  const page = await chrome.newPage();
  await page.init();
  let failures = 0;
  try {
    for (const video of videos) {
      const started = Date.now();
      const frameDir = args.frames ? join(args.frames, video.id) : mkdtempSync(join(tmpdir(), `lvt-video-${video.id}-`));
      rmSync(frameDir, { recursive: true, force: true });
      mkdirSync(frameDir, { recursive: true });
      try {
        const voice = loadVoice(video.id);
        const { frames, posterFrame, seconds, chapters, cues, clicks } = await record(page, baseUrl, video, frameDir, voice);
        const mp4 = join(outDir, `${video.id}.mp4`);
        if (voice) {
          const silent = join(frameDir, 'video.mp4');
          encode(frames, frameDir, silent);
          addAudio({ videoFile: silent, outFile: mp4, dir: frameDir, voiceFile: voice.file, segments: voice.segments, cues, clicks, seconds });
        } else {
          encode(frames, frameDir, mp4);
        }
        poster(posterFrame, join(outDir, `${video.id}.webp`));
        const size = statSync(mp4).size;
        // Real length of the encoded file (frame-rate rounding makes it differ from the timeline).
        const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' }).trim());
        // Read by scripts/build-guide.mjs: title, length and chapter start times.
        writeFileSync(join(outDir, `${video.id}.json`), `${JSON.stringify({ id: video.id, title: video.title, duration: Math.round(duration || seconds), chapters }, null, 2)}\n`);
        const minutes = `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
        console.log(`✓ ${video.id.padEnd(22)} ${minutes.padStart(5)}  ${(size / 1024 / 1024).toFixed(2)} MB  ${frames.length} khung  ${voice ? `giọng đọc ${cues.length} đoạn, ${clicks.length} tiếng bấm` : 'không tiếng'}  ${((Date.now() - started) / 1000).toFixed(0)} s`);
        const errors = page.consoleMessages.filter((line) => /^(error|exception)/.test(line));
        if (errors.length) console.log(`    console: ${errors.slice(0, 4).join(' | ').slice(0, 600)}`);
      } catch (error) {
        failures += 1;
        console.log(`✗ ${video.id}: ${error.message}`);
        const errors = page.consoleMessages.filter((line) => /^(error|exception|warning)/.test(line));
        if (errors.length) console.log(`    console: ${errors.slice(0, 6).join(' | ').slice(0, 1200)}`);
      } finally {
        if (!args.frames) rmSync(frameDir, { recursive: true, force: true });
      }
    }
  } finally {
    await chrome.close();
    await server.close();
  }
  if (failures) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
