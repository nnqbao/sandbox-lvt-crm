# LVT CRM

CRM nội bộ cho Trường THCS Lê Văn Tám. Stack: **Vite + React 19**, backend **Convex Cloud** với **Convex Auth (Password provider)** — đăng nhập email + mật khẩu, hồ sơ do admin cấp.

**URL production:** https://lvt.vscgroup.io.vn
**Chính sách bảo mật (công khai, Việt + Anh):** https://lvt.vscgroup.io.vn/privacy
**Ứng dụng:** CRM Lê Văn Tám — Android `lvt.crm`, iOS `vn.lvt.crm.uikit`
Frontend production chạy static server qua LaunchAgent trên Mac mini, public qua Cloudflare Tunnel. Backend là Convex Cloud: prod `confident-guanaco-953`, sandbox `decisive-puma-318`. Bản Convex self-hosted cũ (Docker, `127.0.0.1:3210`) đã ngừng từ 2026-09-14.

> **Sandbox, prod, quy trình phát hành, lệnh deploy, backup:** xem mục *Môi trường, quy trình phát hành và vận hành* trong [`AGENTS.md`](AGENTS.md). Mọi thay đổi làm ở sandbox trước, owner duyệt rồi mới lên prod.

Vận hành production:

- Build + deploy web prod: `npm run build:production` (chạy trong `~/projects/LVT-CRM` là deploy luôn)
- Chạy local production: `npm run start`
- **Hướng dẫn AI session:** Cursor đọc `.cursor/rules/*.mdc`; Claude Code đọc `CLAUDE.md`; chi tiết sản phẩm/import user trong `README.md`.
- Backup Convex prod (gồm file storage) tự động lúc 00:30 bằng `~/ops/scripts/lvt-crm-convex-backup.sh`, lưu `~/projects/LVT-CRM/.runtime/backups/convex/cloud-*.zip`, giữ 7 ngày.
- Deploy key Convex Cloud chỉ đọc từ `~/projects/LVT-CRM/.convex-cloud-keys.csv` (untracked) qua `scripts/lvt-convex-cloud-env.sh`; không lưu trong source, bundle hay log.
- File công văn (Drive mới **và** Convex Storage cũ) không bao giờ đưa link cho trình duyệt. Frontend gửi Convex Auth token đến `/api/files/:documentId`; server kiểm tra quyền, lấy từ **cache server 24 giờ** (hoặc tải Drive/storage một lần rồi cache), rồi mới stream. Upload Drive prewarm cache (best-effort).
- Drive OAuth do `gog` quản lý ngoài repo. Folder ID được đọc từ macOS Keychain với service `lvt-crm-drive-folder-id`; không commit OAuth token/credential hoặc bật “Anyone with the link”.
- Quên mật khẩu (web / Android / API iOS): `users.requestPasswordReset` gửi mật khẩu tạm qua AgentMail từ inbox `thcslevantambinhthanh@agentmail.to`. Cấu hình Convex env `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID` (xem `.env.example`); thiếu cấu hình báo `MAIL_NOT_CONFIGURED`, key sai/thiếu quyền báo `MAIL_AUTH_FAILED`. Không commit API key.

## Phạm vi hiện tại

- Xác thực **email + password only**. Không public signup, không email verification. Sai email/mật khẩu, tài khoản **khóa đăng nhập**, và tài khoản **disable** mỗi loại một thông báo rõ, không cho login.
- Quên mật khẩu tự phục vụ: gửi mật khẩu tạm **trước**, chỉ xoay credential khi mail thành công; cooldown 5 phút/user, **không** rate-limit IP. Sau đó bắt buộc đổi MK (`mustChangePassword`).
- Đổi MK trên trang **Đổi mật khẩu** (menu tài khoản góc trên) phải nhập **mật khẩu hiện tại**. Cổng đổi MK bắt buộc (lần đầu / admin reset, web + Android/iOS) chỉ hỏi MK mới.
- **Ba vai trò hệ thống** trên `users.role`:
  - `admin` — **Administrator**: toàn quyền, bao gồm **Thiết lập tối cao** và quản lý tài khoản.
  - `moderator` — **Moderator**: toàn quyền nghiệp vụ và **Quản trị hệ thống**, không thấy/không truy cập **Thiết lập tối cao**.
  - `user` — **User**: các chức năng chính theo **nhóm quyền** do Administrator gán.
- Administrator quản lý thông số tối cao; Administrator và Moderator cùng quản lý nghiệp vụ (công tác, công việc, …).
- Mật khẩu băm bởi Convex Auth (Scrypt); plaintext không lưu / không ghi audit. Tài khoản tạo/reset có `mustChangePassword=true`.
- **Đã có luồng dữ liệu:** Lịch công tác (cá nhân + lịch chung dạng mẫu Word/PDF, xác nhận tham gia, địa điểm nhập text), Công việc (tạo/giao ngay, nộp + duyệt hoàn thành), Báo cáo (Công việc; Bán trú đang ẩn), Thông báo (mốc hạn + click mở đúng mục), Thiết lập hiển thị.
- **Đã có nền tảng Lớp chủ nhiệm (Phase 1):** năm học, lớp, phân công GVCN/Giám thị, học sinh/phụ huynh, nhập danh sách Excel (atomic), nhập/công bố điểm danh camera có giới hạn, sổ điểm danh ngày, phân loại vắng, báo cáo/xuất cơ bản. Ngày chuyển lớp / thay GVCN thuộc lớp/GVCN mới; bản ghi cũ đóng ngày trước đó (`endDate`/`effectiveTo` inclusive). Chưa chốt workbook camera thật và lịch ngày học nhà trường.
- **Vẫn placeholder:** Đánh giá nhân sự.

