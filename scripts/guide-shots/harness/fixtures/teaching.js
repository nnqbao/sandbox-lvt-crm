// Lớp học (Lớp giảng dạy, Lịch dạy, Sổ đầu bài, Học bạ) + Thiết lập giáo viên / lịch dạy /
// môn học / loại kiểm tra. ALL DATA IS FICTIONAL (people from personas.js, "Học sinh Mẫu NN").
import { summarizeGrades } from '../../../../convex/teachingPolicy.ts';
import { DEPARTMENTS, USERS } from './personas.js';
import { STUDENTS } from './homeroom.js';

const YEAR = {
  _id: 'sy_2627',
  name: '2026-2027',
  startDate: '2026-09-05',
  endDate: '2027-05-31',
  semester2StartDate: '2027-01-11',
  locked: false,
};
const TODAY = '2026-10-21'; // Thứ Tư; frozen clock 09:00
const HOLIDAYS = ['2026-11-20', '2027-01-01', '2027-02-15', '2027-02-16', '2027-02-17', '2027-02-18', '2027-02-19'];

const CLASSES = [
  { _id: 'c_6a1', name: 'Lớp 6/1', gradeLevel: 6 },
  { _id: 'c_6a2', name: 'Lớp 6/2', gradeLevel: 6 },
  { _id: 'c_7a1', name: 'Lớp 7/1', gradeLevel: 7 },
  { _id: 'c_7a2', name: 'Lớp 7/2', gradeLevel: 7 },
  { _id: 'c_8a1', name: 'Lớp 8/1', gradeLevel: 8 },
  { _id: 'c_9a1', name: 'Lớp 9/1', gradeLevel: 9 },
];
const className = (id) => CLASSES.find((row) => row._id === id)?.name || '';
const nameOf = (id) => USERS.find((u) => u._id === id)?.name || '';

const SUBJECTS = [
  ['sub_toan', 'Toán', 'TOAN'],
  ['sub_van', 'Ngữ văn', 'NGU_VAN'],
  ['sub_anh', 'Tiếng Anh', 'TIENG_ANH'],
  ['sub_khtn', 'Khoa học tự nhiên', 'KHTN'],
  ['sub_lsdl', 'Lịch sử và Địa lí', 'LS_DL'],
  ['sub_gdcd', 'Giáo dục công dân', 'GDCD'],
  ['sub_tin', 'Tin học', 'TIN_HOC'],
  ['sub_cn', 'Công nghệ', 'CONG_NGHE'],
  ['sub_gdtc', 'Giáo dục thể chất', 'GDTC'],
  ['sub_nt', 'Nghệ thuật', 'NGHE_THUAT'],
  ['sub_hdtn', 'Hoạt động trải nghiệm, hướng nghiệp', 'HDTN'],
  ['sub_gddp', 'Nội dung giáo dục địa phương', 'GDDP'],
].map(([_id, name, code]) => ({ _id, name, code, active: true }));
const subjectName = (id) => SUBJECTS.find((row) => row._id === id)?.name || '';

const TEST_TYPES = [
  ['tt_mieng', 'Miệng', 1],
  ['tt_15p', '15 phút', 1],
  ['tt_th', 'Thực hành', 1],
  ['tt_1t', '1 tiết', 2],
  ['tt_gk', 'Giữa kỳ', 2],
  ['tt_ck', 'Cuối kỳ', 3],
].map(([_id, name, coefficient]) => ({ _id, name, coefficient, active: true }));

/** Môn giảng dạy, Lớp giảng dạy, Lớp chủ nhiệm of each fictional teacher. */
const TEACHERS = {
  u_gvcn: { subjects: ['sub_van'], teaching: ['c_6a1', 'c_7a2', 'c_8a1'], homeroom: ['c_7a2'] },
  u_teacher: { subjects: ['sub_toan'], teaching: ['c_7a1', 'c_7a2'], homeroom: [] },
  u_leader: { subjects: ['sub_toan', 'sub_tin'], teaching: ['c_7a2', 'c_8a1'], homeroom: ['c_8a1'] },
  u_t5: { subjects: ['sub_toan'], teaching: ['c_6a1', 'c_6a2'], homeroom: [] },
  u_t6: { subjects: ['sub_van'], teaching: [], homeroom: ['c_9a1'] },
  u_t7: { subjects: ['sub_anh'], teaching: ['c_6a1', 'c_7a2'], homeroom: ['c_6a1'] },
  u_t8: { subjects: ['sub_anh'], teaching: ['c_6a2'], homeroom: ['c_6a2'] },
  u_pht: { subjects: ['sub_gdcd'], teaching: [], homeroom: [], inherited: true },
};

