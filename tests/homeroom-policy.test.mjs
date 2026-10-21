import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actorAssignedToStudentClass,
  assertCanCorrectDisposition,
  assertCanListAttendanceImportClasses,
  assertCanMaintainAssignedRoster,
  assertCanReadClass,
  assertCanSupervisorImport,
  assertGuardianBelongsToStudent,
  assertHomeroomTeacherAssignmentInput,
  authorizeAccessibleEnrollments,
  canBulkImportRoster,
  canCorrectDisposition,
  canImportAttendanceWithoutClassAssignment,
  canMaintainAssignedRoster,
  canReadClass,
  canSeeSensitiveContacts,
  canUploadCamera,
  assertCanIncludeArchivedClasses,
  assertClassNotArchived,
  canWriteHomeroomCatalog,
  CLASS_ARCHIVED,
  classIncludedInScopedList,
  classVisibleInScope,
  filterStudentAttendanceHistory,
  HOMEROOM_SCOPE_FORBIDDEN,
  INVALID_ASSIGNMENT_SCOPE,
  INVALID_ASSIGNMENT_TYPE,
  resolveAttendanceImportClassScope,
  resolveCatalogScope,
  resolveClassScope,
  resolveTeacherOverviewScope,
  SUPERVISOR_REQUIRED,
} from '../convex/homeroomPolicy.ts';
import {
  enrollmentsCoveringDate,
  findOverlappingHomeroomTeacher,
  planHomeroomTeacherReplacement,
} from '../convex/homeroomCatalog.ts';
import { assertYmdRange } from '../convex/homeroomTime.ts';
import {
  addDaysYmd,
  assertYmd,
  DEFAULT_ATTENDANCE_UPLOAD_DUE_TIME,
  vietnamDateFromUtcMs,
  vietnamWallTimeToUtcMs,
} from '../convex/homeroomTime.ts';
import {
  evaluateMissingUploadAlert,
  evaluateRepeatedAbsenceAlert,
  evaluateScopedMissingUploadAlerts,
  evaluateUnresolvedAbsenceAlerts,
} from '../convex/homeroomAlerts.ts';

const teacherAssignment = {
  classId: 'class-6a1',
  schoolYearId: 'year-1',
  userId: 'teacher-1',
  assignmentType: 'homeroom_teacher',
  scopeKind: 'class',
  effectiveFrom: '2026-08-01',
  active: true,
};

const supervisorAssignment = {
  classId: 'class-6a1',
  schoolYearId: 'year-1',
  userId: 'sup-1',
  assignmentType: 'supervisor',
  scopeKind: 'class',
  effectiveFrom: '2026-08-01',
  active: true,
};

const teacher = {
  userId: 'teacher-1',
  role: 'user',
  status: 'active',
  menuAccess: { homeroom: 'view' },
};

const otherTeacher = {
  userId: 'teacher-2',
  role: 'user',
  status: 'active',
  menuAccess: { homeroom: 'view' },
};

/** Legacy Giám thị: homeroom=supervisor now resolves to hidden (Giám thị moved to menu attendance). */
const supervisor = {
  userId: 'sup-1',
  role: 'user',
  status: 'active',
  menuAccess: { homeroom: 'supervisor' },
};

const viewAll = {
  userId: 'viewer-1',
  role: 'user',
  status: 'active',
  menuAccess: { homeroom: 'view_all' },
};

const admin = {
  userId: 'admin-1',
  role: 'admin',
  status: 'active',
  menuAccess: {},
};

test('assigned teacher reads own class and is forbidden on another class', () => {
  const date = '2026-09-01';
  const assignments = [teacherAssignment];
  assert.equal(canReadClass(teacher, assignments, 'class-6a1', date), true);
  assert.equal(canReadClass(otherTeacher, assignments, 'class-6a1', date), false);
  assert.throws(
    () => assertCanReadClass(otherTeacher, assignments, 'class-6a1', date),
    new RegExp(HOMEROOM_SCOPE_FORBIDDEN),
  );
  assert.deepEqual(resolveClassScope(teacher, assignments, { date, schoolYearId: 'year-1' }), {
    kind: 'ids',
    classIds: ['class-6a1'],
  });
});

