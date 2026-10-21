import assert from 'node:assert/strict';
import test from 'node:test';

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  ATTENDANCE_TEMPLATE_HEADERS,
  detectAttendanceHeader,
  rowsFromAttendanceMatrix,
} from '../convex/attendanceImportSheet.ts';
import {
  classMatchKey,
  decidePublishedDateAction,
  parseSchoolCameraStatus,
  reconcileSchoolAttendanceRows,
  REPLACE_MODE_CANCEL,
  REPLACE_MODE_REPLACE,
  REPLACE_MODE_SUPPLEMENT,
} from '../convex/attendanceImportValidate.ts';
import {
  applyPublicationPolicy,
  attendanceImportPublishResult,
  planAttendanceImportWrites,
} from '../convex/studentAttendancePolicy.ts';
import { enrollmentsCoveringDate } from '../convex/homeroomCatalog.ts';
import { assertImportUploadUsable } from '../convex/userImportPolicy.ts';
import { messageFor } from '../src/lib/appErrorMessage.js';


const students = [
  { studentId: 's1', studentCode: 'HS001', fullName: 'Nguyễn Văn A', dateOfBirth: '2014-03-11', classId: 'c1', classCode: '7/1', enrollmentId: 'e1' },
  { studentId: 's2', studentCode: 'HS002', fullName: 'Nguyễn Văn A', dateOfBirth: '2014-05-20', classId: 'c1', classCode: '7/1', enrollmentId: 'e2' },
  { studentId: 's3', studentCode: 'HS003', fullName: 'Hà Thị Thùy Linh', dateOfBirth: '2014-08-01', classId: 'c1', classCode: '7/1', enrollmentId: 'e3' },
];
const classes = [
  { classId: 'c1', code: '7/1', name: 'Lớp 7/1' },
  { classId: 'c2', code: '7/2', name: 'Lớp 7/2' },
];

const TEMPLATE_HEADER = ['Lớp học', 'Tên học sinh', 'Ngày sinh', 'Trạng thái điểm danh', 'Thời gian điểm danh'];
const FILE_HEADER = [...TEMPLATE_HEADER, 'Loại điểm danh'];

test('camera file header is detected below a title row; Loại điểm danh is ignored', () => {
  assert.deepEqual(Object.values(ATTENDANCE_TEMPLATE_HEADERS), TEMPLATE_HEADER);
  const matrix = [
    ['BẢNG THỐNG KÊ ĐIỂM DANH HỌC SINH TOÀN TRƯỜNG'],
    [],
    FILE_HEADER,
    ['7/1', 'Nguyễn Văn A', '11/03/2014', 'Đúng giờ', '06:52', ''],
    ['', '', '', '', '', ''],
    ['7/1', 'Hà Thị Thuỳ Linh', '01/08/2014', 'Chưa điểm danh', '--:--', ''],
  ];
  const header = detectAttendanceHeader(matrix);
  assert.equal(header?.rowIndex, 2);
  assert.deepEqual(header?.missing, []);
  assert.deepEqual(header?.columns, { classCode: 0, studentName: 1, dateOfBirth: 2, sourceStatus: 3, observedAt: 4 });
  const parsed = rowsFromAttendanceMatrix(matrix);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows[0], {
    rowNumber: 4,
    rawClassCode: '7/1',
    rawStudentName: 'Nguyễn Văn A',
    rawDateOfBirth: '11/03/2014',
    rawObservedAt: '06:52',
    rawStatus: 'Đúng giờ',
  });
  assert.equal(parsed.rows[1].rowNumber, 6);
});

test('template errors are explicit: missing header, missing required columns, empty file', () => {
  assert.deepEqual(rowsFromAttendanceMatrix([['foo', 'bar'], ['1', '2']]), {
    ok: false,
    message: 'ATTENDANCE_TEMPLATE_HEADER_NOT_FOUND',
  });
  const missing = rowsFromAttendanceMatrix([['Lớp học', 'Tên học sinh', 'Thời gian điểm danh'], ['7/1', 'A', '07:00']]);
  assert.equal(missing.ok, false);
  assert.equal(missing.message, 'ATTENDANCE_TEMPLATE_COLUMNS_MISSING');
  assert.deepEqual(missing.missing, ['dateOfBirth', 'sourceStatus']);
  assert.equal(
    messageFor(new Error(`${missing.message}:${missing.missing.join(',')}`)),
    'File điểm danh thiếu cột: Ngày sinh, Trạng thái điểm danh.',
  );
  assert.deepEqual(rowsFromAttendanceMatrix([TEMPLATE_HEADER]), { ok: false, message: 'IMPORT_FILE_EMPTY' });
});