## Mô hình phân quyền

### Vai trò hệ thống (`users.role`)

| Key | Tên UI | Quyền |
|-----|--------|--------|
| `admin` | Administrator | Toàn quyền, gồm Thiết lập tối cao và lifecycle tài khoản |
| `moderator` | Moderator | Toàn quyền chức năng và quản trị nghiệp vụ; không truy cập Thiết lập tối cao |
| `user` | User | Menu = `permissionGroups.menuAccess` (mặc định ẩn nếu chưa gán nhóm; **Thông báo** mặc định `view`) |

Chỉ Administrator thấy **Thiết lập tối cao**. Moderator thấy **Chức năng chính** và **Quản trị hệ thống**. User thấy **Chức năng chính** theo nhóm quyền.

### Nhóm quyền (`permissionGroups`)

Mỗi nhóm quy định quyền trên **7** menu **Chức năng chính**:

| Menu id | Nhãn |
|---------|------|
| `reports` | Báo cáo |
| `notifications` | Thông báo |
| `duties` | Lịch công tác |
| `work` | Công việc |
| `homeroom` | Lớp chủ nhiệm |
| `people-review` | Đánh giá nhân sự |
| `staff-faults` | Ghi nhận lỗi |

Mỗi menu có một mức: **`hidden`** (ẩn) · **`view`** (thao tác nghiệp vụ trong phạm vi của mình) · **`view_all`** (thao tác nghiệp vụ trên phạm vi toàn trường, nơi module hỗ trợ) · **`supervisor`** (**Giám thị**, chỉ menu `homeroom`). Mức legacy **`edit`** vẫn đọc được nhưng chuẩn hóa thành `view` khi lưu; không dùng `edit` để biểu diễn Giám thị. **Giám thị** không phải vai trò hệ thống (`users.role` vẫn là `user`), không thỏa `view_all`, và không được `canOperateMenu`. Phạm vi lớp/toàn trường của Giám thị đến từ phân công riêng, không từ riêng mức menu. Tạo công việc/công tác toàn trường vẫn theo role/cấp, không theo mức menu. Menu **Ghi nhận lỗi**: hai mục **Lỗi của tôi** / **Lỗi do tôi ghi nhận**; **Xem** chỉ thấy hai mục đó; **Xem tối cao** vẫn theo cùng hai mục (lỗi của người khác hiện nếu mình là đối tượng hoặc người ghi); nút thêm chỉ admin/mod và cấp 2–5★.

- Mỗi nhóm có **mã** (`code`): tối đa **20** ký tự, chỉ `A–Z 0–9 _ -`, luôn lưu/hiển thị **IN HOA**; dùng trong file import user (`ma_nhom_quyen`).
- Nhóm cũ thiếu mã được backfill tự động (`permissionGroups.ensureCodes`): chữ cái đầu mỗi từ tên (bỏ dấu), nếu trùng thì 3 rồi 4 ký tự đầu, rồi thêm số.
- Gán user: form Thiết lập người dùng **hoặc** nút **Thêm user** trong Thiết lập nhóm quyền.
- Xóa = soft-delete (`active=false`). **Không cho xóa** nếu còn user đang gán (`HAS_ASSIGNED_USERS`). Tạo lại trùng **mã** (không phải tên) → bật lại bản ghi soft-deleted.

### Phòng ban (`departments`)

CRUD phòng ban (tên + mã). Rule mã giống nhóm quyền/chức vụ (≤20, `A–Z0–9_-`, IN HOA). Gán user khi tạo user hoặc từ màn phòng ban. Xóa = soft-delete; **chặn xóa** khi còn user đang gán. Tạo lại trùng mã → reactivate.

### Chức vụ (`positions`)

CRUD chức vụ với **cấp bậc 1–5 sao** (vàng). Cấp bậc dùng cho **quy trình duyệt** công văn / công việc và nền tảng workflow:

| Cấp | Ý nghĩa duyệt |
|-----|----------------|
| 5★ | Duyệt được cấp 4, 3, 2, 1 |
| 4★ | Duyệt được 3, 2, 1 (không duyệt 5) |
| 3★ / 2★ | Duyệt cấp thấp hơn |
| 1★ | Không duyệt được ai |

- Cùng cấp không duyệt nhau; chỉ **cấp cao hơn** duyệt cấp thấp hơn (`canApproveLevel` trong `convex/lib.ts`).
- Task nhiều cấp duyệt: cấp cao hơn được **duyệt thay** cấp thấp; mỗi lần duyệt ghi `approvalLogs` (actor, level, task, on-behalf, thời điểm).
- Rule mã / soft-delete / chặn xóa khi còn user / reactivate theo mã: giống phòng ban.
- Gán user: form user hoặc nút **Thêm user** trong Thiết lập chức vụ.

### Công việc / công văn

