import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { DbCtx } from "./lib";
import { homeroomActorOrThrow, loadUserAssignments, writeAudit } from "./homeroomContext";
import {
  isHomeroomOperationalManager,
  isHomeroomTeacherClassAssignment,
  isHomeroomViewAllUser,
  type HomeroomActor,
} from "./homeroomPolicy";
import { assertSchoolYearEditable, enrollmentsCoveringDate } from "./homeroomCatalog";
import {
  classesForYear,
  enrollmentsForClass,
  enrollmentsForStudent,
  getClassById,
  getStudentById,
  studentsByIds,
} from "./homeroomData";
import { sortClassesNatural } from "./classOrder";
import { listSubjectRows, listTestTypeRows } from "./teachingCatalog";
import { publicYear, referenceDate, slotsForClass, userNames, yearOrThrow } from "./teachingData";
import {
  assertScore,
  assertSemester,
  GRADE_SUBJECT_FORBIDDEN,
  GRADEBOOK_FORBIDDEN,
  summarizeGrades,
} from "./teachingPolicy";

/**
 * Học bạ. Quyền (owner 2026-10-23):
 * - Admin/mod: xem và nhập mọi môn. Người có Lớp học = view_all: xem mọi môn, nhập môn mình dạy.
 * - Giáo viên (kể cả GVCN) nhập / sửa điểm môn mình dạy ở lớp đó theo Lịch dạy.
 * - GVCN xem điểm mọi môn của học sinh lớp mình; giáo viên bộ môn chỉ thấy môn mình dạy học sinh đó.
 */
type Scope = {
  me: string;
  wholeSchool: boolean;
  canWriteAll: boolean;
  /** classId → subjects the actor teaches there (any time in that class's year). */
  taught: Map<string, Set<string>>;
  homeroomClassIds: Set<string>;
};

async function gradebookScope(ctx: DbCtx, actor: HomeroomActor): Promise<Scope> {
  const me = actor.userId;
  const [slots, assignments] = await Promise.all([
    ctx.db.query("timetableSlots").withIndex("by_teacher_year", (q) => q.eq("teacherId", me)).collect(),
    loadUserAssignments(ctx, me),
  ]);
  const taught = new Map<string, Set<string>>();
  for (const slot of slots) {
    if (!taught.has(slot.classId)) taught.set(slot.classId, new Set());
    taught.get(slot.classId)!.add(slot.subjectId);
  }
  return {
    me,
    wholeSchool: isHomeroomOperationalManager(actor) || isHomeroomViewAllUser(actor),
    canWriteAll: isHomeroomOperationalManager(actor),
    taught,
    homeroomClassIds: new Set(assignments.filter(isHomeroomTeacherClassAssignment).map((row) => row.classId)),
  };
}

function canOpenClass(scope: Scope, classId: string) {
  return scope.wholeSchool || scope.taught.has(classId) || scope.homeroomClassIds.has(classId);
}

function canWriteSubject(scope: Scope, classId: string, subjectId: string) {
  return scope.canWriteAll || Boolean(scope.taught.get(classId)?.has(subjectId));
}

/** Học bạ › danh sách lớp mình dạy / chủ nhiệm trong năm (admin/mod/view_all: mọi lớp). */
export const myClasses = query({
  args: { schoolYearId: v.string() },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const scope = await gradebookScope(ctx, actor);
    const year = await yearOrThrow(ctx, args.schoolYearId);
    const ref = referenceDate(year);
    const classes = (await classesForYear(ctx, args.schoolYearId)).filter(
      (row) => row.status === "active" && canOpenClass(scope, String(row._id)),
    );
    const rows = await Promise.all(
      sortClassesNatural(classes).map(async (row) => {
        const id = String(row._id);
        const roster = enrollmentsCoveringDate(await enrollmentsForClass(ctx, id), { classId: id, date: ref });
        return {
          _id: id,
          name: row.name,
          gradeLevel: row.gradeLevel,
          rosterCount: roster.length,
          isHomeroom: scope.homeroomClassIds.has(id),
          subjectIds: [...(scope.taught.get(id) || [])],
        };
      }),
    );
    return { year: publicYear(year), classes: rows };
  },
});

