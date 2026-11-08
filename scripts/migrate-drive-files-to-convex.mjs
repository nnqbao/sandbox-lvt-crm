#!/usr/bin/env node
// One-off: move legacy Google Drive objects of ACTIVE records into Convex File Storage.
//
//   node scripts/migrate-drive-files-to-convex.mjs <sandbox|prod>            # dry run: list only
//   node scripts/migrate-drive-files-to-convex.mjs sandbox --apply
//   LVT_CONVEX_CONFIRM_PROD=local-prod node scripts/migrate-drive-files-to-convex.mjs prod --apply
//
// Per file: download from Drive with gog (same LVT_DRIVE_ACCOUNT and gog settings as the prod gateway,
// read from its LaunchAgent and passed only to gog), check non-empty / ≤20 MiB / old checksum,
// upload to Convex Storage, then convex/driveToConvexMigration.ts:adoptConvexObject re-checks
// Convex's own SHA-256 and size before switching the record to `cvx_<storageId>`. The Drive
// object is left untouched. A manifest (old key → new key, sha256) is written to .runtime/migration.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
const apply = process.argv.includes('--apply');
if (!['sandbox', 'prod'].includes(target)) {
  console.error('usage: node scripts/migrate-drive-files-to-convex.mjs <sandbox|prod> [--apply]');
  process.exit(64);
}
const MAX_BYTES = 20 * 1024 * 1024;
const GATEWAY_PLIST = path.join(homedir(), 'Library/LaunchAgents/ai.lvt.crm.web.plist');

function convexRun(fn, args = {}) {
  const out = execFileSync(
    path.join(root, 'scripts/lvt-convex-local-env.sh'),
    [target, path.join(root, 'node_modules/.bin/convex'), 'run', fn, JSON.stringify(args)],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
  ).trim();
  return out ? JSON.parse(out) : null;
}

/** Drive account + gog settings of the prod gateway (account keyring), never printed. */
function gogEnv() {
  const env = { ...process.env };
  for (const key of ['LVT_DRIVE_ACCOUNT', 'GOG_CLIENT', 'GOG_KEYRING_BACKEND', 'GOG_KEYRING_PASSWORD']) {
    try {
      const value = execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :EnvironmentVariables:${key}`, GATEWAY_PLIST], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).replace(/\n$/, '');
      if (value) env[key] = value;
    } catch {
      // Missing key: gog falls back to its defaults.
    }
  }
  return env;
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const label = (o) => `${o.table}/${o.id.slice(0, 8)}${o.userId ? `/${o.userId.slice(0, 6)}` : ''}`;

const objects = convexRun('driveToConvexMigration:listDriveObjects');
const byTable = objects.reduce((acc, o) => ({ ...acc, [o.table]: (acc[o.table] || 0) + 1 }), {});
console.log(`${target}: ${objects.length} active Drive-backed file(s)`, byTable);
if (!apply) {
  console.log('dry run (add --apply to move them)');
  process.exit(0);
}

const env = gogEnv();
// Same default as scripts/serve-production.mjs when the LaunchAgent sets no account.
const driveAccount = env.LVT_DRIVE_ACCOUNT || 'bemiagent@gmail.com';
const work = mkdtempSync(path.join(tmpdir(), 'lvt-drive-move-'));
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
const manifestDir = path.join(root, '.runtime', 'migration');
mkdirSync(manifestDir, { recursive: true });
const manifestPath = path.join(manifestDir, `drive-to-convex-${target}-${stamp}.json`);
const manifest = [];
const save = () => writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

try {
  for (const [index, o] of objects.entries()) {
    const entry = { ...o, status: 'pending' };
    manifest.push(entry);
    const file = path.join(work, `f${index}`);
    try {
      execFileSync('/opt/homebrew/bin/gog', ['drive', 'download', o.driveFileId, '--account', driveAccount, '--out', file, '--no-input'], {
        env,
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout: 120_000,
      });
      const size = statSync(file).size;
      if (size <= 0 || size > MAX_BYTES) throw new Error(`SIZE_${size}`);
      const bytes = readFileSync(file);
      const hex = sha256(bytes);
      if (o.driveChecksum && o.driveChecksum !== hex) throw new Error('DRIVE_CHECKSUM_MISMATCH');
      if (o.fileSize && o.fileSize !== size) throw new Error(`DRIVE_SIZE_MISMATCH_${o.fileSize}_${size}`);
      const uploadUrl = convexRun('driveToConvexMigration:issueUploadUrl');
      const response = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
      if (!response.ok) throw new Error(`UPLOAD_HTTP_${response.status}`);
      const { storageId } = await response.json();
      const result = convexRun('driveToConvexMigration:adoptConvexObject', {
        table: o.table,
        id: o.id,
        ...(o.userId ? { userId: o.userId } : {}),
        driveFileId: o.driveFileId,
        storageId,
        sha256: hex,
        size,
      });
      Object.assign(entry, { storageId, sha256: hex, size, status: result?.applied ? 'moved' : `skipped:${result?.reason}` });
      console.log(`${result?.applied ? '✓' : '·'} ${label(o)} ${(size / 1024).toFixed(0)} KB ${entry.status}`);
    } catch (error) {
      entry.status = `failed:${String(error?.message || error).split('\n')[0].slice(0, 160)}`;
      console.log(`✗ ${label(o)} ${entry.status}`);
    } finally {
      rmSync(file, { force: true });
      save();
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
const counts = manifest.reduce((acc, e) => ({ ...acc, [e.status.split(':')[0]]: (acc[e.status.split(':')[0]] || 0) + 1 }), {});
console.log(`${target}: done`, counts, `manifest ${path.relative(root, manifestPath)}`);
if (counts.failed) process.exitCode = 1;
