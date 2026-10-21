// Lớp chủ nhiệm (homeroom): classes, rosters, class attendance, reports, roster import.
// ALL STUDENTS ARE FICTIONAL ("Học sinh Mẫu"-style generic names, codes HSM…).
import { DAY, T0, USERS } from './personas.js';

const YEAR_ID = 'sy_2627';
const TODAY = '2026-10-21';
const nameOf = (id) => USERS.find((u) => u._id === id)?.name || '';

// ---------------------------------------------------------------- classes
const CLASS_DEFS = [
  { _id: 'c_6a1', code: '6A1', gradeLevel: 6, teacher: 'u_t7', roster: 35 },
  { _id: 'c_6a2', code: '6A2', gradeLevel: 6, teacher: 'u_t8', roster: 34 },
  { _id: 'c_7a1', code: '7A1', gradeLevel: 7, teacher: null, roster: 33 },
  { _id: 'c_7a2', code: '7A2', gradeLevel: 7, teacher: 'u_gvcn', roster: 32 },
  { _id: 'c_8a1', code: '8A1', gradeLevel: 8, teacher: 'u_leader', roster: 36 },
  { _id: 'c_9a1', code: '9A1', gradeLevel: 9, teacher: 'u_t6', roster: 31 },
];

const classDoc = (def) => ({
  _id: def._id,
  _creationTime: T0 - 50 * DAY,
  schoolYearId: YEAR_ID,
  code: def.code,
  name: `Lớp ${def.code}`,
  gradeLevel: def.gradeLevel,
  status: 'active',
  notes: def._id === 'c_7a2' ? 'Phòng học tầng 2, dãy B' : undefined,
  createdAt: T0 - 50 * DAY,
  updatedAt: T0 - 50 * DAY,
});

const assignmentFor = (def) =>
  def.teacher
    ? {
        _id: `as_${def._id}`,
        _creationTime: T0 - 47 * DAY,
        schoolYearId: YEAR_ID,
        classId: def._id,
        userId: def.teacher,
        assignmentType: 'homeroom_teacher',
        scopeKind: 'class',
        effectiveFrom: '2026-09-05',
        active: true,
        user: { _id: def.teacher, name: nameOf(def.teacher), status: 'active' },
      }
    : null;

// ---------------------------------------------------------------- students of 7A2
const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương', 'Lý'];
const GIVEN = [
  ['Minh An', 'male'], ['Gia Bảo', 'male'], ['Ngọc Châu', 'female'], ['Thành Đạt', 'male'],
  ['Thu Hà', 'female'], ['Quốc Huy', 'male'], ['Khánh Linh', 'female'], ['Đức Minh', 'male'],
  ['Bảo Ngọc', 'female'], ['Hoàng Phúc', 'male'], ['Minh Quân', 'male'], ['Thảo Vy', 'female'],
  ['Anh Thư', 'female'], ['Tuấn Kiệt', 'male'], ['Hải Yến', 'female'], ['Nhật Nam', 'male'],
  ['Mai Anh', 'female'], ['Trọng Nhân', 'male'], ['Phương Uyên', 'female'], ['Văn Khoa', 'male'],
  ['Thùy Dung', 'female'], ['Đức Thịnh', 'male'], ['Lan Chi', 'female'], ['Hữu Phát', 'male'],
  ['Yến Nhi', 'female'], ['Gia Huy', 'male'], ['Minh Thư', 'female'], ['Công Danh', 'male'],
  ['Kim Ngân', 'female'], ['Quang Vinh', 'male'], ['Tường Vi', 'female'], ['Bảo Long', 'male'],
];

