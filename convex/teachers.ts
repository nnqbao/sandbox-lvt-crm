import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { adminOrThrow, isOperationalManagerRole } from "./lib";
import { homeroomActorOrThrow, loadAssignments, writeAudit } from "./homeroomContext";
import { assignmentCovers, isHomeroomTeacherClassAssignment } from "./homeroomPolicy";
import { classesForYear } from "./homeroomData";
import { assertSchoolYearEditable } from "./homeroomCatalog";
import { sortClassesNatural } from "./classOrder";
import { listSubjectRows } from "./teachingCatalog";
import {
  holidaysForYear,
  profileFor,
  profilesForYear,
  publicYear,
  referenceDate,
  slotsForTeacherYear,
  slotsForYear,
  teacherName,
  yearOrThrow,
} from "./teachingData";
import { slotCoversDate, slotReachesDate } from "./teachingPolicy";

export const TEACHER_SUBJECT_IN_USE = "TEACHER_SUBJECT_IN_USE";
export const TEACHER_SCHEDULE_FORBIDDEN = "TEACHER_SCHEDULE_FORBIDDEN";

/** Previous school year by start date — Môn giảng dạy of a new year defaults to it. */
async function previousYearId(ctx: any, year: { _id: unknown; startDate: string }) {
  const years = await ctx.db.query("schoolYears").collect();
  const earlier = years
    .filter((row: any) => String(row._id) !== String(year._id) && row.startDate < year.startDate)
    .sort((a: any, b: any) => b.startDate.localeCompare(a.startDate));
  return earlier[0] ? String(earlier[0]._id) : "";
}

/**
 * Thiết lập Giáo viên: every active account grouped by phòng ban, with the year's
 * Môn giảng dạy, Lớp giảng dạy (current timetable) and Lớp chủ nhiệm (current GVCN rows).
 */
export const listForYear = query({
  args: { schoolYearId: v.string() },
  handler: async (ctx, args) => {
    await adminOrThrow(ctx);
    const year = await yearOrThrow(ctx, args.schoolYearId);
    const ref = referenceDate(year);
    const [users, departments, classes, slots, assignments, profiles, subjects] = await Promise.all([
      ctx.db.query("users").withIndex("by_status", (q) => q.eq("status", "active")).collect(),
      ctx.db.query("departments").collect(),
      classesForYear(ctx, args.schoolYearId),
      slotsForYear(ctx, args.schoolYearId),
      loadAssignments(ctx, args.schoolYearId),
      profilesForYear(ctx, args.schoolYearId),
      listSubjectRows(ctx),
    ]);
    const prevId = await previousYearId(ctx, year);
    const previousProfiles = prevId ? await profilesForYear(ctx, prevId) : [];
    const classById = new Map(classes.map((row) => [String(row._id), row]));
    const profileByUser = new Map(profiles.map((row) => [row.userId, row]));
    const previousByUser = new Map(previousProfiles.map((row) => [row.userId, row]));
    const activeSubjectIds = new Set(subjects.filter((row) => row.active).map((row) => String(row._id)));
    const classList = (ids: Set<string>) =>
      sortClassesNatural([...ids].map((id) => classById.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row)))
        .map((row) => ({ _id: String(row._id), name: row.name, gradeLevel: row.gradeLevel }));

    const teachers = users.map((user) => {
      const userId = String(user._id);
      const own = profileByUser.get(userId);
      const previous = previousByUser.get(userId);
      const teaching = new Set(slots.filter((slot) => slot.teacherId === userId && slotReachesDate(slot, ref)).map((slot) => slot.classId));
      const homeroom = new Set(
        assignments
          .filter((row) => row.userId === userId && isHomeroomTeacherClassAssignment(row) && assignmentCovers(row, { date: ref }))
          .map((row) => row.classId),
      );
      return {
        _id: userId,
        name: teacherName(user),
        departmentId: user.departmentId || "",
        // Năm chưa lưu môn → lấy lại môn của năm trước (admin chỉnh rồi lưu).
        subjectIds: (own ? own.subjectIds : previous?.subjectIds || []).filter((id) => activeSubjectIds.has(id)),
        subjectsInherited: !own && Boolean(previous?.subjectIds.length),
        teachingClasses: classList(teaching),
        homeroomClasses: classList(homeroom),
      };
    });
    teachers.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    return {
      year: publicYear(year),
      departments: departments
        .filter((row) => row.active)
        .map((row) => ({ _id: String(row._id), name: row.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "vi")),
      teachers,
    };
  },
});

