import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  DESIGN_LIBRARY_URL,
  designLibraryErrorMessage,
  prepareDesignLibraryDocument,
} from '../src/settings/designLibrary.js';
import { pathnameForMenu, routeForPathname } from '../src/navigationRoutes.js';

const root = new URL('../', import.meta.url);
const read = (relative) => readFile(new URL(relative, root), 'utf8');

test('design library prototype is not shipped as a public static file', async () => {
  await assert.rejects(access(new URL('public/demo/index.html', root)));
  const html = await read('design/component-library/index.html');
  assert.match(html, /data-view="components"/);
  assert.doesNotMatch(html, /src="assets\//, 'logo must use the absolute /assets path inside srcdoc');
});

test('Convex gate for the design library is administrator only', async () => {
  const source = await read('convex/designLibrary.ts');
  assert.match(source, /export const authorizeView = query\(/);
  assert.match(source, /await adminOrThrow\(ctx\)/);
});

test('server authorizes before reading the design library and never caches it', async () => {
  const source = await read('scripts/serve-production.mjs');
  const start = source.indexOf('async function serveDesignLibrary');
  const body = source.slice(start, source.indexOf('\n}\n', start));
  assert.notEqual(start, -1);
  const authorize = body.indexOf('anyApi.designLibrary.authorizeView');
  assert.ok(body.indexOf('authorizedClient(request)') !== -1 && authorize !== -1);
  assert.ok(authorize < body.indexOf('readFile(designLibraryFile)'), 'authorization must run before the file is read');
  assert.match(body, /'Cache-Control', 'private, no-store'/);
  assert.match(body, /'Vary', 'Authorization'/);
  assert.match(source, /privatePath === '\/api\/design-library'/);
  assert.match(source, /designLibraryFile = path\.join\(projectRoot, 'design', 'component-library', 'index\.html'\)/);
});

test('design library page is an admin-only supreme setting route', async () => {
  assert.equal(pathnameForMenu('design-library'), '/thu-vien-giao-dien');
  assert.equal(routeForPathname('/thu-vien-giao-dien')?.menu, 'design-library');
  const main = await read('src/main.jsx');
  const routes = await read('src/navigationRoutes.js');
  assert.match(routes, /\['design-library', 'Thư viện giao diện'\],\n\]\);/);
  assert.match(main, /active === 'design-library' && isAdmin \?/);
  const view = await read('src/settings/DesignLibraryView.jsx');
  assert.match(view, /sandbox="allow-scripts"/);
  assert.doesNotMatch(view, /allow-same-origin/);
  assert.equal(DESIGN_LIBRARY_URL, '/api/design-library');
});

test('prepared document opens the components view and keeps the original body', () => {
  const prepared = prepareDesignLibraryDocument('<html><body><main>x</main></body></html>');
  assert.match(prepared, /<main>x<\/main><script>[^<]*data-view="components"[^<]*<\/script><\/body><\/html>$/);
  assert.match(prepareDesignLibraryDocument('<p>no body</p>'), /^<p>no body<\/p><script>/);
});

test('design library errors stay distinct for expired session and non-admin', () => {
  assert.match(designLibraryErrorMessage(401), /đăng nhập lại/);
  assert.match(designLibraryErrorMessage(403), /Chỉ Administrator/);
  assert.match(designLibraryErrorMessage(500), /Không tải được/);
});

test('design-system page shows every token with the value from :root', async () => {
  const { COLOR_TOKENS, STATUS_PAIRS, DESIGN_SECTIONS } = await import('../src/settings/designSystem.js');
  const styles = await read('src/styles.css');
  const root = styles.slice(0, styles.indexOf('}'));
  for (const color of COLOR_TOKENS) {
    const match = root.match(new RegExp(`${color.token}:\\s*(#[0-9a-f]{6})`, 'i'));
    assert.ok(match, `${color.token} must exist in :root`);
    assert.equal(match[1].toLowerCase(), color.value, `${color.token} value drifted from styles.css`);
  }
  for (const pair of STATUS_PAIRS) {
    assert.match(root, new RegExp(`${pair.text}:`));
    assert.match(root, new RegExp(`${pair.bg}:`));
  }
  const design = await read('DESIGN.md');
  const headings = [...design.matchAll(/^## (\d+)\. /gm)].map((match) => Number(match[1]));
  assert.deepEqual(DESIGN_SECTIONS.map((section) => section.number), headings);
});

test('samples are inert and the fake-data prototype loads only after acknowledgement', async () => {
  const { canOpenPrototypeArchive } = await import('../src/settings/designSystem.js');
  assert.equal(canOpenPrototypeArchive(true), true);
  assert.equal(canOpenPrototypeArchive(false), false);
  assert.equal(canOpenPrototypeArchive('true'), false);
  const view = await read('src/settings/DesignLibraryView.jsx');
  assert.match(view, /className="ds-sample-body" inert>/);
  assert.match(view, /Tài liệu quy chuẩn giao diện, không phải chức năng của hệ thống/);
  const open = view.slice(view.indexOf('const open = async'), view.indexOf('const close ='));
  assert.match(open, /if \(!canOpenPrototypeArchive\(acknowledged\)\) return;[\s\S]*fetch\(DESIGN_LIBRARY_URL/);
  assert.equal((view.match(/fetch\(DESIGN_LIBRARY_URL/g) || []).length, 1, 'the prototype is fetched in one place only');
  assert.match(view, /disabled=\{!canOpenPrototypeArchive\(acknowledged\)\}/);
  assert.match(view, /DỮ LIỆU GIẢ · KHÔNG PHẢI CHỨC NĂNG THẬT/);
});
