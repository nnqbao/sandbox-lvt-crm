/** Index-backed loaders shared by teachers / timetable / lessonLogs / gradebook. */
import type { DbCtx } from "./lib";
import { getYearById } from "./homeroomData";
import { vietnamDateFromUtcMs } from "./homeroomTime";
import { holidaySet, type TimetableSlot } from "./teachingPolicy";

export function toSlot(row: {
  _id: unknown;
  classId: string;
  weekday: number;
  session: string;
  period: number;
  teacherId: string;
  subjectId: string;
  effectiveFrom: string;
  effectiveTo?: string;
}): TimetableSlot & { _id: string } {
  return {
    _id: String(row._id),
    classId: row.classId,
    weekday: row.weekday,
    session: row.session,
    period: row.period,
    teacherId: row.teacherId,
    subjectId: row.subjectId,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  };
}

export async function slotsForClass(ctx: DbCtx, classId: string) {
  const rows = await ctx.db.query("timetableSlots").withIndex("by_class", (q) => q.eq("classId", classId)).collect();
  return rows.map(toSlot);
}

export async function slotsForTeacherYear(ctx: DbCtx, teacherId: string, schoolYearId: string) {
  const rows = await ctx.db
    .query("timetableSlots")
    .withIndex("by_teacher_year", (q) => q.eq("teacherId", teacherId).eq("schoolYearId", schoolYearId))
    .collect();
  return rows.map(toSlot);
}

export async function slotsForYear(ctx: DbCtx, schoolYearId: string) {
  const rows = await ctx.db.query("timetableSlots").withIndex("by_year", (q) => q.eq("schoolYearId", schoolYearId)).collect();
  return rows.map(toSlot);
}

export async function profilesForYear(ctx: DbCtx, schoolYearId: string) {
  return await ctx.db
    .query("teacherYearProfiles")
    .withIndex("by_year_user", (q) => q.eq("schoolYearId", schoolYearId))
    .collect();
}

export async function profileFor(ctx: DbCtx, schoolYearId: string, userId: string) {
  return await ctx.db
    .query("teacherYearProfiles")
    .withIndex("by_year_user", (q) => q.eq("schoolYearId", schoolYearId).eq("userId", userId))
    .unique();
}

export async function holidaysForYear(ctx: DbCtx, schoolYearId: string) {
  const rows = await ctx.db
    .query("schoolCalendarDays")
    .withIndex("by_year_date", (q) => q.eq("schoolYearId", schoolYearId))
    .collect();
  return [...holidaySet(rows)].sort();
}

export async function yearOrThrow(ctx: DbCtx, schoolYearId: string) {
  const year = await getYearById(ctx, schoolYearId);
  if (!year) throw new Error("SCHOOL_YEAR_NOT_FOUND");
  return year;
}

export function publicYear(year: { _id: unknown; name: string; startDate: string; endDate: string; semester2StartDate?: string; lockedAt?: number }) {
  return {
    _id: String(year._id),
    name: year.name,
    startDate: year.startDate,
    endDate: year.endDate,
    semester2StartDate: year.semester2StartDate || "",
    locked: Boolean(year.lockedAt),
  };
}

/** Today clamped into the school year: the date whose timetable / GVCN counts as "current". */
export function referenceDate(year: { startDate: string; endDate: string }, now = Date.now()) {
  const today = vietnamDateFromUtcMs(now);
  if (today < year.startDate) return year.startDate;
  if (today > year.endDate) return year.endDate;
  return today;
}

/** Display name only — never fall back to the e-mail address. */
export function teacherName(user: { name?: string | null } | null | undefined) {
  return String(user?.name || "").trim() || "Người dùng không còn hoạt động";
}

export async function userNames(ctx: DbCtx, ids: Iterable<string>) {
  const map = new Map<string, string>();
  const unique = [...new Set(ids)].filter(Boolean);
  const users = await Promise.all(
    unique.map((id) => {
      const normalized = ctx.db.normalizeId("users", id);
      return normalized ? ctx.db.get(normalized) : null;
    }),
  );
  unique.forEach((id, index) => map.set(id, teacherName(users[index])));
  return map;
}