export const classStudents = query({
  args: { classId: v.string() },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const scope = await gradebookScope(ctx, actor);
    const klass = await getClassById(ctx, args.classId);
    if (!klass) throw new Error("CLASS_NOT_FOUND");
    if (!canOpenClass(scope, args.classId)) throw new Error(GRADEBOOK_FORBIDDEN);
    const year = await yearOrThrow(ctx, klass.schoolYearId);
    const roster = enrollmentsCoveringDate(await enrollmentsForClass(ctx, args.classId), {
      classId: args.classId,
      date: referenceDate(year),
    });
    const students = await studentsByIds(ctx, roster.map((row) => row.studentId));
    return {
      class: { _id: String(klass._id), name: klass.name, gradeLevel: klass.gradeLevel },
      year: publicYear(year),
      students: roster
        .map((row) => {
          const student = students.get(row.studentId);
          return {
            _id: row.studentId,
            fullName: student?.fullName || "",
            studentCode: student?.studentCode || "",
            dateOfBirth: student?.dateOfBirth || "",
            rosterNumber: row.rosterNumber ?? null,
          };
        })
        .sort(
          (a, b) =>
            (a.rosterNumber ?? 9999) - (b.rosterNumber ?? 9999) || a.fullName.localeCompare(b.fullName, "vi"),
        ),
    };
  },
});