- Công việc **không duyệt công văn**. Tạo xong là giao ngay. User **Nộp** kèm file bằng chứng và có thể gửi thêm nội dung text (không bắt buộc) cho người giao; **người tạo** mới đánh dấu hoàn thành (kèm %) hoặc trả về (kèm lý do, có thể đổi hạn).
- Badge menu **Công việc** = task chờ duyệt hoàn thành + việc chưa hoàn thành của tôi + việc chưa hoàn thành tôi tạo.
- Danh sách **Việc của tôi** / **Việc tôi tạo**: bốn tab **Việc cần làm**, **Đang chờ duyệt**, **Quá hạn**, **Đã duyệt hoàn thành** — mỗi tab hiện số việc. Thẻ công việc dùng icon Thu gọn/Chi tiết/Sửa/Xóa; icon chat mở trao đổi (rich text) trên Convex cho mọi người đã thấy việc đó (người giao, người nhận, admin/mod, 4/5★ theo chế độ hiển thị). Người gửi có thể **thu hồi** tin của mình trong 15 phút (giữ dòng, hiện *Tin nhắn đã được thu hồi*). Tin nhắn mới (chưa thu hồi) tạo thông báo chuông cho người khác được xem thread; bấm thông báo mở đúng việc và popup Trao đổi.
- Sửa/xóa: người tạo đến khi user nộp; admin/mod mọi lúc.
- File đính kèm công việc là tùy chọn. Có file thì **bắt buộc chọn Loại văn bản** (Kế hoạch / Biên bản / Báo cáo, catalog admin). File cũ chưa có loại được gắn mặc định **Biên bản**. Danh sách ưu tiên **tên công việc**.
- Nộp hoàn thành: bắt buộc file bằng chứng **và** loại văn bản. Bằng chứng cũ chưa có loại cũng gắn **Biên bản**.
- File xem/tải qua `/api/files/:documentId` + cache server; không trả URL Drive hay Convex Storage cho client.

### Cấu trúc menu

1. **Chức năng chính**: Báo cáo (submenu: Công việc; Bán trú đang ẩn), **Trao đổi** (hub hai cột `/trao-doi`, luôn hiện với người đã đăng nhập; danh sách cuộc trò chuyện Công tác / Công việc / Nhóm), **Lịch công tác** (tab **cá nhân** = lịch tuần/tháng/quý/năm kèm cột nhân sự như Báo cáo Công việc; tab **chung** = mẫu Word/PDF; nút **Tạo công tác** / **Import Excel** cho admin/mod và tổ trưởng/tổ phó 2/3★ — tạo mở trang riêng `/cong-tac/tao`; thẻ/hàng công tác dùng icon Thu gọn/Chi tiết/Sửa/Xóa và icon chat trao đổi trên Convex — quyền chat = quyền thấy công tác trên lịch cá nhân: admin/mod, `view_all`, người tạo, người tham gia, cấp dưới cùng phòng), Công việc (nút **Tạo công việc** cùng nhóm), Lớp chủ nhiệm, Đánh giá nhân sự, Ghi nhận lỗi. **Thông báo** không nằm trên sidebar; mở từ chuông góc trên → **Xem toàn bộ**. **Hồ sơ nội bộ / Đổi mật khẩu / Quản lý thiết bị đăng nhập** mở từ avatar tròn góc trên (không còn mục Thông tin cá nhân trên sidebar). `/bao-cao/cong-tac` chuyển vào tab lịch chung.
2. **Quản trị hệ thống**: đang ẩn (Quản lý công tác / bán trú / công việc đã gộp hoặc tạm tắt).
3. **Thiết lập tối cao** (chỉ Administrator): Thiết lập người dùng, phòng ban, nhóm quyền, chức vụ, **loại văn bản**, **Thiết lập hiển thị**. Thiết lập địa điểm đã gỡ; địa điểm công tác nhập text tự do.

### Thông báo & Thiết lập hiển thị

- Feed tính theo mốc giờ trước hạn riêng cho từng nguồn (mặc định `48 · 24 · 12 · 0` / Đến hạn nếu chưa tách). **Công tác** và **Công việc** được gán cho user có thể khác mốc.
- Chuông trên header (và **Xem toàn bộ**); đánh dấu đã đọc / đọc tất cả; xóa thông báo khi quyền menu `notifications` cho phép thao tác. Trang `/thong-bao` vẫn mở được; không còn mục Thông báo trên sidebar.
- **Click thông báo** → chuyển sang menu Công tác hoặc Công việc và scroll/highlight đúng bản ghi (`sourceType` + `sourceId`). `duty` và `duty_assigned` cùng focus thẻ công tác; `work_assigned` cùng `department_work` / `personal_task` focus thẻ công việc. `work_chat` / `duty_chat` / `group_chat` mở đúng cuộc trò chuyện trong menu **Trao đổi** (popup trên thẻ Công tác/Công việc vẫn dùng chung bảng tin). Tin Trao đổi mới (chưa thu hồi) vào chuông của người xem thread, không phải người gửi; độc lập với công tắc mốc hạn Công việc/Công tác. Công việc mới (giống công tác mới) hiện ngay trên feed với nhãn **Mới phân công**, không chờ mốc hạn. Công tác mới/cập nhật cũng gửi APNs/FCM tới người tham gia (phòng ban hoặc cá nhân), kể cả khi người tạo tự thêm mình. Người được giao công việc nhận thông báo kể cả khi tự tạo việc cho mình; người tạo không nhận nếu chỉ giao cho người khác. Android nhận FCM data-only (không gắn `android.notification` rỗng) rồi hiện banner từ feed; mở lại app cũng sync ngay. iOS lock screen cần APNs alert (`APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`; `APNS_BUNDLE_ID` mặc định `vn.lvt.crm.uikit`; `APNS_PRODUCTION=true` khi cài Ad Hoc/TestFlight).
- Admin cấu hình trong **Thiết lập hiển thị**: bật/tắt xác nhận tham gia công tác; **Ai nhìn thấy công việc?** (chỉ người tạo / người tạo+người nhận+4/5★+admin/mod); bật/tắt nguồn thông báo Công tác/Công việc; chỉnh **mốc giờ riêng** cho từng nguồn.
- User tự đặt **nhắc nhở cá nhân** trên từng công tác chưa diễn ra / công việc còn phải làm của chính mình (list 1 cột, toggle bên phải thẻ). Nhắc này độc lập với mốc Admin: tắt nguồn toàn trường không tắt nhắc cá nhân. Web trước; native app sau.

