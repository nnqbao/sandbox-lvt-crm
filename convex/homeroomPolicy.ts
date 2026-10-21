import {
  effectiveMenuAccessLevel,
  HOMEROOM_MENU_ID,
  isMenuVisible,
  isViewAllAccess,
  type MenuAccess,
} from "./menuAccess.ts";
import { assertYmd, assertYmdRange, compareYmd, dateInRange } from "./homeroomTime.ts";

function isOperationalManagerRole(role: string) {
  return role === "admin" || role === "moderator";
}

export const HOMEROOM_SCOPE_FORBIDDEN = "HOMEROOM_SCOPE_FORBIDDEN";
export const SUPERVISOR_REQUIRED = "SUPERVISOR_REQUIRED";
export const HOMEROOM_MENU_HIDDEN = "HOMEROOM_MENU_HIDDEN";
export const SENSITIVE_CONTACTS_FORBIDDEN = "SENSITIVE_CONTACTS_FORBIDDEN";
export const CLASS_ARCHIVED = "CLASS_ARCHIVED";
export const INVALID_ASSIGNMENT_TYPE = "INVALID_ASSIGNMENT_TYPE";
export const INVALID_ASSIGNMENT_SCOPE = "INVALID_ASSIGNMENT_SCOPE";
export const HOMEROOM_TEACHER_ASSIGNMENT_TYPE = "homeroom_teacher";

export type HomeroomActor = {
  userId: string;
  role: string;
  status?: string;
  mustChangePassword?: boolean;
  menuAccess: Record<string, string | MenuAccess | undefined>;
};

export type HomeroomAssignment = {
  classId: string;
  schoolYearId: string;
  userId: string;
  assignmentType: string;
  scopeKind: string;
  effectiveFrom: string;
  effectiveTo?: string;
  active: boolean;
};

export function isHomeroomOperationalManager(actor: HomeroomActor): boolean {
  return isOperationalManagerRole(actor.role);
}

/** Giám thị (`supervisor`) lives on the attendance menu; on homeroom it resolves to hidden. */
export function homeroomMenuAccess(actor: HomeroomActor): MenuAccess {
  return effectiveMenuAccessLevel(HOMEROOM_MENU_ID, actor.menuAccess?.homeroom || "hidden");
}

export function hasHomeroomMenu(actor: HomeroomActor): boolean {
  return isHomeroomOperationalManager(actor) || isMenuVisible(homeroomMenuAccess(actor));
}

export function isHomeroomViewAllUser(actor: HomeroomActor): boolean {
  return !isHomeroomOperationalManager(actor) && isViewAllAccess(homeroomMenuAccess(actor));
}

export function canWriteHomeroomCatalog(actor: HomeroomActor): boolean {
  return isHomeroomOperationalManager(actor);
}

export function classIncludedInScopedList(
  row: { status?: string },
  args: { includeArchived?: boolean } = {},
): boolean {
  if (args.includeArchived) return true;
  return row.status === "active";
}

/** Effective GVCN rows only. Historical supervisor / whole-school rows never grant teaching scope. */
export function isHomeroomTeacherClassAssignment(assignment: HomeroomAssignment): boolean {
  return (
    assignment.assignmentType === HOMEROOM_TEACHER_ASSIGNMENT_TYPE
    && assignment.scopeKind === "class"
    && Boolean(assignment.classId)
  );
}

export function assertHomeroomTeacherAssignmentInput(args: {
  assignmentType: string;
  scopeKind?: string;
}) {
  if (args.assignmentType !== HOMEROOM_TEACHER_ASSIGNMENT_TYPE) {
    throw new Error(INVALID_ASSIGNMENT_TYPE);
  }
  if (args.scopeKind != null && args.scopeKind !== "class") {
    throw new Error(INVALID_ASSIGNMENT_SCOPE);
  }
}

export function teacherClassAssignmentsOnDate(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  args: { date: string; schoolYearId?: string; classId?: string },
): HomeroomAssignment[] {
  return actorAssignmentsOnDate(actor, assignments, args).filter(isHomeroomTeacherClassAssignment);
}

export function findEffectiveHomeroomTeacherAssignment(
  assignments: HomeroomAssignment[],
  args: { classId: string; date: string },
): HomeroomAssignment | undefined {
  return assignments.find(
    (row) => isHomeroomTeacherClassAssignment(row) && assignmentCovers(row, args),
  );
}

/**
 * Legacy whole-school camera import (now retired): only admin/mod may still read its history.
 * Giám thị marks attendance on the separate Điểm danh menu (convex/supervisorAttendance.ts).
 */
