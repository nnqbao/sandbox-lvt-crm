# LVT CRM — Homeroom & Student Attendance Three-Phase Implementation Plan

> **For Cursor:** Read `CLAUDE.md`, `.cursor/rules/*.mdc`, `README.md`, the relevant schema/functions/tests, and this plan before editing. Implement **one phase at a time** as thin tested vertical slices. Do not start a later phase until the current phase passes its acceptance gate and the owner has approved continuing.

**Goal:** Replace the current `Lớp chủ nhiệm` placeholder with a secure electronic homeroom and student-attendance system based on the school's current scanned homeroom book and the 23/7 requirements recap.

**Architecture:** Extend the existing React 19 + Vite frontend and self-hosted Convex backend. Keep authoritative student, class, attendance, import, report, and submission state in Convex. Treat camera Excel files as staged inputs, preserve immutable import evidence and original machine observations, and record human corrections separately. Render usable task-oriented screens in CRM; generate printable/exportable records from normalized data instead of copying each paper page into a separate screen.

**Tech stack:** React 19, Vite, Convex self-hosted, Convex Auth, Node test runner, SheetJS/XLSX where appropriate, existing private-file/upload patterns, server-generated PDF/XLSX when export is added.

---

## 0. Source requirements and current baseline

### 0.1 Verified source requirements

The meeting recap requires:

- Manage student lists by class; student photos are not required.
- The current camera attendance system exports a daily Excel file.
- A supervisor uploads that Excel file to CRM each day, expected before 08:30.
- Supervisors may change an absence to excused or unexcused on the web.
- The electronic homeroom book replaces handwritten records.
- Attendance data automatically populates absence/attendance sections.
- Homeroom teachers enter weekly and monthly reports.
- Records can be exported for printing, archival, and accreditation.
- The school may later integrate Viettel digital signatures.

The acceptance backlog at `acceptance-platform/Backlog_Quan_ly_so_Truong_hoc_VSC.xlsx` is also a required traceability source. Its **Lớp chủ nhiệm và điểm danh** epic contains 43 acceptance items: `CLS-001..CLS-007`, `ATT-001..ATT-016`, and `HOM-001..HOM-020`. Implementation checklists and UAT evidence must reference these IDs rather than relying only on phase prose.

Backlog-to-phase mapping:

- Phase 1: `CLS-001..CLS-007`, `ATT-001..ATT-016`, plus the attendance foundation required by `HOM-002..HOM-005`, `HOM-009`, `HOM-016`, and `HOM-019`.
- Phase 2: `HOM-001..HOM-016`, `HOM-019`, and `HOM-020`, reusing Phase 1 attendance rather than copying totals.
- Phase 3 discovery/integration: `HOM-017..HOM-018`.

The backlog and scanned book serve different purposes: the backlog supplies acceptance IDs, dependencies, roles, and UAT expectations; the scanned book supplies the exact field/page inventory and print form. Neither source silently overrides a security, privacy, or data-integrity invariant in this plan.

The scanned 65-page homeroom book additionally contains:

- Class identity and homeroom-teacher identity.
- Subject teachers/supervisors, class officers, parent representatives.
- Student and parent contact lists.
- Class situation at beginning of year, semester I, and semester II.
- Previous-year results, goals, plans, monthly plans and reviews.
- Semester/year summaries.
- Per-student monitoring: subjects needing attention, violations/remedies, absences, comments.
- Parent meetings, parent-contact minutes, teacher notes, student self-criticism forms.
- Extracurricular activity reports and management review/signature pages.

### 0.2 Current implementation baseline

At the start of this plan:

- `src/navigationRoutes.js` already maps `homeroom` to `/lop-chu-nhiem`.
- `src/main.jsx` includes `Lớp chủ nhiệm` in primary menus but renders the generic placeholder.
- `convex/lib.ts` and `permissionGroups.menuAccess` currently recognize the `homeroom` menu with `hidden | view | view_all | edit`; legacy `edit` is normalized to `view` and therefore **cannot** represent the new Giám thị permission.
- `convex/schema.ts` has no class, student, parent, student-attendance, or homeroom-book tables.
- `dutyAttendances` is employee attendance for school duties and **must not** be reused for student attendance.
- Existing user bulk import is for employee accounts and **must not** be overloaded for students.

### 0.3 Non-negotiable design principles

1. **School-year history is immutable.** A student moving class or advancing year creates/ends enrollment records; it does not rewrite historical membership.
2. **Camera observation and human disposition are separate facts.** Never overwrite the raw camera-derived status when a supervisor marks excused/unexcused.
3. **Backend authorization is authoritative.** Hiding a button is never sufficient.
4. **Imports are staged, previewed, validated, idempotent, and auditable.** A repeated file cannot silently duplicate attendance.
5. **No student photo in MVP.** Do not add storage or image upload for student portraits.
6. **Minimize sensitive data exposure.** Parent phone numbers and individual student records are visible only to authorized scopes.
7. **Avoid a 65-screen paper clone.** Build normalized workflows and produce paper-compatible exports later.
8. **Use Asia/Ho_Chi_Minh school dates.** Never derive attendance dates from server UTC without explicit Vietnam-time handling.
9. **No public signup or student/parent login in these phases.** This is a staff-only module unless separately approved later.
10. **Preserve unrelated apps and code.** Web/Convex are primary scope. Do not modify `ios-app`, `ios-uikit-lvt`, or `android-app` unless a later explicit task requests mobile support.
11. **Giám thị is a menu permission, not a fourth system role.** A giám thị account remains `users.role === "user"` and receives the specialized capability through its permission group.
12. **The Giám thị level is homeroom-only.** The backend must reject `supervisor` on every menu except `homeroom`; UI restrictions alone are not authorization.

---

# PHASE 1 — Operational MVP: Classes, Students, Camera Import, Daily Attendance, Core Reports

## 1. Phase objective

Deliver the smallest production-usable vertical system that lets the school:

1. Configure a school year and classes.
2. Assign homeroom teachers and authorized supervisors.
3. Import student rosters.
4. Upload and reconcile a daily camera Excel file.
5. Review and publish daily attendance.
6. Mark absence disposition as pending, excused, or unexcused without destroying raw data.
7. View daily/monthly attendance and basic risk alerts.
8. Export attendance details and a basic homeroom attendance report.

This phase is complete only when a real representative workbook can pass preview → reconciliation → publication → correction → report/export with audit evidence.

## 2. Phase 1 scope

### 2.1 In scope

- School-year catalog.
- Class catalog and homeroom-teacher assignment.
- Student master records without photos.
- Year-specific class enrollment/membership history.
- Parent/guardian contacts required by the current book.
- Student roster `.xlsx` import with preview and all-or-nothing validation.
- Daily camera `.xlsx` attendance import.
- Configurable camera column mapping per import; optional reusable mapping profile only if required by more than one real file layout.
- Reconciliation errors and warnings.
- Daily attendance register.
- Supervisor correction: excused/unexcused, reason, note.
- Raw observation preservation and audit history.
- Daily, weekly, and monthly attendance summaries.
- Alerts for missing upload, unmatched rows, unresolved absences, repeated absence, and repeated lateness.
- Basic XLSX/PDF exports.
- Web UI only.

### 2.2 Explicitly out of scope

- Direct camera API integration.
- Viettel digital signature.
- Parent portal or parent-submitted leave requests.
- Student account/login.
- Grade synchronization or school-industry database synchronization.
- Full monthly plan/semester narrative book.
- Parent-meeting minutes.
- Native mobile screens.
- Automatic SMS/email to parents.