## Schema chính

| Bảng | Mục đích |
|------|----------|
| `users` (+ authTables) | Hồ sơ, `role`, `departmentId`, `permissionGroupId`, `positionId`, status, `mustChangePassword`, `loginLockedAt`, `importRollbackAt` |
| `departments` | Phòng ban (`code` unique) |
| `locations` | Địa điểm (catalog cũ; công tác mới dùng `duties.locationText`) |
| `permissionGroups` | Nhóm quyền + `code` + `menuAccess[]` (`supervisor` chỉ cho `homeroom`) |
| `schoolYears`, `schoolCalendarDays`, `homeroomClasses`, `homeroomAssignments` | Năm học, lịch ngày học, lớp, phân công GVCN/Giám thị |
| `students`, `studentGuardians`, `classEnrollments` | Học sinh, liên hệ, quá trình học theo năm |
| `studentRosterImportUploads`, `studentRosterImportRows` | Nhập danh sách lớp (staged, atomic) |
| `attendanceImportUploads`, `attendanceImportRows`, `studentAttendanceDays`, `studentAttendanceCorrections` | Import camera, sổ ngày, nhật ký phân loại |
| `positions` | Chức vụ + `code` + `level` 1–5 |
| `documentTypes` | Loại văn bản công việc (Kế hoạch / Biên bản / Báo cáo) |
| `userImportUploads` | File Excel import user tạm (Convex Storage, TTL 1 giờ) |
| `dutyImportUploads` | File Excel import công tác tạm (Convex Storage, TTL 1 giờ) |
| `duties` / `dutyAttendances` | Lịch công tác + trạng thái tham gia |
| `dutyMessages` | Chat theo công tác (HTML đã lọc, quyền xem = quyền thấy công tác trên lịch cá nhân; `recalledAt` = thu hồi mềm) |
| `chatNotificationEvents` | Thông báo chuông theo người nhận cho tin Trao đổi (công việc / công tác / nhóm) |
| `chatThreads` / `chatInbox` / `chatCounters` | Tóm tắt thread, hộp thư theo user (preview, chưa đọc, hoạt động mới nhất), badge một dòng |
| `chatGroups` / `chatGroupMembers` / `groupMessages` | Nhóm do user tạo: chủ nhóm quản lý, thành viên rời, admin xem/giải tán |
| `chatHubSync` | Con trỏ backfill một lần cho thread Công tác/Công việc đã có trước hub |
| `personalReminders` | Nhắc nhở cá nhân theo user + công tác/công việc |
| `boardingPeriods` | Kỳ bán trú (menu đang ẩn) |
| `officeDocuments` | Công việc đã giao, tên, tệp đính kèm tùy chọn |
| `workItems` | Phân công phòng ban / cá nhân và tiến độ nộp |
| `personalTasks` | Đầu mục cá nhân, người thực hiện, deadline và trạng thái hoàn thành |
| `workMessages` | Chat theo công việc (HTML đã lọc, quyền xem = quyền thấy việc; `recalledAt` = thu hồi mềm) |
| `systemSettings` | Cờ hiển thị / cấu hình thông báo |
| `notificationReads` / `notificationDismissals` | Đã đọc / đã xóa theo `notificationKey` |
| `roles` | Legacy seed admin permissions (tùy chọn; gate admin thực tế = `role === "admin"`) |
| `auditLogs` | Audit thao tác admin |
| `approvalLogs` | Log duyệt / duyệt thay (nền tảng workflow) |

Backend modules: `convex/users.ts`, `userImport.ts`, `userImportParse.ts`, `userImportValidate.ts`, `userImportSheet.ts`, `entityCodes.ts`, `departments.ts`, `locations.ts`, `permissionGroups.ts`, `positions.ts`, `duties.ts`, `dutyWritePolicy.ts`, `dutyImport.ts`, `dutyImportParse.ts`, `dutyImportValidate.ts`, `dutyImportSheet.ts`, `dutyMessages.ts`, `dutyMessagePolicy.ts`, `boarding.ts`, `reports.ts`, `work.ts`, `workMessages.ts`, `workMessagePolicy.ts`, `chatMessagePolicy.ts`, `chatNotifications.ts`, `notifications.ts`, `notificationSettings.ts`, `personalReminders.ts`, `personalReminderPolicy.ts`, `settings.ts`, `lib.ts`, `seed.ts`, `auth.ts`, `http.ts`.

Cấu trúc frontend gợi ý:

```
src/
  main.jsx              # shell, auth UI, duties CRUD, profile
  notifications/        # feed, chuông, click → focus bản ghi
  work/                 # công văn & công việc
  boarding/             # bán trú
  reports/              # báo cáo công tác / công việc
  settings/             # thiết lập hiển thị
  duties/ · profile/ · management/
convex/                 # schema + functions
infra/convex-local/     # Docker Compose Convex local
scripts/check-files.mjs
```

## Convex Auth beta

`@convex-dev/auth` đang **beta**:

- JWT access token vẫn hợp lệ đến khi hết hạn (~1 giờ) sau khi session bị revoke; refresh/session vô hiệu theo `invalidateSessions`.
- Không có managed IdP; backup volume Docker và first-admin là trách nhiệm vận hành.
- Trước production cứng: security review + kế hoạch rollback/migration.

## Yêu cầu

- Node.js 20+ và npm.
- Docker/Colima cho Convex local.
- Admin key local. **Không** commit secret, password, token, `.env` thật.

## Clone và chạy local

```bash
git clone https://github.com/kingrubic/LVT-CRM.git
cd LVT-CRM
npm install
cp .env.example .env.local
```

### Convex self-hosted (Docker/Colima)

```bash
colima start --cpu 4 --memory 8 --disk 60 --vm-type=vz --mount-type=virtiofs
docker compose -f infra/convex-local/docker-compose.yml up -d
```

| Service | URL |
|--------|-----|
| Backend/API | `http://127.0.0.1:3210` |
| Site proxy (auth HTTP) | `http://127.0.0.1:3211` |
| Dashboard | `http://127.0.0.1:6791` |

`.env.local` (gitignored, chỉ dành cho local development):

```dotenv
VITE_CONVEX_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=<admin key from local deployment>
# optional site origin for auth routes
# VITE_CONVEX_SITE_URL=http://127.0.0.1:3211
```

**Lưu ý shell:** admin key thường chứa ký tự `|`. Không `source .env.local` trực tiếp trong bash (pipe bị hiểu nhầm). Dùng export an toàn hoặc load qua script/Python.

Không đưa admin key vào source, bundle Vite, hoặc browser.

### Convex Auth keys (deployment env)

Cần `JWT_PRIVATE_KEY` và `JWKS` trên **deployment** (không phải Vite):

```bash
node --input-type=module -e '
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });
process.stdout.write(`JWT_PRIVATE_KEY="${privateKey.trimEnd().replace(/\n/g, " ")}"\n`);
process.stdout.write(`JWKS=${jwks}\n`);
'
```

```bash
npx convex env set JWT_PRIVATE_KEY "..."
npx convex env set JWKS "..."
npx convex env set SITE_URL http://localhost:5173
# production tunnel ví dụ: SITE_URL=https://lvt.vscgroup.io.vn
```

`auth.config.ts` dùng `process.env.CONVEX_SITE_URL` (local proxy `http://127.0.0.1:3211`).

### Đẩy functions + seed + frontend

```bash
# Convex Cloud: key đọc từ ~/projects/LVT-CRM/.convex-cloud-keys.csv (dòng LVT-CRM), không in ra.
npm run convex:dev -- --once        # dev:decisive-puma-318 (sandbox)
LVT_CONVEX_CONFIRM_PROD=confident-guanaco-953 npm run convex:deploy -- -y   # prod, cần tree sạch

npx convex run internal.seed.seed

npm run dev
# production-like build:
npm run build
```

**Seed tạo:**

- Phòng ban mẫu: BGH, Tổ Toán, Tổ Ngữ văn, Hành chính  
- Nhóm quyền: **Cơ bản**, **Toàn quyền nghiệp vụ**  
- Chức vụ: Hiệu trưởng 5★ … Nhân viên 1★  
- Đồng bộ legacy `roles` key `admin` (permissions audit); deactivate key `manager` / `user` cũ  

### First admin (operator-only)

Không có admin/password mặc định, không public bootstrap.

```bash
npx convex run internal.users.provisionFirstAdmin \
  '{"email":"admin@example.school","name":"Quản trị viên","temporaryPassword":"<temp-at-least-8-chars>"}'
```

- Chỉ thành công khi **chưa có** active admin.
- `role=admin`, `mustChangePassword=true`.
- Truyền password tạm qua kênh nội bộ; không commit/chat plaintext.
- Đăng nhập → bắt buộc đổi MK trước khi vào CRM.

## Admin user lifecycle

1. Administrator tạo user: email (unique, trim+lowercase), tên, **role** (`admin`|`moderator`|`user`), phòng ban / chức vụ / nhóm quyền (tùy chọn), temporary password ≥8. `createAccount` (provider `password`).
2. `mustChangePassword=true`; audit không chứa password. **Mọi user đăng nhập lần đầu / sau reset đều phải đổi mật khẩu.**
3. User `signIn` only. Flag còn true → chỉ form đổi MK; server chặn thao tác nghiệp vụ. `loginLockedAt` chặn login **và** mutation/query đã đăng nhập (`currentUserOrThrow`).
4. Đổi MK hồ sơ: `changeOwnPassword` **bắt buộc `currentPassword`**. Cổng `mustChangePassword` (web/Android/iOS) chỉ gửi `newPassword`. Sau đó `modifyAccountCredentials`, `invalidateSessions` (giữ session hiện tại), clear flag.
5. Admin reset MK → flag + credentials + revoke mọi session target.
6. Disable → `disabled` + invalidate sessions + xóa push token / device metadata; `beforeSessionCreation` từ chối user không active.
7. Remove → soft-delete giống disable (kèm dọn push/device). Không xóa auth tables trực tiếp. Cấm tự xóa active account. Cấm khóa/xóa/hạ quyền **admin đang hoạt động cuối cùng** (`LAST_ACTIVE_ADMIN`).
8. Public `signUp` / `reset` / email verification bị từ chối trong `convex/auth.ts`.
9. Quên mật khẩu: gửi email trước; thất bại mail **không** xoay credential. Không rate-limit IP.

