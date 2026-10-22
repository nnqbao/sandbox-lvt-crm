import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  assertSingleActiveEnrollment,
  assertSchoolYearEditable,
  enrollmentsCoveringDate,
  findDuplicateClassCode,
  findOverlappingHomeroomTeacher,
  HOMEROOM_TEACHER_OVERLAP,
  isActiveAssignmentCandidate,
  planHomeroomTeacherEnd,
  planHomeroomTeacherReplacement,
  planStudentTransfer,
  toAssignmentCandidate,
  toSafeAssignmentUser,
  validateClassInput,
} from "./homeroomCatalog";
import {
  assertClassReadable,
  homeroomActorOrThrow,
  homeroomCatalogWriterOrThrow,
  loadAssignments,
  writeAudit,
} from "./homeroomContext";
import {
  assertCanIncludeArchivedClasses,
  assertCanListAttendanceImportClasses,
  assertClassNotArchived,
  assertHomeroomTeacherAssignmentInput,
  canCorrectDisposition,
  canEditStudentContacts,
  canImportAttendanceWithoutClassAssignment,
  canWriteHomeroomCatalog,
  classIncludedInScopedList,
  classVisibleInScope,
  findEffectiveHomeroomTeacherAssignment,
  resolveAttendanceImportClassScope,
  resolveCatalogScope,
  resolveClassScope,
} from "./homeroomPolicy";
import { addDaysYmd, assertYmd, compareYmd, vietnamDateFromUtcMs } from "./homeroomTime";
import {
  assignmentsForClass,
  classesForYear,
  enrollmentsForClass,
  enrollmentsForStudent,
  enrollmentsForYear,
  getClassById,
  getYearById,
  usersByIds,
} from "./homeroomData";
import { sortClassesNatural } from "./classOrder";

const sortByGradeAndCode = sortClassesNatural;

export const listScoped = query({
  args: {
    schoolYearId: v.string(),
    date: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    if (args.includeArchived) assertCanIncludeArchivedClasses(actor);
    const date = args.date ? assertYmd(args.date) : vietnamDateFromUtcMs(Date.now());
    const classes = await classesForYear(ctx, args.schoolYearId);
    const enrollments = await enrollmentsForYear(ctx, args.schoolYearId);
    const assignments = await loadAssignments(ctx, args.schoolYearId);
    const scope = resolveClassScope(actor, assignments, { date, schoolYearId: args.schoolYearId });
    return sortByGradeAndCode(
      classes
        .filter((row) => classIncludedInScopedList(row, { includeArchived: args.includeArchived }))
        .filter((row) => classVisibleInScope(String(row._id), scope)),
    ).map((row) => ({
      ...row,
      rosterCount: enrollmentsCoveringDate(enrollments, { classId: String(row._id), date }).length,
    }));
  },
});

export const listCatalog = query({
  args: {
    schoolYearId: v.string(),
    date: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { actor } = await homeroomCatalogWriterOrThrow(ctx);
    if (args.includeArchived) assertCanIncludeArchivedClasses(actor);
    const date = args.date ? assertYmd(args.date) : vietnamDateFromUtcMs(Date.now());
    const scope = resolveCatalogScope(actor);
    const classes = await classesForYear(ctx, args.schoolYearId);
    const enrollments = await enrollmentsForYear(ctx, args.schoolYearId);
    const assignments = await loadAssignments(ctx, args.schoolYearId);
    const users = await usersByIds(ctx, assignments.map((row) => row.userId));
    return sortByGradeAndCode(
      classes
        .filter((row) => classIncludedInScopedList(row, { includeArchived: args.includeArchived }))
        .filter((row) => classVisibleInScope(String(row._id), scope)),
    ).map((row) => {
      const current = findEffectiveHomeroomTeacherAssignment(assignments, { classId: String(row._id), date });
      const upcoming = assignments
        .filter(
          (item) =>
            item.classId === String(row._id)
            && item.active
            && item.assignmentType === "homeroom_teacher"
            && item.effectiveFrom > date,
        )
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
      return {
        ...row,
        rosterCount: enrollmentsCoveringDate(enrollments, { classId: String(row._id), date }).length,
        currentHomeroomTeacher: current
          ? { ...current, user: toSafeAssignmentUser(users.get(String(current.userId)), current.userId) }
          : null,
        upcomingHomeroomTeacher: upcoming
          ? { ...upcoming, user: toSafeAssignmentUser(users.get(String(upcoming.userId)), upcoming.userId) }
          : null,
      };
    });
  },
});