## 3. Phase 1 actor and permission matrix

Create server-side helpers for homeroom scope. Do not duplicate authorization checks across handlers.

### 3.1 Permission-group contract for Giám thị

Before implementing homeroom business workflows, extend the permission-group model with a new canonical access value: **`supervisor`** (Vietnamese UI label: **`Giám thị`**).

- Keep the three existing levels `hidden | view | view_all` unchanged for every menu.
- Add **Giám thị** as a fourth visible permission column immediately to the right of **Xem tối cao** in **Thiết lập tối cao → Thiết lập nhóm quyền**.
- Only the **Lớp chủ nhiệm** (`homeroom`) row may select **Giám thị**. Every other row must render a non-interactive unavailable cell such as `—`; do not render an enabled radio that is merely ignored later.
- Persist the selection as `{ menu: "homeroom", access: "supervisor" }`.
- Do **not** reuse legacy `edit`: current normalization maps `edit` to `view`, which would erase the specialized capability.
- Do **not** add `supervisor` to `users.role`. Administrator and Moderator behavior remains unchanged; giám thị accounts remain ordinary `user` accounts assigned to a permission group.
- Validate and normalize on the server. Create/update must reject `supervisor` paired with any menu other than `homeroom` using a stable domain error such as `INVALID_MENU_ACCESS`.
- Unknown access values must never grant access. Existing legacy rows continue to normalize `edit` to `view`; migration/backfill must preserve current groups and must not silently promote any existing user to Giám thị.
- Shared helpers must distinguish specialized supervisor operations from ordinary menu visibility. `supervisor` makes the `homeroom` menu visible and grants only the supervisor workflow described below; it must not accidentally satisfy generic `view_all` checks or broaden access in unrelated modules.
- Explicit class/supervisor assignment remains the data-scope boundary. Selecting **Giám thị** does not by itself grant whole-school data access; whole-school supervisor scope requires a separate explicit configuration approved by the school.

The settings-screen explanatory copy and `README.md` / user guide (now the in-app guide `/huong-dan-su-dung.html`, source `docs/guide/`) must describe four displayed columns while making clear that **Giám thị is available only for Lớp chủ nhiệm**.

| Actor | Default scope | Read | Write |
|---|---|---|---|
| Administrator | Whole school | All classes/students/attendance/imports | All catalogs, assignments, imports, corrections, exports |
| Moderator | Whole school operational scope | All operational records | Same operational actions as admin, but no supreme account settings |
| Supervisor/Giám thị user with `homeroom=supervisor` | Classes assigned through explicit supervisor assignment, or whole-school only if explicitly configured | Student identity needed for attendance, import results, and daily register within supervisor scope | Upload/preview/publish camera files, correct dispositions, and add correction reasons; no homeroom-teacher narrative authority unless separately assigned as the class's teacher |
| Homeroom teacher with `homeroom=view` | Current assigned class(es) | Roster, permitted contacts, attendance, and own-class reports | Maintain allowed student/contact notes; write weekly/monthly comments in later slices; must not alter raw camera observation or use supervisor import/correction actions |
| User with `homeroom=view` but no active homeroom assignment | None | None | None |
| User with `homeroom=view_all` | Whole-school operational/read scope supported by the module | All classes/attendance; sensitive contacts only if a separate business rule grants them | Ordinary homeroom operations supported for `view_all`, but **not** supervisor-only camera upload/publication or attendance disposition correction |
| Hidden/no assignment | None | None | None |

### Permission safeguards

- `view_all` must not automatically expose every parent phone number unless approved; provide a separate `includeSensitiveContacts` policy controlled server-side.
- `supervisor` must not imply `view_all`; scope comes from active supervisor assignment unless a separate whole-school supervisor configuration exists.
- Only `admin`, `moderator`, or a scoped `homeroom=supervisor` user may upload/preview/publish camera attendance or change absence disposition. Enforce this on every Convex query/mutation and staged-upload step.
- A user who loses the Giám thị permission group or supervisor assignment must lose specialized access on the next server call; cached client state must not preserve it.
- A teacher losing assignment must immediately lose access to that class on subsequent Convex calls.
- Historical homeroom teachers may access archived records only if the school explicitly keeps an archival assignment or an operational manager grants access.
- Import upload, preview, commit, replace, and export each re-check actor scope.
- Every correction records actor, timestamp, previous effective status, new disposition, reason, and source import.

## 4. Phase 1 proposed data model

Add tables to `convex/schema.ts`. Exact names may change only if Cursor demonstrates a clearer consistent naming scheme.

### 4.1 `schoolYears`

```ts
{
  name: string,             // "2026-2027"
  startDate: string,        // YYYY-MM-DD
  endDate: string,          // YYYY-MM-DD
  attendanceUploadDueTime: string, // "08:30"
  active: boolean,
  lockedAt?: number,
  createdBy: string,
  updatedBy?: string,
  createdAt: number,
  updatedAt: number,
}
```

Indexes:

- unique-by-policy normalized `name` lookup.
- active date range if needed.

Rules:

- No overlapping active school years unless explicitly approved.
- Locking a year prevents ordinary edits but allows authorized export/read.
- Soft-delete/deactivate rather than destructive delete after dependent data exists.

### 4.2 `homeroomClasses`

```ts
{
  schoolYearId: string,
  code: string,             // e.g. "6A1"
  name: string,             // display name
  gradeLevel: number,       // 6..9 for current school; validate configurable range if needed
  status: string,           // active | archived
  notes?: string,
  createdBy: string,
  updatedBy?: string,
  createdAt: number,
  updatedAt: number,
}
```

Indexes:

- by school year.
- by school year + normalized code.
- teacher/supervisor assignments are effective-dated records, not mutable arrays used as historical truth.

### 4.2A `homeroomAssignments`

Use a separate assignment record so `CLS-002`, `ATT-012`, and historical reports can determine who had scope on the date a record arose:

```ts
{
  classId: string,
  schoolYearId: string,
  userId: string,
  assignmentType: string,   // homeroom_teacher | supervisor
  scopeKind: string,        // class | whole_school (whole_school only by explicit approval)
  effectiveFrom: string,
  effectiveTo?: string,
  active: boolean,
  createdBy: string,
  endedBy?: string,
  createdAt: number,
  updatedAt: number,
}
```

Rules:

- No overlapping active GVCN assignment for the same class unless the school explicitly approves co-teachers.
- Changing GVCN closes the old assignment and creates a new one atomically; never overwrite history.
- Authorization uses the assignment effective for the requested class/date, not only today's assignment.
- Whole-school supervisor scope is never inferred from `homeroom=supervisor`; it requires an explicit assignment/configuration record and audit.
- Index by user + active/effective range and class + assignment type + effective range.

### 4.3 `students`

```ts
{
  studentCode: string,
  fullName: string,
  dateOfBirth?: string,
  gender?: string,          // female | male | other | unknown; do not invent from name
  studentPhone?: string,
  priorityCategory?: string,
  ethnicity?: string,
  hardshipNote?: string,
  status: string,           // active | transferred | withdrawn | graduated | inactive
  createdBy: string,
  updatedBy?: string,
  createdAt: number,
  updatedAt: number,
}
```

Indexes:

- normalized unique student code.
- optional normalized full-name/date-of-birth helper for reconciliation warnings, never as authoritative identity.

### 4.4 `studentGuardians`