### Import Excel công tác

UI: trang **Công tác** — nút *Import Excel* cạnh *Tạo công tác* (`src/duties/DutyBulkImport.jsx`).

**Phạm vi**

- Cùng quyền với **Tạo công tác**: admin/mod + tổ trưởng/tổ phó (2/3★). Tổ trưởng **không** được điền `ma_phong_ban`; chỉ email cấp dưới cùng phòng.
- Chỉ file **`.xlsx`**, tối đa **2 MB**, tối đa **200** dòng. Không CSV.
- All-or-nothing: một dòng lỗi → không commit; báo lỗi theo dòng.
- Chỉ khi **mọi dòng hợp lệ** mới hiện xem trước → xác nhận mới tạo công tác.
- Mỗi dòng tạo một `duties` (không unique lịch). Công tác của văn thư (admin/mod) vào lịch tuần chờ BGH duyệt; công tác của tổ trưởng push ngay giống tạo tay.

**Cột file mẫu (không dấu)**

`ten_cong_tac`, `noi_dung`, `dia_diem`, `ngay_bat_dau`, `gio_bat_dau`, `ngay_ket_thuc`, `gio_ket_thuc`, `ca_ngay`, `ma_phong_ban`, `email_tham_gia`, `thanh_phan_khac`

- Ngày: `YYYY-MM-DD` hoặc `dd/mm/yyyy`.
- `ca_ngay`: `1`/`0`, `có`/`không`, `true`/`false`; trống = không cả ngày. Khi cả ngày: ngày kết thúc = ngày bắt đầu, giờ mặc định `08:00`–`17:00`.
- `ma_phong_ban` / `email_tham_gia` / `thanh_phan_khac`: mã phòng và email nhiều giá trị cách nhau dấu phẩy; được để trống từng cột. Văn thư (admin/mod) được để trống cả ba và bổ sung thành phần sau; tổ trưởng **phải có ít nhất một** email hoặc thành phần khác (tối đa 500 ký tự). Thành phần khác không nhận thông báo nhưng vẫn hiện trên Lịch công tác chung.

**Flow server-first**

1. Client chỉ kiểm tra extension/size, rồi upload Convex Storage + `dutyImport.registerUpload` (TTL **1 giờ**).
2. `dutyImport.validateUpload({ uploadId })` — server đọc lại file, chặn nếu quá hạn hoặc blob > 2 MiB.
3. `dutyImport.commit({ uploadId })` — đọc lại cùng file, validate lần nữa, claim một lần, insert atomic. **Không tin rows từ client.**

**Code chính:** `convex/dutyImport.ts`, `dutyImportParse.ts`, `dutyImportValidate.ts`, `dutyImportSheet.ts`; test `tests/duty-import.test.mjs`.

### Duyệt Lịch công tác chung theo tuần

Quy trình trường yêu cầu (10/2026): văn thư soạn → nộp → BGH duyệt → giáo viên mới thấy.

- **Văn thư** = admin/mod. Soạn lịch tuần (thứ Hai–thứ Bảy) trên trang *Lịch công tác chung*; được nhập 4 cột trước, **Thành phần không bắt buộc**, bổ sung sau. Bấm **Nộp BGH duyệt**.
- **BGH** = tài khoản đang hoạt động, **không** phải admin/mod, chức vụ cấp **4–5**. **Một** người duyệt là đủ. Duyệt **cả tuần** một lần, hoặc **Trả lại** kèm lý do (bắt buộc, ≤ 500 ký tự).
- **Giáo viên** (mọi người khác) chỉ thấy bản đã duyệt: trang chung, lịch cá nhân (web + app), điểm danh, trao đổi, nhắc việc, chuông. Tuần chưa duyệt hiện "Lịch tuần này chưa được duyệt".
- **Sửa sau khi duyệt** (sửa, thêm, xóa, đổi tuần) phải nộp duyệt lại; trong lúc chờ, giáo viên vẫn thấy bản cũ. Văn thư có thể **Hủy thay đổi** để quay về bản đã duyệt. Sửa khi tuần đang *Chờ duyệt* sẽ rút bản nộp về Nháp.
- **Công tác tổ trưởng/tổ phó (cấp 2–3) giao cho tổ**: không qua duyệt, hiện ngay cho thành viên, **không** lên trang chung.

Kỹ thuật:

- `duties.scope` (`school` | `team`), `approvalTracked`, `published` (bản đã duyệt) + `publishedStartDate/EndDate`. Dòng cũ không có `approvalTracked` được coi là đã duyệt; lần sửa/xóa đầu tiên chụp bản đang hiện vào `published`.
- Bảng `dutyWeeks` giữ trạng thái tuần (`submitted` / `returned` / `approved` / `draft`). Trạng thái hiển thị (Nháp, Chờ duyệt, Bị trả lại, Đã duyệt, Đã duyệt · có thay đổi) tính từ dữ liệu trong `convex/dutyApproval.ts`.
- Mutation: `dutyWeeks.submit`, `approve({ weekStart, submittedAt })`, `returnWeek`, `discardChanges`. `submittedAt` ghim đúng bản BGH đã xem; sửa sau đó làm `approve` báo `DUTY_WEEK_CHANGED`.
- Mọi đường đọc của giáo viên đi qua `projectPublicDuty` / `loadPublicDutiesFromEndDate`.
- Sau khi deploy lần đầu chạy một lần `dutyWeeks:backfillScope` (internal) để gán `scope` cho dòng cũ.

### Import user hàng loạt (SYS-011 · chỉ Administrator)

UI: **Thiết lập người dùng** — nút *Tải file nhập liệu mẫu* + *Import file nhập liệu* + *Xuất DS người dùng* (`src/settings/UserBulkImport.jsx`).

**Phạm vi**

- Chỉ tạo tài khoản `role=user`. Moderator/Admin phải tạo tay trên web.
- Chỉ file **`.xlsx`**, tối đa **2 MB**. Không CSV.
- All-or-nothing: một dòng lỗi → không commit; báo lỗi theo dòng + tải PDF báo cáo.
- Chỉ khi **mọi dòng hợp lệ** mới hiện xem trước → Admin xác nhận mới tạo user.

**Cột file mẫu (không dấu)**

`ho_ten`, `email`, `ma_phong_ban`, `ma_chuc_vu`, `ma_nhom_quyen`, `mat_khau_tam_thoi`

- Không có cột vai trò (luôn `user`).
- Không được để trống bất kỳ cột nào → `"Vui lòng điền đầy đủ các cột thông tin người dùng"`.
- PB / chức vụ / nhóm quyền map theo **mã** (không phân biệt hoa thường; chuẩn hóa IN HOA). Sai/không khớp → `"Thông tin [Phòng ban, Chức vụ, Nhóm quyền] không chính xác, vui lòng đảm bảo chính xác với hệ thống"`.
- Trùng email trong file hoặc đã có trong DB → `"Phát hiện email trùng, vui lòng kiểm tra lại"` (chi tiết dòng / email).
- Mật khẩu tạm do admin điền trong file, ≥ 8 ký tự; user tạo ra luôn `mustChangePassword=true`.
- Mã PB/chức vụ/nhóm quyền đang dùng trong hệ thống nếu sai rule (≤20, `A–Z0–9_-`) → chặn import và chỉ rõ mục nào admin phải sửa trước.

**Flow server-first (bắt buộc)**

1. Client chỉ kiểm tra extension/size tối thiểu, rồi **upload file lên Convex Storage** + `userImport.registerUpload` (TTL **1 giờ**, kể cả khi file lỗi hoặc đã import thành công).
2. `userImport.validateUpload({ uploadId })` — server đọc lại file từ storage (`userImportParse.parseStorageXlsx`), **chặn nếu quá `expiresAt` hoặc blob > 2 MiB**, validate, trả errors hoặc preview.
3. `userImport.commit({ uploadId })` — server **đọc lại cùng file**, validate lần nữa, claim `committing`, rồi tạo user. **Không tin rows từ client.** File đã `committed` không commit lại.
4. Nếu tạo dở dang giữa chừng: soft-disable các user đã tạo (`importRollbackAt`); lần import sau **được phép dùng lại email đó** (reactivate + mật khẩu tạm mới). Email user disable bình thường vẫn chặn trùng. Mã catalog active trùng nhau → chặn import.

**Code chính:** `convex/userImport.ts`, `userImportParse.ts`, `userImportSheet.ts`, `userImportValidate.ts`, `entityCodes.ts`; test `tests/user-import.test.mjs`.

### Xuất danh sách người dùng (SYS-012 · chỉ Administrator)

- Nút **Xuất DS người dùng** cạnh import (màu khác); xuất **client-side** `.xlsx`.
- Chỉ user `status === "active"`. Không xuất vai trò / mật khẩu.
- Cột (header có dấu): `Họ tên`, `Email`, `Mã phòng ban`, `Tên phòng ban`, `Mã chức vụ`, `Tên chức vụ`, `Mã nhóm quyền`, `Tên nhóm quyền`.
- Admin/Moderator: `Mã nhóm quyền` trống, `Tên nhóm quyền` = `Quản trị viên`.
- Tên file: `danh_sach_nguoi_dung_YYYYMMDD_01.xlsx` — số thứ tự tăng theo ngày trên trình duyệt (`localStorage`), qua ngày mới reset `01`.
- Code: `src/lib/userExport.js`; test `tests/user-export.test.mjs`.

## Authorization (server)

- Identity: `getAuthUserId` từ JWT Convex Auth.
- Supreme gate: `status === "active"`, `role === "admin"`, không còn `mustChangePassword` (`adminOrThrow` / `adminPermissionOrThrow`); chỉ dùng cho Thiết lập tối cao và lifecycle tài khoản.
- Operational manager gate: vai trò `admin` hoặc `moderator` (`operationalManagerOrThrow` / `operationalManagerPermissionOrThrow`); dùng cho quản trị bán trú, công việc và nghiệp vụ.
- Menu user: `resolveUserMenuAccess` / query `users.sessionContext`.
- Client chỉ là UX; mọi mutation/action admin re-check server-side.