const STUDENTS = GIVEN.map(([given, gender], index) => {
  const n = index + 1;
  const month = ((index * 5) % 12) + 1;
  const day = ((index * 7) % 27) + 1;
  return {
    _id: `st_${String(n).padStart(2, '0')}`,
    studentCode: `HSM07${String(n).padStart(2, '0')}`,
    fullName: `${FAMILY[index % FAMILY.length]} ${given}`,
    dateOfBirth: `2013-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    gender,
    rosterNumber: n,
    status: 'active',
  };
});

const fakePhone = (n) => `0900 000 ${String(100 + n).padStart(3, '0')}`;
const guardiansOf = (student, n) => [
  {
    _id: `g_${student._id}_m`,
    fullName: `Phụ huynh Mẫu ${String(n).padStart(2, '0')}`,
    relationship: n % 3 === 0 ? 'father' : 'mother',
    phone: fakePhone(n),
    isPrimaryContact: true,
    notes: n === 3 ? 'Gọi sau 17 giờ' : undefined,
  },
];

const FOCUS = STUDENTS[2]; // Lê Ngọc Châu — student detail example

// ---------------------------------------------------------------- daily attendance of 7A2
// Today: Giám thị saved at 07:42 with 3 absentees. #12 already marked "không phép" by GVCN.
function absenteesOn(date) {
  if (date === TODAY) {
    return {
      st_03: { disposition: 'excused', note: 'Mẹ báo bị sốt' },
      st_12: { disposition: 'unexcused', note: '' },
      st_23: { disposition: 'excused', note: '' },
    };
  }
  const seed = Number(date.slice(-2));
  const pick = STUDENTS[(seed * 7) % STUDENTS.length]._id;
  return { [pick]: { disposition: seed % 4 === 0 ? 'unexcused' : 'excused', note: '' } };
}

const isWeekend = (ymd) => [0, 6].includes(new Date(`${ymd}T00:00:00Z`).getUTCDay());
const schoolDayOf = (ymd) =>
  isWeekend(ymd)
    ? { isSchoolDay: false, kind: 'default_weekend', outsideYear: false }
    : { isSchoolDay: true, kind: 'default_school_day', outsideYear: false };

function dailyRows(date) {
  const marked = !isWeekend(date) && date <= TODAY;
  const absent = marked ? absenteesOn(date) : {};
  return STUDENTS.map((s) => {
    const a = absent[s._id];
    return {
      enrollment: { _id: `en_${s._id}`, rosterNumber: s.rosterNumber },
      student: { _id: s._id, studentCode: s.studentCode, fullName: s.fullName },
      day: marked
        ? {
            _id: `day_${s._id}_${date}`,
            rawObservation: a ? 'absent' : 'present',
            disposition: a ? a.disposition : 'none',
            effectiveStatus: a ? `absent_${a.disposition}` : 'present',
            note: a?.note || undefined,
          }
        : null,
    };
  });
}

function listDailyClass(args, { persona }) {
  const date = args.attendanceDate || TODAY;
  const rows = dailyRows(date);
  const marked = rows.some((r) => r.day);
  const canCorrect = persona.role !== 'user' || persona._id === 'u_gvcn';
  return {
    date,
    rows,
    published: marked,
    classSaved: marked
      ? {
          savedAt: Date.parse(`${date}T07:42:00+07:00`),
          savedByName: 'Phạm Văn C',
          source: 'manual',
          absentCount: rows.filter((r) => r.day?.rawObservation === 'absent').length,
        }
      : null,
    archived: false,
    canCorrect,
    schoolDay: schoolDayOf(date),
  };
}

// ---------------------------------------------------------------- reports
function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function attendanceSummary(args) {
  const from = args.from > '2026-09-05' ? args.from : '2026-09-05';
  const to = args.to < TODAY ? args.to : TODAY;
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isWeekend(d)) continue;
    for (const row of dailyRows(d)) {
      days.push({
        classId: 'c_7a2',
        studentId: row.student._id,
        studentCode: row.student.studentCode,
        fullName: row.student.fullName,
        attendanceDate: d,
        effectiveStatus: row.day.effectiveStatus,
      });
    }
  }
  // A couple of repeat offenders so the "≥ 3 buổi không phép" highlight shows.
  for (const [id, dates] of [['st_12', ['2026-10-05', '2026-10-13', '2026-10-19']], ['st_26', ['2026-10-07']]]) {
    for (const d of dates) {
      const row = days.find((x) => x.studentId === id && x.attendanceDate === d);
      if (row) row.effectiveStatus = 'absent_unexcused';
    }
  }
  const counts = { present: 0, late: 0, absent_excused: 0, absent_unexcused: 0, absent_pending: 0, no_data: 0, exempt: 0 };
  for (const d of days) counts[d.effectiveStatus] += 1;
  const byStudent = new Map();
  for (const d of days) {
    const e = byStudent.get(d.studentId) || {
      studentId: d.studentId, studentCode: d.studentCode, fullName: d.fullName,
      present: 0, late: 0, absent_excused: 0, absent_unexcused: 0, absent_pending: 0, no_data: 0, exempt: 0,
    };
    e[d.effectiveStatus] += 1;
    byStudent.set(d.studentId, e);
  }
  const abs = (r) => r.absent_excused + r.absent_unexcused + r.absent_pending;
  const studentTotals = [...byStudent.values()]
    .map((e) => {
      const rated = e.present + e.late + abs(e);
      return { ...e, ratedRows: rated, attendanceRate: rated ? (e.present + e.late) / rated : 0 };
    })
    .sort((a, b) => abs(b) - abs(a) || a.fullName.localeCompare(b.fullName, 'vi'));
  const rated = days.length;
  return {
    summary: {
      counts,
      totalRows: days.length,
      ratedRows: rated,
      absenceRows: days.length - counts.present,
      attendanceRate: rated ? counts.present / rated : 0,
      days,
    },
    studentTotals,
    exportPayload: { className: 'Lớp 7A2', schoolYearName: '2026-2027', from: args.from, to: args.to, rows: [] },
  };
}

// ---------------------------------------------------------------- overview
function overview(args, { persona }) {
  const date = args.date || TODAY;
  const school = persona.role !== 'user' || persona.permissionGroupId === 'grp_bgh';
  const defs = school ? CLASS_DEFS : CLASS_DEFS.filter((d) => d.teacher === persona._id);
  const classes = defs.map((def) => {
    const counts = { present: 0, late: 0, absent_excused: 0, absent_unexcused: 0, absent_pending: 0, no_data: 0, exempt: 0 };
    let published = !isWeekend(date);
    if (def._id === 'c_7a2') {
      for (const r of dailyRows(date)) if (r.day) counts[r.day.effectiveStatus] += 1;
      published = dailyRows(date).some((r) => r.day);
    } else if (def._id === 'c_9a1' && date === TODAY) {
      published = false;
    } else if (published) {
      counts.present = def.roster - 1;
      counts.absent_excused = 1;
    }
    return {
      _id: def._id,
      code: def.code,
      name: `Lớp ${def.code}`,
      gradeLevel: def.gradeLevel,
      status: 'active',
      rosterCount: def.roster,
      teacherName: def.teacher ? nameOf(def.teacher) : '',
      published,
      saved: published,
      counts,
      pendingTotal: 0,
      canCorrect: !school || persona.role !== 'user',
    };
  });
  const counts = { present: 0, late: 0, absent_excused: 0, absent_unexcused: 0, absent_pending: 0, no_data: 0, exempt: 0 };
  for (const c of classes) for (const k of Object.keys(counts)) counts[k] += c.counts[k];
  const rated = Object.values(counts).reduce((a, b) => a + b, 0);
  const missing = classes.filter((c) => !c.saved);
  return {
    date,
    today: TODAY,
    mode: school ? 'school' : 'teacher',
    schoolYear: { _id: YEAR_ID, name: '2026-2027', startDate: '2026-09-05', endDate: '2027-05-31', cutoffTime: '08:30' },
    schoolDay: schoolDayOf(date),
    classes,
    studentCount: classes.reduce((s, c) => s + c.rosterCount, 0),
    summary: { counts, attendanceRate: rated ? (counts.present + counts.late) / rated : 0, ratedRows: rated, totalRows: rated },
    missingUpload: {
      shouldAlert: date === TODAY && missing.length > 0,
      cutoffTime: '08:30',
      missingClasses: missing.map((c) => ({ classId: c._id, code: c.code, name: c.name })),
    },
    pendingTotal: 0,
    permissions: { isManager: persona.role !== 'user', canMarkAttendance: persona.role !== 'user', canCorrectAny: true },
  };
}

// ---------------------------------------------------------------- class detail / roster / student
function classScoped(args, { persona }) {
  const def = CLASS_DEFS.find((d) => d._id === args.classId) || CLASS_DEFS[3];
  const manager = persona.role !== 'user';
  const mine = def.teacher === persona._id;
  const assignment = assignmentFor(def);
  const history =
    def._id === 'c_7a2'
      ? [
          {
            _id: 'as_c_7a2_old',
            schoolYearId: YEAR_ID,
            classId: def._id,
            userId: 'u_t7',
            assignmentType: 'homeroom_teacher',
            scopeKind: 'class',
            effectiveFrom: '2026-09-01',
            effectiveTo: '2026-09-04',
            active: true,
            user: { _id: 'u_t7', name: nameOf('u_t7'), status: 'active' },
          },
        ]
      : [];
  return {
    class: classDoc(def),
    schoolYear: { _id: YEAR_ID, name: '2026-2027' },
    assignments: [...(assignment ? [assignment] : []), ...history],
    currentTeacherName: def.teacher ? nameOf(def.teacher) : '',
    rosterCount: def._id === 'c_7a2' ? STUDENTS.length : def.roster,
    permissions: {
      canManage: manager,
      canImportAttendance: manager,
      canCorrect: manager || mine,
      canEditContacts: manager || mine,
    },
  };
}

function listByClass(args, { persona }) {
  const def = CLASS_DEFS.find((d) => d._id === args.classId);
  const showContacts = persona.role !== 'user' || def?.teacher === persona._id;
  return {
    showContacts,
    rows: STUDENTS.map((s, i) => ({
      enrollment: { _id: `en_${s._id}`, rosterNumber: s.rosterNumber, startDate: '2026-09-05' },
      student: { _id: s._id, studentCode: s.studentCode, fullName: s.fullName, dateOfBirth: s.dateOfBirth, gender: s.gender },
      guardians: showContacts ? guardiansOf(s, i + 1) : [],
    })),
  };
}

function studentScoped(args) {
  const index = Math.max(0, STUDENTS.findIndex((s) => s._id === args.studentId));
  const s = STUDENTS[index];
  return {
    student: { ...s },
    enrollments: [
      {
        _id: `en_${s._id}`,
        classId: 'c_7a2',
        classCode: '7A2',
        className: 'Lớp 7A2',
        startDate: '2026-09-05',
        status: 'active',
        rosterNumber: s.rosterNumber,
        current: true,
      },
    ],
    guardians: [
      ...guardiansOf(s, index + 1),
      { _id: `g_${s._id}_f`, fullName: 'Phụ huynh Mẫu (Cha)', relationship: 'father', phone: fakePhone(index + 51), isPrimaryContact: false },
    ],
    showContacts: true,
    permissions: { canManage: false, canEditContacts: true },
  };
}

function studentHistory(args) {
  const id = args.studentId || FOCUS._id;
  const days = [];
  for (let d = '2026-09-28'; d <= TODAY; d = addDays(d, 1)) {
    if (isWeekend(d)) continue;
    const row = dailyRows(d).find((r) => r.student._id === id);
    if (row?.day) days.push({ ...row.day, _id: row.day._id, classId: 'c_7a2', studentId: id, attendanceDate: d });
  }
  if (id === FOCUS._id) {
    const extra = days.find((d) => d.attendanceDate === '2026-10-08');
    if (extra) Object.assign(extra, { rawObservation: 'absent', disposition: 'unexcused', effectiveStatus: 'absent_unexcused', note: 'Không có phụ huynh báo' });
  }
  const corrections = days
    .filter((d) => d.disposition === 'unexcused')
    .map((d) => ({
      _id: `cor_${d._id}`,
      studentId: id,
      attendanceDate: d.attendanceDate,
      attendanceDayId: d._id,
      previousEffectiveStatus: 'absent_excused',
      nextEffectiveStatus: 'absent_unexcused',
      note: d.note,
      at: Date.parse(`${d.attendanceDate}T10:15:00+07:00`),
    }));
  return { days, corrections };
}

// ---------------------------------------------------------------- catalog (admin / mod)
function listCatalog() {
  return CLASS_DEFS.map((def) => ({
    ...classDoc(def),
    rosterCount: def.roster,
    currentHomeroomTeacher: assignmentFor(def),
    upcomingHomeroomTeacher: null,
  }));
}

const CANDIDATES = USERS.filter((u) => u.status === 'active')
  .map((u) => ({ _id: u._id, name: u.name, role: u.role }))
  .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

// ---------------------------------------------------------------- roster import (all-or-nothing errors)
const IMPORT_BLOCKED = {
  ok: false,
  preview: [],
  issues: [],
  blockers: [
    { rowNumber: 5, field: 'studentCode', column: 'ma_hoc_sinh', rejectedValue: 'HSM0603', code: 'STUDENT_CODE_DUPLICATE_FILE', message: 'Mã học sinh bị trùng trong file. Mỗi mã chỉ được xuất hiện một lần.', severity: 'error' },
    { rowNumber: 9, field: 'dateOfBirth', column: 'ngay_sinh', rejectedValue: '31/02/2014', code: 'INVALID_DATE_OF_BIRTH', message: 'Ngày sinh không hợp lệ. Dùng YYYY-MM-DD hoặc dd/mm/yyyy.', severity: 'error' },
    { rowNumber: 14, field: 'fullName', column: 'ho_ten', rejectedValue: null, code: 'FULL_NAME_REQUIRED', message: 'Họ tên học sinh bắt buộc.', severity: 'error' },
  ],
};

export const queries = {
  'homeroomReports:overview': overview,
  'homeroomReports:attendanceSummary': attendanceSummary,
  'homeroomClasses:getScoped': classScoped,
  'homeroomClasses:listCatalog': listCatalog,
  'homeroomClasses:listAssignmentCandidates': () => CANDIDATES,
  'students:listByClass': listByClass,
  'students:getScoped': studentScoped,
  'studentAttendance:listDailyClass': listDailyClass,
  'studentAttendance:getStudentHistory': studentHistory,
};

export const mutations = {
  'studentRosterImport:generateUploadUrl': 'https://guide-upload.invalid/upload',
  'studentRosterImport:registerUpload': { uploadId: 'up_demo' },
  'studentRosterImport:validateUpload': (_args, { state }) =>
    state.importOk
      ? {
          ok: true,
          issues: [],
          blockers: [],
          preview: Array.from({ length: 34 }, (_, i) => ({ rowNumber: i + 2 })),
        }
      : IMPORT_BLOCKED,
};