/** Toàn bộ học bạ khối 6–9 của một học sinh; mặc định năm học mặc định (hoặc năm gần nhất). */
export const studentRecord = query({
  args: { studentId: v.string(), schoolYearId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const scope = await gradebookScope(ctx, actor);
    const student = await getStudentById(ctx, args.studentId);
    if (!student) throw new Error("STUDENT_NOT_FOUND");
    const enrollments = await enrollmentsForStudent(ctx, args.studentId);
    const studentClassIds = new Set(enrollments.map((row) => row.classId));
    if (!scope.wholeSchool && ![...studentClassIds].some((id) => canOpenClass(scope, id))) {
      throw new Error(GRADEBOOK_FORBIDDEN);
    }
    const fullView = scope.wholeSchool || [...studentClassIds].some((id) => scope.homeroomClassIds.has(id));
    const visibleSubjects = new Set<string>();
    if (!fullView) {
      for (const id of studentClassIds) for (const subjectId of scope.taught.get(id) || []) visibleSubjects.add(subjectId);
    }
    const subjectVisible = (subjectId: string) => fullView || visibleSubjects.has(subjectId);

    // Năm học + lớp của học sinh trong từng năm.
    const classRows = new Map<string, NonNullable<Awaited<ReturnType<typeof getClassById>>>>();
    for (const id of studentClassIds) {
      const row = await getClassById(ctx, id);
      if (row) classRows.set(id, row);
    }
    const yearIds = [...new Set(enrollments.map((row) => row.schoolYearId))];
    const yearDocs = (await Promise.all(yearIds.map((id) => ctx.db.normalizeId("schoolYears", id)).map((id) => (id ? ctx.db.get(id) : null))))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    const years = yearDocs.map((year) => {
      const own = enrollments
        .filter((row) => row.schoolYearId === String(year._id))
        .sort((a, b) => b.startDate.localeCompare(a.startDate));
      const klass = classRows.get(own[0]?.classId || "");
      return {
        ...publicYear(year),
        classId: klass ? String(klass._id) : "",
        className: klass?.name || "",
        gradeLevel: klass?.gradeLevel || 0,
        classIds: own.map((row) => row.classId),
      };
    });
    if (!years.length) throw new Error("STUDENT_NOT_FOUND");
    const selected =
      years.find((row) => row._id === args.schoolYearId)
      || years.find((row) => yearDocs.find((doc) => String(doc._id) === row._id)?.active)
      || years[years.length - 1];

    const [allEntries, subjects, testTypes] = await Promise.all([
      ctx.db.query("gradeEntries").withIndex("by_student", (q) => q.eq("studentId", args.studentId)).collect(),
      listSubjectRows(ctx),
      listTestTypeRows(ctx),
    ]);
    const entries = allEntries.filter((row) => subjectVisible(row.subjectId));
    const subjectOrder = new Map(subjects.map((row, index) => [String(row._id), index]));
    const orderSubjects = (ids: Iterable<string>) =>
      [...new Set(ids)].sort((a, b) => (subjectOrder.get(a) ?? 999) - (subjectOrder.get(b) ?? 999));

    const yearSummaries = years.map((year) => {
      const own = entries.filter((row) => row.schoolYearId === year._id);
      const summary = summarizeGrades(own, orderSubjects(own.map((row) => row.subjectId)));
      return { schoolYearId: year._id, semester1: summary.semester1, semester2: summary.semester2, year: summary.year };
    });

    // Môn hiển thị của năm đang chọn: môn trong lịch dạy của lớp + môn đã có điểm.
    const selectedEntries = entries.filter((row) => row.schoolYearId === selected._id);
    const timetableSubjects = new Set<string>();
    for (const classId of selected.classIds) {
      for (const slot of await slotsForClass(ctx, classId)) {
        if (subjectVisible(slot.subjectId)) timetableSubjects.add(slot.subjectId);
      }
    }
    const writeClassId = selected.classId;
    const yearDoc = yearDocs.find((doc) => String(doc._id) === selected._id);
    const locked = Boolean(yearDoc?.lockedAt);
    const writableSubjectIds = locked || !writeClassId
      ? []
      : scope.canWriteAll
        ? subjects.filter((row) => row.active).map((row) => String(row._id))
        : [...(scope.taught.get(writeClassId) || [])];
    const subjectIds = orderSubjects([
      ...timetableSubjects,
      ...selectedEntries.map((row) => row.subjectId),
      ...writableSubjectIds,
    ]);
    const names = await userNames(ctx, selectedEntries.map((row) => row.enteredBy));
    const summary = summarizeGrades(selectedEntries, subjectIds);
    return {
      student: {
        _id: String(student._id),
        fullName: student.fullName,
        studentCode: student.studentCode,
        dateOfBirth: student.dateOfBirth || "",
      },
      years: years.map(({ classIds: _ignored, ...row }) => row),
      yearSummaries,
      selectedYearId: selected._id,
      selectedClassId: writeClassId,
      fullView,
      subjects: subjects.map((row) => ({ _id: String(row._id), name: row.name, active: row.active })),
      testTypes: testTypes.filter((row) => row.active).map((row) => ({ _id: String(row._id), name: row.name, coefficient: row.coefficient })),
      subjectIds,
      writableSubjectIds,
      summary,
      entries: selectedEntries
        .map((row) => ({
          _id: String(row._id),
          subjectId: row.subjectId,
          semester: row.semester,
          testTypeId: row.testTypeId,
          testTypeName: row.testTypeName,
          coefficient: row.coefficient,
          score: row.score,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          enteredByName: names.get(row.enteredBy) || "",
          canEdit: !locked && canWriteSubject(scope, row.classId, row.subjectId),
        }))
        .sort((a, b) => a.semester - b.semester || a.createdAt - b.createdAt),
    };
  },
});

async function activeTestTypeOrThrow(ctx: DbCtx, testTypeId: string) {
  const id = ctx.db.normalizeId("testTypes", testTypeId);
  const row = id ? await ctx.db.get(id) : null;
  if (!row || !row.active) throw new Error("TEST_TYPE_NOT_FOUND");
  return row;
}

