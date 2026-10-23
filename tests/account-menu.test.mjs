import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('header account menu is Facebook-style and lists account actions', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const menu = readFileSync(new URL('../src/profile/AccountMenu.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/profile/accountMenu.css', import.meta.url), 'utf8');

  assert.doesNotMatch(main, /<NavButton id="profile" label="Thông tin cá nhân"/);
  assert.doesNotMatch(main, /className="user-greeting"/);
  assert.match(main, /<AccountMenu onChoose=\{choose\} onSignOut=/);
  assert.match(main, /<OwnAvatarProvider user=\{user\}>/);

  assert.match(menu, /account-menu-trigger/);
  assert.match(menu, /go\('profile'\)/);
  assert.match(menu, /Đổi mật khẩu/);
  assert.match(menu, /Quản lý thiết bị đăng nhập/);
  assert.match(menu, /Đăng xuất/);
  assert.match(menu, /go\('change-password'\)/);
  assert.match(menu, /go\('devices'\)/);
  assert.match(menu, /onSignOut\(\)/);
  assert.match(css, /border-radius: 50%/);
  assert.match(css, /\.account-menu-logout/);
});

test('guide is a safe new-tab link after devices and before logout', () => {
  const menu = readFileSync(new URL('../src/profile/AccountMenu.jsx', import.meta.url), 'utf8');
  const link = menu.match(/<a\s[^>]*href="\/huong-dan-su-dung\.html"[^>]*>[\s\S]*?<\/a>/)?.[0];
  assert.ok(link, 'native guide anchor must exist');
  assert.match(link, /role="menuitem"/);
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener noreferrer"/);
  assert.match(link, /onClick=\{\(\) => setOpen\(false\)\}/);
  assert.match(link, /Hướng dẫn sử dụng/);
  assert.ok(menu.indexOf('Quản lý thiết bị đăng nhập') < menu.indexOf(link));
  assert.ok(menu.indexOf(link) < menu.indexOf('className="account-menu-row account-menu-logout"'));
  const guide = readFileSync(new URL('../public/huong-dan-su-dung.html', import.meta.url), 'utf8');
  assert.match(guide, /<title>Cẩm nang CRM · THCS Lê Văn Tám/);
});

test('guide is built from docs/guide with external, captioned images', () => {
  const guide = readFileSync(new URL('../public/huong-dan-su-dung.html', import.meta.url), 'utf8');
  const outline = JSON.parse(readFileSync(new URL('../docs/guide/outline.json', import.meta.url), 'utf8'));
  const topicIds = outline.parts.flatMap((part) => part.topics);
  assert.equal((guide.match(/<article class="topic"/g) || []).length, topicIds.length);
  for (const id of topicIds) assert.match(guide, new RegExp(`<article class="topic" id="${id}"`));
  for (const part of outline.parts) assert.match(guide, new RegExp(`<section class="part" id="${part.id}"`));
  assert.doesNotMatch(guide, /data:image\//, 'images must be separate files, not base64');
  assert.doesNotMatch(guide, /Chưa xếp mục|is-missing/, 'every topic is in the outline and every image exists');
  // 360 KB since 2026-10-24: 67 topics / 146 captioned figures (Lớp học, app sign-in); images stay external.
  assert.ok(Buffer.byteLength(guide) < 360 * 1024, 'guide HTML stays under 360 KB');
  const images = [...guide.matchAll(/<img src="(huong-dan\/[^"]+)"[^>]*alt="([^"]*)"/g)];
  assert.ok(images.length > 0);
  for (const [, src, alt] of images) {
    assert.ok(existsSync(new URL(`../public/${src}`, import.meta.url)), `${src} exists`);
    assert.match(alt, /^Hình \d+\. \S/, `${src} has a numbered Vietnamese alt text`);
  }
});

test('account pages are centered, single-column, and use colorful field icons', () => {
  const css = readFileSync(new URL('../src/profile/profile.css', import.meta.url), 'utf8');
  const profile = readFileSync(new URL('../src/profile/InternalProfilePanel.jsx', import.meta.url), 'utf8');

  assert.match(css, /\.profile-page-single\s*\{[^}]*align-items:\s*center/s);
  assert.match(css, /\.profile-page-single \.profile-overview[\s\S]*margin-inline:\s*auto/);
  assert.match(css, /\.profile-page-single \.profile-security[\s\S]*margin-inline:\s*auto/);
  assert.match(css, /\.profile-page-single \.devices-panel[\s\S]*margin-inline:\s*auto/);
  assert.match(css, /\.profile-modern-dl\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.doesNotMatch(css, /grid-template-columns:\s*repeat\(2/);
  assert.match(css, /\.profile-field-icon\.is-name/);
  assert.match(css, /\.profile-field-icon\.is-email/);
  assert.match(css, /\.profile-field-icon\.is-role/);
  assert.match(css, /\.profile-field-icon\.is-department/);
  assert.match(css, /\.profile-field-icon\.is-position/);

  assert.doesNotMatch(profile, /<i>0[1-6]<\/i>/);
  assert.match(profile, /profile-field-icon is-name/);
  assert.match(profile, /profile-field-icon is-email/);
  assert.match(profile, /NameFieldIcon/);
  assert.match(profile, /EmailFieldIcon/);
  assert.match(profile, /RoleFieldIcon/);
  assert.match(profile, /DepartmentFieldIcon/);
  assert.match(profile, /PositionFieldIcon/);
});

test('combined profile view is split into three page modules', () => {
  const pages = readFileSync(new URL('../src/profile/ProfilePages.jsx', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(pages, /InternalProfilePanel/);
  assert.match(pages, /ChangePasswordPanel/);
  assert.match(pages, /DevicesPanel mode="self"/);
  assert.match(main, /active === 'change-password'/);
  assert.match(main, /<ChangePasswordView \/>/);
  assert.match(main, /active === 'devices'/);
  assert.match(main, /<DevicesView \/>/);
});
