/**
 * Index-backed reads for the homeroom module.
 *
 * Every attendance/enrollment read must go through an index — full-table
 * `.collect()` on `studentAttendanceDays` grows with (students × school days)
 * and breaks Convex read limits within weeks of real use.
 */
import type { Id } from "./_generated/dataModel";
import type { DbCtx } from "./lib";
import { enrollmentsCoveringDate } from "./homeroomCatalog";

export async function classesForYear(ctx: DbCtx, schoolYearId: string) {
  return await ctx.db
    .query("homeroomClasses")
    .withIndex("by_year", (q) => q.eq("schoolYearId", schoolYearId))
    .collect();
}

export async function getClassById(ctx: DbCtx, classId: string) {
  const id = ctx.db.normalizeId("homeroomClasses", classId);
  return id ? await ctx.db.get(id) : null;
}

export async function getStudentById(ctx: DbCtx, studentId: string) {
  const id = ctx.db.normalizeId("students", studentId);
  return id ? await ctx.db.get(id) : null;
}

export async function getYearById(ctx: DbCtx, schoolYearId: string) {
  const id = ctx.db.normalizeId("schoolYears", schoolYearId);
  return id ? await ctx.db.get(id) : null;
}

export async function enrollmentsForClass(ctx: DbCtx, classId: string) {
  return await ctx.db
    .query("classEnrollments")
    .withIndex("by_class_status", (q) => q.eq("classId", classId))
    .collect();
}

export async function enrollmentsForClassOnDate(ctx: DbCtx, classId: string, date: string) {
  return enrollmentsCoveringDate(await enrollmentsForClass(ctx, classId), { classId, date });
}

export async function enrollmentsForYear(ctx: DbCtx, schoolYearId: string) {
  return await ctx.db
    .query("classEnrollments")
    .withIndex("by_year_status", (q) => q.eq("schoolYearId", schoolYearId))
    .collect();
}

export async function enrollmentsForStudent(ctx: DbCtx, studentId: string, schoolYearId?: string) {
  return await ctx.db
    .query("classEnrollments")
    .withIndex("by_student_year", (q) =>
      schoolYearId ? q.eq("studentId", studentId).eq("schoolYearId", schoolYearId) : q.eq("studentId", studentId),
    )
    .collect();
}

export async function assignmentsForClass(ctx: DbCtx, classId: string) {
  return await ctx.db
    .query("homeroomAssignments")
    .withIndex("by_class_type", (q) => q.eq("classId", classId).eq("assignmentType", "homeroom_teacher"))
    .collect();
}

export async function daysForClassOnDate(ctx: DbCtx, classId: string, date: string) {
  return await ctx.db
    .query("studentAttendanceDays")
    .withIndex("by_class_date", (q) => q.eq("classId", classId).eq("attendanceDate", date))
    .collect();
}

export async function daysForClassRange(ctx: DbCtx, classId: string, from: string, to: string) {
  return await ctx.db
    .query("studentAttendanceDays")
    .withIndex("by_class_date", (q) => q.eq("classId", classId).gte("attendanceDate", from).lte("attendanceDate", to))
    .collect();
}

export async function daysForYearOnDate(ctx: DbCtx, schoolYearId: string, date: string) {
  return await ctx.db
    .query("studentAttendanceDays")
    .withIndex("by_year_date", (q) => q.eq("schoolYearId", schoolYearId).eq("attendanceDate", date))
    .collect();
}

export async function daysForYearRange(ctx: DbCtx, schoolYearId: string, from: string, to: string) {
  return await ctx.db
    .query("studentAttendanceDays")
    .withIndex("by_year_date", (q) =>
      q.eq("schoolYearId", schoolYearId).gte("attendanceDate", from).lte("attendanceDate", to),
    )
    .collect();
}

