#!/usr/bin/env node
// Build public/huong-dan-su-dung.html from docs/guide/ (plain Node, no dependencies).
//
//   npm run guide:build            # writes public/huong-dan-su-dung.html, copies diagrams
//   npm run guide:build -- --check # fail if the committed HTML is out of date
//
// Source layout:
//   docs/guide/outline.json        parts (sections) and topic order, role cards
//   docs/guide/topics/**/<id>.md   one topic per file (front matter + small Markdown subset)
//   docs/guide/diagrams/*.svg      hand-drawn diagrams, copied to public/huong-dan/
//   docs/guide/template.html       page shell; guide.css / guide.js are inlined
//   public/huong-dan/*.webp        screenshots captured by `npm run guide:shots`
//
// Topic file format:
//   ---
//   id: gv-lich-ca-nhan            (= file name)
//   title: Xem lịch công tác của tôi
//   menu: Lịch công tác            (chip)
//   roles: Giáo viên, GVCN         (chips)
//   keywords: extra search words
//   ---
//   First paragraph = one-line purpose.
//   1. Numbered steps; **Nút** bold; [[1]] = round number matching a callout badge.
//   ![Caption, without "Hình N."](image-id)        figure; image-id.webp|svg|png in public/huong-dan
//   ![Caption](image-id-mobile)                      ids ending in -mobile = 2x phone shot, shown narrow
//   consecutive figure lines                          side-by-side row
//   @video-index                                      table of every embedded video (title, length)
//   @video(video-id)  or  @video(video-id "Chương")   tutorial video from public/huong-dan/video
//                                                     (npm run guide:videos), optionally from a chapter
//   ::: tip|warn|danger|note [Tiêu đề]  ...  :::      boxes
//   ### Câu hỏi thường gặp, then "??? Question" + answer lines (until a blank line)
//   | a | b | tables, - bullets, `code`, [link](#topic-id)
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guideDir = join(repoRoot, 'docs/guide');
const imageDir = join(repoRoot, 'public/huong-dan');
const outFile = join(repoRoot, 'public/huong-dan-su-dung.html');
const IMAGE_URL = 'huong-dan';
const videoDir = join(imageDir, 'video');

const problems = [];
const warn = (message) => problems.push(message);

// ---------------------------------------------------------------- helpers

