import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertReadableAttendanceDate,
  assertSupervisorAttendanceActor,
  assertWritableAttendanceDate,
  canChooseAttendanceDate,
  canUseSupervisorAttendance,
  parseAbsentCell,
  pickSchoolYearForDate,
  planSupervisorClassSave,
  rowsFromSupervisorMatrix,
  studentNameKey,
  SUPERVISOR_IMPORT_HEADERS,
  validateSupervisorImportRows,
} from '../convex/supervisorAttendancePolicy.ts';

const supervisor = { userId: 'u-sup', role: 'user', status: 'active', menuAccess: { attendance: 'supervisor', homeroom: 'hidden' } };
const admin = { userId: 'u-admin', role: 'admin', status: 'active', menuAccess: {} };
const moderator = { userId: 'u-mod', role: 'moderator', status: 'active', menuAccess: {} };
const teacher = { userId: 'u-gvcn', role: 'user', status: 'active', menuAccess: { homeroom: 'view', attendance: 'hidden' } };
const year = { startDate: '2026-09-01', endDate: '2027-05-31' };
const today = '2026-10-21';

test('only attendance=supervisor or admin/mod may use the Điểm danh menu; homeroom access does not count', () => {
  assert.equal(canUseSupervisorAttendance(supervisor), true);
  assert.equal(canUseSupervisorAttendance(admin), true);
  assert.equal(canUseSupervisorAttendance(moderator), true);
  assert.equal(canUseSupervisorAttendance(teacher), false);
  assert.equal(canUseSupervisorAttendance({ ...teacher, menuAccess: { homeroom: 'supervisor' } }), false);
  assert.throws(() => assertSupervisorAttendanceActor(teacher), /SUPERVISOR_REQUIRED/);
  assert.throws(() => assertSupervisorAttendanceActor({ ...supervisor, status: 'disabled' }), /USER_NOT_ACTIVE/);
  assert.throws(() => assertSupervisorAttendanceActor({ ...supervisor, mustChangePassword: true }), /PASSWORD_CHANGE_REQUIRED/);
  assert.doesNotThrow(() => assertSupervisorAttendanceActor(supervisor));
});

test('Giám thị saves today only; admin/mod today or past days inside the year; never the future', () => {
  assert.equal(canChooseAttendanceDate(supervisor), false);
  assert.equal(canChooseAttendanceDate(admin), true);
  assert.doesNotThrow(() => assertWritableAttendanceDate(supervisor, today, today, year));
  assert.throws(() => assertWritableAttendanceDate(supervisor, '2026-10-20', today, year), /ATTENDANCE_DATE_TODAY_ONLY/);
  assert.throws(() => assertReadableAttendanceDate(supervisor, '2026-10-20', today), /ATTENDANCE_DATE_TODAY_ONLY/);
  assert.throws(() => assertWritableAttendanceDate(supervisor, '2026-10-22', today, year), /ATTENDANCE_DATE_IN_FUTURE/);
  assert.doesNotThrow(() => assertWritableAttendanceDate(admin, '2026-10-01', today, year));
  assert.doesNotThrow(() => assertWritableAttendanceDate(moderator, today, today, year));
  assert.throws(() => assertWritableAttendanceDate(admin, '2026-10-22', today, year), /ATTENDANCE_DATE_IN_FUTURE/);
  assert.throws(() => assertWritableAttendanceDate(admin, '2026-08-20', today, year), /ATTENDANCE_DATE_OUTSIDE_YEAR/);
});

test('school year for a date prefers the default year among covering years', () => {
  const years = [
    { _id: 'old', startDate: '2025-09-01', endDate: '2026-05-31', active: false },
    { _id: 'a', startDate: '2026-08-15', endDate: '2027-06-30', active: false },
    { _id: 'b', startDate: '2026-09-01', endDate: '2027-05-31', active: true },
  ];
  assert.equal(pickSchoolYearForDate(years, '2026-10-21')?._id, 'b');
  assert.equal(pickSchoolYearForDate(years, '2026-08-20')?._id, 'a');
  assert.equal(pickSchoolYearForDate(years, '2026-07-01'), null);
});

const enrollments = ['s1', 's2', 's3'].map((studentId) => ({
  enrollmentId: `e-${studentId}`,
  studentId,
  classId: 'c1',
  schoolYearId: 'y1',
}));