test('class scope is fail-closed for no, removed, or expired assignment', () => {
  const date = '2026-09-01';
  assert.deepEqual(resolveClassScope(teacher, [], { date, schoolYearId: 'year-1' }), { kind: 'none' });
  assert.equal(classVisibleInScope('class-6a1', { kind: 'none' }), false);
  const removed = { ...teacherAssignment, active: false };
  assert.deepEqual(resolveClassScope(teacher, [removed], { date, schoolYearId: 'year-1' }), { kind: 'none' });
  const expired = { ...teacherAssignment, effectiveTo: '2026-08-31' };
  assert.deepEqual(resolveClassScope(teacher, [expired], { date, schoolYearId: 'year-1' }), { kind: 'none' });
  assert.equal(canReadClass(teacher, [expired], 'class-6a1', date), false);
});

test('managers, view_all, and supervisor assignments never populate teacher overview', () => {
  const date = '2026-09-01';
  assert.deepEqual(resolveClassScope(admin, [], { date }), { kind: 'none' });
  assert.deepEqual(resolveTeacherOverviewScope(admin, [teacherAssignment], { date, schoolYearId: 'year-1' }), {
    kind: 'none',
  });
  assert.deepEqual(resolveClassScope(viewAll, [], { date }), { kind: 'none' });
  const wholeSchool = {
    ...supervisorAssignment,
    classId: '',
    scopeKind: 'whole_school',
  };
  assert.deepEqual(resolveClassScope(supervisor, [wholeSchool], { date, schoolYearId: 'year-1' }), { kind: 'none' });
  assert.deepEqual(resolveClassScope(supervisor, [supervisorAssignment], { date, schoolYearId: 'year-1' }), {
    kind: 'none',
  });
  assert.equal(canReadClass(supervisor, [supervisorAssignment], 'class-6a1', date), false);
  assert.equal(canReadClass(supervisor, [wholeSchool], 'class-6a2', date), false);
  assert.equal(canReadClass(admin, [], 'class-6a2', date), true);
  assert.equal(canReadClass(viewAll, [], 'class-6a2', date), true);
  assert.deepEqual(resolveCatalogScope(admin), { kind: 'all' });
  assert.deepEqual(resolveCatalogScope(supervisor), { kind: 'none' });
  assert.deepEqual(resolveAttendanceImportClassScope(supervisor), { kind: 'none' });
  assert.deepEqual(resolveAttendanceImportClassScope(admin), { kind: 'all' });
  assert.deepEqual(resolveAttendanceImportClassScope(teacher), { kind: 'none' });
});

test('legacy homeroom supervisor has no homeroom access; retired camera import is admin/mod only', () => {
  const date = '2026-09-01';
  assert.equal(canUploadCamera(supervisor, [], 'class-6a2', date), false);
  assert.equal(canCorrectDisposition(supervisor, [], 'class-6a2', date), false);
  assert.throws(() => assertCanCorrectDisposition(supervisor, [], 'class-6a2', date), /HOMEROOM_MENU_HIDDEN/);
  assert.equal(canImportAttendanceWithoutClassAssignment(supervisor), false);
  assert.throws(() => assertCanSupervisorImport(supervisor, [], 'class-6a2', date), /HOMEROOM_MENU_HIDDEN/);
  assert.throws(() => assertCanListAttendanceImportClasses(supervisor), /HOMEROOM_MENU_HIDDEN/);
  assert.throws(() => assertCanReadClass(supervisor, [], 'class-6a2', date), /HOMEROOM_MENU_HIDDEN/);
  assert.equal(canImportAttendanceWithoutClassAssignment(admin), true);
  assert.doesNotThrow(() => assertCanListAttendanceImportClasses(admin));
  assert.equal(canUploadCamera(teacher, [teacherAssignment], 'class-6a1', date), false);
  assert.throws(
    () => assertCanSupervisorImport(teacher, [teacherAssignment], 'class-6a1', date),
    new RegExp(SUPERVISOR_REQUIRED),
  );
  assert.throws(() => assertCanListAttendanceImportClasses(teacher), new RegExp(SUPERVISOR_REQUIRED));
  // Attendance-menu Giám thị (menu attendance) still gets nothing in homeroom.
  const attendanceSupervisor = { ...supervisor, menuAccess: { attendance: 'supervisor' } };
  assert.equal(canReadClass(attendanceSupervisor, [], 'class-6a1', date), false);
  assert.equal(canCorrectDisposition(attendanceSupervisor, [], 'class-6a1', date), false);
});

