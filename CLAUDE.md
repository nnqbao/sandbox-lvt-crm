# LVT CRM — Claude Code Instructions

## Scope and operating boundaries

- Work only inside this repository. Never scan `/Users/vsc_agent`, the user home, sibling workspaces, or unrelated projects.
- Start with `git status --short`. Preserve unrelated dirty and untracked files.
- Prod has live customers: make every change in the sandbox checkout `~/projects/sandbox-lvt-crm` first; promote to `~/projects/LVT-CRM` only after the owner approves. Environments, release flow, deploy commands and backups: `AGENTS.md` → *Môi trường, quy trình phát hành và vận hành*.
- Never modify or commit `ios-uikit-lvt.zip`, archives, `.derivedData`, runtime caches, logs, secrets, credentials, or local environment files.
- Do not read macOS Keychain, `.env*`, token stores, OAuth data, private backups, or files outside this repository unless the owner explicitly asks for a narrowly scoped operational task.
- Do not commit, push, deploy, restart services, delete external data, or change production configuration unless explicitly requested.
- If discovery is needed, inspect this repository only. Prefer targeted file reads/searches over broad filesystem scans.

## Project map

- Web: React 19 + Vite under `src/`.
- Backend: self-hosted Convex under `convex/`.
- Private file gateway and production static server: `scripts/serve-production.mjs` plus `scripts/lib/`.
- Standalone native UIKit app: `ios-uikit-lvt/` (`vn.lvt.crm.uikit`).
- Existing SwiftUI workspace: `ios-app/`; preserve it unless the task explicitly targets it.
- Android app: `android-app/`; touch only when explicitly in scope.
- Any Android / iOS UIKit change must bump the Profile version (`versionName` / `MARKETING_VERSION`) and build number. See `.cursor/rules/native-app-version.mdc`.
- Tests: Node test runner under `tests/*.test.mjs`.
- Production frontend: `https://lvt.vscgroup.io.vn`.
- Convex runs on Convex Cloud (dev `decisive-puma-318` = sandbox, prod `confident-guanaco-953` = customers). Deploy/codegen only through `scripts/lvt-convex-cloud-env.sh` (the npm scripts); never expose or inline deploy/admin keys. The old self-hosted wrapper is retired because `127.0.0.1:3210` now belongs to another project.
- UI changes (web, Android, iOS) follow `DESIGN.md`; read it before touching screens or styles.
- Cursor agents also load `.cursor/rules/*.mdc` (core + import always-on; work/auth rules by glob). Keep those rules in sync when changing invariants.

## Engineering discipline

1. Read the relevant implementation, schema, tests, and call sites before editing.
2. State assumptions when the source does not establish a business rule; do not invent one.
3. Make the smallest coherent change and preserve unrelated work.
4. Backend authorization and invariants are the source of truth. UI visibility is only UX and never sufficient enforcement.
5. Treat external storage, database state, cache state, and client state as separate failure domains.
6. Prefer staged operations, atomic publication, soft-delete, and compensating cleanup over destructive in-place flows.
7. Do not report completion without real tests/builds and relevant end-to-end verification.
8. Never fabricate command output, deployment state, live behavior, or test results.

## Authorization and privacy invariants

