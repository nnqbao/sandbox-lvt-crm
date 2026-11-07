// Machine-local Convex ports of THIS checkout, read from the untracked infra/convex-local/.env.
// Port numbers and the compose project name never live in tracked files: sandbox and prod are
// separate checkouts with different reservations (registry: ~/ops/docs/convex-ports.md), and
// commits move between them. Template: infra/convex-local/.env.example.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CONVEX_LOCAL_ENV = join(repoRoot, 'infra', 'convex-local', '.env');

/** KEY=VALUE lines (no quotes, no expansion), `#` comments and blank lines ignored. */
export function parseEnv(text) {
  const values = {};
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !line.trimStart().startsWith('#')) values[match[1]] = match[2];
  }
  return values;
}

const PORT = /^[1-9][0-9]{2,4}$/;

/** `{ backend, site, dashboard }` URLs, or null when this checkout has no (valid) reservation. */
export function convexLocalPorts(file = CONVEX_LOCAL_ENV) {
  if (!existsSync(file)) return null;
  const env = parseEnv(readFileSync(file, 'utf8'));
  const ports = [env.LVT_CONVEX_BACKEND_PORT, env.LVT_CONVEX_SITE_PORT, env.LVT_CONVEX_DASHBOARD_PORT];
  if (!ports.every((port) => PORT.test(String(port || '')))) return null;
  const [backend, site, dashboard] = ports.map((port) => `http://127.0.0.1:${port}`);
  return { backend, site, dashboard };
}
