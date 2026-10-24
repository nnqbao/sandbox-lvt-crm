#!/usr/bin/env python3
"""Split one narration take per video into its voice-over segments using speech recognition.

    python3 scripts/guide-videos/asr-align.py lh-lop-hoc ~/Downloads/lh-lop-hoc.wav [more id file pairs]

Needs `pip install faster-whisper` (any venv) and ffmpeg. More reliable than the pause-only
fallback (npm run guide:voice): the TTS pauses inside sentences about as long as between
segments, so pauses alone cannot tell where a segment ends. Here faster-whisper ("small" model)
times every spoken word, the transcript is matched word by word to voiceover.json, and each
segment boundary is placed in the middle of the silence between the previous segment's last
word and this segment's first word.

Writes scripts/guide-videos/voice/<id>.m4a (AAC mono) and <id>.json (segment start/end seconds,
same format as align-voice.mjs) and prints, per segment, how much of its text was heard inside
its window (flag < 60%: listen to it).
"""
import difflib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

HERE = Path(__file__).resolve().parent
VOICE_DIR = HERE / 'voice'


def norm(word):
    return re.sub(r'[^\w]', '', unicodedata.normalize('NFC', word.lower()))


def pauses(file, noise='-35dB', minimum=0.15):
    run = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(file), '-af', f'silencedetect=noise={noise}:d={minimum}', '-f', 'null', '-'],
                         capture_output=True, text=True)
    out, start = [], None
    for line in run.stderr.splitlines():
        m = re.search(r'silence_start: (-?[\d.]+)', line)
        if m:
            start = max(0.0, float(m.group(1)))
        m = re.search(r'silence_end: ([\d.]+) \| silence_duration: ([\d.]+)', line)
        if m:
            out.append((start or 0.0, float(m.group(1))))
    return out


def duration(file):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(file)],
                                capture_output=True, text=True, check=True).stdout)


def align(model, texts, file):
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(file), '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'],
                         capture_output=True, check=True).stdout
    segs, _ = model.transcribe(np.frombuffer(pcm, dtype=np.float32), language='vi', word_timestamps=True, beam_size=5)
    heard = [(norm(w.word), w.start, w.end) for s in segs for w in s.words if norm(w.word)]
    expected = [(norm(word), i) for i, text in enumerate(texts) for word in text.split() if norm(word)]
    matcher = difflib.SequenceMatcher(a=[w for w, _ in expected], b=[w for w, _, _ in heard], autojunk=False)
    match = {}
    for a, b, n in matcher.get_matching_blocks():
        for k in range(n):
            match[a + k] = b + k
    total = duration(file)
    silence = pauses(file)
    lead = silence[0][1] if silence and silence[0][0] <= 0.05 else 0.0
    tail = silence[-1][0] if silence and silence[-1][1] >= total - 0.05 else total

    def first_word(i):
        for j, (_, seg) in enumerate(expected):
            if seg == i and j in match:
                return heard[match[j]][1]
        return None

    def last_word(i):
        for j in range(len(expected) - 1, -1, -1):
            if expected[j][1] == i and j in match:
                return heard[match[j]][2]
        return None

    bounds = [lead]
    for i in range(1, len(texts)):
        start, end = first_word(i), last_word(i - 1)
        if start is None or end is None:
            raise SystemExit(f'đoạn {i}: không nghe ra chữ đầu/cuối, hãy tạo lại đoạn này')
        lo, hi = min(end, start), max(end, start)
        # The silence overlapping [last word of i-1, first word of i] the most (Whisper times are ±0.3 s).
        best, overlap = None, 0.0
        for a, b in silence:
            o = min(b, hi + 0.3) - max(a, lo - 0.3)
            if o > overlap:
                best, overlap = (a, b), o
        bounds.append(round(((best[0] + best[1]) / 2) if best else (lo + hi) / 2, 3))
    bounds.append(tail)
    report = []
    for i, text in enumerate(texts):
        a, b = bounds[i], bounds[i + 1]
        inside = [w for w, s, e in heard if s >= a - 0.1 and e <= b + 0.1]
        want = [norm(w) for w in text.split() if norm(w)]
        ratio = difflib.SequenceMatcher(a=want, b=inside, autojunk=False).ratio()
        report.append((i, a, b, ratio))
    return [{'start': bounds[i], 'end': bounds[i + 1]} for i in range(len(texts))], report


def main(argv):
    if len(argv) < 2 or len(argv) % 2:
        raise SystemExit(__doc__)
    voice = json.loads((HERE / 'voiceover.json').read_text())
    model = WhisperModel('small', device='cpu', compute_type='int8')
    VOICE_DIR.mkdir(exist_ok=True)
    for vid, file in zip(argv[0::2], argv[1::2]):
        texts = voice[vid]
        segments, report = align(model, texts, Path(file).expanduser())
        flagged = 0
        for i, a, b, ratio in report:
            bad = ratio < 0.6
            flagged += bad
            print(f'{vid}-{i:02d} {a:7.2f}–{b:7.2f} nghe được {ratio:4.0%}{"  ← nghe lại" if bad else ""}  {texts[i][:48]}')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(file), '-ac', '1', '-ar', '24000', '-c:a', 'aac', '-b:a', '64k',
                        str(VOICE_DIR / f'{vid}.m4a')], check=True)
        (VOICE_DIR / f'{vid}.json').write_text(json.dumps({'id': vid, 'source': 'Google AI Studio TTS', 'aligned': 'faster-whisper small',
                                                            'segments': segments}, ensure_ascii=False, indent=2) + '\n')
        print(f'{vid}: {len(segments)} đoạn, {flagged} cần nghe lại\n')


if __name__ == '__main__':
    main(sys.argv[1:])