test('camera status accepts only Đúng giờ / Đi trễ / Chưa điểm danh (accents optional)', () => {
  assert.equal(parseSchoolCameraStatus('Đúng giờ'), 'present');
  assert.equal(parseSchoolCameraStatus('dung gio'), 'present');
  // File camera đời cũ
  assert.equal(parseSchoolCameraStatus('Đã điểm danh'), 'present');
  assert.equal(parseSchoolCameraStatus('da diem danh'), 'present');
  assert.equal(parseSchoolCameraStatus(' Đi trễ '), 'late');
  assert.equal(parseSchoolCameraStatus('CHƯA ĐIỂM DANH'), 'absent');
  assert.equal(parseSchoolCameraStatus('Có mặt'), null);
  assert.equal(parseSchoolCameraStatus(''), null);
});

test('class key tolerates "Lớp" prefix, spacing, and "/" vs "-" (app codes cannot contain "/")', () => {
  assert.equal(classMatchKey('7/1'), classMatchKey('Lớp 7/1'));
  assert.equal(classMatchKey(' 7 / 1 '), '7-1');
  assert.equal(classMatchKey('7/1'), classMatchKey('7-1'));
  assert.equal(classMatchKey('7/1'), classMatchKey('Lớp 7-1'));
  assert.notEqual(classMatchKey('7/1'), classMatchKey('7/11'));
});

test('students match by class + name + birth date; same name different DOB is disambiguated', () => {
  const rows = [
    { rowNumber: 2, rawClassCode: '7/1', rawStudentName: 'Nguyễn Văn A', rawDateOfBirth: '11/03/2014', rawObservedAt: '06:52', rawStatus: 'Đúng giờ' },
    { rowNumber: 3, rawClassCode: 'Lớp 7/1', rawStudentName: 'nguyễn  văn a', rawDateOfBirth: '20/05/2014', rawObservedAt: '07:12', rawStatus: 'Đi trễ' },
    { rowNumber: 4, rawClassCode: '7/1', rawStudentName: 'Hà Thị Thuỳ Linh', rawDateOfBirth: '01/08/2014', rawObservedAt: '--:--', rawStatus: 'Chưa điểm danh' },
  ];
  const result = reconcileSchoolAttendanceRows(rows, { attendanceDate: '2026-09-01', classes, students });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.deepEqual(result.rows.map((row) => row.matchedStudentId), ['s1', 's2', 's3']);
  assert.deepEqual(result.rows.map((row) => row.rawObservation), ['present', 'late', 'absent']);
  assert.equal(typeof result.rows[0].normalizedObservedAt, 'number');
  assert.equal(result.rows[2].normalizedObservedAt, undefined);
  const c1 = result.classes.find((row) => row.classId === 'c1');
  assert.deepEqual([c1.present, c1.late, c1.absent, c1.missingCount, c1.publishable], [1, 1, 1, 0, true]);
});

