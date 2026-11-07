# Agent notes (Cursor Cloud / Background Agents)

This repo ships **project** Cursor helpers under `.cursor/` so Cloud Agents (which do **not** see your Mac Mini `~/.cursor`) still get useful context.

## Môi trường, quy trình phát hành và vận hành (đọc trước khi sửa code)

Prod đang có khách (Trường THCS Lê Văn Tám) sử dụng. **Mọi thay đổi làm ở sandbox trước; owner review sandbox xong và đồng ý thì mới đưa lên prod.**

### Hai môi trường trên Mac mini

| | Sandbox | Prod |
|---|---|---|
| Thư mục | `~/projects/sandbox-lvt-crm` | `~/projects/LVT-CRM` |
| GitHub | `kingrubic/sandbox-lvt-crm` (remote `origin`; remote `lvt-crm` = repo prod) | `kingrubic/LVT-CRM` |
| Nhánh | `main` | Checkout chạy `feat/native-homeroom-parity`; nhánh tích hợp `feat/homeroom-rework`; `main` trên GitHub đang cũ |
| Convex Cloud | `dev:decisive-puma-318` | `prod:confident-guanaco-953` |
| Web (LaunchAgent) | `ai.lvt.crm.sandbox-web`, `127.0.0.1:3009`, serve `dist/` của thư mục sandbox | `ai.lvt.crm.web`, `127.0.0.1:3007`, serve `dist/` của thư mục prod; public `https://thcslevantam.ai.vn` (tên miền chính thức) và `https://lvt.vscgroup.io.vn` (giữ cho app cũ và passkey) qua Cloudflare Tunnel |
| Log web | `~/ops/logs/ai.lvt.crm.sandbox-web*.log` | `~/ops/logs/ai.lvt.crm.web*.log` |
| App mobile | **Không có** (code native chỉ đồng bộ cho giống prod) | Android `lvt.crm`, iOS `vn.lvt.crm.uikit` |

### Quy trình sau mỗi lần sửa code

1. Làm trên nhánh mới trong **sandbox**.
2. Kiểm tra: `npm test`, `npm run build`, `git diff --check` (thêm `xcodebuild` UIKit / Gradle Android và tăng version + build number khi sửa native, xem `.cursor/rules/native-app-version.mdc`). Gate nào lỗi thì dừng, không đẩy tiếp.
3. Commit → push → mở PR vào `main` của `kingrubic/sandbox-lvt-crm` → **tự merge** (owner đã cho phép).
4. Deploy sandbox: `git switch main && git pull --ff-only`, `npm run convex:dev -- --once`, `npm run build`, `launchctl kickstart -k gui/$(id -u)/ai.lvt.crm.sandbox-web`, rồi kiểm tra `127.0.0.1:3009` và đúng luồng vừa sửa.
5. **Chỉ khi owner đồng ý**: đưa commit sang repo prod (PR vào nhánh mà checkout prod đang chạy), chạy lại gate trên một worktree sạch, merge, `git pull --ff-only` trong `~/projects/LVT-CRM`, rồi deploy prod nếu cần (bên dưới) và kiểm tra live.

### Lệnh deploy

- Key Convex nằm trong `~/projects/LVT-CRM/.convex-cloud-keys.csv` (untracked, chmod 600; cột `name,key prod,key dev`, dòng `LVT-CRM`). `scripts/lvt-convex-cloud-env.sh` đọc key, kiểm tra đúng deployment và chỉ truyền qua biến môi trường. Không in, không commit, không ghi key vào file khác.
- Convex dev (sandbox): `npm run convex:dev -- --once`. Chỉ chạy từ thư mục sandbox.
- Convex prod: từ worktree sạch của commit đã review, `LVT_CONVEX_CONFIRM_PROD=confident-guanaco-953 npm run convex:deploy -- -y`. Thiếu biến xác nhận hoặc tree có thay đổi chưa commit thì script từ chối.
- Web sandbox: `npm run build` (đọc `VITE_CONVEX_URL` dev từ `.env.local`). **Không dùng `build:production` cho sandbox**: script này ghi cứng URL Convex prod.
- Web prod: `npm run build:production` trong `~/projects/LVT-CRM`. **Chạy lệnh này là deploy web prod luôn**, vì `ai.lvt.crm.web` serve trực tiếp `dist/` của thư mục đó. Muốn chỉ kiểm tra build thì chạy trên worktree tạm.