test('first save inserts every enrolled student: absent → excused by default, others present', () => {
  const plan = planSupervisorClassSave({ enrollments, existingDays: [], absentStudentIds: ['s2'] });
  assert.equal(plan.inserts.length, 3);
  const byStudent = Object.fromEntries(plan.inserts.map((row) => [row.studentId, row]));
  assert.deepEqual(
    [byStudent.s1.rawObservation, byStudent.s1.disposition, byStudent.s1.effectiveStatus],
    ['present', 'none', 'present'],
  );
  assert.deepEqual(
    [byStudent.s2.rawObservation, byStudent.s2.disposition, byStudent.s2.effectiveStatus],
    ['absent', 'excused', 'absent_excused'],
  );
  assert.equal(plan.absentCount, 1);
  assert.equal(plan.presentCount, 2);
  assert.deepEqual(plan.corrections, []);
});

test('re-save keeps a GVCN "không phép", resets present rows and audits every status change', () => {
  const existingDays = [
    { _id: 'd1', studentId: 's1', rawObservation: 'absent', disposition: 'unexcused', effectiveStatus: 'absent_unexcused', note: 'Trốn học' },
    { _id: 'd2', studentId: 's2', rawObservation: 'absent', disposition: 'excused', effectiveStatus: 'absent_excused', reasonCode: 'Ốm' },
    { _id: 'd3', studentId: 's3', rawObservation: 'late', disposition: 'none', effectiveStatus: 'late' },
  ];
  const plan = planSupervisorClassSave({ enrollments, existingDays, absentStudentIds: ['s1', 's3'] });
  assert.equal(plan.inserts.length, 0);
  const patches = Object.fromEntries(plan.patches.map((row) => [row.studentId, row]));
  assert.equal(patches.s1, undefined, 'unchanged unexcused absence is not rewritten');
  assert.deepEqual(
    [patches.s2.rawObservation, patches.s2.disposition, patches.s2.effectiveStatus, patches.s2.reasonCode],
    ['present', 'none', 'present', undefined],
  );
  assert.deepEqual([patches.s3.disposition, patches.s3.effectiveStatus], ['excused', 'absent_excused']);
  assert.deepEqual(
    plan.corrections.map((row) => [row.studentId, row.previousEffectiveStatus, row.nextEffectiveStatus]),
    [
      ['s2', 'absent_excused', 'present'],
      ['s3', 'late', 'absent_excused'],
    ],
  );

  const legacyPending = planSupervisorClassSave({
    enrollments,
    existingDays: [{ _id: 'd9', studentId: 's1', rawObservation: 'absent', disposition: 'pending', effectiveStatus: 'absent_pending' }],
    absentStudentIds: ['s1'],
  });
  const pendingPatch = legacyPending.patches.find((row) => row.studentId === 's1');
  assert.equal(pendingPatch.disposition, 'excused');
  assert.equal(legacyPending.corrections.length, 1);
});

test('absent ids must be enrolled in that class on that date', () => {
  assert.throws(
    () => planSupervisorClassSave({ enrollments, existingDays: [], absentStudentIds: ['s-other'] }),
    /ATTENDANCE_STUDENT_NOT_IN_CLASS/,
  );
  const deduped = planSupervisorClassSave({ enrollments, existingDays: [], absentStudentIds: ['s1', 's1'] });
  assert.equal(deduped.absentCount, 1);
});

test('template sheet needs Lớp học / Tên học sinh / Vắng; blank rows are skipped', () => {
  assert.deepEqual([...SUPERVISOR_IMPORT_HEADERS], ['Lớp học', 'Tên học sinh', 'Vắng']);
  const parsed = rowsFromSupervisorMatrix([
    ['Điểm danh ngày 21/10/2026'],
    ['Lớp học', 'Tên học sinh', 'Vắng'],
    ['6/1', 'Nguyễn Văn A', ''],
    ['', '', ''],
    ['6/1', 'Trần Thị B', 'x'],
  ]);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.rows.map((row) => [row.rowNumber, row.className, row.studentName, row.absent]), [
    [3, '6/1', 'Nguyễn Văn A', ''],
    [5, '6/1', 'Trần Thị B', 'x'],
  ]);
  assert.deepEqual(rowsFromSupervisorMatrix([['Lớp học', 'Tên học sinh']]), { ok: false, message: 'SUPERVISOR_IMPORT_HEADERS' });
  assert.deepEqual(rowsFromSupervisorMatrix([['Lớp học', 'Tên học sinh', 'Vắng']]), { ok: false, message: 'IMPORT_FILE_EMPTY' });
});