- `admin` and `moderator` are operational managers; only `admin` has supreme settings/account authority.
- A `moderator` with a `departmentId` is scoped to that department in Công việc (create/list/edit/delete/review/archive only documents whose every assignment is that department or its members; plus anything they see as creator/assignee), Báo cáo (`view_all` narrows to department + self), Đánh giá nhân sự and Ghi nhận lỗi (targets in that department only; level rules unchanged). Out-of-scope writes fail with `MODERATOR_DEPARTMENT_SCOPE`. A moderator without a department stays school-wide; `admin` is never scoped; duties, homeroom/attendance, boarding, notifications, hub/group chat and settings stay school-wide. Enforce server-side via `convex/moderatorScope.ts` (`moderatorDepartmentScope`).
- **Giám thị** is menu access `supervisor` on `attendance` (menu **Điểm danh**, `/diem-danh`) only — never a fourth `users.role`. Create/update of permission groups must reject `supervisor` on any other menu (including `homeroom`) with `INVALID_MENU_ACCESS`; `attendance` itself accepts only `hidden` or `supervisor` for ordinary users (admin/mod get it by role). Legacy `edit` normalizes to `view` and must not be reused as Giám thị. `supervisor` makes the Điểm danh menu visible but does not satisfy generic `view_all` checks or grant another module (no homeroom access). Old `homeroom=supervisor` groups are moved by `permissionGroups:migrateSupervisorToAttendance`.
- Điểm danh: Giám thị saves **today** only; admin/mod today or a past date of the school year; never the future. Saving a class writes every enrolled student (absent → `excused` unless the GVCN already set `unexcused`), records a correction for each changed status, and upserts `attendanceClassDays` (no row = "Chưa điểm danh"). GVCN (or admin/mod) only toggles absent rows between `excused` / `unexcused`; reason/note is optional. The camera import is retired (`ATTENDANCE_CAMERA_IMPORT_RETIRED`); its old rows stay readable.
- Do not disable, delete, or demote the last active admin (`LAST_ACTIVE_ADMIN`).
- Login failures stay distinct and blocking: invalid credentials, `ACCOUNT_LOCKED`, `USER_NOT_ACTIVE`.
- `loginLockedAt` is enforced at sign-in **and** on authenticated calls (`currentUserOrThrow`).
- Forgot-password sends email **before** rotating credentials. Mail failure must not leave an unknown password. Per-user cooldown only; do not add IP rate limits.
- Profile password change requires `currentPassword`. The forced `mustChangePassword` gate (web / Android / iOS) only sends `newPassword`.
- Work access requires an active account with no pending mandatory password change. Ordinary users also require the `work` menu not to be hidden.
- "Việc của tôi" (`personalTodos`) is owner-only (not even admin/mod) and independent of the `work` menu access and work-document approval; the Công việc menu is shown to every active user, with only that tab when `work` is hidden.
- Work-document create/update/delete operations require the operational-manager `work:write` gate.
- Every protected Convex mutation/query must re-check authorization server-side.
- Every private-file metadata/download request must authenticate and authorize the current user.
- Never put bearer tokens, OAuth tokens, Drive IDs intended to remain private, passwords, or secrets in public URLs, logs, source, bundles, commits, or error messages.
- Cached file content is never public. Authorization is checked before serving server cache and before clients reuse local cache.
- A revoked session or removed file permission must not be bypassed by browser/iOS cache.

## Work-document business invariants