```ts
{
  studentId: string,
  relationship: string,     // father | mother | guardian | other
  fullName: string,
  phone?: string,
  isPrimaryContact: boolean,
  notes?: string,
  active: boolean,
  createdBy: string,
  updatedBy?: string,
  createdAt: number,
  updatedAt: number,
}
```

Indexes:

- by student + active.
- optional normalized phone for duplicate warning only.

### 4.5 `classEnrollments`

```ts
{
  studentId: string,
  classId: string,
  schoolYearId: string,
  rosterNumber?: number,
  startDate: string,
  endDate?: string,
  status: string,           // active | transferred | completed | withdrawn
  transferReason?: string,
  createdBy: string,
  updatedBy?: string,
  createdAt: number,
  updatedAt: number,
}
```

Invariants:

- At most one active class enrollment per student per school year unless a documented exception is approved.
- Class and enrollment school year must match.
- Moving a student closes the old row and creates a new row atomically.
- Historical attendance remains linked to the enrollment/class effective on that date.

### 4.6 `studentRosterImportUploads`

Follow the existing employee import's proven staged pattern, but keep a separate table and contracts.

Fields should include:

- storage/blob identity.
- original filename, size, checksum.
- uploadedBy.
- schoolYearId and classId.
- status: uploaded | validated | committing | committed | rejected | expired.
- rowCount, successCount, errorCount.
- createdAt, expiresAt, committedAt.
- deterministic request/import key.

### 4.7 `attendanceImportUploads`

```ts
{
  schoolYearId: string,
  attendanceDate: string,
  sourceKind: string,       // camera_excel
  fileName: string,
  fileSize: number,
  checksum: string,
  storageId: Id<"_storage">,  // required once upload registration succeeds; approved private storage only
  uploadedBy: string,
  columnMapping: {
    studentCode?: string,
    studentName?: string,
    classCode?: string,
    observedAt?: string,
    sourceStatus?: string,
  },
  status: string,           // uploaded | validated | published | superseded | rejected | expired
  rowCount: number,
  matchedCount: number,
  warningCount: number,
  errorCount: number,
  publishedAt?: number,
  supersedesImportId?: string,
  createdAt: number,
  updatedAt: number,
}
```

The officially published source workbook is immutable operational evidence (`ATT-007`). Authorized users can inspect its metadata and download the original through an authorize-first private-file route. Superseding an import never deletes or replaces the prior source bytes.

### 4.8 `attendanceImportRows`

Persist normalized preview/reconciliation rows so commit does not trust client-supplied parsed rows.

```ts
{
  importId: string,
  rowNumber: number,
  rawStudentCode?: string,
  rawStudentName?: string,
  rawClassCode?: string,
  rawObservedAt?: string,
  rawStatus?: string,
  matchedStudentId?: string,
  matchedClassId?: string,
  resolution: string,       // matched | unmatched | ambiguous | duplicate | wrong_class | invalid
  messages: string[],
  normalizedObservedAt?: number,
  createdAt: number,
}
```

### 4.9 `studentAttendanceDays`

One row represents the authoritative daily attendance state for one student/date.

```ts
{
  schoolYearId: string,
  classId: string,
  enrollmentId: string,
  studentId: string,
  attendanceDate: string,
  sourceImportId?: string,
  rawObservation: string,   // present | late | absent | unknown
  rawObservedAt?: number,
  disposition: string,      // none | pending | excused | unexcused | exempt
  effectiveStatus: string,  // present | late | absent_excused | absent_unexcused | absent_pending | no_data | exempt
  reasonCode?: string,
  note?: string,
  firstPublishedAt: number,
  updatedAt: number,
  updatedBy: string,
}
```

Indexes:

- unique-by-policy student + attendanceDate.
- class + attendanceDate.
- schoolYear + attendanceDate.
- source import.

### 4.10 `studentAttendanceCorrections`

Append-only correction log:

```ts
{
  attendanceDayId: string,
  studentId: string,
  attendanceDate: string,
  previousDisposition: string,
  nextDisposition: string,
  previousEffectiveStatus: string,
  nextEffectiveStatus: string,
  reasonCode?: string,
  note?: string,
  evidenceAttachmentIds?: string[], // optional private evidence when school policy requires it
  actorUserId: string,
  at: number,
}
```

Never delete these as part of ordinary editing.

Changing an already confirmed disposition (`ATT-011`) requires a non-empty reason or note. Evidence remains optional until the school approves an evidence policy; any evidence uses private authorized storage and is not copied into generic audit details.

## 5. Phase 1 backend modules and public contracts

Suggested files:

- Create `convex/homeroomPolicy.ts` — centralized class/student/contact/import scope.
- Create `convex/schoolYears.ts` — catalog and locking.
- Create `convex/homeroomClasses.ts` — class CRUD/assignments/transfers.
- Create `convex/students.ts` — student/contact CRUD and scoped queries.
- Create `convex/studentRosterImport.ts` and parser/validator helpers.
- Create `convex/studentAttendance.ts` — daily list, corrections, summaries.
- Create `convex/attendanceImport.ts` and parser/validator helpers.
- Create `convex/homeroomReports.ts` — server-authoritative aggregates.
- Modify `convex/schema.ts`.
- Modify `convex/lib.ts` only for shared policy constants/helpers that genuinely belong there.
- Update generated Convex bindings through approved codegen/deploy workflow; never hand-edit.

### Required contracts

At minimum:

- `schoolYears.list`, `create`, `update`, `setActive`, `lock`.
- `homeroomClasses.listScoped`, `getScoped`, `create`, `update`, `archive`, `transferStudent`.
- `students.listByClass`, `getScoped`, `create`, `update`, guardian mutations.
- `studentRosterImport.generateUploadUrl/registerUpload`, `validateUpload`, `commit`, `getResult`.
- `attendanceImport.generateUploadUrl/registerUpload`, `inspectColumns`, `validate`, `publish`, `replacePublishedImport`, `getResult`.
- `studentAttendance.listDailyClass`, `setDisposition`, `getStudentHistory`, `getClassSummary`.
- `homeroomReports.attendanceSummary` and export preparation contracts.

Contract naming should match current repository conventions after inspection.

## 6. Phase 1 import behavior

### 6.1 Student roster workbook

Provide a downloadable template with columns such as:

- `ma_hoc_sinh`
- `ho_ten`
- `ngay_sinh`
- `gioi_tinh`
- `so_thu_tu`
- `dien_thoai_hoc_sinh`
- `ho_ten_cha`
- `dien_thoai_cha`
- `ho_ten_me`
- `dien_thoai_me`
- `ho_ten_nguoi_giam_ho`
- `dien_thoai_nguoi_giam_ho`
- `dien_uu_tien`
- `dan_toc`
- `hoan_canh_kho_khan`
- `ghi_chu`

Validation:

- `.xlsx` only; define and document a bounded size/row limit.
- Student code required and unique within file.
- Existing active student code updates only through an explicit merge/update mode; default create mode rejects duplicates.
- Class/year must be active and in actor scope.
- Date formats normalized deterministically.
- Phone values read as strings; preserve leading zero.
- Empty optional guardian fields do not create empty guardian rows.
- Preview contains row-level errors and normalized values.
- Commit reparses or consumes server-persisted normalized rows; never accepts client rows.

**Approved roster-import contract — atomic with actionable row errors:** if any row has a blocking validation error, commit **none** of the file. Preview must identify every failing row, column/field, rejected value where safe, stable error code, and clear Vietnamese correction message so the user can fix the workbook and upload it again. Warnings that do not affect integrity may remain non-blocking, but the UI must distinguish them from blockers. Commit reparses or consumes the exact server-persisted validated preview, and no parser side effect may create a partial import.