test('homeroom teacher classifies absences only for own class on that date; admin anywhere', () => {
  const date = '2026-09-01';
  assert.equal(canCorrectDisposition(teacher, [teacherAssignment], 'class-6a1', date), true);
  assert.doesNotThrow(() => assertCanCorrectDisposition(teacher, [teacherAssignment], 'class-6a1', date));
  assert.equal(canCorrectDisposition(teacher, [teacherAssignment], 'class-6a2', date), false);
  assert.throws(
    () => assertCanCorrectDisposition(teacher, [teacherAssignment], 'class-6a2', date),
    /DISPOSITION_FORBIDDEN/,
  );
  assert.equal(canCorrectDisposition(admin, [], 'class-6a2', date), true);
});

test('view_all cannot run supervisor-only camera or disposition actions', () => {
  const date = '2026-09-01';
  assert.equal(canReadClass(viewAll, [], 'class-6a1', date), true);
  assert.equal(canUploadCamera(viewAll, [], 'class-6a1', date), false);
  assert.equal(canCorrectDisposition(viewAll, [], 'class-6a1', date), false);
  assert.throws(
    () => assertCanCorrectDisposition(viewAll, [], 'class-6a1', date),
    /DISPOSITION_FORBIDDEN/,
  );
});

test('removing supervisor permission revokes import; historical supervisor rows never grant scope', () => {
  const date = '2026-09-01';
  const lostPermission = { ...supervisor, menuAccess: { homeroom: 'view' } };
  assert.equal(canUploadCamera(lostPermission, [supervisorAssignment], 'class-6a1', date), false);
  const ended = { ...supervisorAssignment, active: false, effectiveTo: '2026-08-31' };
  assert.equal(canReadClass(supervisor, [ended], 'class-6a1', date), false);
  assert.equal(canReadClass(supervisor, [supervisorAssignment], 'class-6a1', date), false);
});

test('sensitive guardian contacts stay omitted unless policy grants them', () => {
  assert.equal(canSeeSensitiveContacts(viewAll, { includeSensitiveContacts: false }), false);
  assert.equal(canSeeSensitiveContacts(supervisor, { includeSensitiveContacts: false }), false);
  assert.equal(
    canSeeSensitiveContacts(teacher, {
      includeSensitiveContacts: false,
      assignedToClass: true,
    }),
    true,
  );
  assert.equal(canSeeSensitiveContacts(admin, { includeSensitiveContacts: false }), true);
  assert.equal(canSeeSensitiveContacts(viewAll, { includeSensitiveContacts: true }), false);
  assert.equal(canSeeSensitiveContacts(supervisor, { includeSensitiveContacts: true }), false);
  assert.equal(
    canSeeSensitiveContacts(teacher, { includeSensitiveContacts: true, assignedToClass: false }),
    false,
  );
});

test('guessed archived or no-enrollment student IDs fail closed and do not leak contacts', () => {
  const date = '2026-09-01';
  assert.throws(
    () => authorizeAccessibleEnrollments(teacher, [teacherAssignment], []),
    new RegExp(HOMEROOM_SCOPE_FORBIDDEN),
  );
  const archived = [
    {
      classId: 'class-6a2',
      schoolYearId: 'year-1',
      startDate: '2025-08-01',
      endDate: '2026-05-31',
    },
  ];
  assert.throws(
    () => authorizeAccessibleEnrollments(teacher, [teacherAssignment], archived),
    new RegExp(HOMEROOM_SCOPE_FORBIDDEN),
  );
  const current = [
    { classId: 'class-6a1', schoolYearId: 'year-1', startDate: '2026-08-15' },
  ];
  assert.deepEqual(authorizeAccessibleEnrollments(teacher, [teacherAssignment], current), current);
  assert.throws(
    () => authorizeAccessibleEnrollments(supervisor, [supervisorAssignment], current),
    new RegExp(HOMEROOM_SCOPE_FORBIDDEN),
  );
  assert.equal(actorAssignedToStudentClass(supervisor, [supervisorAssignment], current), false);
  assert.equal(actorAssignedToStudentClass(viewAll, [], current), false);
  assert.equal(actorAssignedToStudentClass(teacher, [teacherAssignment], current), true);
  assert.equal(canSeeSensitiveContacts(viewAll, { assignedToClass: true }), false);
});