let slotSeq = 0;
const slot = (teacherId, classId, subjectId, weekday, session, period) => ({
  _id: `ts_${(slotSeq += 1)}`,
  classId,
  teacherId,
  subjectId,
  weekday,
  session,
  period,
  effectiveFrom: '2026-09-07',
});
const M = 'morning';
const A = 'afternoon';
const SLOTS = [
  // Trần Thị B — Ngữ văn
  slot('u_gvcn', 'c_7a2', 'sub_van', 1, M, 1), slot('u_gvcn', 'c_7a2', 'sub_van', 1, M, 2),
  slot('u_gvcn', 'c_7a2', 'sub_van', 3, M, 1), slot('u_gvcn', 'c_7a2', 'sub_van', 5, M, 4),
  slot('u_gvcn', 'c_6a1', 'sub_van', 2, M, 3), slot('u_gvcn', 'c_6a1', 'sub_van', 3, M, 3),
  slot('u_gvcn', 'c_6a1', 'sub_van', 4, A, 1), slot('u_gvcn', 'c_8a1', 'sub_van', 1, A, 2),
  slot('u_gvcn', 'c_8a1', 'sub_van', 4, M, 2), slot('u_gvcn', 'c_8a1', 'sub_van', 3, A, 2),
  // Nguyễn Văn A — Toán
  slot('u_teacher', 'c_7a2', 'sub_toan', 1, M, 3), slot('u_teacher', 'c_7a2', 'sub_toan', 2, M, 1),
  slot('u_teacher', 'c_7a2', 'sub_toan', 2, M, 2), slot('u_teacher', 'c_7a2', 'sub_toan', 3, M, 2),
  slot('u_teacher', 'c_7a2', 'sub_toan', 4, M, 4), slot('u_teacher', 'c_7a1', 'sub_toan', 1, M, 1),
  // Lê Thị D — Toán + Tin học
  slot('u_leader', 'c_7a2', 'sub_tin', 3, A, 1), slot('u_leader', 'c_8a1', 'sub_toan', 1, M, 1),
  slot('u_leader', 'c_8a1', 'sub_toan', 2, M, 3),
  // Lý Thị N — Tiếng Anh
  slot('u_t7', 'c_7a2', 'sub_anh', 2, M, 4), slot('u_t7', 'c_7a2', 'sub_anh', 4, M, 1),
  slot('u_t7', 'c_7a2', 'sub_anh', 5, M, 1), slot('u_t7', 'c_6a1', 'sub_anh', 1, M, 1),
  // Ngô Thị L — Toán
  slot('u_t5', 'c_6a1', 'sub_toan', 1, M, 2), slot('u_t5', 'c_6a2', 'sub_toan', 2, M, 1),
];

const publicClass = (id) => ({ _id: id, name: className(id), gradeLevel: CLASSES.find((c) => c._id === id)?.gradeLevel || 0 });
const teacherInfo = (id) => TEACHERS[id] || { subjects: [], teaching: [], homeroom: [] };