test('broken classes are skipped, good classes stay publishable; DOB mismatch / wrong class are explicit', () => {
  const roster = [
    ...students,
    { studentId: 's4', studentCode: 'HS004', fullName: 'Lê Văn C', dateOfBirth: '2014-01-02', classId: 'c2', classCode: '7/2', enrollmentId: 'e4' },
    { studentId: 's5', studentCode: 'HS005', fullName: 'Phạm D', classId: 'c2', classCode: '7/2', enrollmentId: 'e5' },
  ];
  const rows = [
    { rowNumber: 2, rawClassCode: '7/1', rawStudentName: 'Nguyễn Văn A', rawDateOfBirth: '11/03/2014', rawStatus: 'Đúng giờ' },
    { rowNumber: 3, rawClassCode: '7/2', rawStudentName: 'Lê Văn C', rawDateOfBirth: '03/01/2014', rawStatus: 'Đúng giờ' },
    { rowNumber: 4, rawClassCode: '7/2', rawStudentName: 'Phạm D', rawDateOfBirth: '04/04/2014', rawStatus: 'Đi trễ' },
    { rowNumber: 5, rawClassCode: '7/2', rawStudentName: 'Hà Thị Thùy Linh', rawDateOfBirth: '01/08/2014', rawStatus: 'Đúng giờ' },
    { rowNumber: 6, rawClassCode: '9/9', rawStudentName: 'X', rawDateOfBirth: '01/01/2012', rawStatus: 'Đúng giờ' },
    { rowNumber: 7, rawClassCode: '7/2', rawStudentName: 'Lê Văn C', rawDateOfBirth: '02/01/2014', rawStatus: 'Nghỉ' },
  ];
  const result = reconcileSchoolAttendanceRows(rows, { attendanceDate: '2026-09-01', classes, students: roster });
  const c1 = result.classes.find((row) => row.classId === 'c1');
  const c2 = result.classes.find((row) => row.classId === 'c2');
  assert.equal(c1.publishable, true);
  assert.equal(c1.missingCount, 2, 'students absent from the file become absent pending on publish');
  assert.equal(c2.publishable, false);
  assert.deepEqual(result.publishableClassIds, ['c1']);
  const codeAt = (rowNumber) => result.issues.filter((item) => item.rowNumber === rowNumber).map((item) => item.code);
  assert.deepEqual(codeAt(3), ['CAMERA_DOB_MISMATCH']);
  assert.match(result.issues.find((item) => item.rowNumber === 3).message, /02\/01\/2014/);
  assert.deepEqual(codeAt(4), ['CAMERA_DOB_MISMATCH'], 'student without DOB on file cannot be matched');
  assert.deepEqual(codeAt(5), ['CAMERA_WRONG_CLASS']);
  assert.deepEqual(codeAt(6), ['CAMERA_CLASS_UNKNOWN']);
  assert.deepEqual(codeAt(7), ['CAMERA_STATUS_INVALID']);
  assert.ok(result.rows.every((row) => row.rowNumber === 2 || row.resolution === 'invalid'));
  assert.equal(result.rows.length, rows.length);
});

test('duplicate rows and same name + DOB twice in a class never auto-match', () => {
  const twins = [
    ...students,
    { studentId: 's9', studentCode: 'HS009', fullName: 'Nguyễn Văn A', dateOfBirth: '2014-03-11', classId: 'c1', classCode: '7/1', enrollmentId: 'e9' },
  ];
  const ambiguous = reconcileSchoolAttendanceRows(
    [{ rowNumber: 2, rawClassCode: '7/1', rawStudentName: 'Nguyễn Văn A', rawDateOfBirth: '11/03/2014', rawStatus: 'Đúng giờ' }],
    { attendanceDate: '2026-09-01', classes, students: twins },
  );
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.issues[0].code, 'CAMERA_STUDENT_AMBIGUOUS');
  const row = { rawClassCode: '7/1', rawStudentName: 'Nguyễn Văn A', rawDateOfBirth: '11/03/2014', rawStatus: 'Đúng giờ' };
  const duplicate = reconcileSchoolAttendanceRows(
    [{ rowNumber: 2, ...row }, { rowNumber: 3, ...row }],
    { attendanceDate: '2026-09-01', classes, students },
  );
  assert.equal(duplicate.issues.some((item) => item.rowNumber === 3 && item.code === 'CAMERA_DUPLICATE_ROW'), true);
  assert.equal(duplicate.classes[0].publishable, false);
});

const REAL_EXPORT = fileURLToPath(new URL('../Bảng-thống-kê-điểm-danh-học-sinh-toan-truong.xlsx', import.meta.url));

test('the real school export parses and every row has a valid status and DOB', { skip: !existsSync(REAL_EXPORT) }, () => {
  const XLSX = createRequire(import.meta.url)('xlsx');
  const workbook = XLSX.readFile(REAL_EXPORT);
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '', raw: false });
  const parsed = rowsFromAttendanceMatrix(matrix);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.rows.length > 100);
  const result = reconcileSchoolAttendanceRows(parsed.rows, { attendanceDate: '2026-09-01', classes: [], students: [] });
  const codes = new Set(result.issues.map((item) => item.code));
  assert.deepEqual([...codes], ['CAMERA_CLASS_UNKNOWN'], 'only class lookup fails without a roster');
});

