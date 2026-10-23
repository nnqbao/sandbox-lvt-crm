import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { adminOrThrow, isOperationalManagerRole } from "./lib";
import { homeroomActorOrThrow, loadAssignments, writeAudit } from "./homeroomContext";
import { assertClassNotArchived, assignmentCovers, isHomeroomTeacherClassAssignment } from "./homeroomPolicy";
import { assignmentsForClass, classesForYear, getClassById } from "./homeroomData";
import { assertSchoolYearEditable, planHomeroomTeacherEnd } from "./homeroomCatalog";
import { sortClassesNatural } from "./classOrder";
import { listSubjectRows } from "./teachingCatalog";
import {
  effectiveTeachingClassIds,
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
export const TEACHER_CLASS_IN_USE = "TEACHER_CLASS_IN_USE";
export const TEACHER_SUBJECTS_REQUIRED = "TEACHER_SUBJECTS_REQUIRED";

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
 * Môn giảng dạy, Lớp giảng dạy (admin's list, else the current timetable) and Lớp chủ nhiệm
 * (current GVCN rows), plus the year's classes for the quick pickers.
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
      const teaching = new Set(effectiveTeachingClassIds(own, slots.filter((slot) => slot.teacherId === userId), ref));
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
      // Danh sách lớp cho ô chọn nhanh Lớp giảng dạy / Lớp chủ nhiệm (kèm GVCN hiện tại).
      classes: sortClassesNatural(classes.filter((row) => row.status === "active")).map((row) => {
        const gvcn = assignments.find(
          (item) => item.classId === String(row._id) && isHomeroomTeacherClassAssignment(item) && assignmentCovers(item, { date: ref }),
        );
        return {
          _id: String(row._id),
          name: row.name,
          gradeLevel: row.gradeLevel,
          homeroomTeacherId: gvcn?.userId || "",
          homeroomTeacherName: gvcn ? teacherName(users.find((user) => String(user._id) === gvcn.userId)) : "",
        };
      }),
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

async function activeTeacherOrThrow(ctx: any, userId: string) {
  const id = ctx.db.normalizeId("users", userId);
  const user = id ? await ctx.db.get(id) : null;
  if (!user || user.status !== "active") throw new Error("USER_NOT_FOUND");
  return user;
}

/**
 * Lớp giảng dạy (chọn nhanh ở Thiết lập giáo viên). Thêm lịch dạy và Thiết lập lịch dạy chỉ
 * xếp giáo viên vào các lớp này. Không bỏ được lớp mà giáo viên còn tiết hiện tại / sắp tới.
 */
export const setTeachingClasses = mutation({
  args: { schoolYearId: v.string(), userId: v.string(), classIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const admin = await adminOrThrow(ctx);
    const year = await yearOrThrow(ctx, args.schoolYearId);
    assertSchoolYearEditable(year);
    await activeTeacherOrThrow(ctx, args.userId);
    const classIds = [...new Set(args.classIds)];
    const classes = new Map((await classesForYear(ctx, args.schoolYearId)).map((row) => [String(row._id), row]));
    for (const id of classIds) {
      const row = classes.get(id);
      if (!row) throw new Error("CLASS_NOT_FOUND");
      assertClassNotArchived(row);
    }
    const ref = referenceDate(year);
    const slots = await slotsForTeacherYear(ctx, args.userId, args.schoolYearId);
    if (slots.some((slot) => slotReachesDate(slot, ref) && !classIds.includes(slot.classId))) {
      throw new Error(TEACHER_CLASS_IN_USE);
    }
    const now = Date.now();
    const existing = await profileFor(ctx, args.schoolYearId, args.userId);
    // Phải có Môn giảng dạy (của năm, hoặc kế thừa năm trước) trước khi nhận lớp.
    const prevYearId = existing ? "" : await previousYearId(ctx, year);
    const inheritedSubjects = prevYearId ? (await profileFor(ctx, prevYearId, args.userId))?.subjectIds || [] : [];
    const subjectIds = existing ? existing.subjectIds : inheritedSubjects;
    if (classIds.length && !subjectIds.length) throw new Error(TEACHER_SUBJECTS_REQUIRED);
    if (existing) {
      await ctx.db.patch(existing._id, { teachingClassIds: classIds, updatedBy: String(admin._id), updatedAt: now });
    } else {
      // Hồ sơ năm mới: giữ Môn giảng dạy kế thừa từ năm trước.
      await ctx.db.insert("teacherYearProfiles", {
        schoolYearId: args.schoolYearId,
        userId: args.userId,
        subjectIds,
        teachingClassIds: classIds,
        updatedBy: String(admin._id),
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeAudit(ctx, {
      actorUserId: String(admin._id),
      action: "teacher.setTeachingClasses",
      targetUserId: args.userId,
      details: JSON.stringify({ schoolYearId: args.schoolYearId, classIds }),
    });
  },
});

/**
 * Lớp chủ nhiệm (chọn nhanh): giáo viên làm GVCN lớp `classId` từ hôm nay (thay GVCN cũ của lớp
 * nếu có) và thôi chủ nhiệm các lớp khác của năm. `classId` rỗng = thôi chủ nhiệm.
 * Lịch sử phân công được giữ (dòng cũ kết thúc hôm qua), giống Quản lý lớp.
 */
export const setHomeroomClass = mutation({
  args: { schoolYearId: v.string(), userId: v.string(), classId: v.string() },
  handler: async (ctx, args) => {
    const admin = await adminOrThrow(ctx);
    const year = await yearOrThrow(ctx, args.schoolYearId);
    assertSchoolYearEditable(year);
    await activeTeacherOrThrow(ctx, args.userId);
    const date = referenceDate(year);
    const now = Date.now();
    const endRow = async (row: any) => {
      // Dòng bắt đầu từ hôm nay trở đi: thu hồi; dòng đang chạy: kết thúc hôm qua.
      const plan = row.effectiveFrom >= date
        ? { patch: { active: false } }
        : planHomeroomTeacherEnd({ assignment: row, date });
      await ctx.db.patch(row._id, { ...plan.patch, endedBy: String(admin._id), updatedAt: now });
    };
    const current = (await loadAssignments(ctx, args.schoolYearId)).filter(
      (row) => row.userId === args.userId && isHomeroomTeacherClassAssignment(row) && assignmentCovers(row, { date }),
    );
    for (const row of current) {
      if (row.classId === args.classId) continue;
      const doc = (await assignmentsForClass(ctx, row.classId)).find(
        (item) => item.userId === args.userId && item.active && item.effectiveFrom === row.effectiveFrom,
      );
      if (doc) await endRow(doc);
    }
    if (args.classId && !current.some((row) => row.classId === args.classId)) {
      const klass = await getClassById(ctx, args.classId);
      if (!klass || klass.schoolYearId !== args.schoolYearId) throw new Error("CLASS_NOT_FOUND");
      assertClassNotArchived(klass);
      for (const row of await assignmentsForClass(ctx, args.classId)) {
        if (!row.active || row.assignmentType !== "homeroom_teacher") continue;
        if (row.effectiveTo && row.effectiveTo < date) continue;
        await endRow(row);
      }
      await ctx.db.insert("homeroomAssignments", {
        classId: args.classId,
        schoolYearId: args.schoolYearId,
        userId: args.userId,
        assignmentType: "homeroom_teacher",
        scopeKind: "class",
        effectiveFrom: date,
        active: true,
        createdBy: String(admin._id),
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeAudit(ctx, {
      actorUserId: String(admin._id),
      action: "teacher.setHomeroomClass",
      targetUserId: args.userId,
      details: JSON.stringify({ schoolYearId: args.schoolYearId, classId: args.classId || null, from: date }),
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
    const [slots, holidays, classes, profile] = await Promise.all([
      slotsForTeacherYear(ctx, teacherId, args.schoolYearId),
      holidaysForYear(ctx, args.schoolYearId),
      classesForYear(ctx, args.schoolYearId),
      profileFor(ctx, args.schoolYearId, teacherId),
    ]);
    const used = new Set([...slots.map((slot) => slot.classId), ...(profile?.teachingClassIds || [])]);
    const today = referenceDate(year);
    return {
      year: publicYear(year),
      teacher: { _id: teacherId, name: teacherName(teacher) },
      holidays,
      slots,
      currentSlotCount: slots.filter((slot) => slotCoversDate(slot, today)).length,
      teachingClassIds: effectiveTeachingClassIds(profile, slots, today),
      classes: classes
        .filter((row) => used.has(String(row._id)))
        .map((row) => ({ _id: String(row._id), name: row.name, gradeLevel: row.gradeLevel })),
    };
  },
});