### Backup Convex prod

- LaunchAgent `ai.lvt.crm.convex-backup` chạy `~/ops/scripts/lvt-crm-convex-backup.sh` lúc 00:30 mỗi đêm: `convex export --include-file-storage` từ prod, kiểm tra zip, lưu `~/projects/LVT-CRM/.runtime/backups/convex/cloud-*.zip`.
- Giữ **7 ngày** gần nhất (`LVT_CONVEX_BACKUP_RETENTION_DAYS` để đổi). Log: `~/ops/logs/ai.lvt.crm.convex-backup*.log`.
- `scripts/lvt-convex-backup.sh` và `ops/production/*.plist` trong repo là bản cũ thời self-hosted, **không phải** thứ đang chạy.

### Những chỗ dễ nhầm

- Cổng Convex của dự án này: **3318** (backend) / **3319** (HTTP actions) / **6805** (dashboard), compose project `sandbox-lvt-crm-convex` — cấp cố định ngày 2026-11-07.
- `127.0.0.1:3210` là backend của **VUBAOANH**, không phải của LVT (ghi chú cũ nói `akiko-dev` là sai; akiko ở 3420). Đừng trỏ lệnh Convex nào vào 3210/3211/6791.
- Convex thật của LVT vẫn ở Convex Cloud; bản self-hosted chỉ là chỗ đặt sẵn. Trước khi đụng bất kỳ cổng Convex nào, đọc `~/ops/docs/convex-ports.md`.
- `.env.local` của thư mục prod trỏ vào prod: chạy `npx convex deploy` trần ở đó là deploy thẳng lên prod.
- Hostname proxy cũ `lvt-convex.vscgroup.io.vn` / `lvt-convex-site.vscgroup.io.vn` đã ngừng (trả 530).
- Thư mục sandbox và prod chứa file nhạy cảm chưa track (`.env.local*`, `.convex-cloud-keys.csv`, `client_secret_*.json`, keystore, file xlsx dữ liệu học sinh). Không đọc, in hoặc commit chúng.

## Giao diện

Mọi thay đổi giao diện (web, Android, iOS) theo [`DESIGN.md`](DESIGN.md). Rule Cursor: `.cursor/rules/design.mdc`. Prototype gốc (Thư viện giao diện) chỉ admin xem tại `/thu-vien-giao-dien`.

## What is committed vs local-only

| Artifact | Commit? | Why |
|----------|---------|-----|
| `.cursor/rules/graphify.mdc` | yes | Soft graph-first guidance |
| `.cursor/rules/ponytail.mdc` | yes | Simplest-diff coding style (rule-only; no hooks) |
| `.cursor/skills/defuddle/` | yes | Token-saving web→markdown |
| `.cursor/mcp.json` (CodeGraph) | yes (optional) | Project MCP hint; **Cloud Agents still need the same server enabled in [cursor.com/agents](https://cursor.com/agents) MCP dropdown** — project `mcp.json` is not a reliable cloud-only config surface |
| `.codegraph/` | **no** (gitignored) | Rebuild per VM; LVT-scale indexes are tens of MB |
| `graphify-out/` | **no** (gitignored) | Rebuild with `graphify update .` when needed |

## CodeGraph (preferred structural navigation when MCP is live)

1. Ensure index exists (idempotent):

```bash
npx -y @colbymchenry/codegraph init -y
```

2. Prefer MCP tools `codegraph_explore` / related once the server is connected.
3. If MCP is **not** available in this Cloud Agent session (common until dashboard MCP is enabled), fall back to CLI:

```bash
npx -y @colbymchenry/codegraph explore "<question>"
npx -y @colbymchenry/codegraph context "<task>"
```

Do **not** commit `.codegraph/`.

## Graphify (file-based graph; no MCP required)

When `graphify-out/graph.json` exists, prefer `graphify query|path|explain` (see `.cursor/rules/graphify.mdc`).
Otherwise build once if the CLI is present:

```bash
# install once per VM if needed
uv tool install graphifyy   # or: pipx install graphifyy
graphify update .
```

If install is too heavy for the task, skip and use normal search — do not block.

## Ponytail

Always-on via `.cursor/rules/ponytail.mdc`. Cloud does not get Mac Mini `hooks.json` mode switching; the rule text is enough.

## Defuddle

For reading web docs, prefer `/defuddle` skill or `npx -y defuddle parse <url> --md` over dumping raw HTML.
