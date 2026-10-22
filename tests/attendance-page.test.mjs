import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  absentIdsOf,
  classesForGrade,
  classStatusText,
  GRADE_TAB_STORAGE_KEY,
  precheckImportFile,
  readStoredGrade,
  sameIdSet,
  templateFileName,
  toggleId,
  vietnamHm,
  writeStoredGrade,
} from '../src/attendance/attendanceState.js';
import {
  classNotMarked,
  isUnexcused,
  nextDispositionForToggle,
  notMarkedMessage,
  splitAttendanceRows,
} from '../src/homeroom/attendanceDay.js';
import { rowsFromSupervisorMatrix, SUPERVISOR_IMPORT_HEADERS } from '../convex/supervisorAttendancePolicy.ts';
import { messageFor } from '../src/lib/appErrorMessage.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('grade tab memory survives missing or throwing storage', () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  assert.equal(readStoredGrade(storage), 6);
  writeStoredGrade(8, storage);
  assert.equal(store.get(GRADE_TAB_STORAGE_KEY), '8');
  assert.equal(readStoredGrade(storage), 8);
  store.set(GRADE_TAB_STORAGE_KEY, '12');
  assert.equal(readStoredGrade(storage), 6);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readStoredGrade(broken), 6);
  assert.doesNotThrow(() => writeStoredGrade(7, broken));
  assert.equal(readStoredGrade(undefined), 6);
});

test('class status chip text: Chưa điểm danh / Đã lưu HH:mm · N vắng (Vietnam time)', () => {
  assert.equal(classStatusText(null), 'Chưa điểm danh');
  const savedAt = Date.parse('2026-10-21T00:35:00.000Z'); // 07:35 in Vietnam
  assert.equal(vietnamHm(savedAt), '07:35');
  assert.equal(classStatusText({ savedAt, absentCount: 3 }), 'Đã lưu 07:35 · 3 vắng');
});

test('draft helpers: default present, toggling, dirty check, grade lookup', () => {
  const students = [
    { studentId: 'a', absent: false },
    { studentId: 'b', absent: true },
  ];
  const initial = absentIdsOf(students);
  assert.deepEqual([...initial], ['b']);
  const toggled = toggleId(initial, 'a');
  assert.equal(sameIdSet(initial, toggled), false);
  assert.equal(sameIdSet(initial, toggleId(toggled, 'a')), true);
  assert.equal(initial.has('a'), false, 'toggle never mutates the original set');
  const roster = { grades: [{ gradeLevel: 6, classes: [{ classId: 'c1' }] }, { gradeLevel: 7, classes: [] }] };
  assert.deepEqual(classesForGrade(roster, 6), [{ classId: 'c1' }]);
  assert.deepEqual(classesForGrade(roster, 9), []);
  assert.deepEqual(classesForGrade(undefined, 6), []);
});

test('template file name and client pre-check (server re-validates)', () => {
  assert.equal(templateFileName('2026-10-21'), 'mau_diem_danh_20261021.xlsx');
  assert.match(precheckImportFile(null), /chọn file/);
  assert.match(precheckImportFile({ name: 'a.xls', size: 10 }), /\.xlsx/);
  assert.match(precheckImportFile({ name: 'a.xlsx', size: 0 }), /trống/);
  assert.match(precheckImportFile({ name: 'a.xlsx', size: 2 * 1024 * 1024 + 1 }), /2 MB/);
  assert.equal(precheckImportFile({ name: 'A.XLSX', size: 100 }), '');
});

test('client template has exactly the 3 server columns and round-trips through the server parser', async () => {
  const { SUPERVISOR_TEMPLATE_HEADERS, supervisorTemplateMatrix, SUPERVISOR_TEMPLATE_INSTRUCTIONS_SHEET } = await import(
    '../src/lib/supervisorAttendanceExcel.js'
  );
  assert.deepEqual(SUPERVISOR_TEMPLATE_HEADERS, [...SUPERVISOR_IMPORT_HEADERS]);
  assert.equal(SUPERVISOR_TEMPLATE_INSTRUCTIONS_SHEET, 'huong_dan');
  const matrix = supervisorTemplateMatrix([
    { className: '6/1', studentName: 'Nguyễn Văn A' },
    { className: '6/1', studentName: 'Trần Thị B' },
  ]);
  assert.deepEqual(matrix[1], ['6/1', 'Nguyễn Văn A', '']);
  const parsed = rowsFromSupervisorMatrix(matrix);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 2);
  assert.ok(parsed.rows.every((row) => row.absent === ''));
});