const transferredEnrollments = [
  {
    classId: 'class-6a1',
    schoolYearId: 'year-1',
    startDate: '2026-08-15',
    endDate: '2026-10-31',
  },
  {
    classId: 'class-6a2',
    schoolYearId: 'year-1',
    startDate: '2026-11-01',
  },
];

test('enrolled authorized student with no attendance days returns empty history', () => {
  const empty = filterStudentAttendanceHistory({
    actor: teacher,
    assignments: [teacherAssignment],
    enrollments: [{ classId: 'class-6a1', schoolYearId: 'year-1', startDate: '2026-08-15' }],
    days: [],
    corrections: [],
  });
  assert.deepEqual(empty, { days: [], corrections: [] });
  const adminEmpty = filterStudentAttendanceHistory({
    actor: admin,
    assignments: [],
    enrollments: [{ classId: 'class-6a1', schoolYearId: 'year-1', startDate: '2026-08-15' }],
    days: [],
    corrections: [],
  });
  assert.deepEqual(adminEmpty, { days: [], corrections: [] });
});

test('out-of-scope student with no attendance days stays forbidden', () => {
  assert.throws(
    () =>
      filterStudentAttendanceHistory({
        actor: teacher,
        assignments: [teacherAssignment],
        enrollments: [{ classId: 'class-6a2', schoolYearId: 'year-1', startDate: '2026-08-15' }],
        days: [],
        corrections: [],
      }),
    new RegExp(HOMEROOM_SCOPE_FORBIDDEN),
  );
  assert.throws(
    () =>
      filterStudentAttendanceHistory({
        actor: otherTeacher,
        assignments: [teacherAssignment],
        enrollments: [],
        days: [],
        corrections: [],
      }),
    new RegExp(HOMEROOM_SCOPE_FORBIDDEN),
  );
});

test('mixed historical attendance rows are filtered by effective class and date', () => {
  const days = [
    { _id: 'd1', classId: 'class-6a1', studentId: 'st-1', attendanceDate: '2026-10-01' },
    { _id: 'd2', classId: 'class-6a2', studentId: 'st-1', attendanceDate: '2026-11-15' },
    { _id: 'd-leak', classId: 'class-6a1', studentId: 'st-1', attendanceDate: '2026-11-20' },
  ];
  const corrections = [
    { attendanceDayId: 'd1', studentId: 'st-1', attendanceDate: '2026-10-01' },
    { attendanceDayId: 'd2', studentId: 'st-1', attendanceDate: '2026-11-15' },
    { attendanceDayId: 'd-leak', studentId: 'st-1', attendanceDate: '2026-11-20' },
  ];
  const assignments = [{ ...teacherAssignment, effectiveTo: '2026-10-31' }];
  const history = filterStudentAttendanceHistory({
    actor: teacher,
    assignments,
    enrollments: transferredEnrollments,
    days,
    corrections,
  });
  assert.deepEqual(history.days.map((row) => row._id), ['d1']);
  assert.deepEqual(history.corrections.map((row) => row.attendanceDayId), ['d1']);
  assert.throws(
    () =>
      filterStudentAttendanceHistory({
        actor: teacher,
        assignments: [teacherAssignment],
        enrollments: [{ classId: 'class-6a2', schoolYearId: 'year-1', startDate: '2026-11-01' }],
        days: [{ _id: 'leftover', classId: 'class-6a1', studentId: 'st-1', attendanceDate: '2026-09-01' }],
        corrections: [{ attendanceDayId: 'leftover', studentId: 'st-1', attendanceDate: '2026-09-01' }],
      }),
    new RegExp(HOMEROOM_SCOPE_FORBIDDEN),
  );
});

