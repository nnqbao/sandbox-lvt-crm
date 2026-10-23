import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as server from '../convex/teachingPolicy.ts';
import * as client from '../src/lib/teachingSchedule.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const year = { startDate: '2026-09-05', endDate: '2027-05-31', semester2StartDate: '2027-01-12' };

const slot = (overrides = {}) => ({
  _id: overrides._id || 's1',
  classId: 'c1',
  teacherId: 't1',
  subjectId: 'math',
  weekday: 1,
  session: 'morning',
  period: 1,
  effectiveFrom: '2026-09-05',
  ...overrides,
});

test('seeded test types match the owner list and coefficients', () => {
  assert.deepEqual(
    server.DEFAULT_TEST_TYPES.map((row) => `${row.name}:${row.coefficient}`),
    ['Miệng:1', '15 phút:1', 'Thực hành:1', '1 tiết:2', 'Giữa kỳ:2', 'Cuối kỳ:3'],
  );
  for (const subject of server.DEFAULT_SUBJECTS) assert.match(subject.code, /^[A-Z0-9_-]{1,20}$/);
});

test('ĐTB môn học kỳ = (TĐĐGtx + 2×ĐĐGgk + 3×ĐĐGck)/(số ĐĐGtx + 5)', () => {
  // Ví dụ trong bài hướng dẫn: tx 8, 7, 9, 10 · gk 8 · ck 9 → (34 + 16 + 27)/9 = 8,56 → 8,6
  const entries = [8, 7, 9, 10].map((score) => ({ score, coefficient: 1 }))
    .concat([{ score: 8, coefficient: 2 }, { score: 9, coefficient: 3 }]);
  assert.equal(server.semesterAverage(entries), 8.6);
  assert.equal(server.semesterAverage([]), null);
  assert.equal(server.yearAverage(7, 8), 7.7); // (7 + 16)/3 = 7,67
  assert.equal(server.yearAverage(7, null), null);
  assert.equal(server.roundAverage(8.25), 8.3);
  assert.equal(server.overallAverage([8, null, 9]), 8.5);
});

test('summarizeGrades: per subject HK1/HK2/cả năm and overall', () => {
  const entries = [
    { subjectId: 'math', semester: 1, score: 8, coefficient: 1 },
    { subjectId: 'math', semester: 2, score: 9, coefficient: 3 },
    { subjectId: 'lit', semester: 1, score: 6, coefficient: 2 },
  ];
  const summary = server.summarizeGrades(entries, ['math', 'lit']);
  assert.deepEqual(summary.subjects[0], { subjectId: 'math', semester1: 8, semester2: 9, year: 8.7 });
  assert.deepEqual(summary.subjects[1], { subjectId: 'lit', semester1: 6, semester2: null, year: null });
  assert.equal(summary.semester1, 7);
  assert.equal(summary.semester2, 9);
  assert.equal(summary.year, 8.3);
});

test('score / coefficient / rating validation', () => {
  assert.equal(server.assertScore(9.25), 9.25);
  for (const bad of [-1, 10.5, 7.123, Number.NaN]) assert.throws(() => server.assertScore(bad), /INVALID_SCORE/);
  assert.throws(() => server.assertCoefficient(0), /INVALID_COEFFICIENT/);
  assert.throws(() => server.assertCoefficient(1.5), /INVALID_COEFFICIENT/);
  assert.throws(() => server.assertRating(6), /INVALID_RATING/);
  assert.throws(() => server.assertSemester(3), /INVALID_SEMESTER/);
  assert.throws(() => server.assertTimetableCell({ weekday: 6, session: 'morning', period: 1 }), /INVALID_TIMETABLE_CELL/);
  assert.throws(() => server.assertTimetableCell({ weekday: 1, session: 'evening', period: 1 }), /INVALID_TIMETABLE_CELL/);
});

test('semester follows Ngày bắt đầu học kỳ II', () => {
  for (const mod of [server, client]) {
    assert.equal(mod.semesterForDate('2027-01-11', year), 1);
    assert.equal(mod.semesterForDate('2027-01-12', year), 2);
    assert.equal(mod.semesterForDate('2027-03-01', { startDate: year.startDate }), 1);
  }
});

test('planCellChange keeps past lessons and replaces from the chosen date', () => {
  const rows = [slot({ _id: 'old' })];
  const plan = server.planCellChange(rows, '2026-11-02', { teacherId: 't2', subjectId: 'math' });
  assert.deepEqual(plan.ends, [{ id: 'old', effectiveTo: '2026-11-01' }]);
  assert.deepEqual(plan.deletes, []);
  assert.deepEqual(plan.insert, { teacherId: 't2', subjectId: 'math', effectiveFrom: '2026-11-02' });

  const same = server.planCellChange(rows, '2026-11-02', { teacherId: 't1', subjectId: 'math' });
  assert.equal(same.changed, false);

  const fromStart = server.planCellChange(rows, '2026-09-05', null);
  assert.deepEqual(fromStart.deletes, ['old'], 'a row starting on the date is removed, not ended before it began');

  const future = server.planCellChange([slot({ _id: 'a', effectiveTo: '2026-12-31' }), slot({ _id: 'b', effectiveFrom: '2027-01-01' })], '2026-10-01', null);
  assert.deepEqual(future.ends, [{ id: 'a', effectiveTo: '2026-09-30' }]);
  assert.deepEqual(future.deletes, ['b']);

  const ended = server.planCellChange([slot({ _id: 'x', effectiveTo: '2026-09-30' })], '2026-10-01', null);
  assert.equal(ended.changed, false, 'clearing an already empty cell is a no-op');
});

