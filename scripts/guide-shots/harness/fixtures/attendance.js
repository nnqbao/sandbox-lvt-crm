// Điểm danh (Giám thị) + Thiết lập năm học: fictional classes and students only.
// Students are named "Học sinh Mẫu NN" on purpose so nobody mistakes them for real pupils.
import { DAY, T0 } from './personas.js';

const MIN = 60 * 1000;
const TODAY = '2026-10-21';

const CLASS_SIZES = {
  6: [36, 35, 37, 34, 36],
  7: [38, 36, 37, 35],
  8: [39, 37, 38, 36],
  9: [40, 38, 39, 37],
};

/** Saved markers for the morning (Giám thị đã lưu lúc …). Key = class name. */
const SAVED = {
  '6/1': { at: T0 - 85 * MIN, absent: [4, 17] },
  '6/2': { at: T0 - 78 * MIN, absent: [] },
  '7/1': { at: T0 - 70 * MIN, absent: [9] },
  '7/2': { at: T0 - 66 * MIN, absent: [3, 21, 30] },
  '8/1': { at: T0 - 60 * MIN, absent: [] },
};

const pad = (n) => String(n).padStart(2, '0');

function buildClasses() {
  const classes = [];
  for (const [grade, sizes] of Object.entries(CLASS_SIZES)) {
    sizes.forEach((size, index) => {
      const name = `${grade}/${index + 1}`;
      const classId = `cls_${grade}_${index + 1}`;
      const saved = SAVED[name];
      const absent = new Set(saved?.absent || []);
      classes.push({
        classId,
        code: `${grade}-${index + 1}`,
        name,
        gradeLevel: Number(grade),
        saved: saved
          ? {
              savedAt: saved.at,
              savedByName: 'Phạm Văn C',
              source: 'manual',
              presentCount: size - absent.size,
              absentCount: absent.size,
            }
          : null,
        students: Array.from({ length: size }, (_, i) => ({
          studentId: `${classId}_hs${pad(i + 1)}`,
          fullName: `Học sinh Mẫu ${pad(i + 1)}`,
          rosterNumber: i + 1,
          absent: absent.has(i + 1),
        })),
      });
    });
  }
  return classes;
}

const CLASSES = buildClasses();
const classById = (id) => CLASSES.find((row) => row.classId === id);

function roster(args, { state }) {
  const date = args?.date || TODAY;
  const classes = state.attendanceEmptyMorning
    ? CLASSES.map((row) => ({ ...row, saved: null, students: row.students.map((s) => ({ ...s, absent: false })) }))
    : CLASSES;
  return {
    date,
    today: TODAY,
    canChooseDate: Boolean(state.attendanceCanChooseDate),
    schoolYear: { _id: 'sy_2627', name: '2026-2027', startDate: '2026-09-05', endDate: '2027-05-31' },
    schoolDay: { isSchoolDay: true, kind: 'default_school_day', outsideYear: false },
    grades: [6, 7, 8, 9].map((gradeLevel) => ({ gradeLevel, classes: classes.filter((row) => row.gradeLevel === gradeLevel) })),
  };
}

const IMPORT_PREVIEW_OK = {
  ok: true,
  fileName: 'mau_diem_danh_20261021.xlsx',
  attendanceDate: TODAY,
  expiresAt: T0 + 60 * MIN,
  totalRows: 108,
  errors: [],
  errorsTruncated: false,
  classes: [
    { classId: 'cls_6_3', code: '6-3', name: '6/3', rosterCount: 37, absentCount: 2, presentCount: 35, absentNames: ['Học sinh Mẫu 05', 'Học sinh Mẫu 28'] },
    { classId: 'cls_6_4', code: '6-4', name: '6/4', rosterCount: 34, absentCount: 0, presentCount: 34, absentNames: [] },
    { classId: 'cls_6_5', code: '6-5', name: '6/5', rosterCount: 36, absentCount: 1, presentCount: 35, absentNames: ['Học sinh Mẫu 12'] },
  ],
};

