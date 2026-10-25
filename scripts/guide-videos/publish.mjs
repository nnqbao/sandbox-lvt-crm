#!/usr/bin/env node
// Upload the rendered guide videos + posters to Convex File Storage (they are not kept in git).
//
//   npm run guide:videos:publish -- dev                       # every video in public/huong-dan/video
//   npm run guide:videos:publish -- dev --only tl-mon-hoc
//   LVT_CONVEX_CONFIRM_PROD=confident-guanaco-953 npm run guide:videos:publish -- prod --dir <path>
//
// Unchanged files (same SHA-256 as the published copy) are skipped. Runs the internal functions of
// convex/guideVideos.ts through scripts/lvt-convex-cloud-env.sh, so the deploy key never leaves
// that wrapper. `--dir` reads the files from another checkout (prod publishes from a clean
// worktree but the videos are rendered in the sandbox checkout).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const KINDS = [['video', 'mp4', 'video/mp4'], ['poster', 'webp', 'image/webp']];

function parseArgs(argv) {
  const args = { target: argv[0], only: [], dir: join(repoRoot, 'public/huong-dan/video') };
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--only') args.only.push(...argv[++i].split(','));
    else if (argv[i] === '--dir') args.dir = resolve(argv[++i]);
    else throw new Error(`Unknown argument ${argv[i]}`);
  }
  if (!['dev', 'prod'].includes(args.target)) throw new Error('Dùng: npm run guide:videos:publish -- <dev|prod> [--only id,…] [--dir thư mục]');
  return args;
}

/** Run a Convex function via the CLI wrapper and return its JSON result. */
function convexRun(target, fn, args) {
  const out = execFileSync(join(repoRoot, 'scripts/lvt-convex-cloud-env.sh'), [target, join(repoRoot, 'node_modules/.bin/convex'), 'run', fn, JSON.stringify(args)], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const text = out.trim();
  if (!text) return null; // `convex run` prints nothing for a null result
  const start = Math.max(text.lastIndexOf('\n{'), text.lastIndexOf('\n"'), text.lastIndexOf('\nnull'));
  return JSON.parse(start >= 0 ? text.slice(start + 1) : text);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ids = readdirSync(args.dir).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5))
    .filter((id) => !args.only.length || args.only.includes(id)).sort();
  let uploaded = 0;
  let skipped = 0;
  for (const id of ids) {
    for (const [kind, ext, type] of KINDS) {
      const file = join(args.dir, `${id}.${ext}`);
      if (!existsSync(file)) throw new Error(`Thiếu ${file} (chạy npm run guide:videos trước)`);
      const bytes = readFileSync(file);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const current = convexRun(args.target, 'guideVideos:current', { videoId: id, kind });
      if (current?.sha256 === sha256) {
        skipped += 1;
        continue;
      }
      const uploadUrl = convexRun(args.target, 'guideVideos:issueUploadUrl', {});
      const response = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': type }, body: bytes });
      if (!response.ok) throw new Error(`${id}.${ext}: upload ${response.status}`);
      const { storageId } = await response.json();
      convexRun(args.target, 'guideVideos:register', { videoId: id, kind, storageId, sha256 });
      uploaded += 1;
      console.log(`↑ ${args.target} ${id}.${ext} ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
    }
  }
  console.log(`${args.target}: ${uploaded} file tải lên, ${skipped} file không đổi (${ids.length} video).`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
