import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { convexLocalPorts, parseEnv } from '../scripts/lib/convex-local-ports.mjs';

// Sandbox and prod are separate checkouts with different Convex port reservations, and commits
// move between them. A port literal or per-checkout compose name in a tracked file would conflict
// on every promotion or point one copy at another's (or another project's) backend.
const root = new URL('../', import.meta.url);
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter((file) => file && /\.(m?js|jsx|ts|ya?ml|sh|md|mdc|json)$/.test(file))
  .filter((file) => !file.startsWith('tests/') && !file.startsWith('convex/_generated/') && !file.startsWith('ops/'));

test('no Convex port literal or per-checkout compose name in tracked files', () => {
  const offenders = [];
  for (const file of tracked) {
    const text = readFileSync(new URL(file, root), 'utf8');
    text.split('\n').forEach((line, index) => {
      // Host-side bindings/URLs on the Convex ranges (3200–3499 backend/site, 6700–6899 dashboard).
      if (/(127\.0\.0\.1|localhost):(3[2-4]\d\d|6[78]\d\d)\b/.test(line) && !/localhost:3210\/version/.test(line)) {
        offenders.push(`${file}:${index + 1}: ${line.trim()}`);
      }
      if (/^\s*name:\s*[a-z0-9-]*convex\s*$/.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], 'Put machine-local ports in the untracked infra/convex-local/.env (see .env.example)');
});

test('compose, vite and serve-production read the reservation from infra/convex-local/.env', () => {
  const compose = readFileSync(new URL('infra/convex-local/docker-compose.yml', root), 'utf8');
  for (const key of ['LVT_CONVEX_PROJECT', 'LVT_CONVEX_BACKEND_PORT', 'LVT_CONVEX_SITE_PORT', 'LVT_CONVEX_DASHBOARD_PORT']) {
    assert.match(compose, new RegExp(`\\$\\{${key}`), `${key} in docker-compose.yml`);
  }
  assert.match(readFileSync(new URL('vite.config.js', root), 'utf8'), /convexLocalPorts\(\)/);
  assert.match(readFileSync(new URL('scripts/serve-production.mjs', root), 'utf8'), /convexLocalPorts\(\)\?\.backend/);
});

test('convexLocalPorts parses a reservation and refuses an incomplete one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lvt-ports-'));
  const file = join(dir, '.env');
  writeFileSync(file, '# c\nLVT_CONVEX_PROJECT=x-convex\nLVT_CONVEX_BACKEND_PORT=4100\nLVT_CONVEX_SITE_PORT=4101\nLVT_CONVEX_DASHBOARD_PORT=4102\n');
  assert.deepEqual(convexLocalPorts(file), { backend: 'http://127.0.0.1:4100', site: 'http://127.0.0.1:4101', dashboard: 'http://127.0.0.1:4102' });
  writeFileSync(file, 'LVT_CONVEX_BACKEND_PORT=4100\n');
  assert.equal(convexLocalPorts(file), null);
  assert.equal(convexLocalPorts(join(dir, 'missing')), null);
  assert.equal(parseEnv('#LVT_CONVEX_BACKEND_PORT=1\n').LVT_CONVEX_BACKEND_PORT, undefined);
});