test('transferred attendance history is scoped to the actor class period', () => {
  const days = [
    { _id: 'd1', classId: 'class-6a1', studentId: 'st-1', attendanceDate: '2026-10-01' },
    { _id: 'd2', classId: 'class-6a2', studentId: 'st-1', attendanceDate: '2026-11-15' },
  ];
  const corrections = [
    { attendanceDayId: 'd1', studentId: 'st-1', attendanceDate: '2026-10-01' },
    { attendanceDayId: 'd2', studentId: 'st-1', attendanceDate: '2026-11-15' },
  ];
  const oldTeacher = teacher;
  const newTeacher = { ...otherTeacher, userId: 'teacher-2' };
  const assignments = [
    { ...teacherAssignment, effectiveTo: '2026-10-31' },
    {
      classId: 'class-6a2',
      schoolYearId: 'year-1',
      userId: 'teacher-2',
      assignmentType: 'homeroom_teacher',
      scopeKind: 'class',
      effectiveFrom: '2026-11-01',
      active: true,
    },
  ];
  const oldHistory = filterStudentAttendanceHistory({
    actor: oldTeacher,
    assignments,
    enrollments: transferredEnrollments,
    days,
    corrections,
  });
  assert.deepEqual(oldHistory.days.map((row) => row.classId), ['class-6a1']);
  assert.deepEqual(oldHistory.corrections.map((row) => row.attendanceDayId), ['d1']);
  const newHistory = filterStudentAttendanceHistory({
    actor: newTeacher,
    assignments,
    enrollments: transferredEnrollments,
    days,
    corrections,
  });
  assert.deepEqual(newHistory.days.map((row) => row.classId), ['class-6a2']);
  assert.deepEqual(newHistory.corrections.map((row) => row.attendanceDayId), ['d2']);
  const managerHistory = filterStudentAttendanceHistory({
    actor: admin,
    assignments,
    enrollments: transferredEnrollments,
    days,
    corrections,
  });
  assert.equal(managerHistory.days.length, 2);
  const viewAllHistory = filterStudentAttendanceHistory({
    actor: viewAll,
    assignments,
    enrollments: transferredEnrollments,
    days,
    corrections,
  });
  assert.equal(viewAllHistory.days.length, 2);
  assert.throws(
    () =>
      filterStudentAttendanceHistory({
        actor: teacher,
        assignments: [],
        enrollments: transferredEnrollments,
        days,
        corrections,
      }),
    new RegExp(HOMEROOM_SCOPE_FORBIDDEN),
  );
});

test('transfer-date attendance is authorized only for the new class teacher', () => {
  const days = [{ _id: 'd-transfer', classId: 'class-6a2', studentId: 'st-1', attendanceDate: '2026-11-01' }];
  const corrections = [{ attendanceDayId: 'd-transfer', studentId: 'st-1', attendanceDate: '2026-11-01' }];
  const assignments = [
    { ...teacherAssignment, effectiveTo: '2026-10-31' },
    {
      classId: 'class-6a2',
      schoolYearId: 'year-1',
      userId: 'teacher-2',
      assignmentType: 'homeroom_teacher',
      scopeKind: 'class',
      effectiveFrom: '2026-11-01',
      active: true,
    },
  ];
  const incoming = { ...otherTeacher, userId: 'teacher-2' };
  const enrollments = [{ classId: 'class-6a2', schoolYearId: 'year-1', startDate: '2026-11-01' }];
  assert.equal(canReadClass(teacher, assignments, 'class-6a2', '2026-11-01'), false);
  assert.equal(canReadClass(incoming, assignments, 'class-6a2', '2026-11-01'), true);
  const newHistory = filterStudentAttendanceHistory({
    actor: incoming,
    assignments,
    enrollments,
    days,
    corrections,
  });
  assert.deepEqual(newHistory.days.map((row) => row._id), ['d-transfer']);
  assert.throws(
    () =>
      filterStudentAttendanceHistory({
        actor: teacher,
        assignments,
        enrollments,
        days,
        corrections,
      }),
    new RegExp(HOMEROOM_SCOPE_FORBIDDEN),
  );
});

test('invalid from>to range and cross-student guardian updates are rejected', () => {
  assert.throws(() => assertYmdRange('2026-09-02', '2026-09-01'), /INVALID_DATE_RANGE/);
  assert.throws(
    () => assertGuardianBelongsToStudent({ studentId: 'st-other' }, 'st-1'),
    /GUARDIAN_NOT_FOUND/,
  );
  assert.doesNotThrow(() => assertGuardianBelongsToStudent({ studentId: 'st-1' }, 'st-1'));
  assert.throws(
    () => assertCanMaintainAssignedRoster(supervisor, [supervisorAssignment], 'class-6a1', '2026-09-01'),
    /HOMEROOM_MENU_HIDDEN/,
  );
});