- Approval is **creator-based** (`workDocumentRequiresApproval`, stored as `officeDocuments.requiresApproval`; legacy rows without the flag fall back to the creator's current role):
  - Created by **admin/moderator** (văn thư): requires Ban giám hiệu approval. At least one approver is mandatory (`WORK_APPROVER_REQUIRED`). Status stays `pending` until **every** designated approver approves, then becomes `approved` (released).
  - Created by anyone else: released immediately (`status: "approved"`, no approvers).
  - Exception: a văn thư document whose only assignee is the creator (individual assignment(s) holding just the creator, no department) is released immediately with no approvers (`workDocumentNeedsApproval`, re-decided on every edit); creator plus anyone else or any department follows the normal BGH approval.
- Who may create work (`canCreateWorkDocuments`): admin/mod and any non-ops user at level ≥ 2. Level 1 and users without a position cannot (`ASSIGNMENT_CREATE_FORBIDDEN`). Công tác keeps its own rule (`canCreateAssignments`: admin/mod + 2/3★).
- Non-ops assignment targets (`canAssignWorkToUser`): strictly lower position level, never self or a peer. Ban giám hiệu (level ≥ 4) may assign individuals in any department and whole departments (`canAssignWorkDepartment`); other creators assign only individuals in their own department (`WORK_ASSIGNEE_NOT_SUBORDINATE`, `WORK_DEPARTMENT_FORBIDDEN`). Admin/mod keep moderator department scope for assignments; approvers are school-wide.
- Released = `active && status === "approved"` (`isWorkReleased`). Until release, assignees do not see the document, its chat, its file, or bell/push items. While `pending`/`rejected` it is visible only to the creator, its designated approvers, and in-scope admin/mod (school visibility mode).
- Approvers get the bell item "Công việc chờ duyệt" + push on submit and resubmit; the creator gets bell + push on final approval and on return; assignees get push only when the document is released.
- Edit/delete decisions go through `workDocumentEditPolicy` (`convex/workDocumentPolicy.ts`); list payloads expose per-document `canEdit`, `canDelete`, `editRequiresReapproval`, `hasSubmissions`, `lastEditedByName`, `lastEditedAt` for web and native clients.
- **Submissions lock everything**: once any assignee has submitted a completion/evidence (`pending_approval`) or been marked complete (`approved` / legacy `completedUserIds`) on an active work item or personal task of the document (`workHasSubmissions`), the document is read-only for **everyone** — admin, moderator, BGH, tổ trưởng and the creator — including documents released immediately without approval. Update and delete fail with `WORK_HAS_SUBMISSIONS`. Reviewing/approving those submissions keeps working (it does not edit the document).
- Moderators, BGH and every other non-admin may edit or delete a work document only while `approvedByUserIds` is empty (and nothing was submitted). `pending`, `rejected`, and overdue documents remain editable/deletable under those rules.
- The first approval permanently locks editing and deletion for every non-admin, even when:
  - another approver is still pending;
  - aggregate `status` remains `pending`;
  - the deadline later passes.
- **Admin exception (owner rule)**: `role === "admin"` only (never a moderator) may edit **any** active work document — any creator, any department — including approval-locked ones, as long as nothing was submitted. When the document is approval-locked or `status === "approved"` (released by BGH approval, or released immediately because BGH/a superior created it), the admin edit (`editRequiresReapproval`) sends it back to Ban giám hiệu: at least one approver is mandatory (`WORK_APPROVER_REQUIRED`, level ≥ 4 non-ops), every decision is reset, status becomes `pending`, the document is hidden from assignees until every approver approves again, approvers get "Công việc chờ duyệt" (bell + push) and assignees are notified again on release. Only exception: the editing admin is the only assignee (self-only) → stays released without approval (`workEditNeedsApproval`). When an admin edits, the same-department rule (`WORK_ASSIGNEE_OPS_FORBIDDEN`) does not block keeping/assigning admin/mod accounts of any department (`allowOpsAnyDepartment`, edit only — create keeps the rule); `WORK_ASSIGNEE_BGH_FORBIDDEN` and every other validation still apply.
- Delete of an approval-locked document stays forbidden for everyone, admin included (`WORK_DOCUMENT_IMMUTABLE`).
- Every successful update stores `lastEditedBy` + `lastEditedAt` (never on create/approve/reject); everyone who can see the document sees "Đã chỉnh sửa bởi {Họ tên} lúc HH:mm dd/MM/yyyy" (Vietnam time). The editor name is resolved server-side; never return emails for it.
- Reject ("Trả lại") is allowed only while `approvedByUserIds` is empty (`canRejectWorkDocument`) and requires a reason (`WORK_RETURN_REASON_INVALID`). A later reject would leave the document both rejected and immutable. A returned document stays unreleased; the creator edits and resubmits it.
- Do not implement the lock using only `status === "approved"`. Use the shared policy in `convex/workDocumentPolicy.ts`.
- Approvers must be active **non-admin, non-moderator** users at position level 4 or above. Operational managers manage documents; they cannot be designated approvers (`ADMIN_USE_MANAGEMENT`).
- Admin/mod (Văn thư) may not assign work individually to Ban giám hiệu (position level ≥ 4) — `WORK_ASSIGNEE_BGH_FORBIDDEN`, hidden from the ops assignee picker; BGH stay approvers, department assignments stay allowed, Lịch công tác participants are unaffected.
- Admin/mod may assign work to themselves, and to another admin/moderator only when both have the same non-empty `departmentId` — otherwise `WORK_ASSIGNEE_OPS_FORBIDDEN` (`opsWorkAssigneeError`); the ops picker shows self always and other ops only from the same department. Exception: an admin **editing** an existing document may keep/assign admin/mod of any department (`formOptions` marks them `editOnly`).
- Completing or reviewing work/personal tasks requires the parent document to still be `active` and `status === "approved"`.
- Editing a mutable document resets prior approval/rejection decisions and sends the revised document through approval again.
- Replacing assignments deactivates superseded work items/personal tasks and creates the new active work graph atomically with the document update. An edit that keeps exactly the same assignments (type, department/assignees, content, deadline) keeps the existing work items and personal tasks (`workAssignmentsUnchanged`).
- Deletion is soft-delete first. Once inactive, authorization must deny access even if Drive/cache cleanup is delayed.
- File replacement is staged: upload and validate the new file before publishing metadata. Never delete the old Drive file before the database update succeeds.
- Superseded Drive files are removed through purpose-scoped cleanup jobs. Keep `work` and `people-review` cleanup authorization separate.
- Department and individual assignees must be active, assignment deadlines use `YYYY-MM-DD`, and duplicate department assignments are invalid.
- New files must pass the shared extension allowlist, be non-empty, and remain within the 20 MiB limit.
- New work / people-review uploads go to **Convex File Storage** (since 2026-10): the gateway `/api/files/upload` relays the bytes to the Convex HTTP route `/lvt-files/upload` (`convex/fileHttp.ts`) with the user's bearer token; Convex re-authorizes, stores the object and registers its staged-upload row in the same request. Records keep the column `driveFileId` as an opaque object key: `cvx_<storageId>` = Convex object, anything else = legacy Drive object (`convex/fileObjects.ts`). Legacy Drive keys and the older `fileId` records stay valid and readable.

## Private file and cache invariants

- New work uploads are private Convex Storage objects (`cvx_` keys); a `cvx_` key can be staged only for a fresh (≤10 min), non-empty, ≤20 MiB object no other stage owns (`storedObjectRegistrable`). Convex deletes the object inside the authorized cleanup mutation (staged-upload cleanup / cleanup job), never while an active record references it.
- Never return Drive links or Convex `storage.getUrl()` to the browser. Preview/download always go through `/api/files/:documentId` after authorization. For `cvx_` objects the gateway fetches bytes from the Convex HTTP route `/lvt-files/object`, which re-runs `authorizeFileDownload` with the user's token; no storage URL is minted.
- Legacy `fileId` (Convex Storage) uses the same authorized gateway and 24-hour server cache as Drive objects.
- Prefer SHA-256 checksum as `fileVersion`; fallback is Drive identity plus size, or `convex-storage:{fileId}:{size}` for unmigrated files.
- Upload prewarm copies the already received file into shared server cache. It is best-effort: cache failure must not turn a valid Drive upload/database commit into a failed business operation.
- Shared cache remains authorize-first, atomic, bounded by TTL/size, single-flight, and concurrency-limited.
- Do not cache failed, partial, empty, unauthorized, forbidden, or not-found responses.
- Each web/iOS preview of a private work file must first call the authenticated no-store metadata endpoint and compare `fileVersion`.
- A matching version may use device/browser cache. A changed version must download and replace the local copy. Failed authorization/version checks must not fall back to stale local content.
- Metadata responses are `private, no-store`. Cacheable content responses are private, use ETag/revalidation, and vary by `Authorization`; authorization still runs before a `304` response.
- Browser metadata failure removes related Cache API entries. UIKit cache identity includes `documentId` plus `fileVersion`, uses staged writes, rejects empty files, is excluded from backup, and remains TTL/LRU bounded.
- Updating/deleting a Drive object invalidates related shared cache entries. Cleanup failure must not reactivate an inactive document.
- Do not weaken these metadata/content cache semantics without a security review.

## Upload and cleanup safety

- Preserve staged-upload settlement semantics: once the Convex mutation commits, retry settlement without repeating the business mutation.
- If the business mutation definitively did not commit, clean up the staged upload.
- Cleanup endpoints must be purpose-scoped and authorize the exact cleanup job/object.
- Never use a broad fallback from one module's authorization to another module.
- Drive downloads retry only transient network/rate-limit failures with bounded exponential backoff and jitter; never retry authorization/not-found failures as if they were transient.
- A cleanup failure after upload registration fails must not replace or hide the original registration error.
- Derive download MIME/disposition from the validated filename rather than client/storage MIME claims; preserve `nosniff` and sandboxed content policy.
- Do not make optional maintenance work a prerequisite for a successful core transaction.

## Generated code and schema

- Treat `convex/_generated/` as generated output; do not hand-edit it.
- Schema/function changes must typecheck and, when deployment/codegen is explicitly requested, use repository scripts:
  - `npm run typecheck:convex-codegen`
  - `npm run convex:dev -- --once` (dev)
  - `LVT_CONVEX_CONFIRM_PROD=confident-guanaco-953 npm run convex:deploy -- -y` (prod; clean worktree of the reviewed commit only)
- Never run a Convex deploy merely to make generated files change unless deployment is in scope.

## Required verification

For web/backend/server changes, run:

```bash
npm test
npm run build:production
git diff --check
```

For standalone UIKit changes, also run from `ios-uikit-lvt/`:

```bash
xcodebuild -project LvtCrmUIKit.xcodeproj -scheme LvtCrmUIKit \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  -derivedDataPath /tmp/lvt-uikit-build \
  build CODE_SIGNING_ALLOWED=NO
```

Additional rules:

- Run focused tests first when useful, then the full required gate.
- A simulator build validates compilation/configuration, not APNs or physical-device behavior.
- For live/deployment tasks, verify health, live hashed assets/routes, authorization failure behavior, and the actual changed workflow before reporting success.
- Before finishing, show `git status --short`, confirm `ios-app` was untouched unless explicitly scoped, and report remaining risks honestly.

## Trao đổi hub (web)

- Sidebar **Trao đổi** (`/trao-doi`) sits above Lịch công tác and Công việc and is visible to every active signed-in user. Work/duty threads still use the existing access rules; groups are membership-based. Admin (`role === admin`) may view and dissolve any group.
- Do not scan `workMessages` / `dutyMessages` to build the conversation list. Maintain `chatThreads` + per-user `chatInbox` (index `by_user_active_activity`) and `chatCounters` on send, recall, and group membership changes. Message history stays paginated on the existing per-entity indexes.
- Popup Trao đổi on Công tác/Công việc and the hub read the same message tables. Bell items `work_chat` / `duty_chat` / `group_chat` open the hub thread. `chatHubSync` is a one-time backfill cursor for threads that existed before the hub; new messages update the inbox directly.
- Group owner adds/removes/renames/dissolves. Members may leave (owner leave transfers to the earliest remaining member, or dissolves if nobody remains). Recall window stays 15 minutes.

## Lịch công tác chung weekly approval

Canonical detail: `README.md` → **Duyệt Lịch công tác chung theo tuần**.

- Văn thư = admin/mod writes the school sheet; Thành phần is optional for them only. BGH = active, non-admin/mod, position level 4–5; one approval covers the whole Monday-based week.
- Teachers only ever read the approved copy (`projectPublicDuty`, `loadPublicDutiesFromEndDate`): shared sheet, personal lists (web/native), attendance, chat, reminders, bell. Never return working fields of an unapproved school duty to them.
- Any create/edit/delete of a school duty needs re-approval; teachers keep seeing the old approved copy meanwhile. Editing a submitted week pulls it back to draft; `approve` must match the `submittedAt` the reviewer saw.
- Team-lead (level 2/3) duties are `scope: "team"`: live at once for their members, not on the shared sheet, never part of approval.

## Bulk user import invariants (SYS-011)

Canonical product detail lives in `README.md` → **Import user hàng loạt**. Do not weaken these rules without owner confirmation:

- Admin-only; bulk create **`user` role only** (never admin/moderator).
- Excel `.xlsx` only, ≤ 2 MiB. Columns: `ho_ten`, `email`, `ma_phong_ban`, `ma_chuc_vu`, `ma_nhom_quyen`, `mat_khau_tam_thoi`.
- **Upload to Convex Storage first**, then server parse/validate/commit from that `uploadId`. Never trust client-supplied rows for commit.
- Keep staged files **1 hour** (success or validation failure), then purge. Validate/commit must also reject when `Date.now() > expiresAt` or the stored blob exceeds 2 MiB.
- Commit is single-use (`committed` / `committing`). Never trust client-supplied rows.
- All-or-nothing validation; preview only when every row is valid; duplicate emails (file + active/disabled-non-rollback DB) block import.
- Mid-batch failure soft-disables created rows (`importRollbackAt`); a retry may reactivate those emails. Ordinary disabled accounts still block.
- Duplicate active catalog codes block import.
- Entity codes (department / position / permission group): ≤20, `A–Z0–9_-`, stored uppercase; case-insensitive match on import.
- Soft-delete catalogs; **block delete while users are assigned**; recreate with same **code** reactivates.

## Bulk user export invariants (SYS-012)

Canonical detail: `README.md` → **Xuất danh sách người dùng**.

- Admin-only client-side `.xlsx` of **active** users only; never export role or password.
- Headers use Vietnamese diacritics (office use, not re-import).
- Admin/moderator rows: empty permission-group code, name `Quản trị viên`.
- Filename `danh_sach_nguoi_dung_YYYYMMDD_NN.xlsx` with daily browser counter reset.

## How to ask questions

- First answer questions that the repository source, tests, schema, README, or this file can resolve.
- Ask the owner only when a business/product decision is genuinely missing or conflicting.
- Group unresolved questions by impact: blocking, security/data integrity, then UX/non-blocking.
- Do not silently choose a destructive, irreversible, permission-expanding, or privacy-weakening interpretation.