## Generated files & scripts

`convex/_generated/` và `convex/tsconfig.json` giữ trong tree. Sau khi đổi schema/function:

```bash
npm run check          # scripts/check-files.mjs
npm run build
git diff --check
LVT_CONVEX_CONFIRM_PROD=confident-guanaco-953 npm run convex:deploy -- -y   # prod, tree sạch
```

`npm run typecheck` = `convex codegen --typecheck enable` (cần credentials).

| Script | Việc |
|--------|------|
| `npm run dev` | Vite frontend |
| `npm run build` / `preview` | Build / xem `dist/` |
| `npm run check` | Kiểm tra file bắt buộc |
| `npm run typecheck` | Codegen + typecheck Convex |
| `npm run convex:dev` | `convex dev` vào Convex Cloud dev (`decisive-puma-318`) |
| `npm run convex:deploy` | `convex deploy` vào prod (`confident-guanaco-953`); bắt buộc `LVT_CONVEX_CONFIRM_PROD=confident-guanaco-953` và tree sạch |

## Deploy (Convex Cloud)

Chi tiết và thứ tự sandbox → prod: xem [`AGENTS.md`](AGENTS.md).

1. `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` đã set trên deployment.
2. Sandbox: `npm run convex:dev -- --once`, rồi `npm run build` và restart `ai.lvt.crm.sandbox-web`.
3. Prod (sau khi owner duyệt, từ worktree sạch): `LVT_CONVEX_CONFIRM_PROD=confident-guanaco-953 npm run convex:deploy -- -y`, rồi `npm run build:production` trong `~/projects/LVT-CRM`.
4. Seed (chỉ khi cần, đúng deployment): `npx convex run internal.seed.seed` qua `scripts/lvt-convex-cloud-env.sh`.
6. Host `lvt.vscgroup.io.vn`: client dùng `window.location.origin` làm Convex URL (xem `src/main.jsx`).

## Backup

- Prod: zip hằng đêm 00:30 (giữ 7 ngày) — xem [`AGENTS.md`](AGENTS.md). Backup thủ công: `npx convex export --include-file-storage` qua `scripts/lvt-convex-cloud-env.sh`.
- `infra/convex-local` chỉ còn là cấu hình Docker self-hosted cũ.
- Không commit dump có PII/hash.

## Chuyển sang Convex Pro

1. Deployment Pro + `JWT_PRIVATE_KEY` / `JWKS` / `SITE_URL` (không commit key).
2. `VITE_CONVEX_URL` → Pro; deploy keys chỉ CI/máy deploy.
3. Migrate: users, authAccounts (hash), departments, locations, permissionGroups, positions, duties, dutyAttendances, boardingPeriods, officeDocuments, workItems, personalTasks, systemSettings, notificationReads, notificationDismissals, auditLogs, approvalLogs.
4. Smoke: login; CRUD catalog; menu theo nhóm quyền; công tác / công việc / bán trú; báo cáo 3 loại; chuông thông báo + click mở đúng mục; thiết lập hiển thị; reset MK / forced change.
5. Giữ local tới khi backup + migration OK. Không dùng admin key local cho Pro.

## Production checklist

- [ ] Không có `.env*` thật, JWT private key, password, deploy token, DB dump, PII trong `git diff`.
- [ ] Auth keys chỉ trên deployment env; có quy trình rotate.
- [ ] First admin qua internal action; password tạm đã rotate.
- [ ] Public signup/reset/email verification disabled.
- [ ] Vai trò chỉ `admin`|`moderator`|`user`; user cũ `manager` đã migrate.
- [ ] Test: CRUD user/PB/địa điểm/nhóm quyền/chức vụ; gán user; menu ẩn/xem/xem tối cao; profile + đổi MK; self-disable/delete blocked; audit.
- [ ] Test: thông báo (chuông, đọc, click → Công tác/Công việc); thiết lập hiển thị; báo cáo 3 loại.
- [ ] Hiểu JWT TTL vs session invalidation (beta).
- [ ] `SITE_URL` / origins khớp domain thật.

## Rollback

- **Frontend:** redeploy commit QA trước với `VITE_CONVEX_URL` tương ứng.
- **Convex functions:** deploy revision trước; không xóa DB bừa bãi.
- **Auth data:** hash trong `authAccounts`; schema rollback cần migration. Remove = soft-delete.
- **Clerk (legacy):** đã gỡ khỏi app.

## Known limitations

- Convex Auth beta.
- Đổi email đăng nhập chưa hỗ trợ qua UI (account id = email).
- Session invalidate không kick JWT ngay (chờ hết hạn access token).
- Placeholder còn lại: **Lớp chủ nhiệm**, **Đánh giá nhân sự**.
- Workflow duyệt task đầy đủ (duyệt thay đa cấp ngoài công văn) chưa UI — helper + bảng `approvalLogs` sẵn sàng.
- Production “hard” (Convex Pro + CDN static) chưa bắt buộc; stack hiện tại self-hosted + Vite/tunnel.

## Tham chiếu

- <https://labs.convex.dev/auth>
- <https://labs.convex.dev/auth/config/passwords>
- <https://labs.convex.dev/auth/api_reference/server>
- <https://docs.convex.dev/auth/convex-auth>