### 6.2 Camera attendance workbook

The camera workbook format is not yet guaranteed. Implement bounded discovery:

1. Upload workbook.
2. Server reads sheet names and header row within limits.
3. UI proposes mappings from known aliases but requires confirmation when ambiguous.
4. Server normalizes each row.
5. Match priority:
   - authoritative student code;
   - only if code absent, exact normalized full name + active class enrollment may produce a **warning requiring confirmation**, not silent automatic identity when ambiguous.
6. Detect duplicate rows for same student/date.
7. Validate attendance date and observed time in Vietnam timezone.
8. Preview grouped counts and errors.
9. Block publication while any blocking row remains.

### 6.3 Presence derivation

Do not assume that a missing row always means absent until confirmed against the real camera export semantics.

Implement an explicit import policy:

- `positive_presence`: workbook lists only detected/present students; active enrolled students without a matched row become `absent/pending` when publishing.
- `full_roster`: workbook includes one row per student with source status; missing students become `no_data` and publication warns/blocks according to policy.

Default recommendation for school confirmation: `positive_presence`, because camera exports commonly list detected people. Keep policy visible in preview and stored on the import.

### 6.4 School calendar and the 08:30 operating rule

The missing-upload alert in `ATT-008` requires explicit workday data; weekday-only inference is insufficient.

- Store/configure Vietnam school working days, holidays, exceptional teaching days, cutoff time (default proposal `08:30`), and alert recipients.
- Evaluate the cutoff in `Asia/Ho_Chi_Minh`.
- Do not alert on configured non-working days.
- Stop/resolve the alert only after an import is successfully published, not merely uploaded.
- Preserve the evaluated calendar date, cutoff, recipient scope, and resulting notification status for audit/debugging.

## 7. Phase 1 replacement/idempotency rules

- Checksum + attendance date + source kind identifies exact duplicate uploads.
- Publishing the same exact import twice returns the prior result without duplicate daily rows.
- A second different file for an already-published date must not silently merge.
- Authorized actor must select one explicit action:
  - `supplement` — fill only unresolved/no-data records; cannot overwrite existing human disposition.
  - `replace_camera_observations` — supersede prior raw observations for that date while preserving correction history and reapplying valid human dispositions.
  - `cancel`.
- Replacement happens atomically at the metadata/data boundary.
- Previous import becomes `superseded`, remains inspectable, and cannot be deleted through normal UI.
- If publication fails, no partially published day is visible.

## 8. Phase 1 frontend

Suggested structure:

```text
src/homeroom/
  HomeroomRouter.jsx
  HomeroomOverview.jsx
  ClassList.jsx
  ClassDetail.jsx
  StudentRoster.jsx
  StudentDetail.jsx
  StudentRosterImportDialog.jsx
  AttendanceImportView.jsx
  AttendanceImportPreview.jsx
  DailyAttendanceRegister.jsx
  AttendanceStudentHistory.jsx
  AttendanceReports.jsx
  homeroom.css
```

Modify:

- `src/main.jsx` — replace the homeroom placeholder with the real module.
- `src/navigationRoutes.js` only if adding stable subroutes; preserve `/lop-chu-nhiem`.
- notification routing if attendance alerts become in-app notifications.

### Required screens

#### A. Homeroom overview

- Current school year selector.
- Cards: active classes, total students, today present/late/absent pending/excused/unexcused.
- Upload status before/after 08:30.
- Alerts requiring action.
- Scope-aware: teacher sees assigned classes only.

#### B. Class list/detail

- Class metadata and assigned teachers/supervisors.
- Current roster count.
- Tabs: `Danh sách học sinh`, `Điểm danh`, `Báo cáo`.
- Sensitive contacts shown only when authorized.

#### C. Roster import

- Download template.
- Upload file.
- Preview normalized rows.
- Errors/warnings with exact row number.
- Confirmation before commit.
- Result summary.

#### D. Camera import

- Select attendance date.
- Upload workbook.
- Choose sheet/header mapping.
- Show policy and reconciliation counts.
- Filter problem rows.
- Confirm matches only when safe.
- Publish button disabled until blockers resolved.
- Import history for each date.

#### E. Daily register

- Class and date controls.
- Rows: roster number, student code, name, raw camera state/time, effective status, reason, note, last editor.
- Fast filters for absent pending/excused/unexcused/late/no data.
- Correction dialog requires disposition and reason/note according to policy.
- No bulk action that can silently overwrite human-reviewed records.

#### F. Attendance reports

- Date range, class, grade filters according to scope.
- Summary counts and rate.
- Student risk list.
- Export buttons.
- Every weekly/monthly/semester attendance aggregate is drillable to the exact student/day source rows (`HOM-005`); GVCN requests a source correction from the supervisor workflow and cannot edit an aggregate directly.

### Accessibility/responsive requirements

- Mobile-first usable layout even if wide attendance data becomes cards instead of a squeezed table.
- No horizontal page overflow; a table may have a bounded internal scroll area with sticky student identity.
- All status colors include text/icons; color alone is insufficient.
- Buttons have clear labels and at least 44px touch targets.
- Dialog focus management, keyboard access, loading/error/empty states.
- Vietnamese labels and error messages; preserve exact student codes/phone strings.

## 9. Phase 1 reporting and export

### Basic outputs

1. Daily attendance by class.
2. Weekly/monthly attendance summary by class.
3. Individual student attendance history.
4. Unresolved-absence list.
5. Import reconciliation report.

### Export rules

- XLSX contains normalized data and filter context.
- PDF includes school, class, school year, date range, generated time, generated-by user, totals, and page numbers.
- Export respects the same server scope as the screen.
- Do not generate a client-only export from overbroad data.
- Define denominator clearly for attendance rate; exempt/no-data records must not be silently counted as ordinary absence.
- Provide both fixed-layout PDF and tabular XLSX where the backlog requires them; XLSX includes title, class, school year, filter context, and generated metadata (`HOM-016`).

## 10. Phase 1 tests

Create focused tests under `tests/`, preferably one file per public behavior group:

- `tests/homeroom-policy.test.mjs`
- `tests/homeroom-class-enrollment.test.mjs`
- `tests/student-roster-import.test.mjs`
- `tests/attendance-import.test.mjs`
- `tests/student-attendance.test.mjs`
- `tests/homeroom-report.test.mjs`
- `tests/homeroom-routing.test.mjs`

Required behavioral coverage:

1. Permission-group normalization accepts `supervisor` only for `homeroom` and preserves it without converting it to `view`.
2. Permission-group create/update rejects `{ menu: nonHomeroom, access: "supervisor" }` server-side with `INVALID_MENU_ACCESS` even when the payload bypasses the UI.
3. Legacy `edit` still normalizes to `view`; existing groups are not promoted to `supervisor`.
4. The permission matrix renders **Giám thị** immediately after **Xem tối cao**, enables it only for **Lớp chủ nhiệm**, and renders unavailable cells for all other menu rows.
5. A `homeroom=supervisor` user sees the Lớp chủ nhiệm menu, but the value does not satisfy generic `view_all` checks and grants nothing on another menu.
6. Teacher cannot read another class.
7. Supervisor cannot import for an unassigned class unless whole-school scope is explicitly granted.
8. `view_all` cannot execute supervisor-only camera import/publication or disposition-correction mutations.
9. Removing the permission group or supervisor assignment revokes supervisor operations on the next server call.
10. Sensitive guardian contacts are omitted when policy denies them.
11. Student cannot have two active enrollments in one school year.
12. Transfer closes old enrollment and preserves historical attendance.
13. Duplicate student code in workbook blocks commit.
14. Phone leading zero survives parse/preview/commit.
15. Camera workbook with ambiguous name does not auto-match.
16. Same checksum/date import is idempotent.
17. Different file for published date requires explicit replacement mode.
18. Failed publication exposes no partial attendance day.
19. Raw observation remains unchanged after disposition correction.
20. Correction creates append-only audit record.
21. Replacing camera observation does not erase human disposition/correction history.
22. Vietnam date/time boundaries are deterministic under a UTC server runtime.
23. Missing-upload and unresolved-absence alerts are scoped.
24. Export cannot exceed actor scope.
25. Homeroom deep route preserves browser back/forward behavior if subroutes are added.