export const listForAttendanceImport = query({
  args: {
    schoolYearId: v.string(),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    assertCanListAttendanceImportClasses(actor);
    const date = args.date ? assertYmd(args.date) : vietnamDateFromUtcMs(Date.now());
    const scope = resolveAttendanceImportClassScope(actor);
    const classes = await classesForYear(ctx, args.schoolYearId);
    const enrollments = await enrollmentsForYear(ctx, args.schoolYearId);
    return sortByGradeAndCode(
      classes.filter((row) => classIncludedInScopedList(row)).filter((row) => classVisibleInScope(String(row._id), scope)),
    ).map((row) => ({
      ...row,
      rosterCount: enrollmentsCoveringDate(enrollments, { classId: String(row._id), date }).length,
    }));
  },
});

export const getScoped = query({
  args: { classId: v.string(), date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const date = args.date ? assertYmd(args.date) : vietnamDateFromUtcMs(Date.now());
    const klass = await assertClassReadable(ctx, actor, args.classId, date);
    const assignments = (await assignmentsForClass(ctx, args.classId)).filter((row) => row.scopeKind === "class");
    const enrollments = enrollmentsCoveringDate(await enrollmentsForClass(ctx, args.classId), {
      classId: args.classId,
      date,
    });
    const users = await usersByIds(ctx, assignments.map((row) => row.userId));
    const yearAssignments = await loadAssignments(ctx, klass.schoolYearId);
    const current = findEffectiveHomeroomTeacherAssignment(yearAssignments, { classId: args.classId, date });
    const year = await getYearById(ctx, klass.schoolYearId);
    const archived = klass.status === "archived";
    return {
      class: klass,
      schoolYear: year ? { _id: String(year._id), name: year.name } : null,
      assignments: assignments.map((row) => ({
        ...row,
        user: toSafeAssignmentUser(users.get(String(row.userId)), row.userId),
      })),
      currentTeacherName: current ? users.get(String(current.userId))?.name || "" : "",
      rosterCount: enrollments.length,
      permissions: {
        canManage: canWriteHomeroomCatalog(actor),
        canImportAttendance: !archived && canImportAttendanceWithoutClassAssignment(actor),
        canCorrect: !archived && canCorrectDisposition(actor, yearAssignments, args.classId, date),
        canEditContacts: !archived && canEditStudentContacts(actor, yearAssignments, [args.classId], date),
      },
    };
  },
});

export const listAssignmentCandidates = query({
  args: {},
  handler: async (ctx) => {
    await homeroomCatalogWriterOrThrow(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .filter((row) => isActiveAssignmentCandidate(row))
      .map((row) => toAssignmentCandidate(row))
      .sort((a, b) => a.name.localeCompare(b.name, "vi") || a._id.localeCompare(b._id));
  },
});

export const create = mutation({
  args: {
    schoolYearId: v.string(),
    code: v.string(),
    name: v.string(),
    gradeLevel: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const year = await getYearById(ctx, args.schoolYearId);
    if (!year) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    assertSchoolYearEditable(year);
    const input = validateClassInput(args);
    const classes = await classesForYear(ctx, args.schoolYearId);
    if (findDuplicateClassCode(classes, { schoolYearId: args.schoolYearId, code: input.code })) {
      throw new Error("CLASS_CODE_TAKEN");
    }
    const now = Date.now();
    const id = await ctx.db.insert("homeroomClasses", {
      schoolYearId: args.schoolYearId,
      ...input,
      status: "active",
      notes: args.notes?.trim() || undefined,
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "homeroomClass.create",
      details: JSON.stringify({ id, code: input.code }),
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.string(),
    code: v.string(),
    name: v.string(),
    gradeLevel: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const current = await getClassById(ctx, args.id);
    if (!current) throw new Error("CLASS_NOT_FOUND");
    assertClassNotArchived(current);
    const input = validateClassInput(args);
    const classes = await classesForYear(ctx, current.schoolYearId);
    if (findDuplicateClassCode(classes, { schoolYearId: current.schoolYearId, code: input.code }, args.id)) {
      throw new Error("CLASS_CODE_TAKEN");
    }
    await ctx.db.patch(current._id, {
      ...input,
      notes: args.notes?.trim() || undefined,
      updatedBy: String(user._id),
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "homeroomClass.update",
      details: JSON.stringify({ id: args.id, code: input.code }),
    });
  },
});

/** Lưu trữ lớp: đóng phân công GVCN đang/sắp hiệu lực để lớp không còn xuất hiện trong phạm vi giáo viên. */
export const archive = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const current = await getClassById(ctx, args.id);
    if (!current) throw new Error("CLASS_NOT_FOUND");
    if (current.status === "archived") return;
    const today = vietnamDateFromUtcMs(Date.now());
    const now = Date.now();
    let closed = 0;
    for (const row of await assignmentsForClass(ctx, args.id)) {
      if (!row.active) continue;
      if (row.effectiveTo && row.effectiveTo < today) continue;
      if (row.effectiveFrom > today) {
        await ctx.db.patch(row._id, { active: false, endedBy: String(user._id), updatedAt: now });
      } else {
        await ctx.db.patch(row._id, { effectiveTo: today, endedBy: String(user._id), updatedAt: now });
      }
      closed += 1;
    }
    await ctx.db.patch(current._id, {
      status: "archived",
      updatedBy: String(user._id),
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "homeroomClass.archive",
      details: JSON.stringify({ id: args.id, closedAssignments: closed }),
    });
  },
});