test('historical roster uses startDate/endDate coverage instead of active status', () => {
  const enrollments = [
    {
      classId: 'class-6a1',
      studentId: 'st-1',
      startDate: '2026-08-15',
      endDate: '2026-10-31',
      status: 'transferred',
    },
    {
      classId: 'class-6a2',
      studentId: 'st-1',
      startDate: '2026-11-01',
      status: 'active',
    },
  ];
  assert.deepEqual(
    enrollmentsCoveringDate(enrollments, { classId: 'class-6a1', date: '2026-10-01' }).map((row) => row.classId),
    ['class-6a1'],
  );
  assert.deepEqual(
    enrollmentsCoveringDate(enrollments, { classId: 'class-6a1', date: '2026-11-01' }),
    [],
  );
  assert.deepEqual(
    enrollmentsCoveringDate(enrollments, { classId: 'class-6a2', date: '2026-11-01' }).map((row) => row.studentId),
    ['st-1'],
  );
  assert.deepEqual(
    enrollmentsCoveringDate(enrollments, { classId: 'class-6a1', date: '2026-11-15' }),
    [],
  );
  assert.deepEqual(
    enrollmentsCoveringDate(enrollments, { classId: 'class-6a2', date: '2026-11-15' }).map((row) => row.studentId),
    ['st-1'],
  );
});

test('replacement date authorizes only the new homeroom teacher', () => {
  const date = '2026-11-01';
  const plan = planHomeroomTeacherReplacement({
    assignment: { effectiveFrom: teacherAssignment.effectiveFrom },
    date,
  });
  const closed = { ...teacherAssignment, ...plan.close };
  const incomingAssignment = {
    classId: 'class-6a1',
    schoolYearId: 'year-1',
    userId: 'teacher-2',
    assignmentType: 'homeroom_teacher',
    scopeKind: 'class',
    effectiveFrom: date,
    active: true,
  };
  const assignments = [closed, incomingAssignment];
  const incoming = { ...otherTeacher, userId: 'teacher-2' };
  assert.equal(plan.close.active, true);
  assert.equal(closed.active, true);
  assert.equal(plan.close.effectiveTo, '2026-10-31');
  assert.equal(canReadClass(teacher, assignments, 'class-6a1', '2026-10-15'), true);
  assert.equal(canReadClass(teacher, assignments, 'class-6a1', plan.close.effectiveTo), true);
  assert.equal(canReadClass(teacher, assignments, 'class-6a1', date), false);
  assert.equal(canReadClass(incoming, assignments, 'class-6a1', plan.close.effectiveTo), false);
  assert.equal(canReadClass(incoming, assignments, 'class-6a1', date), true);
  assert.equal(canMaintainAssignedRoster(teacher, assignments, 'class-6a1', date), false);
  assert.equal(canMaintainAssignedRoster(incoming, assignments, 'class-6a1', date), true);
  assert.equal(
    findOverlappingHomeroomTeacher([closed], { classId: 'class-6a1', effectiveFrom: date, userId: 'teacher-2' }),
    undefined,
  );
  const revoked = { ...closed, active: false };
  assert.equal(canReadClass(teacher, [revoked, incomingAssignment], 'class-6a1', plan.close.effectiveTo), false);
});

test('only operational managers write catalogs or bulk-import students', () => {
  assert.equal(canWriteHomeroomCatalog(admin), true);
  assert.equal(canWriteHomeroomCatalog({ ...admin, role: 'moderator' }), true);
  assert.equal(canWriteHomeroomCatalog(teacher), false);
  assert.equal(canWriteHomeroomCatalog(supervisor), false);
  assert.equal(canBulkImportRoster(admin), true);
  assert.equal(canBulkImportRoster(teacher), false);
  assert.equal(canBulkImportRoster(supervisor), false);
  assert.equal(canBulkImportRoster(viewAll), false);
});