Follow red → green per behavior. Do not write a large imagined suite before implementing any vertical slice.

## 11. Phase 1 suggested implementation slices

### Slice 1.0 — Add the homeroom-only Giám thị permission

**Objective:** Establish the persisted permission value, server invariant, settings UI, and focused regression coverage before any homeroom workflow relies on it.

**Expected files (inspect current call sites before editing):**

- Modify `convex/menuAccess.ts`: add canonical `supervisor`, homeroom-only validation, and explicit helper(s) for menu visibility versus supervisor operations.
- Modify `convex/schema.ts`: accept canonical `supervisor` in stored menu access while retaining legacy `edit` compatibility.
- Modify `convex/permissionGroups.ts`: enforce the homeroom-only invariant in both create and update paths; never trust the client matrix.
- Modify `convex/lib.ts` and any menu-access consumers that currently assume only three canonical values.
- Modify `src/main.jsx`: add the **Giám thị** header after **Xem tối cao**, render a radio only for `homeroom`, render `—` for other rows, and update explanatory/access labels.
- Modify the relevant permission-matrix CSS only as needed to support five total columns without page overflow.
- Modify `README.md` and the user guide (now `docs/guide/` → `/huong-dan-su-dung.html`) to document the new level and its restriction.
- Extend `tests/menu-access.test.mjs`; add a focused permission-group UI/source test only if the current test harness cannot verify the matrix behavior cleanly in that file.

**TDD sequence:**

1. Add failing pure-policy tests for valid `homeroom=supervisor`, invalid non-homeroom use, legacy `edit`, visibility, and the fact that supervisor is not `view_all`.
2. Run `node --test tests/menu-access.test.mjs`; expected before implementation: failures showing `supervisor` is unsupported or incorrectly normalized.
3. Implement the minimal canonical type/normalization/validation helpers.
4. Add failing server-boundary tests proving create and update reject a crafted non-homeroom supervisor payload.
5. Implement the same validation in both mutation paths using the shared helper.
6. Add failing UI/source behavior coverage for column order and homeroom-only selectability.
7. Implement the matrix and copy; do not create disabled radios for unrelated rows.
8. Run focused tests, then `npm test`, `npm run build:production`, and `git diff --check`.

**Acceptance:** An Administrator can save a group with **Lớp chủ nhiệm → Giám thị** and edit it without losing the value. No other menu can receive the value through the UI or a crafted backend call. Existing groups retain their prior effective permissions. No homeroom business feature is required in this slice; it establishes the secure permission contract for subsequent slices.

### Slice 1.1 — School year + class + scope foundation

**Files:** schema, `homeroomPolicy.ts`, school years/classes functions, focused tests.

**Acceptance:** operational manager creates a year/class, assigns teacher; assigned teacher reads class; unrelated teacher receives server-side forbidden.

### Slice 1.2 — Student/guardian/enrollment core

**Acceptance:** scoped teacher sees current roster/contacts as permitted; transfer preserves old membership.

### Slice 1.3 — Roster import

**Acceptance:** template upload → server validation → preview → atomic commit; invalid batch commits nothing.

### Slice 1.4 — Camera workbook inspect/preview

**Acceptance:** real representative camera workbook produces deterministic headers, normalized rows, matches, warnings, blockers.

### Slice 1.5 — Publish daily attendance

**Acceptance:** publication creates one daily row per active enrollment according to explicit import policy; retry is idempotent.

### Slice 1.6 — Human absence disposition and audit

**Acceptance:** supervisor marks excused/unexcused with reason; original camera fact remains visible; audit is append-only.

### Slice 1.7 — Overview, daily register, alerts

**Acceptance:** each role sees only its scope; unresolved work is actionable and deep-linked.

### Slice 1.8 — Reports and exports

**Acceptance:** totals match daily records and correction states; PDF/XLSX are authorized and reproducible.

## 12. Phase 1 verification gate

Run at minimum:

```bash
npm test
npm run build:production
git diff --check
git status --short
```

If schema/functions are deployed by an explicitly authorized release task:

```bash
npm run typecheck:convex-codegen
npm run convex:deploy
```

Do not deploy merely to generate code during an unapproved implementation task.

### Phase 1 acceptance checklist

- [ ] A representative roster workbook imports atomically.
- [ ] A representative camera workbook reconciles and publishes.
- [ ] Duplicate and replacement behavior is explicit and tested.
- [ ] Original camera observation survives every human correction.
- [ ] Teacher/supervisor/admin scopes are enforced at Convex boundaries.
- [ ] Daily/weekly/monthly totals reconcile to individual rows.
- [ ] Missing upload before/after 08:30 is visible.
- [ ] The 08:30 alert respects the configured Vietnam school calendar, does not fire on holidays, and resolves only after publication.
- [ ] Authorized import history can retrieve the immutable original source workbook; superseded files remain available.
- [ ] Attendance totals drill down to the exact source days and cannot be edited directly.
- [ ] Basic PDF/XLSX exports work and respect scope.
- [ ] No student photos or public student/guardian data.
- [ ] Existing duties/work/boarding/people-review behavior and tests remain green.

---

# PHASE 2 — Full Electronic Homeroom Book

## 13. Phase objective

Build the narrative and review workflows required to replace the handwritten homeroom book while reusing Phase 1 student, class, attendance, and report data. Teachers should enter plans and professional observations once; attendance and summary numbers should populate automatically.

## 14. Phase 2 scope

### 14.1 In scope

- Class situation snapshots.
- Beginning-of-year strengths/difficulties.
- Annual goals, targets, and implementation measures.
- Monthly plans and monthly reviews from August through May.
- Weekly reports and monthly reports.
- Semester I, semester II, and annual summaries.
- Per-student monitoring timeline.
- Subjects needing attention.
- Violations, remedies, commendations, and comments.
- Parent meetings and parent-contact records.
- Teacher free-form notes.
- Student self-criticism records/files.
- Extracurricular activity reports.
- BGH/management review comments.
- Submission, revision, versioning, locking, and printable homeroom-book PDF.

### 14.2 Out of scope

- Legally binding digital signature integration.
- Automatic grade-system integration unless a separately approved API/source exists.
- Parent portal.
- AI-generated disciplinary judgments or student evaluation.
- Deleting historical submitted versions.

## 15. Phase 2 data model

### 15.1 `homeroomClassProfiles`

One row per class/year, containing teacher-authored beginning-year context:

- strengths.
- difficulties.
- general context.
- previous-year result snapshot reference or manually confirmed values.
- version and submission state.