const IMPORT_PREVIEW_ERRORS = {
  ok: false,
  fileName: 'mau_diem_danh_20261021.xlsx',
  attendanceDate: TODAY,
  expiresAt: T0 + 60 * MIN,
  totalRows: 108,
  errors: [
    { rowNumber: 9, code: 'INVALID_ABSENT_VALUE', message: 'Cột Vắng chỉ nhận “x” hoặc để trống (đang là “v”).' },
    { rowNumber: 41, code: 'STUDENT_NOT_FOUND', message: 'Không có học sinh “Học sinh Mẫu 99” trong lớp 6/4.' },
    { rowNumber: 75, code: 'CLASS_NOT_FOUND', message: 'Không tìm thấy lớp “6/9” trong năm học.' },
  ],
  errorsTruncated: false,
  classes: [],
};

/* ------------------------------ Năm học ------------------------------ */

const holidayRun = (from, to, note) => {
  const rows = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    rows.push({ date: d.toISOString().slice(0, 10), kind: 'holiday', note });
  }
  return rows;
};

const CALENDAR = {
  sy_2627: [
    ...holidayRun('2027-01-01', '2027-01-01', 'Nghỉ Tết Dương lịch'),
    ...holidayRun('2027-02-01', '2027-02-12', 'Nghỉ Tết Nguyên đán'),
    { date: '2027-02-20', kind: 'extra_teaching', note: 'Học bù sau Tết' },
    ...holidayRun('2027-04-16', '2027-04-16', 'Giỗ Tổ Hùng Vương'),
    ...holidayRun('2027-04-30', '2027-04-30', 'Nghỉ lễ 30/4 – 1/5'),
  ],
  sy_2526: [
    ...holidayRun('2026-01-01', '2026-01-02', 'Nghỉ Tết Dương lịch'),
    ...holidayRun('2026-02-09', '2026-02-20', 'Nghỉ Tết Nguyên đán'),
    ...holidayRun('2026-04-27', '2026-05-01', 'Nghỉ lễ 30/4 – 1/5'),
  ],
};

const YEAR_META = {
  sy_2627: { name: '2026-2027', startDate: '2026-09-05', endDate: '2027-05-31' },
  sy_2526: { name: '2025-2026', startDate: '2025-09-05', endDate: '2026-05-31' },
};

export const queries = {
  'supervisorAttendance:roster': roster,
  'supervisorAttendance:templateRows': (args) => ({
    date: args?.date || TODAY,
    schoolYearName: '2026-2027',
    rows: CLASSES.flatMap((klass) => klass.students.map((s) => ({ className: klass.name, studentName: s.fullName }))),
  }),
  'schoolYears:listCalendarDays': (args) => {
    const meta = YEAR_META[args?.schoolYearId];
    if (!meta) return null;
    return {
      schoolYear: { _id: args.schoolYearId, ...meta, attendanceUploadDueTime: '08:30' },
      days: (CALENDAR[args.schoolYearId] || []).map((row, i) => ({ _id: `cal_${args.schoolYearId}_${i}`, ...row })),
    };
  },
  'schoolYears:removalCheck': (args) =>
    args?.id === 'sy_2627'
      ? { blocker: 'SCHOOL_YEAR_DELETE_DEFAULT', calendarDays: 0 }
      : { blocker: 'SCHOOL_YEAR_DELETE_LOCKED', calendarDays: 0 },
};

export const mutations = {
  'supervisorAttendance:saveClass': (args) => {
    const klass = classById(args.classId);
    const total = klass?.students.length || 0;
    const absentCount = (args.absentStudentIds || []).length;
    return { classId: args.classId, savedAt: T0, presentCount: total - absentCount, absentCount, changedCount: total };
  },
  'supervisorAttendance:generateUploadUrl': () => 'https://guide-harness.invalid/upload',
  'supervisorAttendance:registerUpload': (args) => ({ uploadId: 'upl_guide_1', expiresAt: T0 + 60 * MIN, attendanceDate: args.date || TODAY }),
  'supervisorAttendance:validate': (_args, { state }) => (state.importErrors ? IMPORT_PREVIEW_ERRORS : IMPORT_PREVIEW_OK),
  'supervisorAttendance:commit': () => ({ classCount: 3, absentCount: 3, attendanceDate: TODAY }),
  'schoolYears:create': () => 'sy_2728',
};