export const restore = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const current = await getClassById(ctx, args.id);
    if (!current) throw new Error("CLASS_NOT_FOUND");
    if (current.status !== "archived") return;
    const classes = await classesForYear(ctx, current.schoolYearId);
    if (findDuplicateClassCode(classes, { schoolYearId: current.schoolYearId, code: current.code }, args.id)) {
      throw new Error("CLASS_CODE_TAKEN");
    }
    await ctx.db.patch(current._id, { status: "active", updatedBy: String(user._id), updatedAt: Date.now() });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "homeroomClass.restore",
      details: JSON.stringify({ id: args.id }),
    });
  },
});

export const assignUser = mutation({
  args: {
    classId: v.string(),
    userId: v.string(),
    assignmentType: v.string(),
    scopeKind: v.optional(v.string()),
    effectiveFrom: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const klass = await getClassById(ctx, args.classId);
    if (!klass) throw new Error("CLASS_NOT_FOUND");
    assertClassNotArchived(klass);
    const targetId = ctx.db.normalizeId("users", args.userId);
    const target = targetId ? await ctx.db.get(targetId) : null;
    if (!target || target.status !== "active") throw new Error("USER_NOT_FOUND");
    assertHomeroomTeacherAssignmentInput({
      assignmentType: args.assignmentType,
      scopeKind: args.scopeKind,
    });
    const assignmentType = "homeroom_teacher";
    const scopeKind = "class";
    const effectiveFrom = assertYmd(args.effectiveFrom);
    const current = await assignmentsForClass(ctx, args.classId);
    const overlap = findOverlappingHomeroomTeacher(current, {
      classId: args.classId,
      effectiveFrom,
    });
    if (overlap && String(overlap.userId) === String(args.userId) && !overlap.effectiveTo) {
      throw new Error("HOMEROOM_TEACHER_ALREADY_ASSIGNED");
    }
    if (overlap) {
      const plan = planHomeroomTeacherReplacement({
        assignment: overlap,
        date: effectiveFrom,
      });
      await ctx.db.patch(overlap._id as Id<"homeroomAssignments">, {
        ...plan.close,
        endedBy: String(user._id),
        updatedAt: Date.now(),
      });
    }
    if (
      findOverlappingHomeroomTeacher(
        current.filter((row) => String(row._id) !== String(overlap?._id)),
        { classId: args.classId, effectiveFrom },
      )
    ) {
      throw new Error(HOMEROOM_TEACHER_OVERLAP);
    }
    const now = Date.now();
    const id = await ctx.db.insert("homeroomAssignments", {
      classId: args.classId,
      schoolYearId: klass.schoolYearId,
      userId: args.userId,
      assignmentType,
      scopeKind,
      effectiveFrom,
      active: true,
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "homeroomAssignment.create",
      details: JSON.stringify({ id, classId: args.classId, assignmentType, scopeKind }),
    });
    return id;
  },
});

