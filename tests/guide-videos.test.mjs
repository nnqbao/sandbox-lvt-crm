import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { parseByteRange, staticEtag } from '../scripts/lib/static-range.mjs';
import { readTime } from '../scripts/guide-videos/run.mjs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const VIDEO_DIR = new URL('../public/huong-dan/video/', import.meta.url);
const VIDEOS = ['dd-diem-danh', 'lh-lop-hoc', 'nh-thiet-lap-nam-hoc', 'tl-giao-vien', 'tl-lich-day', 'tl-loai-kiem-tra', 'tl-mon-hoc'];

test('byte ranges: single ranges served, malformed ignored, out of range refused', () => {
  assert.deepEqual(parseByteRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseByteRange('bytes=900-', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseByteRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseByteRange('bytes=0-5000', 1000), { start: 0, end: 999 });
  assert.equal(parseByteRange(undefined, 1000), null);
  assert.equal(parseByteRange('bytes=0-1,5-6', 1000), null, 'multi-range falls back to the whole file');
  assert.equal(parseByteRange('items=0-1', 1000), null);
  assert.deepEqual(parseByteRange('bytes=1000-', 1000), { unsatisfiable: true });
  assert.deepEqual(parseByteRange('bytes=50-10', 1000), { unsatisfiable: true });
  assert.deepEqual(parseByteRange('bytes=-0', 1000), { unsatisfiable: true });
  assert.equal(staticEtag({ size: 255, mtimeMs: 4096.7 }), '"ff-1000"');
});

test('the static server answers MP4 with ranges and revalidation', () => {
  const server = read('scripts/serve-production.mjs');
  assert.match(server, /\['\.mp4', 'video\/mp4'\]/);
  assert.match(server, /if \(extension === '\.mp4'\) \{\n\s+await serveStaticMedia\(request, response, filePath\);/);
  assert.match(server, /response\.writeHead\(range \? 206 : 200\)/);
  assert.match(server, /'Content-Range': `bytes \*\/\$\{info\.size\}`/);
  assert.match(read('src/help/PageHelpButton.jsx'), /allow="fullscreen"\n\s+allowFullScreen/, 'videos can go fullscreen inside the help panel');
});

test('every tutorial video ships with a poster and chapter metadata, and the guide embeds it', () => {
  const files = new Set(readdirSync(VIDEO_DIR));
  const html = read('public/huong-dan-su-dung.html');
  for (const id of VIDEOS) {
    for (const ext of ['mp4', 'webp', 'json']) assert.ok(files.has(`${id}.${ext}`), `${id}.${ext}`);
    const meta = JSON.parse(readFileSync(new URL(`${id}.json`, VIDEO_DIR), 'utf8'));
    assert.equal(meta.id, id);
    assert.ok(meta.duration > 30 && meta.duration < 420, `${id}: ${meta.duration}s`);
    for (const chapter of meta.chapters) assert.ok(chapter.start >= 0 && chapter.start < meta.duration);
    assert.ok(html.includes(`src="huong-dan/video/${id}.mp4`), `${id} embedded`);
  }
  assert.doesNotMatch(html, /Video “[^”]+” chưa được tạo/);
  assert.match(html, /lh-lop-hoc\.mp4#t=\d/, 'tab topics start the Lớp học video at their chapter');
  assert.ok(existsSync(new URL('../docs/guide/topics/start/video-huong-dan.md', import.meta.url)));
  // The "?" help panel opens the GUIDE_ANCHORS topic of each page: those must show the video too.
  for (const [topic, id] of [['menu-lop-chu-nhiem', 'lh-lop-hoc'], ['menu-diem-danh', 'dd-diem-danh'], ['nh-thiet-lap-nam-hoc', 'nh-thiet-lap-nam-hoc'], ['tl-giao-vien', 'tl-giao-vien'], ['tl-lich-day', 'tl-lich-day'], ['tl-mon-hoc', 'tl-mon-hoc'], ['tl-loai-kiem-tra', 'tl-loai-kiem-tra']]) {
    const article = html.slice(html.indexOf(`<article class="topic" id="${topic}"`), html.indexOf('</article>', html.indexOf(`<article class="topic" id="${topic}"`)));
    assert.ok(article.includes(`huong-dan/video/${id}.mp4`), `help panel topic ${topic} embeds ${id}`);
  }
});

test('captions stay on screen long enough to read', () => {
  assert.equal(readTime('ngắn'), 3);
  assert.ok(readTime('x'.repeat(100)) >= 7.5);
  assert.equal(readTime('x'.repeat(400)), 9);
});

test('the mock timetable editor order matches the app: effective date first, then ticks', () => {
  // TimetableEditor clears the draft when "Áp dụng từ ngày" changes, so guides must say date first.
  assert.match(read('src/teaching/TimetableEditor.jsx'), /setEffectiveFrom\(clamp\(event\.target\.value, year\)\);\n\s+setDraft\(new Map\(\)\);/);
  const giaoVien = read('docs/guide/topics/settings/tl-giao-vien.md');
  assert.ok(giaoVien.indexOf('**Áp dụng từ ngày** [[4]] **trước khi tick**') < giaoVien.indexOf('Tick ô [[1]]'));
  const lichDay = read('docs/guide/topics/settings/tl-lich-day.md');
  assert.ok(lichDay.indexOf('**trước khi đổi ô**') < lichDay.indexOf('Ở mỗi ô (thứ × tiết)'));
});