test('GVCN tab: absent rows first, checkbox maps to unexcused/excused, legacy pending handled', () => {
  const rows = [
    { student: { fullName: 'A' }, day: { rawObservation: 'present', effectiveStatus: 'present' } },
    { student: { fullName: 'B' }, day: { rawObservation: 'absent', disposition: 'unexcused', effectiveStatus: 'absent_unexcused' } },
    { student: { fullName: 'C' }, day: null },
    { student: { fullName: 'D' }, day: { rawObservation: 'absent', disposition: 'pending', effectiveStatus: 'absent_pending' } },
    { student: { fullName: 'E' }, day: { rawObservation: 'late', effectiveStatus: 'late' } },
  ];
  const { absent, others } = splitAttendanceRows(rows);
  assert.deepEqual(absent.map((row) => row.student.fullName), ['B', 'D']);
  assert.deepEqual(others.map((row) => row.student.fullName), ['A', 'C', 'E']);
  assert.equal(isUnexcused(rows[1].day), true);
  assert.equal(isUnexcused(rows[3].day), false, 'legacy pending shows unchecked');
  assert.equal(nextDispositionForToggle(true), 'unexcused');
  assert.equal(nextDispositionForToggle(false), 'excused');
  assert.equal(classNotMarked({ classSaved: null, published: false }), true);
  assert.equal(classNotMarked({ classSaved: null, published: true }), false, 'old camera data still shows');
  assert.equal(classNotMarked({ classSaved: { savedAt: 1 }, published: false }), false);
  assert.equal(notMarkedMessage('2026-10-21', '2026-10-21', (d) => d), 'Giám thị chưa điểm danh lớp này hôm nay.');
  assert.match(notMarkedMessage('2026-10-20', '2026-10-21', () => '20/10/2026'), /ngày 20\/10\/2026/);
});

test('GVCN tab has no import, no pending inbox, no bulk classify; legacy labels still render', () => {
  const detail = read('src/homeroom/HomeroomClassDetail.jsx');
  assert.doesNotMatch(detail, /nav\.import|canImportAttendance|Nhập điểm danh|ClassifyAbsenceModal|pendingAbsences|OtherPendingDays/);
  assert.match(detail, /Vắng không phép/);
  assert.match(detail, /splitAttendanceRows/);
  assert.match(detail, /setDisposition/);
  const labels = read('src/homeroom/homeroomLabels.js');
  for (const label of ['Có mặt', 'Vắng có phép', 'Vắng không phép', 'Đi trễ', 'Vắng chờ xử lý']) {
    assert.match(labels, new RegExp(label));
  }
});

test('Điểm danh page: 4 grade tabs, unsaved guard, sticky save, import preview + confirm', () => {
  const page = read('src/attendance/AttendancePage.jsx');
  assert.match(page, /GRADE_TABS\.map/);
  assert.match(page, /Lớp \{value\}/);
  assert.match(page, /Tải file mẫu/);
  assert.match(page, /Import Excel/);
  assert.match(page, /Xác nhận lưu/);
  assert.match(page, /window\.confirm\(UNSAVED_PROMPT\)/);
  assert.match(page, /beforeunload/);
  assert.match(page, /Lưu lớp \$\{klass\.name\}/);
  assert.match(page, /roster\?\.canChooseDate/);
  assert.match(page, /supervisorAttendance\.saveClass/);
  assert.match(page, /supervisorAttendance\.commit/);
  assert.doesNotMatch(page, /localStorage\.(get|set)Item/, 'storage goes through the try/catch helpers');
  const css = read('src/attendance/attendance.css');
  assert.match(css, /position: sticky/);
  assert.match(css, /@media \(max-width: 680px\)/);
  const shell = read('src/main.jsx');
  // Menu list lives next to the routes (src/navigationRoutes.js) since the "?" guide mapping.
  assert.match(read('src/navigationRoutes.js'), /\['homeroom', 'Lớp chủ nhiệm'\],\n  \['attendance', 'Điểm danh'\],/);
  assert.match(shell, /active === 'attendance' \? \(\n\s*<AttendancePage/);
});

test('Điểm danh error codes have Vietnamese messages', () => {
  for (const code of [
    'ATTENDANCE_DATE_TODAY_ONLY',
    'ATTENDANCE_STUDENT_NOT_IN_CLASS',
    'SUPERVISOR_IMPORT_HEADERS',
    'ATTENDANCE_CAMERA_IMPORT_RETIRED',
    'SUPERVISOR_REQUIRED',
  ]) {
    const message = messageFor(new Error(code));
    assert.doesNotMatch(message, /Không thể hoàn tất thao tác/, code);
    assert.doesNotMatch(message, new RegExp(code), code);
  }
});
