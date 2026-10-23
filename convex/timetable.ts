import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { adminOrThrow, type DbCtx } from "./lib";
import { writeAudit } from "./homeroomContext";
import { assertClassNotArchived } from "./homeroomPolicy";
import { assertSchoolYearEditable } from "./homeroomCatalog";
import { classesForYear, getClassById } from "./homeroomData";
import { assertYmd } from "./homeroomTime";
import { listSubjectRows } from "./teachingCatalog";
import {
  holidaysForYear,
  profileFor,
  profilesForYear,
  publicYear,
  referenceDate,
  slotsForClass,
  slotsForTeacherYear,
  slotsForYear,
  teacherName,
  yearOrThrow,
} from "./teachingData";
import {
  assertTimetableCell,
  cellKey,
  findTeacherConflict,
  planCellChange,
  sameCell,
  slotCoversDate,
  TIMETABLE_CELL_CHANGED,
  TIMETABLE_DATE_OUTSIDE_YEAR,
  TIMETABLE_SUBJECT_NOT_TAUGHT,
  TIMETABLE_TEACHER_CONFLICT,
} from "./teachingPolicy";

const MAX_CHANGES = 50; // 5 ngày × 10 tiết

async function previousYearOf(ctx: DbCtx, year: { _id: unknown; startDate: string }) {
  const years = await ctx.db.query("schoolYears").collect();
  return years
    .filter((row) => String(row._id) !== String(year._id) && row.startDate < year.startDate)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

/** Môn giảng dạy hiệu lực: hồ sơ của năm, hoặc kế thừa năm trước khi năm này chưa lưu. */
async function effectiveSubjectIds(ctx: DbCtx, year: { _id: unknown; startDate: string }, userId: string) {
  const own = await profileFor(ctx, String(year._id), userId);
  if (own) return own.subjectIds;
  const previous = await previousYearOf(ctx, year);
  if (!previous) return [];
  return (await profileFor(ctx, String(previous._id), userId))?.subjectIds || [];
}

/** Editor data for one class (Thiết lập Lịch dạy / Thêm lịch dạy cho giáo viên). Admin only. */
export const classTimetable = query({
  args: { classId: v.string() },
  handler: async (ctx, args) => {
    await adminOrThrow(ctx);
    const klass = await getClassById(ctx, args.classId);
    if (!klass) throw new Error("CLASS_NOT_FOUND");
    const year = await yearOrThrow(ctx, klass.schoolYearId);
    const [slots, yearSlots, holidays, users, profiles, subjects, classes, previous] = await Promise.all([
      slotsForClass(ctx, args.classId),
      slotsForYear(ctx, klass.schoolYearId),
      holidaysForYear(ctx, klass.schoolYearId),
      ctx.db.query("users").withIndex("by_status", (q) => q.eq("status", "active")).collect(),
      profilesForYear(ctx, klass.schoolYearId),
      listSubjectRows(ctx),
      classesForYear(ctx, klass.schoolYearId),
      previousYearOf(ctx, year),
    ]);
    const previousProfiles = previous ? await profilesForYear(ctx, String(previous._id)) : [];
    const own = new Map(profiles.map((row) => [row.userId, row.subjectIds]));
    const inherited = new Map(previousProfiles.map((row) => [row.userId, row.subjectIds]));
    const activeSubjects = new Set(subjects.filter((row) => row.active).map((row) => String(row._id)));
    const teachers = users
      .map((user) => {
        const id = String(user._id);
        const subjectIds = (own.get(id) || inherited.get(id) || []).filter((sid) => activeSubjects.has(sid));
        return { _id: id, name: teacherName(user), departmentId: user.departmentId || "", subjectIds };
      })
      .filter((row) => row.subjectIds.length)
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
    const names = new Map(users.map((user) => [String(user._id), teacherName(user)]));
    for (const slot of slots) {
      if (!names.has(slot.teacherId)) {
        const id = ctx.db.normalizeId("users", slot.teacherId);
        names.set(slot.teacherId, teacherName(id ? await ctx.db.get(id) : null));
      }
    }
    return {
      class: { _id: String(klass._id), name: klass.name, gradeLevel: klass.gradeLevel, status: klass.status },
      year: publicYear(year),
      today: referenceDate(year),
      holidays,
      slots: slots.map((slot) => ({ ...slot, teacherName: names.get(slot.teacherId) || "" })),
      // Tiết của giáo viên ở lớp khác (để báo trùng giờ ngay trên lưới).
      busy: yearSlots
        .filter((slot) => slot.classId !== args.classId)
        .map((slot) => ({
          teacherId: slot.teacherId,
          classId: slot.classId,
          weekday: slot.weekday,
          session: slot.session,
          period: slot.period,
          effectiveFrom: slot.effectiveFrom,
          effectiveTo: slot.effectiveTo,
        })),
      classNames: Object.fromEntries(classes.map((row) => [String(row._id), row.name])),
      teachers,
      subjects: subjects.map((row) => ({ _id: String(row._id), name: row.name, active: row.active })),
    };
  },
});

/**
 * Đổi các ô thời khóa biểu của một lớp, áp dụng từ `effectiveFrom` trở đi (lịch trước ngày đó giữ nguyên).
 * `expectedTeacherId` ("" = ô trống) chặn ghi đè khi người khác vừa đổi ô đó.
 */
export const applyChanges = mutation({
  args: {
    classId: v.string(),
    effectiveFrom: v.string(),
    changes: v.array(
      v.object({
        weekday: v.number(),
        session: v.string(),
        period: v.number(),
        teacherId: v.optional(v.string()),
        subjectId: v.optional(v.string()),
        expectedTeacherId: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const admin = await adminOrThrow(ctx);
    if (!args.changes.length) return { changed: 0 };
    if (args.changes.length > MAX_CHANGES) throw new Error("INVALID_TIMETABLE_CELL");
    const klass = await getClassById(ctx, args.classId);
    if (!klass) throw new Error("CLASS_NOT_FOUND");
    assertClassNotArchived(klass);
    const year = await yearOrThrow(ctx, klass.schoolYearId);
    assertSchoolYearEditable(year);
    const effectiveFrom = assertYmd(args.effectiveFrom);
    if (effectiveFrom < year.startDate || effectiveFrom > year.endDate) throw new Error(TIMETABLE_DATE_OUTSIDE_YEAR);

    const seen = new Set<string>();
    const classSlots = await slotsForClass(ctx, args.classId);
    const subjects = new Map((await listSubjectRows(ctx)).map((row) => [String(row._id), row]));
    const teacherCache = new Map<string, { subjectIds: string[]; slots: Awaited<ReturnType<typeof slotsForTeacherYear>> }>();
    const now = Date.now();
    let changed = 0;

    for (const change of args.changes) {
      const cell = assertTimetableCell(change);
      const key = cellKey(cell);
      if (seen.has(key)) throw new Error("INVALID_TIMETABLE_CELL");
      seen.add(key);
      const rows = classSlots.filter((slot) => sameCell(slot, cell));
      if (change.expectedTeacherId !== undefined) {
        const current = rows.find((slot) => slotCoversDate(slot, effectiveFrom));
        if ((current?.teacherId || "") !== change.expectedTeacherId) throw new Error(TIMETABLE_CELL_CHANGED);
      }
      let next: { teacherId: string; subjectId: string } | null = null;
      if (change.teacherId) {
        const teacherDocId = ctx.db.normalizeId("users", change.teacherId);
        const teacher = teacherDocId ? await ctx.db.get(teacherDocId as Id<"users">) : null;
        if (!teacher || teacher.status !== "active") throw new Error("USER_NOT_FOUND");
        let info = teacherCache.get(change.teacherId);
        if (!info) {
          info = {
            subjectIds: await effectiveSubjectIds(ctx, year, change.teacherId),
            slots: await slotsForTeacherYear(ctx, change.teacherId, klass.schoolYearId),
          };
          teacherCache.set(change.teacherId, info);
        }
        const subjectId = change.subjectId || (info.subjectIds.length === 1 ? info.subjectIds[0] : "");
        if (!subjectId || !info.subjectIds.includes(subjectId) || !subjects.get(subjectId)?.active) {
          throw new Error(TIMETABLE_SUBJECT_NOT_TAUGHT);
        }
        if (findTeacherConflict(info.slots, cell, effectiveFrom, args.classId)) {
          throw new Error(TIMETABLE_TEACHER_CONFLICT);
        }
        next = { teacherId: change.teacherId, subjectId };
      }
      const plan = planCellChange(rows, effectiveFrom, next);
      if (!plan.changed) continue;
      for (const id of plan.deletes) await ctx.db.delete(id as Id<"timetableSlots">);
      for (const end of plan.ends) await ctx.db.patch(end.id as Id<"timetableSlots">, { effectiveTo: end.effectiveTo, updatedAt: now });
      if (plan.insert) {
        await ctx.db.insert("timetableSlots", {
          schoolYearId: klass.schoolYearId,
          classId: args.classId,
          ...cell,
          teacherId: plan.insert.teacherId,
          subjectId: plan.insert.subjectId,
          effectiveFrom,
          createdBy: String(admin._id),
          createdAt: now,
          updatedAt: now,
        });
      }
      changed += 1;
    }
    if (changed) {
      await writeAudit(ctx, {
        actorUserId: String(admin._id),
        action: "timetable.applyChanges",
        details: JSON.stringify({ classId: args.classId, effectiveFrom, changed }),
      });
    }
    return { changed };
  },
});
