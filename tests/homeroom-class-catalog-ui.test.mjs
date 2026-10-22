import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  isActiveAssignmentCandidate,
  toAssignmentCandidate,
  toSafeAssignmentUser,
} from '../convex/homeroomCatalog.ts';
import {
  ASSIGNMENT_REPLACE_WARNING,
  BACK_TO_OVERVIEW,
  CLASS_CATALOG_TITLE,
  CURRENT_ASSIGNMENT_TITLE,
  DOWNLOAD_ATTENDANCE_TEMPLATE_ACTION,
  FIRST_CLASS_CTA,
  HISTORICAL_ASSIGNMENT_TITLE,
  IMPORT_ATTENDANCE_ACTION,
  OPEN_CLASS_ACTION,
  TEACHER_OVERVIEW_TITLE,
  UPCOMING_ASSIGNMENT_TITLE,
  assignmentDateRange,
  assignmentTypeLabel,
  buildClassArchivePayload,
  buildClassAssignmentPayload,
  buildClassCreatePayload,
  buildClassUpdatePayload,
  classStatusLabel,
  filterActiveClasses,
  groupAssignmentsByEffect,
  isCurrentAssignment,
  isEndedAssignment,
  isUpcomingAssignment,
  schoolYearWindow,
  userRoleLabel,
} from '../src/homeroom/classCatalog.js';

const routerSource = readFileSync(new URL('../src/homeroom/HomeroomRouter.jsx', import.meta.url), 'utf8');
const catalogUiSource = readFileSync(new URL('../src/homeroom/HomeroomClassCatalog.jsx', import.meta.url), 'utf8');
const catalogHelperSource = readFileSync(new URL('../src/homeroom/classCatalog.js', import.meta.url), 'utf8');
const classesSource = readFileSync(new URL('../convex/homeroomClasses.ts', import.meta.url), 'utf8');
const usersSource = readFileSync(new URL('../convex/users.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/homeroom/homeroom.css', import.meta.url), 'utf8');
const reportsSource = readFileSync(new URL('../convex/homeroomReports.ts', import.meta.url), 'utf8');
const contextSource = readFileSync(new URL('../convex/homeroomContext.ts', import.meta.url), 'utf8');
const detailSource = readFileSync(new URL('../src/homeroom/HomeroomClassDetail.jsx', import.meta.url), 'utf8');
const overviewSource = readFileSync(new URL('../src/homeroom/HomeroomOverview.jsx', import.meta.url), 'utf8');
const rosterSource = readFileSync(new URL('../src/homeroom/HomeroomRoster.jsx', import.meta.url), 'utf8');
const attendancePageSource = readFileSync(new URL('../src/attendance/AttendancePage.jsx', import.meta.url), 'utf8');