export function canImportAttendanceWithoutClassAssignment(actor: HomeroomActor): boolean {
  return isHomeroomOperationalManager(actor);
}

export function canBulkImportRoster(actor: HomeroomActor): boolean {
  return canWriteHomeroomCatalog(actor);
}

export function assertCanIncludeArchivedClasses(actor: HomeroomActor) {
  if (!canWriteHomeroomCatalog(actor)) throw new Error(HOMEROOM_SCOPE_FORBIDDEN);
}

export function assertClassNotArchived(klass: { status?: string }) {
  if (klass.status === "archived") throw new Error(CLASS_ARCHIVED);
}

export function assignmentCovers(
  assignment: HomeroomAssignment,
  args: { classId?: string; schoolYearId?: string; date: string },
): boolean {
  if (!assignment.active) return false;
  if (args.schoolYearId && assignment.schoolYearId !== args.schoolYearId) return false;
  if (!dateInRange(args.date, assignment.effectiveFrom, assignment.effectiveTo)) return false;
  if (assignment.scopeKind === "whole_school") return true;
  if (args.classId && assignment.classId !== args.classId) return false;
  return true;
}

export function actorAssignmentsOnDate(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  args: { date: string; schoolYearId?: string; classId?: string },
): HomeroomAssignment[] {
  return assignments.filter(
    (row) => String(row.userId) === String(actor.userId) && assignmentCovers(row, args),
  );
}

export type HomeroomClassScope =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "ids"; classIds: string[] };

/** Teacher overview: effective homeroom_teacher class assignments only. */
export function resolveTeacherOverviewScope(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  args: { date: string; schoolYearId?: string },
): HomeroomClassScope {
  if (!hasHomeroomMenu(actor)) return { kind: "none" };
  const classIds = [
    ...new Set(teacherClassAssignmentsOnDate(actor, assignments, args).map((row) => row.classId)),
  ];
  return classIds.length ? { kind: "ids", classIds } : { kind: "none" };
}

/** Admin/mod catalog of every class in the year. */
export function resolveCatalogScope(actor: HomeroomActor): HomeroomClassScope {
  return canWriteHomeroomCatalog(actor) ? { kind: "all" } : { kind: "none" };
}

/** Admin/mod may list active classes of the retired camera import. */
export function resolveAttendanceImportClassScope(actor: HomeroomActor): HomeroomClassScope {
  return canImportAttendanceWithoutClassAssignment(actor) ? { kind: "all" } : { kind: "none" };
}

export function resolveClassScope(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  args: { date: string; schoolYearId?: string },
): HomeroomClassScope {
  return resolveTeacherOverviewScope(actor, assignments, args);
}

export function classVisibleInScope(classId: string, scope: HomeroomClassScope): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "none") return false;
  return scope.classIds.includes(classId);
}

export function rangesOverlap(
  startA: string,
  endA: string | undefined,
  startB: string,
  endB: string | undefined,
): boolean {
  if (endA && compareYmd(endA, startB) < 0) return false;
  if (endB && compareYmd(endB, startA) < 0) return false;
  return true;
}

export function enrollmentAccessibleToActor(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  enrollment: { classId: string; schoolYearId?: string; startDate: string; endDate?: string },
): boolean {
  if (!hasHomeroomMenu(actor)) return false;
  if (isHomeroomOperationalManager(actor) || isHomeroomViewAllUser(actor)) return true;
  return assignments.some((row) => {
    if (String(row.userId) !== String(actor.userId) || !row.active) return false;
    if (!isHomeroomTeacherClassAssignment(row)) return false;
    if (enrollment.schoolYearId && row.schoolYearId !== enrollment.schoolYearId) return false;
    if (row.classId !== enrollment.classId) return false;
    return rangesOverlap(row.effectiveFrom, row.effectiveTo, enrollment.startDate, enrollment.endDate);
  });
}

export function filterEnrollmentsForActor<T extends { classId: string; schoolYearId?: string; startDate: string; endDate?: string }>(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  enrollments: T[],
): T[] {
  return enrollments.filter((row) => enrollmentAccessibleToActor(actor, assignments, row));
}

export function authorizeAccessibleEnrollments<T extends { classId: string; schoolYearId?: string; startDate: string; endDate?: string }>(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  enrollments: T[],
): T[] {
  const accessible = filterEnrollmentsForActor(actor, assignments, enrollments);
  if (!accessible.length) throw new Error(HOMEROOM_SCOPE_FORBIDDEN);
  return accessible;
}