export async function daysForStudent(ctx: DbCtx, studentId: string, from?: string, to?: string) {
  return await ctx.db
    .query("studentAttendanceDays")
    .withIndex("by_student_date", (q) => {
      const base = q.eq("studentId", studentId);
      if (from && to) return base.gte("attendanceDate", from).lte("attendanceDate", to);
      if (from) return base.gte("attendanceDate", from);
      if (to) return base.lte("attendanceDate", to);
      return base;
    })
    .collect();
}

export async function pendingDaysForYear(ctx: DbCtx, schoolYearId: string) {
  return await ctx.db
    .query("studentAttendanceDays")
    .withIndex("by_year_status_date", (q) => q.eq("schoolYearId", schoolYearId).eq("effectiveStatus", "absent_pending"))
    .collect();
}

export async function pendingDaysForClass(ctx: DbCtx, classId: string) {
  return await ctx.db
    .query("studentAttendanceDays")
    .withIndex("by_class_status_date", (q) => q.eq("classId", classId).eq("effectiveStatus", "absent_pending"))
    .collect();
}

/** Điểm danh "đã lưu" markers (one per class/day) written by Giám thị or admin/mod. */
export async function classDayMarker(ctx: DbCtx, classId: string, date: string) {
  return await ctx.db
    .query("attendanceClassDays")
    .withIndex("by_class_date", (q) => q.eq("classId", classId).eq("attendanceDate", date))
    .first();
}

export async function classDayMarkersForYearOnDate(ctx: DbCtx, schoolYearId: string, date: string) {
  return await ctx.db
    .query("attendanceClassDays")
    .withIndex("by_year_date", (q) => q.eq("schoolYearId", schoolYearId).eq("attendanceDate", date))
    .collect();
}

export async function correctionsForStudent(ctx: DbCtx, studentId: string) {
  return await ctx.db
    .query("studentAttendanceCorrections")
    .withIndex("by_student_date", (q) => q.eq("studentId", studentId))
    .collect();
}

export async function activeGuardiansForStudent(ctx: DbCtx, studentId: string) {
  return await ctx.db
    .query("studentGuardians")
    .withIndex("by_student_active", (q) => q.eq("studentId", studentId).eq("active", true))
    .collect();
}

export async function calendarDayFor(ctx: DbCtx, schoolYearId: string, date: string) {
  return await ctx.db
    .query("schoolCalendarDays")
    .withIndex("by_year_date", (q) => q.eq("schoolYearId", schoolYearId).eq("date", date))
    .unique();
}

export async function calendarDaysForYear(ctx: DbCtx, schoolYearId: string, from?: string, to?: string) {
  return await ctx.db
    .query("schoolCalendarDays")
    .withIndex("by_year_date", (q) => {
      const base = q.eq("schoolYearId", schoolYearId);
      if (from && to) return base.gte("date", from).lte("date", to);
      return base;
    })
    .collect();
}

export async function importRowsFor(ctx: DbCtx, importId: string) {
  return await ctx.db
    .query("attendanceImportRows")
    .withIndex("by_import", (q) => q.eq("importId", importId))
    .collect();
}

/** Loads students by id with one point read each (no table scan). */
export async function studentsByIds(ctx: DbCtx, ids: Iterable<string>) {
  const map = new Map<string, NonNullable<Awaited<ReturnType<typeof getStudentById>>>>();
  for (const id of new Set(ids)) {
    const student = await getStudentById(ctx, id);
    if (student) map.set(String(student._id), student);
  }
  return map;
}

export async function usersByIds(ctx: DbCtx, ids: Iterable<string>) {
  const map = new Map<string, { _id: string; name: string; role: string }>();
  for (const id of new Set(ids)) {
    const normalized = ctx.db.normalizeId("users", id);
    const user = normalized ? await ctx.db.get(normalized) : null;
    if (user) map.set(String(user._id), { _id: String(user._id), name: user.name || user.email || "", role: user.role });
  }
  return map;
}

export type ClassDoc = NonNullable<Awaited<ReturnType<typeof getClassById>>>;
export type StudentDoc = NonNullable<Awaited<ReturnType<typeof getStudentById>>>;
export type AttendanceDayId = Id<"studentAttendanceDays">;