// ---------------------------------------------------------------- Thiết lập giáo viên
function listForYear() {
  const homeroomOf = (classId) => Object.entries(TEACHERS).find(([, info]) => info.homeroom.includes(classId))?.[0] || '';
  return {
    year: YEAR,
    departments: DEPARTMENTS.map((row) => ({ _id: row._id, name: row.name })),
    classes: CLASSES.map((row) => ({ ...row, homeroomTeacherId: homeroomOf(row._id), homeroomTeacherName: nameOf(homeroomOf(row._id)) })),
    teachers: USERS.filter((u) => u.role === 'user')
      .map((u) => {
        const info = teacherInfo(u._id);
        return {
          _id: u._id,
          name: u.name,
          departmentId: u.departmentId || '',
          subjectIds: info.subjects,
          subjectsInherited: Boolean(info.inherited),
          teachingClasses: info.teaching.map(publicClass),
          homeroomClasses: info.homeroom.map(publicClass),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
  };
}

function schedule(args, { persona }) {
  const teacherId = args.teacherId || persona._id;
  const slots = SLOTS.filter((row) => row.teacherId === teacherId);
  const info = teacherInfo(teacherId);
  return {
    year: YEAR,
    teacher: { _id: teacherId, name: nameOf(teacherId) },
    holidays: HOLIDAYS,
    slots,
    currentSlotCount: slots.length,
    teachingClassIds: info.teaching,
    classes: [...new Set([...slots.map((row) => row.classId), ...info.teaching])].map(publicClass),
  };
}

function classTimetable(args) {
  const classId = args.classId || 'c_7a2';
  return {
    class: { ...publicClass(classId), status: 'active' },
    year: YEAR,
    today: TODAY,
    holidays: HOLIDAYS,
    slots: SLOTS.filter((row) => row.classId === classId).map((row) => ({ ...row, teacherName: nameOf(row.teacherId) })),
    busy: SLOTS.filter((row) => row.classId !== classId),
    classNames: Object.fromEntries(CLASSES.map((row) => [row._id, row.name])),
    teachers: Object.entries(TEACHERS)
      .filter(([, info]) => info.teaching.includes(classId) && info.subjects.length)
      .map(([id, info]) => ({ _id: id, name: nameOf(id), departmentId: '', subjectIds: info.subjects }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    subjects: SUBJECTS,
  };
}

// ---------------------------------------------------------------- Lớp giảng dạy / Sổ đầu bài
function myTeaching(_args, { persona }) {
  const slots = SLOTS.filter((row) => row.teacherId === persona._id);
  const used = [...new Set(slots.map((row) => row.classId))];
  return {
    year: YEAR,
    today: TODAY,
    holidays: HOLIDAYS,
    slots,
    classes: used.map((id) => ({ ...publicClass(id), status: 'active' })),
    // Tiết 1 sáng nay ở 7/2 đã ghi sổ; tiết 3 ở 6/1 đang dạy.
    todayLogs: persona._id === 'u_gvcn'
      ? [{ _id: 'll_today', classId: 'c_7a2', date: TODAY, session: M, period: 1, rating: 5, comment: 'Lớp chuẩn bị bài tốt.' }]
      : [],
  };
}

const LOGS_7A2 = [
  ['2026-10-21', M, 1, 'u_gvcn', 'sub_van', 5, 'Lớp chuẩn bị bài tốt, nhiều em xung phong phát biểu.', '07:48'],
  ['2026-10-20', M, 1, 'u_teacher', 'sub_toan', 4, 'Lớp hiểu bài, còn vài em chưa làm bài tập về nhà.', '07:46'],
  ['2026-10-20', M, 2, 'u_teacher', 'sub_toan', 4, 'Làm bài kiểm tra 15 phút nghiêm túc.', '08:36'],
  ['2026-10-20', M, 4, 'u_t7', 'sub_anh', 3, 'Cuối lớp còn ồn, cần nhắc nhở nhóm bàn cuối.', '10:27'],
  ['2026-10-19', M, 1, 'u_gvcn', 'sub_van', 5, 'Tiết học sôi nổi.', '07:47'],
  ['2026-10-19', M, 3, 'u_teacher', 'sub_toan', 2, 'Nhiều em mất trật tự, chưa chép bài đầy đủ.', '09:37'],
];
function listForClass() {
  return LOGS_7A2.map(([date, session, period, teacherId, subjectId, rating, comment, time], index) => ({
    _id: `ll_${index}`,
    date,
    session,
    period,
    teacherName: nameOf(teacherId),
    subjectName: subjectName(subjectId),
    rating,
    comment,
    createdAt: Date.parse(`${date}T${time}:00+07:00`),
    updatedAt: Date.parse(`${date}T${time}:00+07:00`),
  }));
}

// ---------------------------------------------------------------- Học bạ
function myClasses(_args, { persona }) {
  const info = teacherInfo(persona._id);
  const ids = [...new Set([...info.teaching, ...info.homeroom])];
  return {
    year: YEAR,
    classes: CLASSES.filter((row) => ids.includes(row._id)).map((row) => ({
      ...row,
      rosterCount: row._id === 'c_7a2' ? STUDENTS.length : 34,
      isHomeroom: info.homeroom.includes(row._id),
      subjectIds: info.teaching.includes(row._id) ? info.subjects : [],
    })),
  };
}

function classStudents(args) {
  return {
    class: publicClass(args.classId || 'c_7a2'),
    year: YEAR,
    students: STUDENTS.map((row) => ({
      _id: row._id,
      fullName: row.fullName,
      studentCode: row.studentCode,
      dateOfBirth: row.dateOfBirth,
      rosterNumber: row.rosterNumber,
    })),
  };
}

const PREV_YEAR = { _id: 'sy_2526', name: '2025-2026', startDate: '2025-09-05', endDate: '2026-05-31', semester2StartDate: '2026-01-12', locked: true };
const tt = (id) => TEST_TYPES.find((row) => row._id === id);
let entrySeq = 0;
const entry = (year, subjectId, semester, testTypeId, score, enteredBy, day) => ({
  _id: `ge_${(entrySeq += 1)}`,
  schoolYearId: year,
  subjectId,
  semester,
  testTypeId,
  testTypeName: tt(testTypeId).name,
  coefficient: tt(testTypeId).coefficient,
  score,
  createdAt: Date.parse(`${day}T10:00:00+07:00`),
  updatedAt: Date.parse(`${day}T10:00:00+07:00`),
  enteredByName: nameOf(enteredBy),
});
const ENTRIES = [
  entry('sy_2627', 'sub_van', 1, 'tt_mieng', 8, 'u_gvcn', '2026-09-16'),
  entry('sy_2627', 'sub_van', 1, 'tt_15p', 7.5, 'u_gvcn', '2026-09-25'),
  entry('sy_2627', 'sub_van', 1, 'tt_15p', 9, 'u_gvcn', '2026-10-07'),
  entry('sy_2627', 'sub_van', 1, 'tt_gk', 8, 'u_gvcn', '2026-10-19'),
  entry('sy_2627', 'sub_toan', 1, 'tt_mieng', 9, 'u_teacher', '2026-09-18'),
  entry('sy_2627', 'sub_toan', 1, 'tt_15p', 8.5, 'u_teacher', '2026-10-05'),
  entry('sy_2627', 'sub_toan', 1, 'tt_gk', 7, 'u_teacher', '2026-10-20'),
  entry('sy_2627', 'sub_anh', 1, 'tt_mieng', 6.5, 'u_t7', '2026-10-02'),
  entry('sy_2627', 'sub_tin', 1, 'tt_th', 9.5, 'u_leader', '2026-10-14'),
  // Năm lớp 6 (2025-2026)
  ...[['sub_van', 8.2, 8.6], ['sub_toan', 7.4, 8], ['sub_anh', 7, 7.6], ['sub_tin', 9, 9.2]].flatMap(([subjectId, hk1, hk2]) => [
    entry('sy_2526', subjectId, 1, 'tt_ck', hk1, 'u_t5', '2026-01-05'),
    entry('sy_2526', subjectId, 2, 'tt_ck', hk2, 'u_t5', '2026-05-15'),
  ]),
];

function studentRecord(args, { persona }) {
  const student = STUDENTS.find((row) => row._id === args.studentId) || STUDENTS[0];
  const selectedYearId = args.schoolYearId || 'sy_2627';
  const years = [
    { ...PREV_YEAR, classId: 'c_6x3', className: 'Lớp 6/3', gradeLevel: 6 },
    { ...YEAR, classId: 'c_7a2', className: 'Lớp 7/2', gradeLevel: 7 },
  ];
  const info = teacherInfo(persona._id);
  const fullView = persona.role !== 'user' || info.homeroom.includes('c_7a2');
  const visible = (row) => fullView || info.subjects.includes(row.subjectId);
  const own = ENTRIES.filter((row) => row.schoolYearId === selectedYearId && visible(row));
  const order = SUBJECTS.map((row) => row._id);
  const subjectIds = [...new Set(['sub_van', 'sub_toan', 'sub_anh', 'sub_tin', ...own.map((row) => row.subjectId)])]
    .filter((id) => fullView || info.subjects.includes(id))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const writable = selectedYearId === 'sy_2627' ? (persona.role !== 'user' ? SUBJECTS.map((row) => row._id) : info.subjects) : [];
  return {
    student: { _id: student._id, fullName: student.fullName, studentCode: student.studentCode, dateOfBirth: student.dateOfBirth },
    years,
    yearSummaries: years.map((year) => {
      const rows = ENTRIES.filter((row) => row.schoolYearId === year._id && visible(row));
      const summary = summarizeGrades(rows, [...new Set(rows.map((row) => row.subjectId))]);
      return { schoolYearId: year._id, semester1: summary.semester1, semester2: summary.semester2, year: summary.year };
    }),
    selectedYearId,
    selectedClassId: selectedYearId === 'sy_2627' ? 'c_7a2' : 'c_6x3',
    fullView,
    subjects: SUBJECTS,
    testTypes: TEST_TYPES,
    subjectIds,
    writableSubjectIds: writable,
    summary: summarizeGrades(own, subjectIds),
    entries: own.map((row) => ({ ...row, canEdit: writable.includes(row.subjectId) })),
  };
}

export const queries = {
  'teachingCatalog:catalog': () => ({ subjects: SUBJECTS, testTypes: TEST_TYPES }),
  'teachers:listForYear': listForYear,
  'teachers:schedule': schedule,
  'timetable:classTimetable': classTimetable,
  'lessonLogs:myTeaching': myTeaching,
  'lessonLogs:myLogsFor': () => [],
  'lessonLogs:listForClass': listForClass,
  'gradebook:myClasses': myClasses,
  'gradebook:classStudents': classStudents,
  'gradebook:studentRecord': studentRecord,
};

export const mutations = {
  'teachingCatalog:ensureDefaults': () => ({ created: 0 }),
};