export function actorAssignedToStudentClass(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  enrollments: Array<{ classId: string; schoolYearId?: string; startDate: string; endDate?: string }>,
): boolean {
  if (!hasHomeroomMenu(actor) || isHomeroomOperationalManager(actor) || isHomeroomViewAllUser(actor)) {
    return false;
  }
  return enrollments.some((enrollment) =>
    assignments.some((row) => {
      if (String(row.userId) !== String(actor.userId) || !row.active) return false;
      if (!isHomeroomTeacherClassAssignment(row)) return false;
      if (enrollment.schoolYearId && row.schoolYearId !== enrollment.schoolYearId) return false;
      if (row.scopeKind !== "class" || row.classId !== enrollment.classId) return false;
      return rangesOverlap(row.effectiveFrom, row.effectiveTo, enrollment.startDate, enrollment.endDate);
    }),
  );
}

export function filterStudentAttendanceHistory<
  TDay extends { classId: string; attendanceDate: string; studentId: string; _id?: string },
  TCorrection extends { studentId: string; attendanceDate: string; attendanceDayId?: string },
>(args: {
  actor: HomeroomActor;
  assignments: HomeroomAssignment[];
  enrollments: Array<{ classId: string; schoolYearId?: string; startDate: string; endDate?: string }>;
  days: TDay[];
  corrections: TCorrection[];
  from?: string;
  to?: string;
}): { days: TDay[]; corrections: TCorrection[] } {
  authorizeAccessibleEnrollments(args.actor, args.assignments, args.enrollments);
  const from = args.from ? assertYmd(args.from) : undefined;
  const to = args.to ? assertYmd(args.to) : undefined;
  if (from && to) assertYmdRange(from, to);
  const days = args.days
    .filter((day) => {
      if (from && day.attendanceDate < from) return false;
      if (to && day.attendanceDate > to) return false;
      return canReadClass(args.actor, args.assignments, day.classId, day.attendanceDate);
    })
    .sort((a, b) => a.attendanceDate.localeCompare(b.attendanceDate));
  const authorizedDayIds = new Set(days.map((day) => String(day._id || "")));
  const authorizedKeys = new Set(days.map((day) => `${day.studentId}:${day.attendanceDate}`));
  const corrections = args.corrections.filter((row) => {
    if (row.attendanceDayId && authorizedDayIds.has(String(row.attendanceDayId))) return true;
    return authorizedKeys.has(`${row.studentId}:${row.attendanceDate}`);
  });
  return { days, corrections };
}

export function hasWholeSchoolSupervisorScope(
  actor: HomeroomActor,
  _assignments?: HomeroomAssignment[],
  _args?: { date: string; schoolYearId?: string },
): boolean {
  return isHomeroomOperationalManager(actor);
}

export function canReadClass(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
): boolean {
  if (!hasHomeroomMenu(actor)) return false;
  if (isHomeroomOperationalManager(actor) || isHomeroomViewAllUser(actor)) return true;
  return teacherClassAssignmentsOnDate(actor, assignments, { date, classId }).length > 0;
}

export function canReadClassOnAnyDateInRange(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string | undefined,
  args: { from: string; to: string; schoolYearId?: string },
): boolean {
  if (!hasHomeroomMenu(actor)) return false;
  if (isHomeroomOperationalManager(actor) || isHomeroomViewAllUser(actor)) return true;
  return assignments.some((row) => {
    if (String(row.userId) !== String(actor.userId) || !row.active) return false;
    if (!isHomeroomTeacherClassAssignment(row)) return false;
    if (args.schoolYearId && row.schoolYearId !== args.schoolYearId) return false;
    if (classId && row.classId !== classId) return false;
    return rangesOverlap(row.effectiveFrom, row.effectiveTo, args.from, args.to);
  });
}

export function canMaintainAssignedRoster(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
): boolean {
  if (isHomeroomOperationalManager(actor) || isHomeroomViewAllUser(actor)) return canReadClass(actor, assignments, classId, date);
  return actorAssignmentsOnDate(actor, assignments, { date, classId }).some(
    (row) => row.assignmentType === "homeroom_teacher",
  );
}

export function canUploadCamera(
  actor: HomeroomActor,
  _assignments?: HomeroomAssignment[],
  _classId?: string,
  _date?: string,
): boolean {
  return canImportAttendanceWithoutClassAssignment(actor);
}

/**
 * Absence classification (Có phép / Không phép): the GVCN effective on that
 * attendance date, or an operational manager. Giám thị (attendance menu) only marks
 * present/absent and view_all only reads.
 */
export function canCorrectDisposition(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
): boolean {
  if (!hasHomeroomMenu(actor)) return false;
  if (isHomeroomOperationalManager(actor)) return true;
  if (isHomeroomViewAllUser(actor)) return false;
  return teacherClassAssignmentsOnDate(actor, assignments, { date, classId }).length > 0;
}

