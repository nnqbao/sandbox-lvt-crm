import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { INTRODUCTION_PATHS, isPublicIntroductionPath } from '../src/introduction/introductionRoute.js';
import { routeForPathname } from '../src/navigationRoutes.js';

test('trang giới thiệu là đường dẫn công khai, không phải menu CRM', () => {
  assert.equal(isPublicIntroductionPath('/introduction'), true);
  assert.equal(isPublicIntroductionPath('/Introduction/'), true);
  assert.equal(isPublicIntroductionPath('/gioi-thieu'), true);
  assert.equal(isPublicIntroductionPath('/introduction/x'), false);
  assert.equal(isPublicIntroductionPath('/cong-tac'), false);
  for (const path of INTRODUCTION_PATHS) assert.equal(routeForPathname(path), null);
});

test('mọi hình trên trang giới thiệu đều có ảnh (npm run guide:shots -- --only intro)', () => {
  const source = readFileSync(new URL('../src/introduction/IntroductionPage.jsx', import.meta.url), 'utf8');
  const ids = new Set([
    ...[...source.matchAll(/\b(?:image|phone): '([a-z0-9-]+)'/g)].map((m) => m[1]),
    ...[...source.matchAll(/<(?:BrowserFrame|PhoneFrame|Zoomable) id="([a-z0-9-]+)"/g)].map((m) => m[1]),
    ...[...source.matchAll(/more: \[(.*?)\]\]?,?\n/gs)].flatMap((m) => [...m[1].matchAll(/\['([a-z0-9-]+)'/g)].map((x) => x[1])),
  ]);
  assert.ok(ids.size >= 20, `chỉ thấy ${ids.size} ảnh`);
  for (const id of ids) {
    assert.ok(existsSync(new URL(`../public/gioi-thieu/intro-${id}.webp`, import.meta.url)), `thiếu public/gioi-thieu/intro-${id}.webp`);
  }
});