test('includeArchived is catalog-manager only and scoped lists default to active classes', () => {
  assert.equal(classIncludedInScopedList({ status: 'active' }), true);
  assert.equal(classIncludedInScopedList({ status: 'archived' }), false);
  assert.equal(classIncludedInScopedList({ status: 'archived' }, { includeArchived: false }), false);
  assert.equal(classIncludedInScopedList({ status: 'archived' }, { includeArchived: true }), true);
  assert.doesNotThrow(() => assertCanIncludeArchivedClasses(admin));
  assert.doesNotThrow(() => assertCanIncludeArchivedClasses({ ...admin, role: 'moderator' }));
  assert.throws(() => assertCanIncludeArchivedClasses(teacher), new RegExp(HOMEROOM_SCOPE_FORBIDDEN));
  assert.throws(() => assertCanIncludeArchivedClasses(supervisor), new RegExp(HOMEROOM_SCOPE_FORBIDDEN));
  assert.throws(() => assertCanIncludeArchivedClasses(viewAll), new RegExp(HOMEROOM_SCOPE_FORBIDDEN));
});

test('archived classes reject assignment, roster import, and camera use', () => {
  assert.throws(() => assertClassNotArchived({ status: 'archived' }), new RegExp(CLASS_ARCHIVED));
  assert.doesNotThrow(() => assertClassNotArchived({ status: 'active' }));
});

test('assignUser accepts only exact homeroom_teacher class assignments', () => {
  assert.doesNotThrow(() => assertHomeroomTeacherAssignmentInput({ assignmentType: 'homeroom_teacher' }));
  assert.doesNotThrow(() => assertHomeroomTeacherAssignmentInput({ assignmentType: 'homeroom_teacher', scopeKind: 'class' }));
  assert.throws(
    () => assertHomeroomTeacherAssignmentInput({ assignmentType: 'supervisor' }),
    new RegExp(INVALID_ASSIGNMENT_TYPE),
  );
  assert.throws(
    () => assertHomeroomTeacherAssignmentInput({ assignmentType: 'homeroom_teacher ', scopeKind: 'class' }),
    new RegExp(INVALID_ASSIGNMENT_TYPE),
  );
  assert.throws(
    () => assertHomeroomTeacherAssignmentInput({ assignmentType: 'homeroom_teacher', scopeKind: 'whole_school' }),
    new RegExp(INVALID_ASSIGNMENT_SCOPE),
  );
});

test('Vietnam school dates are deterministic under a UTC runtime', () => {
  assert.equal(vietnamDateFromUtcMs(Date.parse('2026-09-01T16:30:00.000Z')), '2026-09-01');
  assert.equal(vietnamDateFromUtcMs(Date.parse('2026-09-01T17:30:00.000Z')), '2026-09-02');
  assert.equal(vietnamWallTimeToUtcMs('2026-09-01', '08:30'), Date.parse('2026-09-01T01:30:00.000Z'));
  assert.equal(assertYmd('2026-09-01'), '2026-09-01');
  assert.throws(() => assertYmd('01/09/2026'), /INVALID_DATE/);
  assert.equal(addDaysYmd('2026-09-30', 1), '2026-10-01');
  assert.equal(DEFAULT_ATTENDANCE_UPLOAD_DUE_TIME, '08:30');
});

test('missing-upload alert uses configured Vietnam calendar and published import only', () => {
  const now = vietnamWallTimeToUtcMs('2026-09-01', '09:00');
  const working = evaluateMissingUploadAlert({
    date: '2026-09-01',
    nowMs: now,
    cutoffTime: '08:30',
    calendarDay: { date: '2026-09-01', kind: 'working' },
    publishedImportId: null,
  });
  assert.equal(working.shouldAlert, true);
  assert.equal(working.calendarStatus, 'working');

  const holiday = evaluateMissingUploadAlert({
    date: '2026-09-02',
    nowMs: vietnamWallTimeToUtcMs('2026-09-02', '09:00'),
    cutoffTime: '08:30',
    calendarDay: { date: '2026-09-02', kind: 'holiday' },
    publishedImportId: null,
  });
  assert.equal(holiday.shouldAlert, false);
  assert.equal(holiday.calendarStatus, 'holiday');

  const published = evaluateMissingUploadAlert({
    date: '2026-09-01',
    nowMs: now,
    cutoffTime: '08:30',
    calendarDay: { date: '2026-09-01', kind: 'working' },
    publishedImportId: 'imp-1',
  });
  assert.equal(published.shouldAlert, false);
  assert.equal(published.resolvedByPublication, true);

  const defaultWeekday = evaluateMissingUploadAlert({
    date: '2026-09-01',
    nowMs: now,
    cutoffTime: '08:30',
    calendarDay: null,
    publishedImportId: null,
  });
  assert.equal(defaultWeekday.shouldAlert, true);
  assert.equal(defaultWeekday.calendarStatus, 'default_school_day');

  const defaultSunday = evaluateMissingUploadAlert({
    date: '2026-09-06',
    nowMs: vietnamWallTimeToUtcMs('2026-09-06', '09:00'),
    cutoffTime: '08:30',
    calendarDay: null,
    publishedImportId: null,
  });
  assert.equal(defaultSunday.shouldAlert, false);
  assert.equal(defaultSunday.calendarStatus, 'default_weekend');
});