test('Vắng accepts only x / X / empty; names match regardless of accents, case and spaces', () => {
  assert.equal(parseAbsentCell(''), false);
  assert.equal(parseAbsentCell('  '), false);
  assert.equal(parseAbsentCell('x'), true);
  assert.equal(parseAbsentCell(' X '), true);
  assert.equal(parseAbsentCell('có'), null);
  assert.equal(parseAbsentCell('1'), null);
  assert.equal(studentNameKey('Hà Thị  Thùy Linh'), studentNameKey('ha thi thuy  linh'));
  assert.equal(studentNameKey('Đặng Văn Đức'), studentNameKey('DANG VAN DUC'));
});

const context = {
  classes: [
    { classId: 'c61', code: '2627-6-1', name: '6/1' },
    { classId: 'c62', code: '6-2', name: 'Lớp 6/2' },
  ],
  students: [
    { studentId: 'a', classId: 'c61', fullName: 'Nguyễn Văn A' },
    { studentId: 'b', classId: 'c61', fullName: 'Trần Thị B' },
    { studentId: 'c', classId: 'c61', fullName: 'Lê Văn C' },
    { studentId: 'd1', classId: 'c62', fullName: 'Phạm Minh D' },
    { studentId: 'd2', classId: 'c62', fullName: 'Phạm Minh D' },
  ],
};
const row = (rowNumber, className, studentName, absent = '') => ({ rowNumber, className, studentName, absent });

test('import: classes by name or code ("6/1" ~ "6-1"); missing students are present; other classes untouched', () => {
  const result = validateSupervisorImportRows(
    [row(2, '6-1', 'nguyen van a', 'X'), row(3, '6/1', 'Trần Thị B')],
    context,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.classes.length, 1, 'class 6/2 is not in the file and stays untouched');
  const [klass] = result.classes;
  assert.equal(klass.classId, 'c61');
  assert.deepEqual(klass.absentStudentIds, ['a']);
  assert.equal(klass.presentCount, 2, 'Lê Văn C is missing from the file → present');
  assert.deepEqual(klass.absentNames, ['Nguyễn Văn A']);
  const byCode = validateSupervisorImportRows([row(2, 'lớp 6/2', 'Phạm Minh D')], { ...context, students: context.students.slice(0, 4) });
  assert.equal(byCode.ok, true);
  assert.equal(byCode.classes[0].classId, 'c62');
});

test('import: every bad row blocks the commit (all-or-nothing)', () => {
  const result = validateSupervisorImportRows(
    [
      row(2, '9/9', 'Ai Đó'),
      row(3, '6/1', 'Không Có Tên'),
      row(4, '6/2', 'Phạm Minh D'),
      row(5, '6/1', 'Nguyễn Văn A', 'x'),
      row(6, '6/1', 'nguyễn văn a'),
      row(7, '6/1', 'Trần Thị B', 'có'),
      row(8, '', 'Lê Văn C'),
    ],
    context,
  );
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => [error.rowNumber, error.code]),
    [
      [2, 'CLASS_NOT_FOUND'],
      [3, 'STUDENT_NOT_FOUND'],
      [4, 'STUDENT_AMBIGUOUS'],
      [6, 'DUPLICATE_ROW'],
      [7, 'INVALID_ABSENT_VALUE'],
      [8, 'CLASS_REQUIRED'],
    ],
  );
  for (const error of result.errors) assert.match(error.message, /[à-ỹ]/i, 'Vietnamese message');
  assert.equal(validateSupervisorImportRows([], context).ok, false);
});

test('backend re-checks auth on every Điểm danh function and commit never trusts client rows', () => {
  const source = readFileSync(new URL('../convex/supervisorAttendance.ts', import.meta.url), 'utf8');
  for (const name of ['roster', 'templateRows', 'saveClass', 'generateUploadUrl', 'registerUpload', 'getUploadInternal', 'importContextInternal', 'claimUploadForCommit', 'commitInternal']) {
    const start = source.indexOf(`export const ${name} =`);
    assert.ok(start >= 0, name);
    const block = source.slice(start, source.indexOf('\n});', start));
    assert.match(block, /supervisorActorOrThrow\(ctx\)/, name);
  }
  assert.match(source, /export const commitInternal = internalMutation/);
  assert.match(source, /export const commit = action\(\{\n  args: \{ uploadId: v\.id\("supervisorAttendanceUploads"\) \}/);
  assert.match(source, /runAfter\(SUPERVISOR_IMPORT_TTL_MS, internal\.supervisorAttendance\.purgeUpload/);
  assert.match(source, /assertStoredImportMetadata\(stored, \{ fileSize: args\.fileSize, maxBytes: SUPERVISOR_IMPORT_MAX_BYTES \}\)/);
  assert.match(source, /studentAttendanceCorrections/);
  assert.match(source, /attendanceClassDays/);
});