/** Only "Vắng" rows can be classified; Có mặt / Trễ stay as observed. */
export const CORRECTABLE_RAW_OBSERVATION = "absent";
export const DISPOSITION_NOT_ABSENT = "DISPOSITION_NOT_ABSENT";
export const DISPOSITION_FORBIDDEN = "DISPOSITION_FORBIDDEN";
export const TEACHER_DISPOSITIONS = ["pending", "excused", "unexcused"] as const;

export function assertDispositionTarget(day: { rawObservation: string }, nextDisposition: string) {
  if (day.rawObservation !== CORRECTABLE_RAW_OBSERVATION) throw new Error(DISPOSITION_NOT_ABSENT);
  if (!(TEACHER_DISPOSITIONS as readonly string[]).includes(nextDisposition)) {
    throw new Error("INVALID_DISPOSITION");
  }
}

/** Admin/Mod and "Xem tối cao" see every class of the year. */
export function canViewWholeSchool(actor: HomeroomActor): boolean {
  return isHomeroomOperationalManager(actor) || isHomeroomViewAllUser(actor);
}

export function resolveOverviewScope(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  args: { date: string; schoolYearId?: string },
): HomeroomClassScope & { mode: "school" | "teacher" } {
  if (hasHomeroomMenu(actor) && canViewWholeSchool(actor)) return { kind: "all", mode: "school" };
  return { ...resolveTeacherOverviewScope(actor, assignments, args), mode: "teacher" };
}

/** GVCN may edit student phone + guardians of the class they currently lead. */
export function canEditStudentContacts(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classIds: string[],
  date: string,
): boolean {
  if (!hasHomeroomMenu(actor)) return false;
  if (isHomeroomOperationalManager(actor)) return true;
  if (isHomeroomViewAllUser(actor)) return false;
  return classIds.some((classId) => teacherClassAssignmentsOnDate(actor, assignments, { date, classId }).length > 0);
}

export function canSeeSensitiveContacts(
  actor: HomeroomActor,
  args: { includeSensitiveContacts?: boolean; assignedToClass?: boolean } = {},
): boolean {
  if (isHomeroomOperationalManager(actor)) return true;
  if (args.assignedToClass && homeroomMenuAccess(actor) === "view") return true;
  return false;
}

export function assertHomeroomActorReady(actor: HomeroomActor) {
  if (actor.status && actor.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (actor.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  if (!hasHomeroomMenu(actor)) throw new Error(HOMEROOM_MENU_HIDDEN);
}

export function assertCanReadClass(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
) {
  assertHomeroomActorReady(actor);
  if (!canReadClass(actor, assignments, classId, date)) {
    throw new Error(HOMEROOM_SCOPE_FORBIDDEN);
  }
}

export function assertCanSupervisorImport(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
) {
  assertHomeroomActorReady(actor);
  if (!canUploadCamera(actor, assignments, classId, date)) {
    throw new Error(SUPERVISOR_REQUIRED);
  }
}

export function assertCanCorrectDisposition(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
) {
  assertHomeroomActorReady(actor);
  if (!canCorrectDisposition(actor, assignments, classId, date)) {
    throw new Error(DISPOSITION_FORBIDDEN);
  }
}

export function assertCanWriteHomeroomCatalog(actor: HomeroomActor) {
  if (actor.status && actor.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (actor.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  if (!canWriteHomeroomCatalog(actor)) throw new Error(HOMEROOM_SCOPE_FORBIDDEN);
}

export function assertCanBulkImportRoster(actor: HomeroomActor) {
  assertCanWriteHomeroomCatalog(actor);
}

export function assertCanListAttendanceImportClasses(actor: HomeroomActor) {
  assertHomeroomActorReady(actor);
  if (!canImportAttendanceWithoutClassAssignment(actor)) {
    throw new Error(SUPERVISOR_REQUIRED);
  }
}

export function assertCanMaintainAssignedRoster(
  actor: HomeroomActor,
  assignments: HomeroomAssignment[],
  classId: string,
  date: string,
) {
  assertHomeroomActorReady(actor);
  if (!canMaintainAssignedRoster(actor, assignments, classId, date)) {
    throw new Error(HOMEROOM_SCOPE_FORBIDDEN);
  }
}

export function assertGuardianBelongsToStudent(
  guardian: { studentId: string },
  studentId: string,
) {
  if (String(guardian.studentId) !== String(studentId)) throw new Error("GUARDIAN_NOT_FOUND");
}