test('missing-upload alerts are computed per visible class and do not leak school-wide publication', () => {
  const now = vietnamWallTimeToUtcMs('2026-09-01', '09:00');
  const base = {
    date: '2026-09-01',
    nowMs: now,
    cutoffTime: '08:30',
    calendarDay: { date: '2026-09-01', kind: 'working' },
  };
  const classAPublished = evaluateScopedMissingUploadAlerts({
    ...base,
    visibleClassIds: ['class-6a1', 'class-6a2'],
    publishedClassIds: ['class-6a1'],
  });
  assert.equal(classAPublished.shouldAlert, true);
  assert.deepEqual(classAPublished.missingClassIds, ['class-6a2']);
  assert.equal(classAPublished.resolvedByPublication, false);

  const noAssignment = evaluateScopedMissingUploadAlerts({
    ...base,
    visibleClassIds: [],
    publishedClassIds: ['class-6a1'],
  });
  assert.equal(noAssignment.shouldAlert, false);
  assert.deepEqual(noAssignment.missingClassIds, []);
  assert.equal(noAssignment.scopeEmpty, true);

  const wholeSchool = evaluateScopedMissingUploadAlerts({
    ...base,
    visibleClassIds: ['class-6a1', 'class-6a2', 'class-6a3'],
    publishedClassIds: ['class-6a1'],
  });
  assert.equal(wholeSchool.shouldAlert, true);
  assert.deepEqual(wholeSchool.missingClassIds, ['class-6a2', 'class-6a3']);

  const allPublished = evaluateScopedMissingUploadAlerts({
    ...base,
    visibleClassIds: ['class-6a1', 'class-6a2'],
    publishedClassIds: ['class-6a1', 'class-6a2'],
  });
  assert.equal(allPublished.shouldAlert, false);
  assert.deepEqual(allPublished.missingClassIds, []);
  assert.equal(allPublished.resolvedByPublication, true);
});

test('unresolved-absence and repeated-absence alerts stay scoped to assigned classes', () => {
  const days = [
    {
      classId: 'class-6a1',
      studentId: 'st-1',
      attendanceDate: '2026-09-01',
      effectiveStatus: 'absent_pending',
    },
    {
      classId: 'class-6a2',
      studentId: 'st-2',
      attendanceDate: '2026-09-01',
      effectiveStatus: 'absent_pending',
    },
  ];
  const unresolved = evaluateUnresolvedAbsenceAlerts(days, { classIds: ['class-6a1'] });
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].classId, 'class-6a1');

  const history = [
    { classId: 'class-6a1', studentId: 'st-1', attendanceDate: '2026-09-01', rawObservation: 'absent', effectiveStatus: 'absent_unexcused' },
    { classId: 'class-6a1', studentId: 'st-1', attendanceDate: '2026-09-02', rawObservation: 'absent', effectiveStatus: 'absent_pending' },
    { classId: 'class-6a1', studentId: 'st-1', attendanceDate: '2026-09-03', rawObservation: 'absent', effectiveStatus: 'absent_excused' },
  ];
  const repeated = evaluateRepeatedAbsenceAlert(history, { studentId: 'st-1', threshold: 3 });
  assert.equal(repeated.shouldAlert, true);
  assert.equal(repeated.count, 3);
});