test('same checksum and date is idempotent; a different file requires an explicit mode', () => {
  const existing = { importId: 'imp-1', checksum: 'abc', attendanceDate: '2026-09-01' };
  assert.deepEqual(
    decidePublishedDateAction({
      existingPublished: existing,
      nextChecksum: 'abc',
      attendanceDate: '2026-09-01',
    }),
    { action: 'idempotent', importId: 'imp-1' },
  );
  const required = decidePublishedDateAction({
    existingPublished: existing,
    nextChecksum: 'def',
    attendanceDate: '2026-09-01',
  });
  assert.equal(required.action, 'require_mode');
  assert.equal(required.code, 'ATTENDANCE_REPLACE_MODE_REQUIRED');
  for (const [requestedMode, action] of [
    [REPLACE_MODE_SUPPLEMENT, 'supplement'],
    [REPLACE_MODE_REPLACE, 'replace'],
    [REPLACE_MODE_CANCEL, 'cancel'],
  ]) {
    assert.equal(
      decidePublishedDateAction({ existingPublished: existing, nextChecksum: 'def', attendanceDate: '2026-09-01', requestedMode }).action,
      action,
    );
  }
});

test('positive_presence publication creates one day per enrollment and missing students become absent pending', () => {
  const parsed = rowsFromAttendanceMatrix([TEMPLATE_HEADER, ['7/1', 'Nguyễn Văn A', '11/03/2014', 'Đúng giờ', '07:05']]);
  assert.equal(parsed.ok, true);
  const reconciled = reconcileSchoolAttendanceRows(parsed.rows, { attendanceDate: '2026-09-01', classes, students });
  assert.equal(reconciled.ok, true);
  const published = applyPublicationPolicy({
    enrollments: students.map((row) => ({
      enrollmentId: row.enrollmentId,
      studentId: row.studentId,
      classId: row.classId,
      schoolYearId: 'y1',
    })),
    matchedRows: reconciled.rows.map((row) => ({
      matchedStudentId: row.matchedStudentId,
      rawObservation: row.rawObservation,
      normalizedObservedAt: row.normalizedObservedAt,
    })),
    presencePolicy: 'positive_presence',
    attendanceDate: '2026-09-01',
    sourceImportId: 'imp-1',
  });
  assert.equal(published.days.length, 3);
  assert.equal(published.days.find((row) => row.studentId === 's1')?.effectiveStatus, 'present');
  assert.equal(published.days.find((row) => row.studentId === 's3')?.effectiveStatus, 'absent_pending');
});

test('publication roster is date-effective after a transfer', () => {
  const enrollments = [
    { classId: 'c1', studentId: 's1', startDate: '2026-08-15', endDate: '2026-10-31', status: 'transferred' },
    { classId: 'c1', studentId: 's2', startDate: '2026-08-15', status: 'active' },
    { classId: 'c2', studentId: 's1', startDate: '2026-11-01', status: 'active' },
  ];
  const onDate = enrollmentsCoveringDate(enrollments, { classId: 'c1', date: '2026-10-01' });
  assert.deepEqual(onDate.map((row) => row.studentId).sort(), ['s1', 's2']);
  const transferDayOld = enrollmentsCoveringDate(enrollments, { classId: 'c1', date: '2026-11-01' });
  assert.deepEqual(transferDayOld.map((row) => row.studentId), ['s2']);
  const transferDayNew = enrollmentsCoveringDate(enrollments, { classId: 'c2', date: '2026-11-01' });
  assert.deepEqual(transferDayNew.map((row) => row.studentId), ['s1']);
  const afterTransfer = enrollmentsCoveringDate(enrollments, { classId: 'c1', date: '2026-11-15' });
  assert.deepEqual(afterTransfer.map((row) => row.studentId), ['s2']);
});