const escapeHtml = (text) => String(text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function slug(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Width/height of a WebP/PNG/SVG file, in image pixels. */
function imageSize(file) {
  const buf = readFileSync(file);
  if (file.endsWith('.svg')) {
    const text = buf.toString('utf8');
    const viewBox = text.match(/viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/);
    if (viewBox) return { width: Math.round(Number(viewBox[1])), height: Math.round(Number(viewBox[2])) };
    const w = text.match(/<svg[^>]*\swidth="([\d.]+)/);
    const h = text.match(/<svg[^>]*\sheight="([\d.]+)/);
    return { width: Math.round(Number(w?.[1] || 800)), height: Math.round(Number(h?.[1] || 450)) };
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  if (buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  throw new Error(`Unknown image format: ${file}`);
}

function findImage(id) {
  for (const ext of ['webp', 'svg', 'png']) {
    const file = join(imageDir, `${id}.${ext}`);
    if (existsSync(file)) return { file, name: `${id}.${ext}` };
  }
  return null;
}

// ---------------------------------------------------------------- markdown subset

function inline(text, ctx) {
  const codes = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      if (href.startsWith('#')) {
        ctx.links.push(href.slice(1));
        return `<a href="${href}">${label}</a>`;
      }
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    })
    .replace(/\[\[(\d+)\]\]/g, '<span class="step-ref" aria-label="số $1">$1</span>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

const FIGURE_RE = /^!\[([^\]]+)\]\(([a-z0-9-]+)(?:\s+"([^"]*)")?\)\s*$/;

function renderFigure(line, ctx) {
  const [, caption, id, flags = ''] = line.match(FIGURE_RE);
  ctx.figureCount.n += 1;
  const n = ctx.figureCount.n;
  const image = findImage(id);
  if (!image) {
    warn(`${ctx.topicId}: thiếu ảnh "${id}"`);
    return `<figure class="figure is-missing"><div class="figure-missing">Ảnh “${escapeHtml(id)}” chưa được tạo</div><figcaption><b>Hình ${n}.</b> ${inline(caption, ctx)}</figcaption></figure>`;
  }
  ctx.usedImages.add(image.name);
  const size = imageSize(image.file);
  const isSvg = image.name.endsWith('.svg');
  // Phone screenshots (390px viewport, captured at 2x) end in "-mobile".
  const phone = /phone/.test(flags) || id.endsWith('-mobile');
  const plainCaption = caption.replace(/\*\*|`|\[\[|\]\]/g, '');
  const alt = `Hình ${n}. ${plainCaption}`;
  const classes = ['figure', phone ? 'is-phone' : '', isSvg ? 'is-diagram' : '', /wide/.test(flags) ? 'is-wide' : '']
    .filter(Boolean)
    .join(' ');
  // Phone shots are captured at 2x; show them at CSS size.
  const scale = phone ? 2 : 1;
  return `<figure class="${classes}" id="hinh-${n}"><button type="button" class="figure-zoom" aria-label="Phóng to hình ${n}"><img src="${IMAGE_URL}/${image.name}" width="${Math.round(size.width / scale)}" height="${Math.round(size.height / scale)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async"></button><figcaption><b>Hình ${n}.</b> ${inline(caption, ctx)}</figcaption></figure>`;
}

const VIDEO_RE = /^@video\(([a-z0-9-]+)(?:\s+"([^"]*)")?\)\s*$/;
const VIDEO_INDEX_RE = /^@video-index\s*$/;
const VIDEO_INDEX_MARK = '<!--VIDEO_INDEX-->';

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** Tutorial video recorded by scripts/guide-videos; `chapter` starts playback at that chapter. */
function renderVideo(line, ctx) {
  const [, id, chapter] = line.match(VIDEO_RE);
  const metaFile = join(videoDir, `${id}.json`);
  if (!existsSync(metaFile) || !existsSync(join(videoDir, `${id}.mp4`))) {
    warn(`${ctx.topicId}: thiếu video "${id}" (npm run guide:videos)`);
    return `<figure class="guide-video is-missing"><div class="figure-missing">Video “${escapeHtml(id)}” chưa được tạo</div></figure>`;
  }
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  const chapters = meta.chapters || [];
  const from = chapter ? chapters.find((row) => row.title === chapter) : null;
  if (chapter && !from) warn(`${ctx.topicId}: video "${id}" không có chương "${chapter}"`);
  ctx.usedVideos.add(id);
  // The index links each video to the first topic that shows it from the start (else any).
  const known = ctx.videoTopics.get(id);
  if (!known || (known.chapter && !from)) ctx.videoTopics.set(id, { topicId: ctx.topicId, title: meta.title, duration: meta.duration, chapters: chapters.length, chapter: Boolean(from) });
  const start = from ? from.start : 0;
  const src = `${IMAGE_URL}/video/${id}.mp4${start ? `#t=${start}` : ''}`;
  const chapterButtons = chapters.length > 1
    ? `<div class="video-chapters" aria-label="Các phần của video">${chapters
      .map((row) => `<button type="button" data-seek="${row.start}"${row === from ? ' aria-current="true"' : ''}><span>${clock(row.start)}</span>${escapeHtml(row.title)}</button>`)
      .join('')}</div>`
    : '';
  const label = from ? ` · bắt đầu từ phần “${escapeHtml(from.title)}”` : '';
  return `<figure class="guide-video"><video controls playsinline preload="none" width="1280" height="720" poster="${IMAGE_URL}/video/${id}.webp" src="${src}" aria-label="Video hướng dẫn: ${escapeHtml(meta.title)}"></video><figcaption><b>Video hướng dẫn:</b> ${escapeHtml(meta.title)} (${clock(meta.duration)})${label}. Bấm ▶ để xem; có thể tua, tạm dừng và xem toàn màn hình.</figcaption>${chapterButtons}</figure>`;
}

function renderTable(lines, ctx) {
  const rows = lines.map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  const [head, , ...body] = rows;
  return `<div class="table-wrap"><table><thead><tr>${head.map((cell) => `<th scope="col">${inline(cell, ctx)}</th>`).join('')}</tr></thead><tbody>${body
    .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell, ctx)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

const BOX_TITLES = { tip: 'Mẹo', warn: 'Lưu ý', danger: 'Cảnh báo', note: 'Ghi chú' };
const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const BOX_ICONS = {
  tip: svgIcon('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>'),
  warn: svgIcon('<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>'),
  danger: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>'),
  note: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
};

function renderBlocks(lines, ctx) {
  const html = [];
  let i = 0;
  const isBlank = (line) => !line || !line.trim();
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i += 1;
      continue;
    }
    // ::: tip|warn|danger|note [title]
    const box = line.match(/^:::\s*(tip|warn|danger|note)\s*(.*)$/);
    if (box) {
      const inner = [];
      i += 1;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) inner.push(lines[i++]);
      i += 1;
      const kind = box[1];
      const title = box[2] || BOX_TITLES[kind];
      html.push(`<aside class="callout callout-${kind}"><p class="callout-title">${BOX_ICONS[kind]}<span>${inline(title, ctx)}</span></p>${renderBlocks(inner, ctx)}</aside>`);
      continue;
    }
    // ??? FAQ question  (answer = following lines until blank line or next ???)
    if (line.startsWith('??? ')) {
      const question = line.slice(4).trim();
      const answer = [];
      i += 1;
      while (i < lines.length && !isBlank(lines[i]) && !lines[i].startsWith('??? ')) answer.push(lines[i++]);
      html.push(`<details class="faq"><summary>${inline(question, ctx)}</summary><div class="faq-answer">${renderBlocks(answer, ctx)}</div></details>`);
      continue;
    }
    const heading = line.match(/^(#{3,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length + 1; // ### -> h4 (topic title is h3)
      html.push(`<h${level}>${inline(heading[2], ctx)}</h${level}>`);
      i += 1;
      continue;
    }
    if (VIDEO_INDEX_RE.test(line)) {
      html.push(VIDEO_INDEX_MARK);
      i += 1;
      continue;
    }
    if (VIDEO_RE.test(line)) {
      html.push(renderVideo(line, ctx));
      i += 1;
      continue;
    }
    if (FIGURE_RE.test(line)) {
      const figures = [];
      while (i < lines.length && FIGURE_RE.test(lines[i])) figures.push(renderFigure(lines[i++], ctx));
      html.push(figures.length > 1 ? `<div class="figure-row">${figures.join('')}</div>` : figures[0]);
      continue;
    }
    if (line.trim().startsWith('|') && lines[i + 1]?.trim().match(/^\|?\s*:?-{3,}/)) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      html.push(renderTable(rows, ctx));
      continue;
    }
    const listMatch = line.match(/^(\s*)(\d+\.|[-*])\s+/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[2]);
      const items = [];
      while (i < lines.length) {
        const current = lines[i];
        const m = current.match(/^(\s*)(\d+\.|[-*])\s+(.*)$/);
        if (m && m[1].length === 0 && /\d/.test(m[2]) === ordered) {
          items.push({ text: m[3], children: [] });
          i += 1;
        } else if (!isBlank(current) && /^\s{2,}/.test(current) && items.length) {
          items[items.length - 1].children.push(current.replace(/^\s{2,4}/, ''));
          i += 1;
        } else if (isBlank(current) && lines[i + 1] && /^\s{2,}\S/.test(lines[i + 1]) && items.length) {
          i += 1;
        } else {
          break;
        }
      }
      const tag = ordered ? 'ol' : 'ul';
      const start = ordered ? Number(listMatch[2].replace('.', '')) : 1;
      html.push(`<${tag} class="${ordered ? 'steps' : 'bullets'}"${ordered && start !== 1 ? ` start="${start}" style="counter-reset: step ${start - 1}"` : ''}>${items
        .map((item) => {
          const childHtml = item.children.length ? renderBlocks(item.children, ctx) : '';
          return `<li>${inline(item.text, ctx)}${childHtml}</li>`;
        })
        .join('')}</${tag}>`);
      continue;
    }
    const paragraph = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !/^(:::|\?\?\? |#{3,4}\s|\s*(\d+\.|[-*])\s)/.test(lines[i]) &&
      !FIGURE_RE.test(lines[i]) &&
      !VIDEO_RE.test(lines[i]) &&
      !VIDEO_INDEX_RE.test(lines[i]) &&
      !lines[i].trim().startsWith('|')
    ) paragraph.push(lines[i++].trim());
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '), ctx)}</p>`);
    else i += 1;
  }
  return html.join('\n');
}

// ---------------------------------------------------------------- topics

function parseTopic(file) {
  const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${relative(repoRoot, file)}: thiếu front matter (--- ... ---)`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([a-z]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  if (!meta.id || !meta.title) throw new Error(`${relative(repoRoot, file)}: front matter cần id và title`);
  if (meta.id !== basename(file, '.md')) warn(`${relative(repoRoot, file)}: id "${meta.id}" khác tên file`);
  return { ...meta, file, body: match[2] };
}

function renderTopic(topic, ctx) {
  const lines = topic.body.split('\n');
  // First paragraph = purpose (lead).
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i += 1;
  const lead = [];
  while (i < lines.length && lines[i].trim() && !/^(:::|\?\?\? |#|\s*(\d+\.|[-*])\s|!\[|@video|\|)/.test(lines[i])) lead.push(lines[i++].trim());
  ctx.topicId = topic.id;
  const body = renderBlocks(lines.slice(i), ctx);
  const chips = [
    topic.menu ? `<span class="chip chip-menu">${escapeHtml(topic.menu)}</span>` : '',
    ...(topic.roles ? topic.roles.split(',').map((role) => `<span class="chip">${escapeHtml(role.trim())}</span>`) : []),
  ].join('');
  return `<article class="topic" id="${topic.id}" data-keywords="${escapeHtml(topic.keywords || '')}">
<header class="topic-head"><h3><a class="topic-anchor" href="#${topic.id}">${escapeHtml(topic.title)}</a></h3>${chips ? `<div class="chips">${chips}</div>` : ''}</header>
${lead.length ? `<p class="lead">${inline(lead.join(' '), ctx)}</p>` : ''}
${body}
</article>`;
}

// ---------------------------------------------------------------- build

function build() {
  const outline = JSON.parse(readFileSync(join(guideDir, 'outline.json'), 'utf8'));
  const topicFiles = walk(join(guideDir, 'topics')).filter((file) => file.endsWith('.md'));
  const topics = new Map();
  for (const file of topicFiles) {
    const topic = parseTopic(file);
    if (topics.has(topic.id)) throw new Error(`Trùng id chủ đề: ${topic.id}`);
    topics.set(topic.id, topic);
  }

  // Self-host the app font (Montserrat, OFL) for the static page.
  const fontSource = join(repoRoot, 'node_modules/@fontsource-variable/montserrat/files');
  const fontTarget = join(imageDir, 'fonts');
  if (existsSync(fontSource)) {
    mkdirSync(fontTarget, { recursive: true });
    for (const subset of ['latin', 'latin-ext', 'vietnamese']) {
      copyFileSync(join(fontSource, `montserrat-${subset}-wght-normal.woff2`), join(fontTarget, `montserrat-${subset}-wght-normal.woff2`));
    }
  }

  // Copy diagrams so they are served next to screenshots.
  for (const file of walk(join(guideDir, 'diagrams')).filter((f) => f.endsWith('.svg'))) {
    copyFileSync(file, join(imageDir, basename(file)));
  }

  const used = new Set();
  const parts = outline.parts.map((part) => ({ ...part, topics: [...part.topics] }));
  for (const part of parts) {
    for (const id of part.topics) {
      if (!topics.has(id)) warn(`outline: chủ đề "${id}" không có file`);
      used.add(id);
    }
  }
  const orphans = [...topics.keys()].filter((id) => !used.has(id));
  if (orphans.length) {
    warn(`chủ đề chưa có trong outline.json: ${orphans.join(', ')}`);
    parts.push({ id: 'chua-xep', title: 'Chưa xếp mục', intro: 'Các chủ đề chưa được đưa vào outline.json.', topics: orphans });
  }

  const ctx = { figureCount: { n: 0 }, usedImages: new Set(), usedVideos: new Set(), videoTopics: new Map(), links: [], topicId: '' };
  const toc = [];
  const sections = [];
  parts.forEach((part, index) => {
    const partTopics = part.topics.filter((id) => topics.has(id)).map((id) => topics.get(id));
    const rendered = partTopics.map((topic) => renderTopic(topic, ctx)).join('\n');
    const number = index + 1;
    toc.push(`<li class="toc-part" data-part="${part.id}"><a href="#${part.id}"><span class="toc-num">${number}</span>${escapeHtml(part.title)}</a><ol>${partTopics
      .map((topic) => `<li data-topic="${topic.id}"><a href="#${topic.id}">${escapeHtml(topic.title)}</a></li>`)
      .join('')}</ol></li>`);
    sections.push(`<section class="part" id="${part.id}" aria-labelledby="${part.id}-title">
<header class="part-head"><p class="part-kicker">Phần ${number}${part.kicker ? ` · ${escapeHtml(part.kicker)}` : ''}</p><h2 id="${part.id}-title">${escapeHtml(part.title)}</h2>${part.intro ? `<p>${inline(part.intro, ctx)}</p>` : ''}</header>
${rendered}
</section>`);
  });

  const videoRows = [...ctx.videoTopics.entries()].map(([, row]) => `<tr><td><a href="#${row.topicId}">${escapeHtml(row.title)}</a></td><td>${clock(row.duration)}</td><td>${row.chapters > 1 ? `${row.chapters} phần` : '—'}</td></tr>`);
  const videoIndex = `<div class="table-wrap"><table><thead><tr><th scope="col">Video</th><th scope="col">Thời lượng</th><th scope="col">Chia phần</th></tr></thead><tbody>${videoRows.join('')}</tbody></table></div>`;
  for (let k = 0; k < sections.length; k += 1) sections[k] = sections[k].replace(VIDEO_INDEX_MARK, () => videoIndex);

  const allIds = new Set([...topics.keys(), ...parts.map((part) => part.id)]);
  for (const link of ctx.links) {
    if (!allIds.has(link) && !link.startsWith('hinh-') && link !== 'top') warn(`liên kết hỏng: #${link}`);
  }

  const roleCards = (outline.roles || [])
    .map((role) => `<a class="role-card" href="#${role.part}"><span class="role-icon" aria-hidden="true">${role.icon}</span><strong>${escapeHtml(role.title)}</strong><small>${escapeHtml(role.text)}</small></a>`)
    .join('');

  const template = readFileSync(join(guideDir, 'template.html'), 'utf8');
  const css = readFileSync(join(guideDir, 'guide.css'), 'utf8');
  const js = readFileSync(join(guideDir, 'guide.js'), 'utf8');
  const html = template
    .replace('/*{{CSS}}*/', () => css.trim())
    .replace('/*{{JS}}*/', () => js.trim())
    .replace('{{UPDATED}}', () => escapeHtml(outline.updated || ''))
    .replace('{{ROLE_CARDS}}', () => roleCards)
    .replace('{{TOC}}', () => toc.join('\n'))
    .replace('{{CONTENT}}', () => sections.join('\n'))
    .replace('{{TOPIC_COUNT}}', () => String([...used].filter((id) => topics.has(id)).length + orphans.length))
    .replace('{{FIGURE_COUNT}}', () => String(ctx.figureCount.n));

  const unusedImages = readdirSync(imageDir).filter((name) => /\.(webp|svg|png)$/.test(name) && !ctx.usedImages.has(name));
  const videos = existsSync(videoDir) ? readdirSync(videoDir).filter((name) => name.endsWith('.mp4')).map((name) => name.slice(0, -4)) : [];
  for (const id of videos) if (!ctx.usedVideos.has(id)) warn(`video không được dùng: ${id}`);
  return { html, figureCount: ctx.figureCount.n, topicCount: topics.size, unusedImages, videoCount: ctx.usedVideos.size };
}

const check = process.argv.includes('--check');
const result = build();
for (const message of problems) console.warn(`! ${message}`);
if (result.unusedImages.length) console.warn(`! ảnh không được dùng: ${result.unusedImages.join(', ')}`);
if (check) {
  const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
  if (current !== result.html) {
    console.error('public/huong-dan-su-dung.html chưa cập nhật. Chạy: npm run guide:build');
    process.exit(1);
  }
  console.log('Hướng dẫn đã cập nhật.');
} else {
  writeFileSync(outFile, result.html);
  const imageBytes = readdirSync(imageDir).filter((name) => /\.(webp|svg|png)$/.test(name)).reduce((sum, name) => sum + statSync(join(imageDir, name)).size, 0);
  const videoBytes = existsSync(videoDir) ? readdirSync(videoDir).filter((name) => name.endsWith('.mp4')).reduce((sum, name) => sum + statSync(join(videoDir, name)).size, 0) : 0;
  console.log(`Đã ghi public/huong-dan-su-dung.html: ${result.topicCount} chủ đề, ${result.figureCount} hình, ${result.videoCount} video, ${(Buffer.byteLength(result.html) / 1024).toFixed(0)} KB HTML, ảnh ${(imageBytes / 1024 / 1024).toFixed(2)} MB, video ${(videoBytes / 1024 / 1024).toFixed(2)} MB.`);
}