/**
 * "Kết thúc phân công": admin/mod end a GVCN assignment without naming a new
 * teacher. `date` = first day the class has no GVCN (row ends the day before).
 * History stays; the class shows "Chưa có GVCN" until a new assignment.
 */
export const endAssignment = mutation({
  args: { assignmentId: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const assignmentId = ctx.db.normalizeId("homeroomAssignments", args.assignmentId);
    const row = assignmentId ? await ctx.db.get(assignmentId) : null;
    if (!row || row.scopeKind !== "class") throw new Error("ASSIGNMENT_NOT_FOUND");
    const klass = await getClassById(ctx, row.classId);
    if (!klass) throw new Error("CLASS_NOT_FOUND");
    assertClassNotArchived(klass);
    const date = assertYmd(args.date);
    const plan = planHomeroomTeacherEnd({ assignment: row, date });
    await ctx.db.patch(row._id, { ...plan.patch, endedBy: String(user._id), updatedAt: Date.now() });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "homeroomAssignment.end",
      details: JSON.stringify({
        id: row._id,
        classId: row.classId,
        userId: row.userId,
        noTeacherFrom: date,
        previousEffectiveTo: row.effectiveTo ?? null,
        revoked: plan.revoked,
      }),
    });
  },
});

export const transferStudent = mutation({
  args: {
    enrollmentId: v.string(),
    toClassId: v.string(),
    date: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const enrollmentId = ctx.db.normalizeId("classEnrollments", args.enrollmentId);
    const enrollment = enrollmentId ? await ctx.db.get(enrollmentId) : null;
    if (!enrollment) throw new Error("ENROLLMENT_NOT_FOUND");
    const toClass = await getClassById(ctx, args.toClassId);
    if (!toClass || toClass.schoolYearId !== enrollment.schoolYearId) throw new Error("ENROLLMENT_YEAR_MISMATCH");
    assertClassNotArchived(toClass);
    const date = assertYmd(args.date);
    const plan = planStudentTransfer({
      enrollment,
      toClassId: args.toClassId,
      date,
      reason: args.reason,
    });
    const others = (await enrollmentsForStudent(ctx, enrollment.studentId, enrollment.schoolYearId)).filter(
      (row) => String(row._id) !== args.enrollmentId,
    );
    assertSingleActiveEnrollment(others, {
      studentId: enrollment.studentId,
      schoolYearId: enrollment.schoolYearId,
    });
    const now = Date.now();
    await ctx.db.patch(enrollment._id, {
      ...plan.close,
      updatedBy: String(user._id),
      updatedAt: now,
    });
    const nextId = await ctx.db.insert("classEnrollments", {
      ...plan.open,
      rosterNumber: undefined,
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "student.transfer",
      details: JSON.stringify({
        enrollmentId: args.enrollmentId,
        toClassId: args.toClassId,
        nextEnrollmentId: nextId,
      }),
    });
    return nextId;
  },
});

/** Học sinh nghỉ học từ `date`: quá trình học kết thúc ngày liền trước. */
export const withdrawStudent = mutation({
  args: {
    enrollmentId: v.string(),
    date: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomCatalogWriterOrThrow(ctx);
    const enrollmentId = ctx.db.normalizeId("classEnrollments", args.enrollmentId);
    const enrollment = enrollmentId ? await ctx.db.get(enrollmentId) : null;
    if (!enrollment) throw new Error("ENROLLMENT_NOT_FOUND");
    if (enrollment.status !== "active" || enrollment.endDate) throw new Error("ENROLLMENT_NOT_ACTIVE");
    const date = assertYmd(args.date);
    if (compareYmd(date, enrollment.startDate) <= 0) throw new Error("WITHDRAW_BEFORE_START");
    const reason = args.reason?.trim() || undefined;
    if (reason && reason.length > 300) throw new Error("INVALID_REASON");
    await ctx.db.patch(enrollment._id, {
      endDate: addDaysYmd(date, -1),
      status: "withdrawn",
      transferReason: reason,
      updatedBy: String(user._id),
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "student.withdraw",
      details: JSON.stringify({ enrollmentId: args.enrollmentId, date }),
    });
  },
});
