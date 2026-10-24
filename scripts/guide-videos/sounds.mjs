// Original, deterministic sounds for the guide videos (no third-party audio, no licence to track):
//   writeMusic(file, seconds)  a calm background loop: soft pad, electric-piano arpeggio and bass
//                              over Cmaj7 – Am7 – Fmaj7 – G6, 76 BPM
//   writeClick(file)           a two-part mouse click (press + release)
// Output: 16-bit PCM mono WAV at 48 kHz.
import { writeFileSync } from 'node:fs';

const RATE = 48000;

function writeWav(file, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([header, data]));
}

const midi = (note) => 440 * 2 ** ((note - 69) / 12);

/** Small deterministic PRNG so every build renders the same bytes. */
function noise(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 31 - 1;
  };
}

// Cmaj7, Am7, Fmaj7, G6 — two bars each.
const CHORDS = [
  { root: 36, tones: [60, 64, 67, 71] },
  { root: 45, tones: [57, 60, 64, 67] },
  { root: 41, tones: [53, 57, 60, 64] },
  { root: 43, tones: [55, 59, 62, 64] },
];
const BPM = 76;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const ARP = [0, 1, 2, 3, 2, 1, 2, 3]; // eighth notes across a bar

export function renderMusic(seconds) {
  const length = Math.ceil(seconds * RATE);
  const out = new Float32Array(length);
  // `until` caps a note (seconds); its last `release` seconds fade out.
  const add = (start, freqs, gain, attack, decay, harmonics, sustain = 0, until = attack + decay * 6, release = 0.05) => {
    const from = Math.floor(start * RATE);
    const span = Math.min(length - from, Math.floor(until * RATE));
    for (let i = 0; i < span; i += 1) {
      const t = i / RATE;
      let env = t < attack ? t / attack : sustain + (1 - sustain) * Math.exp(-(t - attack) / decay);
      if (t > until - release) env *= Math.max(0, (until - t) / release);
      let value = 0;
      for (const freq of freqs) {
        for (const [multiple, level] of harmonics) value += level * Math.sin(2 * Math.PI * freq * multiple * t);
      }
      out[from + i] += gain * env * value;
    }
  };
  for (let bar = 0; bar * BAR < seconds; bar += 1) {
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const start = bar * BAR;
    if (bar % 2 === 0) {
      // Pad: the chord an octave down, slow swell, held over both bars.
      add(start, chord.tones.map((note) => midi(note - 12)), 0.035, 1.2, BAR * 0.9, [[1, 1], [2, 0.18], [1.003, 0.6]], 0.35, BAR * 2 + 1.2, 1.4);
    }
    // Bass: root on beats 1 and 3.
    add(start, [midi(chord.root)], 0.09, 0.02, 0.9, [[1, 1], [2, 0.35]]);
    add(start + BEAT * 2, [midi(chord.root)], 0.06, 0.02, 0.7, [[1, 1], [2, 0.35]]);
    // Electric-piano arpeggio: soft, a little brighter on the downbeat.
    ARP.forEach((index, n) => {
      const gain = n === 0 ? 0.075 : 0.055;
      add(start + n * (BEAT / 2), [midi(chord.tones[index] + 12)], gain, 0.006, 0.42, [[1, 1], [2, 0.35], [3, 0.12], [4.01, 0.05]]);
    });
  }
  // Room: two short feedback echoes, then normalise to a gentle peak.
  for (const [delay, feedback] of [[0.113, 0.28], [0.197, 0.22]]) {
    const offset = Math.floor(delay * RATE);
    for (let i = offset; i < length; i += 1) out[i] += out[i - offset] * feedback;
  }
  let peak = 0;
  for (const value of out) peak = Math.max(peak, Math.abs(value));
  const scale = peak ? 0.6 / peak : 1;
  for (let i = 0; i < length; i += 1) out[i] *= scale;
  return out;
}

export function renderClick() {
  const length = Math.floor(0.12 * RATE);
  const out = new Float32Array(length);
  const random = noise(7);
  const burst = (at, gain, tone) => {
    const from = Math.floor(at * RATE);
    for (let i = 0; i < Math.floor(0.018 * RATE); i += 1) {
      const t = i / RATE;
      const env = Math.exp(-t / 0.0025);
      out[from + i] += gain * env * (0.75 * random() + 0.6 * Math.sin(2 * Math.PI * tone * t));
    }
  };
  burst(0, 0.9, 3400); // press
  burst(0.075, 0.55, 4200); // release
  // Gentle high-pass (remove thump) by differencing.
  for (let i = length - 1; i > 0; i -= 1) out[i] -= 0.85 * out[i - 1];
  let peak = 0;
  for (const value of out) peak = Math.max(peak, Math.abs(value));
  for (let i = 0; i < length; i += 1) out[i] *= 0.9 / peak;
  return out;
}

export function writeMusic(file, seconds) {
  writeWav(file, renderMusic(seconds));
}

export function writeClick(file) {
  writeWav(file, renderClick());
}