test('a teacher cannot teach two classes in the same cell', () => {
  const busy = [slot({ classId: 'c2' })];
  assert.ok(server.findTeacherConflict(busy, { weekday: 1, session: 'morning', period: 1 }, '2026-10-01', 'c1'));
  assert.equal(server.findTeacherConflict(busy, { weekday: 1, session: 'morning', period: 2 }, '2026-10-01', 'c1'), undefined);
  assert.equal(server.findTeacherConflict(busy, { weekday: 1, session: 'morning', period: 1 }, '2026-10-01', 'c2'), undefined);
  const ended = [slot({ classId: 'c2', effectiveTo: '2026-09-30' })];
  assert.equal(server.findTeacherConflict(ended, { weekday: 1, session: 'morning', period: 1 }, '2026-10-01', 'c1'), undefined);
});

test('expandLessons skips weekends and holidays and honours effective ranges (server = client)', () => {
  const slots = [
    slot({ weekday: 1, period: 2 }),
    slot({ _id: 's2', weekday: 1, session: 'afternoon', period: 1, effectiveTo: '2026-09-07' }),
    slot({ _id: 's3', weekday: 2, effectiveFrom: '2026-09-15' }),
  ];
  const holidays = new Set(['2026-09-14']);
  const args = { from: '2026-09-01', to: '2026-09-22', year, holidays };
  const expected = server.expandLessons(slots, args).map((row) => `${row.date} ${row.session} ${row.period}`);
  assert.deepEqual(expected, [
    '2026-09-07 morning 2',
    '2026-09-07 afternoon 1',
    '2026-09-15 morning 1',
    '2026-09-21 morning 2',
    '2026-09-22 morning 1',
  ]);
  assert.deepEqual(client.expandLessons(slots, args).map((row) => `${row.date} ${row.session} ${row.period}`), expected);
  assert.deepEqual(client.PERIOD_START_TIMES, server.PERIOD_START_TIMES);
});

test('next lesson per class orders Lớp giảng dạy by the nearest lesson', () => {
  const lessons = client.expandLessons(
    [
      slot({ classId: 'c1', weekday: 1, period: 1 }),
      slot({ classId: 'c2', weekday: 1, period: 4 }),
      slot({ classId: 'c3', weekday: 2, period: 1 }),
    ],
    { from: '2026-09-07', to: '2026-09-20', year, holidays: new Set() },
  );
  const next = client.nextLessonByClass(lessons, { date: '2026-09-07', time: '09:00' });
  assert.equal(next.get('c1').date, '2026-09-14', 'tiết 1 đã xong lúc 09:00 → tuần sau');
  assert.equal(next.get('c2').date, '2026-09-07');
  assert.equal(next.get('c3').date, '2026-09-08');
  assert.equal(client.lessonEndTime({ session: 'morning', period: 1 }), '07:45');
});

test('teaching tables are checked before deleting a school year', () => {
  const catalog = read('convex/homeroomCatalog.ts');
  for (const table of ['teacherYearProfiles', 'timetableSlots', 'lessonLogs', 'gradeEntries']) {
    assert.match(catalog, new RegExp(`"${table}"`));
  }
});

test('teaching mutations re-check authorization on the server', () => {
  const timetable = read('convex/timetable.ts');
  assert.match(timetable, /export const applyChanges = mutation\(\{[\s\S]*?await adminOrThrow\(ctx\)/);
  const teachers = read('convex/teachers.ts');
  assert.match(teachers, /export const setSubjects = mutation\(\{[\s\S]*?await adminOrThrow\(ctx\)/);
  assert.match(teachers, /TEACHER_SCHEDULE_FORBIDDEN/);
  const logs = read('convex/lessonLogs.ts');
  assert.match(logs, /slot\.teacherId !== me\) throw new Error\(LESSON_NOT_SCHEDULED\)/);
  assert.match(logs, /LESSON_IN_FUTURE/);
  const grades = read('convex/gradebook.ts');
  for (const name of ['addEntry', 'updateEntry', 'removeEntry']) {
    assert.match(grades, new RegExp(`export const ${name} = mutation\\(\\{[\\s\\S]*?writableClassOrThrow`));
  }
  assert.match(grades, /canWriteAll: isHomeroomOperationalManager\(actor\)/);
  const catalog = read('convex/teachingCatalog.ts');
  for (const name of ['createSubject', 'updateSubject', 'removeSubject', 'createTestType', 'updateTestType', 'removeTestType']) {
    assert.match(catalog, new RegExp(`export const ${name} = mutation\\(\\{[\\s\\S]*?await adminOrThrow\\(ctx\\)`));
  }
});