export const setSubjects = mutation({
  args: { schoolYearId: v.string(), userId: v.string(), subjectIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const admin = await adminOrThrow(ctx);
    const year = await yearOrThrow(ctx, args.schoolYearId);
    assertSchoolYearEditable(year);
    const userId = ctx.db.normalizeId("users", args.userId);
    const user = userId ? await ctx.db.get(userId) : null;
    if (!user || user.status !== "active") throw new Error("USER_NOT_FOUND");
    const subjects = await listSubjectRows(ctx);
    const active = new Set(subjects.filter((row) => row.active).map((row) => String(row._id)));
    const subjectIds = [...new Set(args.subjectIds)];
    if (subjectIds.some((id) => !active.has(id))) throw new Error("SUBJECT_NOT_FOUND");
    // Bỏ một môn mà giáo viên vẫn còn tiết hiện tại / sắp tới → phải đổi lịch dạy trước.
    const ref = referenceDate(year);
    const slots = await slotsForTeacherYear(ctx, args.userId, args.schoolYearId);
    if (slots.some((slot) => slotReachesDate(slot, ref) && !subjectIds.includes(slot.subjectId))) {
      throw new Error(TEACHER_SUBJECT_IN_USE);
    }
    const now = Date.now();
    const existing = await profileFor(ctx, args.schoolYearId, args.userId);
    if (existing) {
      await ctx.db.patch(existing._id, { subjectIds, updatedBy: String(admin._id), updatedAt: now });
    } else {
      await ctx.db.insert("teacherYearProfiles", {
        schoolYearId: args.schoolYearId,
        userId: args.userId,
        subjectIds,
        updatedBy: String(admin._id),
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeAudit(ctx, {
      actorUserId: String(admin._id),
      action: "teacher.setSubjects",
      targetUserId: args.userId,
      details: JSON.stringify({ schoolYearId: args.schoolYearId, subjectIds }),
    });
  },
});

/**
 * Lịch dạy cả năm của một giáo viên (slots + ngày nghỉ; client trải ra Danh sách/Tuần/Tháng/Quý/Năm).
 * Admin/mod xem được mọi giáo viên; người khác chỉ xem lịch của chính mình.
 */
export const schedule = query({
  args: { schoolYearId: v.string(), teacherId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { user } = await homeroomActorOrThrow(ctx);
    const teacherId = args.teacherId || String(user._id);
    if (teacherId !== String(user._id) && !isOperationalManagerRole(user.role)) {
      throw new Error(TEACHER_SCHEDULE_FORBIDDEN);
    }
    const year = await yearOrThrow(ctx, args.schoolYearId);
    const teacherDocId = ctx.db.normalizeId("users", teacherId);
    const teacher = teacherDocId ? await ctx.db.get(teacherDocId) : null;
    if (!teacher) throw new Error("USER_NOT_FOUND");
    const [slots, holidays, classes] = await Promise.all([
      slotsForTeacherYear(ctx, teacherId, args.schoolYearId),
      holidaysForYear(ctx, args.schoolYearId),
      classesForYear(ctx, args.schoolYearId),
    ]);
    const used = new Set(slots.map((slot) => slot.classId));
    const today = referenceDate(year);
    return {
      year: publicYear(year),
      teacher: { _id: teacherId, name: teacherName(teacher) },
      holidays,
      slots,
      currentSlotCount: slots.filter((slot) => slotCoversDate(slot, today)).length,
      classes: classes
        .filter((row) => used.has(String(row._id)))
        .map((row) => ({ _id: String(row._id), name: row.name, gradeLevel: row.gradeLevel })),
    };
  },
});
