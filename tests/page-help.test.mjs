import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ACCOUNT_MENU_IDS,
  GUIDE_ANCHORS,
  GUIDE_PATH,
  PRIMARY_MENUS,
  SUPREME_SETTINGS,
  guideAnchorForMenu,
  guideEmbedUrl,
  guideFullUrl,
  menuLabel,
} from '../src/navigationRoutes.js';
import { SAME_ORIGIN_FRAMEABLE_PATHS, staticFrameHeaders } from '../scripts/lib/static-frame-policy.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const outline = JSON.parse(read('docs/guide/outline.json'));
const outlineIds = new Set([...outline.parts.map((part) => part.id), ...outline.parts.flatMap((part) => part.topics)]);

const PAGE_IDS = [
  ...PRIMARY_MENUS.map(([id]) => id),
  ...SUPREME_SETTINGS.map(([id]) => id),
  ...ACCOUNT_MENU_IDS,
];

test('mỗi menu chính, trang thiết lập và trang tài khoản có mục hướng dẫn trong outline.json', () => {
  for (const id of PAGE_IDS) {
    const anchor = guideAnchorForMenu(id);
    assert.ok(anchor, `${id} cần anchor hướng dẫn`);
    assert.ok(outlineIds.has(anchor), `${id} -> #${anchor} phải có trong docs/guide/outline.json`);
    assert.ok(menuLabel(id), `${id} cần tên menu cho aria-label`);
  }
  for (const [id, anchor] of Object.entries(GUIDE_ANCHORS)) {
    assert.ok(outlineIds.has(anchor), `GUIDE_ANCHORS.${id} -> #${anchor} không có trong outline`);
  }
  assert.equal(guideAnchorForMenu('boarding'), 'bt-ban-tru');
  assert.equal(guideAnchorForMenu('locations'), '');
});

test('menu Tra cứu theo menu có mục riêng cho các menu mới tách', () => {
  const reference = outline.parts.find((part) => part.id === 'tra-cuu-menu').topics;
  for (const id of ['menu-lich-cong-tac', 'menu-cong-viec', 'menu-lop-chu-nhiem', 'menu-diem-danh', 'menu-bao-cao', 'menu-danh-gia-nhan-su', 'menu-thiet-lap']) {
    assert.ok(reference.includes(id), id);
  }
});

test('đường dẫn hướng dẫn: bản nhúng gọn và bản đầy đủ', () => {
  assert.equal(GUIDE_PATH, '/huong-dan-su-dung.html');
  assert.equal(guideEmbedUrl('bt-ban-tru'), '/huong-dan-su-dung.html?embed=1#bt-ban-tru');
  assert.equal(guideFullUrl('bt-ban-tru'), '/huong-dan-su-dung.html#bt-ban-tru');
  assert.equal(menuLabel('boarding'), 'Bán trú');
  assert.equal(menuLabel('devices'), 'Quản lý thiết bị đăng nhập');
  assert.equal(menuLabel('design-library'), 'Thư viện giao diện');
});

test('nút ? dùng chung: nhãn, khung bên phải, Esc, giữ focus, link mở tab mới', () => {
  const main = read('src/main.jsx');
  const button = read('src/help/PageHelpButton.jsx');
  assert.match(main, /<h1>\{title\}<\/h1>\s*<PageHelpButton menuId=\{active\} \/>/);
  assert.equal((main.match(/<PageHelpButton /g) || []).length, 1, 'one shared button in the shell header');
  assert.match(button, /aria-label=\{name\}/);
  assert.match(button, /title=\{name\}/);
  assert.match(button, /`Hướng dẫn: \$\{label\}`/);
  assert.match(button, /role="dialog"/);
  assert.match(button, /aria-modal="true"/);
  assert.match(button, /event\.key === 'Escape'/);
  assert.match(button, /'focusin'/, 'focus leaving the panel is pulled back');
  assert.match(button, /event\.origin === window\.location\.origin/, 'iframe Esc message is same-origin only');
  assert.match(button, /src=\{guideEmbedUrl\(anchor\)\}/);
  assert.match(button, /Mở toàn bộ hướng dẫn/);
  assert.match(button, /target="_blank" rel="noopener noreferrer"/);
  const css = read('src/help/pageHelp.css');
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.page-help-panel \{[^}]*width: 100vw/);
  assert.match(css, /prefers-reduced-motion/);
});

test('hướng dẫn tĩnh có chế độ ?embed=1 và báo Esc cho trang cha', () => {
  const guide = read('public/huong-dan-su-dung.html');
  assert.match(guide, /classList\.add\('is-embed'\)/);
  assert.match(guide, /\.is-embed \.sidebar/);
  assert.match(guide, /postMessage\(\{ type: 'lvt-guide:escape' \}, location\.origin\)/);
  for (const anchor of new Set(Object.values(GUIDE_ANCHORS))) {
    assert.match(guide, new RegExp(`<article class="topic" id="${anchor}"`), anchor);
  }
  assert.doesNotMatch(guide, /Thiết lập địa điểm<\/a>/);
});

test('chỉ trang hướng dẫn được nhúng iframe cùng origin; mọi thứ khác vẫn DENY', () => {
  assert.deepEqual([...SAME_ORIGIN_FRAMEABLE_PATHS], ['/huong-dan-su-dung.html']);
  assert.deepEqual(staticFrameHeaders('/huong-dan-su-dung.html'), [
    { name: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { name: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  ]);
  for (const path of ['/index.html', '/huong-dan/giao-dien-chung.webp', '/assets/app.js', '/huong-dan-su-dung.html/x', '/HUONG-DAN-SU-DUNG.HTML']) {
    assert.deepEqual(staticFrameHeaders(path), [], path);
  }
  const server = read('scripts/serve-production.mjs');
  assert.match(server, /response\.setHeader\('X-Frame-Options', 'DENY'\)/);
  assert.match(server, /const servedPath = `\/\$\{path\.relative\(distRoot, filePath\)/);
  assert.match(server, /staticFrameHeaders\(servedPath\)/);
});
