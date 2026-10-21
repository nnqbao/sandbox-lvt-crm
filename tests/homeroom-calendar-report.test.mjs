import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SCHOOL_DAY,
  DEFAULT_WEEKEND,
  isDefaultSchoolDay,
  resolveSchoolDay,
  weekdayOfYmd,
} from '../convex/homeroomAlerts.ts';
import { summarizeByStudent } from '../convex/homeroomReportPolicy.ts';
import { buildStudentTotalsMatrix, rawObservationLabel } from '../src/homeroom/homeroomExport.js';

const YEAR = { startDate: '2026-09-05', endDate: '2027-05-31' };

test('school calendar defaults to Monday–Friday and respects admin overrides', () => {
  assert.equal(weekdayOfYmd('2026-09-07'), 1);
  assert.equal(weekdayOfYmd('2026-09-12'), 6);
  assert.equal(weekdayOfYmd('2026-09-13'), 0);
  assert.equal(isDefaultSchoolDay('2026-09-07'), true);
  assert.equal(isDefaultSchoolDay('2026-09-12'), false);

  assert.deepEqual(resolveSchoolDay('2026-09-07', null, YEAR), {
    isSchoolDay: true,
    kind: DEFAULT_SCHOOL_DAY,
    outsideYear: false,
  });
  assert.deepEqual(resolveSchoolDay('2026-09-12', null, YEAR), {
    isSchoolDay: false,
    kind: DEFAULT_WEEKEND,
    outsideYear: false,
  });
  const holiday = resolveSchoolDay('2026-09-07', { kind: 'holiday', note: 'Nghỉ bù' }, YEAR);
  assert.equal(holiday.isSchoolDay, false);
  assert.equal(holiday.kind, 'holiday');
  assert.equal(holiday.note, 'Nghỉ bù');
  assert.equal(resolveSchoolDay('2026-09-12', { kind: 'extra_teaching' }, YEAR).isSchoolDay, true);
  assert.equal(resolveSchoolDay('2026-09-13', { kind: 'working' }, YEAR).isSchoolDay, true);

  const before = resolveSchoolDay('2026-09-04', null, YEAR);
  assert.equal(before.outsideYear, true);
  assert.equal(before.isSchoolDay, false);
  assert.equal(resolveSchoolDay('2027-06-01', { kind: 'extra_teaching' }, YEAR).isSchoolDay, false);
  assert.equal(resolveSchoolDay('2026-09-04', null, null).outsideYear, false);
});

test('per-student totals rank most absences first and compute the rate over rated days only', () => {
  const rows = summarizeByStudent([
    { classId: 'c1', studentId: 's1', studentCode: 'HS001', fullName: 'An', attendanceDate: '2026-09-07', effectiveStatus: 'present' },
    { classId: 'c1', studentId: 's1', studentCode: 'HS001', fullName: 'An', attendanceDate: '2026-09-08', effectiveStatus: 'late' },
    { classId: 'c1', studentId: 's1', studentCode: 'HS001', fullName: 'An', attendanceDate: '2026-09-09', effectiveStatus: 'no_data' },
    { classId: 'c1', studentId: 's2', studentCode: 'HS002', fullName: 'Bình', attendanceDate: '2026-09-07', effectiveStatus: 'absent_unexcused' },
    { classId: 'c1', studentId: 's2', studentCode: 'HS002', fullName: 'Bình', attendanceDate: '2026-09-08', effectiveStatus: 'absent_pending' },
    { classId: 'c1', studentId: 's2', studentCode: 'HS002', fullName: 'Bình', attendanceDate: '2026-09-09', effectiveStatus: 'present' },
    { classId: 'c1', studentId: 's2', studentCode: 'HS002', fullName: 'Bình', attendanceDate: '2026-09-10', effectiveStatus: 'exempt' },
  ]);
  assert.deepEqual(rows.map((row) => row.studentCode), ['HS002', 'HS001']);
  const binh = rows[0];
  assert.equal(binh.absent_unexcused, 1);
  assert.equal(binh.absent_pending, 1);
  assert.equal(binh.exempt, 1);
  assert.equal(binh.ratedRows, 3);
  assert.ok(Math.abs(binh.attendanceRate - 1 / 3) < 1e-9);
  const an = rows[1];
  assert.equal(an.ratedRows, 2);
  assert.equal(an.no_data, 1);
  assert.equal(an.attendanceRate, 1);

  const matrix = buildStudentTotalsMatrix({ studentTotals: rows });
  assert.deepEqual(matrix[0], ['Mã HS', 'Học sinh', 'Có mặt', 'Đi trễ', 'Vắng có phép', 'Vắng không phép', 'Vắng chờ xử lý', 'Tổng vắng', 'Chuyên cần']);
  assert.deepEqual(matrix[1], ['HS002', 'Bình', 1, 0, 0, 1, 1, 2, '33.3%']);
  assert.deepEqual(matrix[2], ['HS001', 'An', 1, 1, 0, 0, 0, 0, '100.0%']);
  assert.equal(buildStudentTotalsMatrix({}).length, 1);
});

test('observation labels are Vietnamese in exports (Đi trễ kept for old camera data)', () => {
  assert.equal(rawObservationLabel('present'), 'Có mặt');
  assert.equal(rawObservationLabel('late'), 'Đi trễ');
  assert.equal(rawObservationLabel('absent'), 'Vắng');
  assert.equal(rawObservationLabel('unknown'), 'Không rõ');
  assert.equal(rawObservationLabel(''), '');
});