test('catalog and assignment controls are manager-only and ordinary users never see them', () => {
  assert.match(catalogUiSource, /Tạo lớp đầu tiên/);
  assert.match(catalogUiSource, /Quản lý lớp/);
  assert.match(routerSource, /ClassCatalogPanel/);
  assert.match(detailSource, /ClassManagePanel/);
  assert.match(routerSource, /manageClasses:\s*true/);
  assert.match(catalogUiSource, /session\?\.isOperationalManager/);
  assert.match(catalogUiSource, /canManage/);
  assert.doesNotMatch(catalogUiSource, /menuAccess\?\.homeroom === ['"]supervisor['"]/);
  assert.doesNotMatch(catalogUiSource, /menuAccess\?\.homeroom === ['"]view['"]/);
  const catalogCall = routerSource.slice(
    routerSource.indexOf('<ClassCatalogPanel'),
    routerSource.indexOf('<ClassCatalogPanel') + 280,
  );
  assert.match(catalogCall, /session=/);
  const manageRoute = routerSource.slice(
    routerSource.indexOf("route.view === 'manage'"),
    routerSource.indexOf('<ClassCatalogPanel'),
  );
  assert.match(manageRoute, /roles\.isManager/);
  assert.match(readFileSync(new URL('../src/homeroom/homeroomRoutes.js', import.meta.url), 'utf8'), /isManager = Boolean\(session\?\.isOperationalManager\)/);
  const manageCall = detailSource.slice(
    detailSource.indexOf('<ClassManagePanel'),
    detailSource.indexOf('<ClassManagePanel') + 200,
  );
  assert.match(manageCall, /canManage=\{detail\.permissions\.canManage\}/);
  assert.match(detailSource, /managerOnly: true/);
  assert.match(classesSource, /canManage: canWriteHomeroomCatalog\(actor\)/);
  assert.doesNotMatch(overviewSource, /ClassCatalogPanel/);
  assert.equal(FIRST_CLASS_CTA, 'Tạo lớp đầu tiên');
  assert.equal(CLASS_CATALOG_TITLE, 'Quản lý lớp');
  assert.equal(TEACHER_OVERVIEW_TITLE, 'Lớp đang chủ nhiệm');
  assert.equal(IMPORT_ATTENDANCE_ACTION, 'Import file điểm danh');
  assert.equal(DOWNLOAD_ATTENDANCE_TEMPLATE_ACTION, 'Tải file điểm danh mẫu');
});

test('create, update, archive, and assignment payloads match existing Convex contracts', () => {
  assert.deepEqual(
    buildClassCreatePayload({
      schoolYearId: 'year-1',
      code: ' 6a1 ',
      name: ' Lớp 6A1 ',
      gradeLevel: '6',
      notes: '  Ghi chú  ',
    }),
    {
      schoolYearId: 'year-1',
      code: '6a1',
      name: 'Lớp 6A1',
      gradeLevel: 6,
      notes: 'Ghi chú',
    },
  );
  assert.deepEqual(
    buildClassCreatePayload({
      schoolYearId: 'year-1',
      code: '6A1',
      name: 'Lớp 6A1',
      gradeLevel: 7,
      notes: '   ',
    }),
    {
      schoolYearId: 'year-1',
      code: '6A1',
      name: 'Lớp 6A1',
      gradeLevel: 7,
    },
  );
  assert.deepEqual(
    buildClassUpdatePayload({
      id: 'class-1',
      code: '6A2',
      name: 'Lớp 6A2',
      gradeLevel: 6,
    }),
    {
      id: 'class-1',
      code: '6A2',
      name: 'Lớp 6A2',
      gradeLevel: 6,
    },
  );
  assert.deepEqual(buildClassArchivePayload('class-1'), { id: 'class-1' });
  assert.deepEqual(
    buildClassAssignmentPayload({
      classId: 'class-1',
      userId: 'user-1',
      assignmentType: 'homeroom_teacher',
      effectiveFrom: '2026-08-15',
    }),
    {
      classId: 'class-1',
      userId: 'user-1',
      assignmentType: 'homeroom_teacher',
      scopeKind: 'class',
      effectiveFrom: '2026-08-15',
    },
  );
  assert.throws(
    () =>
      buildClassAssignmentPayload({
        classId: 'class-1',
        userId: 'user-2',
        assignmentType: 'supervisor',
        effectiveFrom: '2026-09-01',
      }),
    /INVALID_ASSIGNMENT_TYPE/,
  );
  assert.match(catalogUiSource, /buildClassCreatePayload/);
  assert.match(catalogUiSource, /buildClassUpdatePayload/);
  assert.match(catalogUiSource, /buildClassArchivePayload/);
  assert.match(catalogUiSource, /buildClassAssignmentPayload/);
  assert.match(catalogUiSource, /gradeLevel/);
  assert.match(catalogUiSource, /option value="6"/);
  assert.match(catalogUiSource, /option value="9"/);
});

test('create-class form offers two years before and after the selected current year', () => {
  const years = [2023, 2024, 2025, 2026, 2027, 2028].map((start) => ({
    _id: `year-${start}`,
    name: `${start}-${start + 1}`,
  }));
  assert.deepEqual(
    schoolYearWindow(years, 'year-2025').map((year) => year.name),
    ['2023-2024', '2024-2025', '2025-2026', '2026-2027', '2027-2028'],
  );
  assert.deepEqual(schoolYearWindow(years, 'missing'), []);
  assert.match(catalogUiSource, /schoolYears=\{createSchoolYears\}/);
  assert.match(catalogUiSource, /schoolYearWindow\(schoolYears, yearId\)/);
  assert.match(catalogUiSource, /schoolYears\.map\(\(year\) =>/);
  assert.match(catalogUiSource, /<option key=\{year\._id\} value=\{year\._id\}>\{year\.name\}<\/option>/);
  assert.match(catalogUiSource, /\(\{ schoolYearId, code, name, gradeLevel, notes \}\)/);
  assert.match(routerSource, /schoolYears=\{years\}/);
});

test('assignment UI is class-scope only and warns that a new GVCN closes the old row the day before', () => {
  assert.equal(
    ASSIGNMENT_REPLACE_WARNING,
    'Gán giáo viên chủ nhiệm mới sẽ đóng phân công cũ vào ngày liền trước ngày hiệu lực.',
  );
  assert.match(catalogUiSource, /ASSIGNMENT_REPLACE_WARNING/);
  assert.match(catalogHelperSource, /ngày liền trước ngày hiệu lực/);
  assert.doesNotMatch(catalogUiSource, /whole_school/);
  assert.doesNotMatch(catalogHelperSource, /whole_school/);
  assert.match(catalogHelperSource, /scopeKind:\s*['"]class['"]/);
  assert.doesNotMatch(catalogUiSource, /option value="supervisor"/);
  assert.match(catalogUiSource, /Phân công giáo viên chủ nhiệm/);
  assert.equal(assignmentTypeLabel('homeroom_teacher'), 'Giáo viên chủ nhiệm');
  assert.equal(assignmentTypeLabel('supervisor'), 'Giám thị');
  assert.equal(userRoleLabel('admin'), 'Administrator');
  assert.equal(userRoleLabel('moderator'), 'Moderator');
  assert.equal(userRoleLabel('user'), 'Người dùng');
  assert.equal(classStatusLabel('active'), 'Đang hoạt động');
  assert.equal(classStatusLabel('archived'), 'Đã lưu trữ');
  assert.equal(assignmentDateRange({ effectiveFrom: '2026-08-01' }), '2026-08-01 – hiện tại');
  assert.equal(
    assignmentDateRange({ effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' }),
    '2026-08-01 – 2026-08-31',
  );
});

test('isCurrentAssignment is date-effective both directions and future rows are upcoming not history', () => {
  const today = '2026-09-01';
  assert.equal(isCurrentAssignment({ effectiveFrom: '2026-08-01' }, today), true);
  assert.equal(isCurrentAssignment({ effectiveFrom: '2026-09-01' }, today), true);
  assert.equal(
    isCurrentAssignment({ effectiveFrom: '2026-08-01', effectiveTo: '2026-09-01' }, today),
    true,
  );
  assert.equal(
    isCurrentAssignment({ effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' }, today),
    false,
  );
  assert.equal(isCurrentAssignment({ effectiveFrom: '2026-10-01' }, today), false);
  assert.equal(isUpcomingAssignment({ effectiveFrom: '2026-10-01' }, today), true);
  assert.equal(isUpcomingAssignment({ effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' }, today), false);
  assert.equal(isEndedAssignment({ effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' }, today), true);
  assert.equal(isEndedAssignment({ effectiveFrom: '2026-10-01' }, today), false);
  const grouped = groupAssignmentsByEffect(
    [
      { _id: 'current', effectiveFrom: '2026-08-01' },
      { _id: 'upcoming', effectiveFrom: '2026-10-01' },
      { _id: 'ended', effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' },
    ],
    today,
  );
  assert.deepEqual(grouped.current.map((row) => row._id), ['current']);
  assert.deepEqual(grouped.upcoming.map((row) => row._id), ['upcoming']);
  assert.deepEqual(grouped.historical.map((row) => row._id), ['ended']);
  assert.equal(CURRENT_ASSIGNMENT_TITLE, 'Phân công hiện tại');
  assert.equal(UPCOMING_ASSIGNMENT_TITLE, 'Sắp hiệu lực');
  assert.equal(HISTORICAL_ASSIGNMENT_TITLE, 'Lịch sử phân công');
  assert.match(catalogUiSource, /UPCOMING_ASSIGNMENT_TITLE/);
  assert.match(catalogUiSource, /groupAssignmentsByEffect/);
  assert.doesNotMatch(
    catalogUiSource.slice(
      catalogUiSource.indexOf('function AssignmentList'),
      catalogUiSource.indexOf('export function ClassManagePanel'),
    ),
    /!isCurrentAssignment/,
  );
});

test('class catalog table exposes code, name, grade, status, roster count, and opens the class', () => {
  const panel = catalogUiSource.slice(
    catalogUiSource.indexOf('export function ClassCatalogPanel'),
    catalogUiSource.indexOf('function AssignmentGroup'),
  );
  assert.match(panel, /item\.code/);
  assert.match(panel, /item\.name/);
  assert.match(panel, /item\.gradeLevel/);
  assert.match(panel, /classStatusLabel\(item\.status\)/);
  assert.match(panel, /item\.rosterCount/);
  assert.match(panel, /onOpenClass\(item\._id\)/);
  assert.match(panel, /aria-label=\{`Sửa lớp/);
  assert.equal(OPEN_CLASS_ACTION, 'Mở lớp');
  assert.match(classesSource, /rosterCount/);
  assert.match(routerSource, /onOpenClass=/);
  assert.match(detailSource, /\{ key: 'quan-ly', label: 'Quản lý lớp'/);
  assert.ok(detailSource.indexOf('hr-tabs') < detailSource.indexOf('<ClassManagePanel'));
});

test('homeroom class catalog CSS stays one-column on mobile with visible focus and 44px targets', () => {
  assert.match(cssSource, /\.homeroom-view\s*\{[^}]*overflow-x:\s*clip/);
  assert.match(cssSource, /:focus-visible/);
  assert.match(cssSource, /min-height:\s*44px/);
  assert.match(cssSource, /@media\s*\(max-width:\s*720px\)/);
  const mobile = cssSource.slice(cssSource.lastIndexOf('@media (max-width: 720px)'));
  assert.match(mobile, /flex-direction:\s*column/);
  assert.match(mobile, /grid-template-columns:\s*1fr/);
  assert.match(cssSource, /\.hr-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(cssSource, /\.hr-table\s*\{/);
});

test('class workspace navigation exposes the current route and usable mobile overflow', () => {
  assert.match(detailSource, /className="hr-back"/);
  assert.match(detailSource, /className="hr-tabs"\s+aria-label="Điều hướng lớp"/);
  assert.doesNotMatch(detailSource, /role="tab"/);
  assert.match(detailSource, /aria-current=\{current === item\.key \? 'page' : undefined\}/);
  assert.doesNotMatch(detailSource, /role="tabpanel"/);
  assert.match(cssSource, /@media\s*\(max-width:\s*720px\)[\s\S]*\.hr-tabs\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(cssSource, /@media\s*\(max-width:\s*720px\)[\s\S]*\.hr-tabs button\s*\{[^}]*width:\s*auto/);
});

test('listScoped is teacher overview; catalog uses its own manager-only query', () => {
  const query = classesSource.slice(
    classesSource.indexOf('export const listScoped'),
    classesSource.indexOf('export const listCatalog'),
  );
  assert.match(query, /includeArchived:\s*v\.optional\(v\.boolean\(\)\)/);
  assert.match(query, /assertCanIncludeArchivedClasses/);
  assert.match(query, /classIncludedInScopedList/);
  assert.match(query, /resolveClassScope/);
  const catalogQuery = classesSource.slice(
    classesSource.indexOf('export const listCatalog'),
    classesSource.indexOf('export const listForAttendanceImport'),
  );
  assert.match(catalogQuery, /homeroomCatalogWriterOrThrow/);
  assert.match(catalogQuery, /resolveCatalogScope/);
  assert.match(catalogQuery, /includeArchived/);
  assert.match(catalogQuery, /currentHomeroomTeacher/);
  assert.match(catalogUiSource, /listCatalog/);
  assert.match(catalogUiSource, /includeArchived:\s*true/);
  assert.match(catalogUiSource, /AssignTeacherModal/);
  assert.match(reportsSource, /status === ["']active["']/);
  // Điểm danh (Giám thị) reads its own roster query, never the teacher overview or the catalog.
  assert.doesNotMatch(attendancePageSource, /listScoped|listCatalog/);
  assert.match(attendancePageSource, /supervisorAttendance\.roster/);
  assert.deepEqual(
    filterActiveClasses([
      { _id: 'a', status: 'active', code: '6A1' },
      { _id: 'b', status: 'archived', code: '6A0' },
    ]),
    [{ _id: 'a', status: 'active', code: '6A1' }],
  );
});

test('archived class detail names the status, disables writes, and returns to overview', () => {
  assert.match(detailSource, /classStatusLabel\(['"]archived['"]\)/);
  assert.match(detailSource, /Lớp đã lưu trữ — chỉ xem\./);
  assert.match(detailSource, /onClick=\{nav\.back\}/);
  assert.equal(BACK_TO_OVERVIEW, 'Về tổng quan');
  assert.match(catalogUiSource, /không thể thêm phân công/);
  assert.match(rosterSource, /canManage = Boolean\(detail\.permissions\?\.canManage\) && detail\.class\.status !== 'archived'/);
  assert.match(classesSource, /canImportAttendance: !archived &&/);
  assert.match(classesSource, /canCorrect: !archived &&/);
  assert.match(classesSource, /canEditContacts: !archived &&/);
  assert.doesNotMatch(detailSource, /menuAccess\?\.homeroom === ['"]view['"]/);
  assert.match(classesSource, /assertClassNotArchived/);
  assert.match(contextSource, /assertClassNotArchived/);
  assert.match(contextSource, /assertCanBulkImportRoster/);
});

test('assignment candidate query is homeroom-scoped, manager-guarded, and returns only safe fields', () => {
  assert.match(usersSource, /export const list = query/);
  assert.match(usersSource, /adminPermissionOrThrow\(ctx, "users:read"\)/);
  assert.doesNotMatch(catalogUiSource, /anyApi\.users\.list/);
  assert.doesNotMatch(routerSource, /anyApi\.users\.list/);
  assert.match(classesSource, /export const listAssignmentCandidates/);
  const query = classesSource.slice(
    classesSource.indexOf('export const listAssignmentCandidates'),
    classesSource.indexOf('export const listAssignmentCandidates') + 900,
  );
  assert.match(query, /homeroomCatalogWriterOrThrow/);
  assert.match(query, /toAssignmentCandidate/);
  assert.match(query, /isActiveAssignmentCandidate/);
  assert.doesNotMatch(query, /email/);
  assert.doesNotMatch(query, /phone/);
  assert.doesNotMatch(query, /mustChangePassword/);
  assert.doesNotMatch(query, /loginLockedAt/);
  const candidate = toAssignmentCandidate({
    _id: 'u1',
    name: '  GVCN A  ',
    role: 'user',
    email: 'secret@school.test',
    phone: '0900000000',
    mustChangePassword: true,
  });
  assert.deepEqual(candidate, { _id: 'u1', name: 'GVCN A', role: 'user' });
  assert.equal('email' in candidate, false);
  assert.equal('phone' in candidate, false);
  assert.equal(isActiveAssignmentCandidate({ status: 'active' }), true);
  assert.equal(isActiveAssignmentCandidate({ status: 'disabled' }), false);
  assert.deepEqual(toSafeAssignmentUser(null, 'gone-1'), {
    _id: 'gone-1',
    name: 'Người dùng không còn hoạt động',
    role: '',
  });
  assert.match(catalogUiSource, /listAssignmentCandidates/);
  assert.match(catalogUiSource, /['"]skip['"]/);
  assert.match(classesSource, /toSafeAssignmentUser/);
});

test('Kết thúc phân công GVCN: kết thúc ngày liền trước, giữ lịch sử, chỉ rút ngắn', async () => {
  const {
    planHomeroomTeacherEnd,
    ASSIGNMENT_END_BEFORE_START,
    ASSIGNMENT_ALREADY_ENDED,
    ASSIGNMENT_NOT_FOUND,
  } = await import('../convex/homeroomCatalog.ts');
  const { findEffectiveHomeroomTeacherAssignment } = await import('../convex/homeroomPolicy.ts');
  const row = { classId: 'c1', schoolYearId: 'y1', userId: 'u1', assignmentType: 'homeroom_teacher', scopeKind: 'class', active: true, effectiveFrom: '2026-09-05' };

  const plan = planHomeroomTeacherEnd({ assignment: row, date: '2026-10-22' });
  assert.deepEqual(plan, { revoked: false, patch: { effectiveTo: '2026-10-21', active: true } });
  const ended = { ...row, ...plan.patch };
  // From the chosen day the class has no GVCN; earlier days stay with the teacher.
  assert.equal(findEffectiveHomeroomTeacherAssignment([ended], { classId: 'c1', date: '2026-10-22' }), undefined);
  assert.equal(findEffectiveHomeroomTeacherAssignment([ended], { classId: 'c1', date: '2026-10-21' })?.userId, 'u1');

  // Ending on the start day: the row never takes effect (revoked, kept for history).
  assert.deepEqual(planHomeroomTeacherEnd({ assignment: row, date: '2026-09-05' }), { revoked: true, patch: { active: false } });
  assert.throws(() => planHomeroomTeacherEnd({ assignment: row, date: '2026-09-04' }), new RegExp(ASSIGNMENT_END_BEFORE_START));
  // Only shortens: a row already ending earlier cannot be "ended" later.
  assert.throws(
    () => planHomeroomTeacherEnd({ assignment: { ...row, effectiveTo: '2026-10-01' }, date: '2026-10-22' }),
    new RegExp(ASSIGNMENT_ALREADY_ENDED),
  );
  assert.deepEqual(
    planHomeroomTeacherEnd({ assignment: { ...row, effectiveTo: '2026-12-31' }, date: '2026-11-01' }).patch,
    { effectiveTo: '2026-10-31', active: true },
  );
  assert.throws(() => planHomeroomTeacherEnd({ assignment: { ...row, active: false }, date: '2026-10-22' }), new RegExp(ASSIGNMENT_NOT_FOUND));
  assert.throws(() => planHomeroomTeacherEnd({ assignment: { ...row, assignmentType: 'supervisor' }, date: '2026-10-22' }), new RegExp(ASSIGNMENT_NOT_FOUND));
});

test('Kết thúc phân công: mutation chỉ admin/mod, ghi audit; UI có nút và nhóm phân công đã hủy thành lịch sử', async () => {
  const { defaultAssignmentEndDate, buildEndAssignmentPayload, groupAssignmentsByEffect: group } = await import('../src/homeroom/classCatalog.js');
  const body = classesSource.slice(classesSource.indexOf('export const endAssignment'), classesSource.indexOf('export const transferStudent'));
  assert.match(body, /homeroomCatalogWriterOrThrow\(ctx\)/);
  assert.match(body, /assertClassNotArchived\(klass\)/);
  assert.match(body, /planHomeroomTeacherEnd\(/);
  assert.match(body, /action: "homeroomAssignment\.end"/);
  assert.match(body, /endedBy: String\(user\._id\)/);
  assert.match(catalogUiSource, /anyApi\.homeroomClasses\.endAssignment/);
  assert.match(catalogUiSource, /Kết thúc phân công/);

  assert.equal(defaultAssignmentEndDate({ effectiveFrom: '2026-09-05' }, '2026-10-22'), '2026-10-22');
  assert.equal(defaultAssignmentEndDate({ effectiveFrom: '2026-11-01' }, '2026-10-22'), '2026-11-01');
  assert.deepEqual(buildEndAssignmentPayload({ assignmentId: 'a1', date: '2026-10-22' }), { assignmentId: 'a1', date: '2026-10-22' });
  const grouped = group([
    { _id: 'a', active: false, effectiveFrom: '2026-09-05' },
    { _id: 'b', active: true, effectiveFrom: '2026-09-05', effectiveTo: '2026-10-21' },
    { _id: 'c', active: true, effectiveFrom: '2026-10-22' },
  ], '2026-10-22');
  assert.deepEqual(grouped.current.map((row) => row._id), ['c']);
  assert.deepEqual(grouped.historical.map((row) => row._id), ['a', 'b']);
});