async function writableClassOrThrow(ctx: DbCtx, scope: Scope, classId: string, subjectId: string) {
  const klass = await getClassById(ctx, classId);
  if (!klass) throw new Error("CLASS_NOT_FOUND");
  const year = await yearOrThrow(ctx, klass.schoolYearId);
  assertSchoolYearEditable(year);
  if (!canWriteSubject(scope, classId, subjectId)) throw new Error(GRADE_SUBJECT_FORBIDDEN);
  return klass;
}

export const addEntry = mutation({
  args: {
    studentId: v.string(),
    classId: v.string(),
    subjectId: v.string(),
    semester: v.number(),
    testTypeId: v.string(),
    score: v.number(),
  },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const scope = await gradebookScope(ctx, actor);
    const klass = await writableClassOrThrow(ctx, scope, args.classId, args.subjectId);
    const enrolled = (await enrollmentsForStudent(ctx, args.studentId, klass.schoolYearId)).some(
      (row) => row.classId === args.classId,
    );
    if (!enrolled) throw new Error("STUDENT_NOT_IN_CLASS");
    const subjectId = ctx.db.normalizeId("subjects", args.subjectId);
    const subject = subjectId ? await ctx.db.get(subjectId) : null;
    if (!subject || !subject.active) throw new Error("SUBJECT_NOT_FOUND");
    const testType = await activeTestTypeOrThrow(ctx, args.testTypeId);
    const now = Date.now();
    const id = await ctx.db.insert("gradeEntries", {
      schoolYearId: klass.schoolYearId,
      classId: args.classId,
      studentId: args.studentId,
      subjectId: args.subjectId,
      semester: assertSemester(args.semester),
      testTypeId: String(testType._id),
      testTypeName: testType.name,
      coefficient: testType.coefficient,
      score: assertScore(args.score),
      enteredBy: scope.me,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actorUserId: scope.me,
      action: "grade.add",
      details: JSON.stringify({ id, studentId: args.studentId, subjectId: args.subjectId, score: args.score }),
    });
    return String(id);
  },
});

export const updateEntry = mutation({
  args: { id: v.string(), semester: v.number(), testTypeId: v.string(), score: v.number() },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const scope = await gradebookScope(ctx, actor);
    const id = ctx.db.normalizeId("gradeEntries", args.id);
    const current = id ? await ctx.db.get(id) : null;
    if (!current) throw new Error("GRADE_NOT_FOUND");
    await writableClassOrThrow(ctx, scope, current.classId, current.subjectId);
    const semester = assertSemester(args.semester);
    const score = assertScore(args.score);
    // Giữ hệ số đã chụp khi không đổi loại kiểm tra (admin có thể đã sửa hệ số sau đó).
    const patch: Record<string, unknown> = { semester, score, updatedBy: scope.me, updatedAt: Date.now() };
    if (args.testTypeId !== current.testTypeId) {
      const testType = await activeTestTypeOrThrow(ctx, args.testTypeId);
      Object.assign(patch, { testTypeId: String(testType._id), testTypeName: testType.name, coefficient: testType.coefficient });
    }
    await ctx.db.patch(current._id, patch);
    await writeAudit(ctx, {
      actorUserId: scope.me,
      action: "grade.update",
      details: JSON.stringify({ id: args.id, from: current.score, to: score }),
    });
  },
});

export const removeEntry = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const scope = await gradebookScope(ctx, actor);
    const id = ctx.db.normalizeId("gradeEntries", args.id);
    const current = id ? await ctx.db.get(id) : null;
    if (!current) throw new Error("GRADE_NOT_FOUND");
    await writableClassOrThrow(ctx, scope, current.classId, current.subjectId);
    await ctx.db.delete(current._id as Id<"gradeEntries">);
    await writeAudit(ctx, {
      actorUserId: scope.me,
      action: "grade.remove",
      details: JSON.stringify({
        id: args.id,
        studentId: current.studentId,
        subjectId: current.subjectId,
        semester: current.semester,
        testTypeName: current.testTypeName,
        score: current.score,
      }),
    });
  },
});