Automatically derived class counts should not be duplicated as editable text fields. When a snapshot is needed for a submitted report, persist the derived values inside that immutable report version.

### 15.2 `homeroomPlans`

```ts
{
  classId: string,
  schoolYearId: string,
  planType: string,         // annual | monthly | weekly
  periodKey: string,        // "annual", "2026-08", "2026-W35"
  goals?: string,
  content: string,
  focus?: string,
  measures: {
    collective?: string,
    academic?: string,
    conduct?: string,
    activities?: string,
    evaluationAdjustment?: string,
  },
  status: string,           // draft | submitted | revision_requested | accepted | locked
  version: number,
  submittedAt?: number,
  submittedBy?: string,
  reviewedAt?: number,
  reviewedBy?: string,
  createdAt: number,
  updatedAt: number,
}
```

One active draft/current version per class/type/period. Submitted versions are immutable snapshots.

### 15.3 `homeroomPeriodReports`

For weekly/monthly/semester/year summaries:

- class/year/period/type.
- derived attendance snapshot.
- commendation count/list.
- violation count/list.
- teacher narrative.
- achievements.
- issues.
- next-period plan.
- status/version/submission/review fields.
- immutable `dataSnapshot` at submission time.

### 15.4 `studentHomeroomEvents`

Unified per-student timeline:

```ts
{
  studentId: string,
  enrollmentId: string,
  classId: string,
  schoolYearId: string,
  eventDate: string,
  category: string, // academic_attention | violation | remedy | commendation | comment | self_criticism | parent_contact
  title: string,
  content: string,
  subjectNames?: string[],
  severity?: string,
  followUpDate?: string,
  status?: string,
  attachmentId?: string,
  sourceAttendanceDayIds?: string[],
  createdBy: string,
  updatedBy?: string,
  createdAt: number,
  updatedAt: number,
}
```

Avoid storing sensitive behavioral claims as unstructured audit-log details only. Use domain records with scoped access and history.

### 15.5 `parentMeetings`

- class/year.
- meeting type/period.
- start/end/date/location.
- agenda, minutes, conclusions.
- created/submitted/locked status and versions.
- attendance entries linked to student + guardian identity/name snapshot + attended state.
- Optional scanned signed minutes through the existing private-file gateway pattern.

Do not treat a drawn web signature as a legal signature.

### 15.6 `parentContacts`

- student/enrollment/class.
- contact time and channel.
- participants.
- reason.
- discussion.
- agreed actions.
- follow-up date/status.
- teacher confirmation and optional private attachment.

### 15.7 `homeroomTeacherNotes`

- class/year/date.
- title/content.
- visibility: teacher_private | management_visible.
- optional student links.

Private teacher notes must not accidentally appear in exports or management views unless explicitly marked visible.

### 15.8 `homeroomActivityReports`

For extracurricular/class activity records:

- class, date, period/lesson.
- participant count.
- objectives/requirements.
- activity content.
- narrative/proceedings.
- teacher confirmation.
- optional attachments.

### 15.9 `homeroomReviews`

Management review records:

- target type/id/version.
- review type: end_semester_1 | end_semester_2 | spot_check | other.
- review time.
- comments.
- decision: accepted | revision_requested.
- reviewer identity.
- immutable reference to reviewed version.

## 16. Phase 2 workflow states

### Draft and submission

- Teacher edits `draft`.
- Submit creates an immutable version and `submitted` state.
- Reviewer may `accept` or `request_revision` with required comments.
- Revision creates a new draft based on the submitted version; it does not mutate the old version.
- Accepted period may be locked by authorized management.
- Locked period is read/export only except an explicit audited unlock by admin/moderator.

### Auto-derived data

Attendance values shown in a report draft are live until submission. At submission:

- calculate server-side from authoritative attendance rows;
- persist period boundaries and derived counts/rates in `dataSnapshot`;
- record generated time and algorithm/version;
- later corrections do not rewrite the submitted historical snapshot;
- UI may show that current underlying attendance differs and allow a new report version if the period is not locked.

## 17. Phase 2 frontend

Suggested additions:

```text
src/homeroom/book/
  HomeroomBookView.jsx
  ClassProfileSection.jsx
  AnnualPlanSection.jsx
  PeriodPlanEditor.jsx
  PeriodReportEditor.jsx
  SemesterSummary.jsx
  StudentMonitoringTimeline.jsx
  ParentMeetings.jsx
  ParentContactEditor.jsx
  TeacherNotes.jsx
  ActivityReports.jsx
  ManagementReviewPanel.jsx
  SubmissionHistory.jsx
```

### User experience

Do not create one screen per scanned page. Use a task-oriented structure:

1. `Tổng quan lớp`
2. `Kế hoạch`
3. `Báo cáo tuần/tháng`
4. `Sơ kết/Tổng kết`
5. `Theo dõi học sinh`
6. `Phụ huynh`
7. `Ghi chép & Hoạt động`
8. `Kiểm tra của BGH`
9. `Lịch sử phiên bản & Xuất sổ`

### Per-student screen

Tabs or sections:

- Profile/contact.
- Attendance summary and history.
- Academic attention.
- Violations/remedies.
- Commendations.
- Parent contacts.
- Notes/self-criticism documents.

Attendance counts must be read-only derived data here; corrections remain in the attendance workflow.

## 18. Phase 2 printable book

Create a versioned export specification rather than arbitrary browser print CSS.

Required sections:

- Cover: school, class, homeroom teacher, school year.
- Teacher/supervisor and class officer lists when data exists.
- Parent/guardian contact list subject to authorized export.
- Class situation and goals/plans.
- Monthly plans/reviews.
- Semester/year summaries.
- Per-student monitoring sheets.
- Parent meeting/contact records.
- Teacher notes included only by chosen visibility/export policy.
- Activities and BGH review.

Export metadata:

- document version.
- class/year.
- generated by/at.
- source report version IDs.
- checksum or verification code.
- page numbers.

A submitted/locked export must be reproducible from its snapshots even if live data later changes.

`HOM-015` and `HOM-020` require a server/reproducible PDF path rather than browser-dependent print output. UAT must include representative long text, many absence cases, page breaks, tables, grayscale/black-and-white readability, and a real school printer. Record approval or defects against the exact export version; browser preview alone is not acceptance.

## 19. Phase 2 notifications

Add scoped in-app notifications for:

- weekly/monthly report due.
- submitted report awaiting review.
- revision requested.
- report accepted/locked.
- follow-up parent contact due.
- student repeated absence/violation requiring teacher review.

Notification click must deep-link to the exact class, period, student, or report version.

## 20. Phase 2 tests

Required behavior:

1. Teacher edits only assigned class draft.
2. Submitted version is immutable.
3. Revision creates a new version.
4. Reviewer cannot silently alter teacher content.
5. Attendance snapshot is calculated server-side.
6. Historical submitted snapshot remains unchanged after attendance correction.
7. New report version can reflect corrected attendance.
8. Private teacher notes are excluded from management queries/exports.
9. Parent phones and contact minutes remain scope-protected.
10. Locked period blocks ordinary mutations.
11. Explicit unlock is manager-only and audited.
12. Student event timeline preserves author/history.
13. Deep-linked notification denies access when assignment was removed.
14. PDF version references the exact accepted snapshots.

Suggested files:

- `tests/homeroom-plan-versioning.test.mjs`
- `tests/homeroom-period-report.test.mjs`
- `tests/student-homeroom-events.test.mjs`
- `tests/parent-contact-scope.test.mjs`
- `tests/homeroom-review-lock.test.mjs`
- `tests/homeroom-book-export.test.mjs`
- `tests/homeroom-notifications.test.mjs`