test('camera import write paths are retired; history stays read-only and the web UI is gone', () => {
  const source = readFileSync(new URL('../convex/attendanceImport.ts', import.meta.url), 'utf8');
  for (const name of ['generateUploadUrl', 'registerUpload', 'validate', 'publish']) {
    const start = source.indexOf(`export const ${name} =`);
    assert.ok(start >= 0, name);
    const block = source.slice(start, source.indexOf('});', start));
    assert.match(block, /retired\(\)/, name);
    assert.doesNotMatch(block, /ctx\.db\.(insert|patch)|storage\.generateUploadUrl/, name);
  }
  assert.match(source, /ATTENDANCE_CAMERA_IMPORT_RETIRED/);
  assert.match(source, /export const uploadsForDate = query/);
  for (const removed of [
    '../src/homeroom/HomeroomAttendanceImport.jsx',
    '../src/homeroom/attendanceImportPreview.js',
    '../src/lib/attendanceImportExcel.js',
    '../convex/attendanceImportParse.ts',
  ]) {
    assert.equal(existsSync(fileURLToPath(new URL(removed, import.meta.url))), false, removed);
  }
  assert.match(messageFor(new Error('ATTENDANCE_CAMERA_IMPORT_RETIRED')), /đã ngừng/);
  assert.throws(
    () =>
      assertImportUploadUsable(
        { uploadedBy: 'sup-1', status: 'uploaded', expiresAt: Date.now() + 1000 },
        { actorId: 'sup-2' },
      ),
    /FORBIDDEN/,
  );
});

test('supplement updates existing no_data, skips reviewed days, and inserts only absent pending per policy', () => {
  const incoming = applyPublicationPolicy({
    enrollments: students.map((row) => ({
      enrollmentId: row.enrollmentId,
      studentId: row.studentId,
      classId: row.classId,
      schoolYearId: 'y1',
    })),
    matchedRows: [
      { matchedStudentId: 's1', rawObservation: 'present', normalizedObservedAt: 15 },
      { matchedStudentId: 's2', rawObservation: 'late', normalizedObservedAt: 16 },
    ],
    presencePolicy: 'positive_presence',
    attendanceDate: '2026-09-01',
    sourceImportId: 'imp-2',
  }).days;
  const existing = [
    {
      studentId: 's1',
      rawObservation: 'unknown',
      disposition: 'none',
      effectiveStatus: 'no_data',
      note: 'Thiếu camera',
    },
    {
      studentId: 's2',
      rawObservation: 'absent',
      disposition: 'excused',
      effectiveStatus: 'absent_excused',
      reasonCode: 'leave',
      note: 'Có phép',
    },
  ];

  const plan = planAttendanceImportWrites({
    incomingDays: incoming,
    existingDays: existing,
    mode: 'supplement',
  });

  assert.equal(plan.changedCount, 2);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.inserts.length, 1);
  assert.deepEqual(plan.updates[0], {
    studentId: 's1',
    rawObservation: 'present',
    rawObservedAt: 15,
    disposition: 'none',
    effectiveStatus: 'present',
    note: 'Thiếu camera',
    overwritten: true,
  });
  assert.equal(plan.inserts[0].studentId, 's3');
  assert.equal(plan.inserts[0].rawObservation, 'absent');
  assert.equal(plan.inserts[0].disposition, 'pending');
  assert.equal(plan.inserts[0].effectiveStatus, 'absent_pending');
});

test('supplement that changes zero rows still publishes the upload with a truthful count', () => {
  const incoming = applyPublicationPolicy({
    enrollments: students.slice(0, 2).map((row) => ({
      enrollmentId: row.enrollmentId,
      studentId: row.studentId,
      classId: row.classId,
      schoolYearId: 'y1',
    })),
    matchedRows: [
      { matchedStudentId: 's1', rawObservation: 'present' },
      { matchedStudentId: 's2', rawObservation: 'late' },
    ],
    presencePolicy: 'positive_presence',
    attendanceDate: '2026-09-01',
    sourceImportId: 'imp-3',
  }).days;
  const existing = [
    { studentId: 's1', rawObservation: 'absent', disposition: 'unexcused', effectiveStatus: 'absent_unexcused' },
    { studentId: 's2', rawObservation: 'absent', disposition: 'pending', effectiveStatus: 'absent_pending' },
  ];

  const plan = planAttendanceImportWrites({
    incomingDays: incoming,
    existingDays: existing,
    mode: 'supplement',
  });
  assert.equal(incoming.length, 2);
  assert.equal(plan.changedCount, 0);
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.inserts, []);
  assert.deepEqual(attendanceImportPublishResult({ uploadId: 'imp-3', changedCount: plan.changedCount }), {
    importId: 'imp-3',
    published: true,
    count: 0,
  });

});
