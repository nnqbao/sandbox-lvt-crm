#!/usr/bin/env node
// Split one narration file per video into its voice-over segments (scripts/guide-videos/voiceover.json).
//
//   npm run guide:voice -- lh-lop-hoc ~/Downloads/lh-lop-hoc.wav
//
// The TTS reads every segment of a video in one take with a pause between segments, but it also
// pauses inside sentences, so the longest pauses alone do not mark segment ends. Dynamic programming
// picks the boundaries (among detected pauses) whose lengths best match the text, sentence by
// sentence (every sentence ends on a pause), preferring longer pauses. Output:
//   scripts/guide-videos/voice/<id>.m4a   the narration, AAC mono (small enough to commit)
//   scripts/guide-videos/voice/<id>.json  segment start/end seconds, in voiceover.json order
// The table it prints flags segments whose length is far from the expected one: listen to those.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const voiceDir = join(here, 'voice');

/** Pauses in an audio file: [{ start, end, length }] (seconds). */
export function detectPauses(file, { noise = '-35dB', min = 0.15 } = {}) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', `silencedetect=noise=${noise}:d=${min}`, '-f', 'null', '-'], { encoding: 'utf8' });
  const pauses = [];
  let start = null;
  for (const line of run.stderr.split('\n')) {
    const begin = line.match(/silence_start: (-?[\d.]+)/);
    if (begin) start = Math.max(0, Number(begin[1]));
    const end = line.match(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/);
    if (end) pauses.push({ start: start ?? 0, end: Number(end[1]), length: Number(end[2]) });
  }
  return pauses;
}

/**
 * Choose segment boundaries. texts: the segments' words; returns [{ start, end }] per text.
 * Cost per segment: log(actual / expected length)^2, minus `pauseWeight` × the pause it ends on.
 */
export function alignSegments(texts, pauses, total, { pauseWeight = 2 } = {}) {
  const lead = pauses.length && pauses[0].start <= 0.05 ? pauses[0].end : 0;
  const last = pauses[pauses.length - 1];
  const tail = last && last.end >= total - 0.05 ? last.start : total;
  const inner = pauses.filter((p) => p.start > 0.05 && p.end < total - 0.05);
  const chars = texts.map((text) => text.length);
  const rate = chars.reduce((a, b) => a + b, 0) / (tail - lead);
  const pos = [lead, ...inner.map((p) => (p.start + p.end) / 2), tail];
  const gap = [0, ...inner.map((p) => p.length), 0];
  const n = texts.length;
  const m = inner.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 2).fill(Infinity));
  const back = Array.from({ length: n + 1 }, () => new Array(m + 2).fill(-1));
  dp[0][0] = 0;
  for (let k = 1; k <= n; k += 1) {
    const expected = chars[k - 1] / rate;
    const ends = k === n ? [m + 1] : Array.from({ length: m }, (_, j) => j + 1);
    for (const j of ends) {
      for (let i = 0; i < j; i += 1) {
        if (dp[k - 1][i] === Infinity) continue;
        const length = pos[j] - pos[i];
        if (length <= 0.3) continue;
        const cost = dp[k - 1][i] + Math.log(length / expected) ** 2 - (j <= m ? pauseWeight * gap[j] : 0);
        if (cost < dp[k][j]) {
          dp[k][j] = cost;
          back[k][j] = i;
        }
      }
    }
  }
  if (dp[n][m + 1] === Infinity) throw new Error('Không đủ khoảng nghỉ để chia đoạn');
  const bounds = [m + 1];
  for (let k = n, j = m + 1; k > 0; k -= 1) {
    j = back[k][j];
    bounds.unshift(j);
  }
  return texts.map((text, k) => {
    const start = pos[bounds[k]];
    const end = pos[bounds[k + 1]];
    const expected = chars[k] / rate;
    return { start: Math.round(start * 1000) / 1000, end: Math.round(end * 1000) / 1000, expected: Math.round(expected * 100) / 100 };
  });
}

/** Sentences of a segment (TTS pauses after each), at least one per segment. */
export function sentences(text) {
  const parts = String(text).split(/(?<=[.?!])\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : [String(text)];
}

/**
 * Sentence-level alignment: every sentence must end on a pause, which pins the segment boundaries
 * far more firmly than segment lengths alone. Returns the same shape as alignSegments.
 */
export function alignBySentences(texts, pauses, total, options = {}) {
  const units = [];
  texts.forEach((text, segment) => sentences(text).forEach((sentence) => units.push({ segment, text: sentence })));
  const timed = alignSegments(units.map((unit) => unit.text), pauses, total, { pauseWeight: 0.6, ...options });
  return texts.map((text, segment) => {
    const mine = timed.filter((_, k) => units[k].segment === segment);
    return {
      start: mine[0].start,
      end: mine[mine.length - 1].end,
      expected: Math.round(mine.reduce((sum, row) => sum + row.expected, 0) * 100) / 100,
    };
  });
}

function main() {
  const [id, input] = process.argv.slice(2);
  if (!id || !input) throw new Error('Dùng: npm run guide:voice -- <video-id> <file giọng đọc>');
  const texts = JSON.parse(readFileSync(join(here, 'voiceover.json'), 'utf8'))[id];
  if (!texts) throw new Error(`voiceover.json không có video ${id}`);
  const file = resolve(input);
  const total = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }));
  const segments = alignBySentences(texts, detectPauses(file), total);
  let flagged = 0;
  segments.forEach((segment, k) => {
    const length = segment.end - segment.start;
    const off = Math.abs(length - segment.expected) / segment.expected > 0.35;
    if (off) flagged += 1;
    console.log(`${String(k).padStart(2, '0')} ${segment.start.toFixed(2).padStart(7)}–${segment.end.toFixed(2).padStart(7)} ${length.toFixed(2).padStart(5)}s (dự kiến ${segment.expected.toFixed(2)}s)${off ? '  ← nghe lại' : ''}  ${texts[k].slice(0, 50)}`);
  });
  mkdirSync(voiceDir, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', '24000', '-c:a', 'aac', '-b:a', '64k', join(voiceDir, `${id}.m4a`)]);
  writeFileSync(join(voiceDir, `${id}.json`), `${JSON.stringify({ id, source: 'Google AI Studio TTS', segments: segments.map(({ start, end }) => ({ start, end })) }, null, 2)}\n`);
  console.log(`\n${segments.length} đoạn, ${flagged} đoạn cần nghe lại → scripts/guide-videos/voice/${id}.m4a + .json`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