## 21. Phase 2 implementation slices

### Slice 2.1 — Annual profile and plan

Teacher draft → submit → manager review with immutable version.

### Slice 2.2 — Weekly/monthly reports with attendance snapshot

Real attendance totals populate a draft; submit freezes the snapshot.

### Slice 2.3 — Student monitoring timeline

Academic attention, violation/remedy, commendation, comment, attachment.

### Slice 2.4 — Parent meeting/contact records

Scoped records, attendance list, conclusions, optional private signed scan.

### Slice 2.5 — Semester/year summary and management review

Versioned submission, revision, acceptance, lock.

### Slice 2.6 — Notes and extracurricular activity reports

Visibility-safe teacher notes and activity form.

### Slice 2.7 — Complete printable homeroom book

Reproducible PDF from accepted/snapshotted records.

### Phase 2 acceptance checklist

- [ ] Teachers no longer enter absence counts manually in reports.
- [ ] Weekly/monthly reports support draft, submit, revise, accept, and lock.
- [ ] Per-student monitoring covers the paper book's core categories.
- [ ] Parent meetings/contacts are recorded with strict privacy scope.
- [ ] Private notes never leak to ordinary management/export paths.
- [ ] BGH review references immutable versions.
- [ ] Full PDF can be regenerated identically from locked snapshots.
- [ ] The exact PDF version passes physical-printer UAT with long content and dense absence data; no serious clipping, column drift, or unreadable grayscale content remains.
- [ ] Existing Phase 1 imports/attendance remain correct and performant.

---

# PHASE 3 — Advanced Integrations: Camera API, Viettel Digital Signature, Push, Optional Parent Workflow

## 22. Phase objective

Reduce manual operations and add legally/operationally stronger integrations only after Phases 1–2 are stable. Every integration must use an adapter boundary, durable sync/job state, idempotency, reconciliation, and rollback/fallback to the proven manual workflow.

## 23. Entry criteria

Do not begin Phase 3 unless:

- At least one full school period has been piloted using the Excel import workflow.
- The exact camera vendor/API documentation, authentication method, identity key, rate limits, and data semantics are available.
- Viettel provides integration documentation, test environment, certificate ownership model, and signature verification requirements.
- The school approves which records require signature and who is an authorized signer.
- Mobile push infrastructure and privacy policy are approved.
- Parent workflow is separately approved; it is not automatically included merely because guardian phone numbers exist.

## 24. Phase 3A — Direct camera integration

### Adapter architecture

Create a narrow domain interface such as:

```ts
interface AttendanceSourceAdapter {
  fetchObservations(input: {
    from: string;
    to: string;
    cursor?: string;
  }): Promise<AttendanceObservationBatch>;
}
```

Adapters:

- `excelCameraImportAdapter` — existing Phase 1 path treated as the stable fallback.
- `vendorCameraApiAdapter` — new direct integration.

Do not scatter vendor fields across attendance domain tables. Normalize into the same import-row and publication pipeline used by Excel.

### Durable sync state

Add tables for:

- connection metadata without secrets.
- sync cursor/watermark.
- sync runs.
- batches and source event IDs.
- retry attempts and terminal errors.
- reconciliation results.

Secrets belong in deployment secret storage/Keychain-backed operational wrappers, never Convex public records, browser bundles, logs, or plan files.

### Required behavior

- Scheduled pull or webhook only if vendor supports it securely.
- Source event ID idempotency.
- Bounded retry for transient failures only.
- Late-arriving event handling.
- Clock/timezone validation.
- Student identity mapping and unmapped-device identity queue.
- Manual Excel fallback remains available.
- Dashboard shows last successful sync, lag, failures, unmapped identities.
- A direct sync cannot overwrite reviewed dispositions.

### Camera integration tests

- duplicate vendor event is idempotent.
- events arrive out of order.
- vendor clock offset is detected/reported.
- unmapped identity does not attach to the wrong student.
- API outage leaves prior attendance intact.
- retry does not repeat publication.
- Excel fallback for same date requires explicit reconciliation/replacement.

## 25. Phase 3B — Viettel digital signature

### Discovery decisions required before code

- Is signing remote, USB token, mobile CA, or another Viettel product?
- Who owns signing certificates: individual teacher, BGH, or school organization?
- Which outputs require which signer(s)?
- Is signing sequential or parallel?
- Does the signed PDF need visible signature appearance, cryptographic signature, timestamp authority, or all three?
- What verification URL/tool is required?
- What happens when a certificate expires or is revoked?
- Is the signed file authoritative and immutable?

### Signature workflow

Recommended states:

```text
draft
→ submitted
→ accepted
→ signature_requested
→ signing
→ signed
→ archived

failure branches:
signature_failed | rejected | certificate_invalid
```

Rules:

- Sign only a locked, checksum-verified PDF snapshot.
- Never sign a live mutable report.
- Store unsigned checksum, signed checksum, signer identity/certificate metadata, provider transaction ID, signed time, verification result.
- Signed bytes are immutable and privately stored.
- Authorization is checked before preview/download.
- Provider callback/webhook must be authenticated, replay-safe, and idempotent.
- A failure must not mark the document signed.
- Revisions require a new document version and new signature; never replace signed bytes in place.

### Signature tests

- modified PDF after request is rejected by checksum mismatch.
- duplicate callback is idempotent.
- forged callback is rejected.
- failed provider response leaves document unsigned.
- unauthorized user cannot request/cancel signing.
- signed record cannot be edited/deleted normally.
- verification metadata corresponds to stored signed bytes.

## 26. Phase 3C — Push notifications

Use existing device/push infrastructure where compatible.

Notification candidates:

- Attendance file/sync missing after configured time.
- Import/sync has unresolved rows.
- Student has pending absence requiring classification.
- Repeated absence/lateness threshold reached.
- Weekly/monthly report due.
- Revision requested or report accepted.
- Signature requested/completed/failed.

Rules:

- Push payload contains opaque IDs and minimal non-sensitive text.
- App fetches protected detail after authentication.
- Deep links re-check authorization and assignment.
- Removed/disabled users do not continue receiving protected notifications.
- Avoid displaying sensitive student/disciplinary detail on lock screen by default.

Mobile implementation is a separate explicit workstream. Do not edit all native apps automatically as part of backend work.

## 27. Phase 3D — Optional parent leave workflow

This is optional and requires owner/school approval.

Possible minimal workflow:

- Staff records a parent-reported leave request; no parent login.
- Later, a secure parent channel may submit a request using verified identity.
- Request includes student, dates, reason, optional evidence, submitted-by identity/channel.
- GVCN/supervisor accepts or rejects.
- Accepted leave updates disposition, never raw camera observation.
- Every decision is audited.

Privacy/security requirements:

- Do not authenticate a parent using only a student code or phone number.
- Avoid public token links with long-lived access to student data.
- Evidence files use private authorized storage.
- Rate limiting and abuse monitoring are required for any public endpoint.

## 28. Phase 3 observability and operations

Add operator-facing evidence without exposing secrets/PII:

- camera sync health and lag.
- signature-provider health.
- failed jobs by typed reason.
- retry/dead-letter state.
- import/source reconciliation counts.
- notification delivery aggregates.
- audit of configuration changes.

Backups must include new Convex records and private document metadata. Provider secrets/tokens need a separate rotation/recovery procedure and must not be copied into ordinary database backups.

## 29. Phase 3 acceptance checklist

### Camera

- [ ] Direct API and Excel fallback produce the same normalized domain model.
- [ ] Duplicate/out-of-order/late events are safe.
- [ ] Dashboard exposes sync lag and failures.
- [ ] Human dispositions survive all source re-syncs.

### Digital signature

- [ ] Only locked checksum-verified snapshots can be signed.
- [ ] Callback/webhook is authenticated and replay-safe.
- [ ] Signed PDF is immutable, private, downloadable, and verifiable.
- [ ] Revision creates a new version/signature.

### Push

- [ ] Sensitive data is minimized on lock screen.
- [ ] Deep links fetch authorized data after login.
- [ ] Disabled/unassigned users cannot access stale notifications.

### Optional parent workflow

- [ ] Parent identity is stronger than knowledge of phone/student code.
- [ ] Leave decision changes disposition only, not raw observation.
- [ ] Evidence is private and every action is audited.

---

# 30. Cross-phase engineering requirements

## 30.1 Data migration

- Phase 1 introduces new empty tables; do not synthesize student data from employee users.
- Import the school's actual roster through the Phase 1 validated workflow.
- Existing CRM modules remain untouched unless integrating navigation/notifications/reporting.
- Schema evolution should use optional-first fields where live records may exist, followed by backfill and only then stricter invariants.
- Before production schema/data migration, create a verified Convex backup including storage.
- Provide rollback for functions/frontend and compensating migration for new records; never advise deleting production volume.

## 30.2 Audit

Record meaningful domain actions:

- school-year/class create/update/archive/lock.
- teacher/supervisor assignment changes.
- student create/update/transfer/status change.
- roster import validate/commit.
- attendance import publish/supplement/replace.
- attendance disposition correction.
- report submit/revision/accept/lock/unlock.
- parent-contact and sensitive-note lifecycle where appropriate.
- signature request/result.

Do not place full parent contact content, secrets, or large student narratives inside generic audit `details`; reference protected domain record IDs and concise metadata.

## 30.3 Performance and indexes

- Do not collect all students/attendance for whole school on ordinary teacher views.
- Query by class/date/student indexes.
- Reports over large ranges should use bounded inputs and, if needed, precomputed snapshots or paginated aggregation.
- Imports have explicit file size, sheet count, row count, cell length, and processing limits.
- Reject formula/macro-driven or malformed workbook content safely; do not evaluate formulas.
- Never trust workbook MIME/extension alone if bytes are stored/processed server-side.

## 30.4 Privacy

- Student and guardian data are protected educational records.
- Never expose them through public file links, analytics, logs, notifications, or client bundles.
- Exports require authorization on every generation/download.
- Cache behavior for private exports follows existing authorize-first/no-stale-access invariants.
- Define retention with the school before automated deletion. Until then, archive/lock rather than purge.

## 30.5 Error handling

Use stable domain codes and Vietnamese messages, including categories such as:

- school year/class/student not found.
- class scope forbidden.
- invalid menu access, including `supervisor` on any menu other than `homeroom`.
- supervisor permission or assignment required for camera import/publication and attendance disposition correction.
- duplicate student code/enrollment.
- import file invalid/too large/expired/already committed.
- camera mapping missing/ambiguous.
- import rows unresolved.
- attendance already published.
- explicit replacement mode required.
- correction reason required.
- report version conflict/submitted/locked.
- signature provider/certificate/checksum errors.

Do not return raw stack traces or vendor secrets to clients.

## 30.6 Documentation

Update after each phase:

- `README.md` current scope, tables, permissions, workflows, known limitations.
- User guide (now `docs/guide/` → `/huong-dan-su-dung.html`) role-oriented operation steps.
- `.cursor/rules/*.mdc` and `CLAUDE.md` only when introducing durable invariants that future agents must preserve; keep both synchronized.
- Import template column documentation.
- Operational runbook for camera import/sync, unresolved rows, backups, and rollback.

## 30.7 Required final verification per phase

```bash
npm test
npm run build:production
git diff --check
git status --short
```

Also:

- Run focused tests before full suite.
- Inspect the complete phase diff.
- Confirm no secrets, PII fixtures, production exports, upload files, caches, archives, or generated runtime artifacts are committed.
- Confirm `ios-app`, `ios-uikit-lvt`, and `android-app` remain untouched unless explicitly scoped.
- If release is authorized, deploy Convex before restarting the web frontend when the frontend depends on new functions/schema.
- After release, verify authenticated roles and the exact changed workflow, not only `/healthz`.

---

# 31. Cursor execution protocol

For each phase:

1. Read the phase fully.
2. Inspect current source and update path names if the repository has evolved; preserve the requirements/invariants.
3. Create a phase-specific implementation checklist with vertical slices.
4. If a genuine business decision remains unresolved, ask before implementation; do not guess a privacy-, identity-, or data-integrity-sensitive rule.
5. Implement one slice using red → green → refactor.
6. Run focused tests.
7. Inspect the slice diff for authorization, data lifecycle, and scope.
8. Continue to the next slice only when green.
9. Run the full phase gate.
10. Report changed files, tests, assumptions, blockers, and residual risks.
11. Do **not** push/deploy/restart unless the owner explicitly invokes the repository's authorized release workflow.

## Required questions before implementing Phase 1 camera parsing

Cursor must inspect a real anonymized camera workbook or request one if not present. It must not invent:

- whether the file lists only present students or the full roster;
- exact headers/sheet name/header row;
- whether authoritative student code is included;
- how class/date/time/status are represented;
- whether one student may have multiple observations;
- how late arrival is represented;
- whether the filename carries the attendance date.

Recommended default if the school confirms no better identifier: add/maintain an explicit camera identity mapping to the school's `studentCode`; do not rely permanently on name matching.

Acceptance-platform inputs that block final implementation/acceptance must be tracked explicitly:

- `IN-016`: real student roster and authoritative student identifier.
- `IN-017`: real camera Excel workbook.
- `IN-018`: meaning of every camera column/status and late-arrival semantics.
- `IN-019`: approved re-upload/replacement contract.
- `IN-020`: workday calendar, 08:30 alert rule, and recipients.
- `IN-025`: exact Viettel product/signature model and integration material.

No affected slice is acceptance-ready while its required input is still `Chưa nhận` or `Chưa chốt`; tests built from invented fixtures do not close the blocker.

## Required product decisions before Phase 2 lock/review

- Which roles may review and lock: BGH only, BGH + office, or admin/moderator?
- Whether an accepted report can be unlocked and by whom.
- Which teacher notes are private versus management-visible.
- Whether guardian phone numbers appear in the printable homeroom book.
- Exact accreditation/PDF format required by the school.

## Required vendor decisions before Phase 3

- Camera API documentation and credentials model.
- Viettel signature product/API and legal signature requirements.
- Mobile app scope and notification privacy copy.
- Whether a parent workflow is approved at all.

---

# 32. Definition of done

The three-phase program is done only when:

- The school can operate attendance without duplicate/manual shadow records.
- Camera observations, human absence decisions, and audit history are separately preserved.
- Teachers can manage assigned classes and produce weekly/monthly/semester/year records without retyping attendance totals.
- BGH can review immutable submitted versions.
- Printable/archival outputs are reproducible and authorized.
- Direct camera/signature/push integrations fail safely and retain manual fallback.
- All server authorization, import idempotency, versioning, privacy, and rollback tests pass.
- Production behavior has been verified with representative, anonymized school artifacts and authorized role accounts.
