/**
 * Điểm danh menu: Giám thị (permission group menu `attendance` = `supervisor`) or admin/mod marks
 * each class present/absent, by hand or from the 3-column Excel template. Every query/mutation
 * re-checks the actor here; the homeroom menu is not involved.
 */
import { v } from "convex/values";
import { anyApi } from "convex/server";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { currentUserOrThrow, resolveUserMenuAccess, type DbCtx } from "./lib";
import { writeAudit } from "./homeroomContext";
import { assertClassNotArchived } from "./homeroomPolicy";
import { enrollmentsCoveringDate } from "./homeroomCatalog";
import { resolveSchoolDay } from "./homeroomAlerts";
import { assertYmd, vietnamDateFromUtcMs } from "./homeroomTime";
import { compareClasses } from "./classOrder";
import {
  calendarDayFor,
  classDayMarker,
  classDayMarkersForYearOnDate,
  classesForYear,
  daysForClassOnDate,
  daysForYearOnDate,
  enrollmentsForClassOnDate,
  enrollmentsForYear,
  getClassById,
  getYearById,
  studentsByIds,
  usersByIds,
  type ClassDoc,
} from "./homeroomData";
import { assertImportUploadUsable } from "./userImportPolicy";
import { assertStoredImportMetadata } from "./studentRosterImportValidate";
import {
  assertReadableAttendanceDate,
  assertSupervisorAttendanceActor,
  assertWritableAttendanceDate,
  canChooseAttendanceDate,
  classRosterStudents,
  groupEnrollmentsByClass,
  pickSchoolYearForDate,
  planSupervisorClassSave,
  sortRosterStudents,
  SUPERVISOR_IMPORT_MAX_BYTES,
  SUPERVISOR_IMPORT_TTL_MS,
  validateSupervisorImportRows,
  type SupervisorActor,
  type SupervisorImportError,
  type SupervisorImportRow,
} from "./supervisorAttendancePolicy";

const internal = anyApi;
const BASE_GRADES = [6, 7, 8, 9];
const ERROR_RETURN_LIMIT = 400;

async function supervisorActorOrThrow(ctx: DbCtx) {
  const user = await currentUserOrThrow(ctx);
  const menuAccess = await resolveUserMenuAccess(ctx, user);
  const actor: SupervisorActor = {
    userId: String(user._id),
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    menuAccess,
  };
  assertSupervisorAttendanceActor(actor);
  return { user, actor };
}

function todayYmd() {
  return vietnamDateFromUtcMs(Date.now());
}

async function yearForDate(ctx: DbCtx, date: string) {
  return pickSchoolYearForDate(await ctx.db.query("schoolYears").collect(), date);
}

/** Active classes of the year (natural order) with the enrollments covering the date. */
async function loadClassEnrollments(ctx: DbCtx, schoolYearId: string, date: string) {
  const classes = (await classesForYear(ctx, schoolYearId))
    .filter((row) => row.status === "active")
    .sort(compareClasses);
  const byClass = groupEnrollmentsByClass(await enrollmentsForYear(ctx, schoolYearId));
  return classes.map((klass) => {
    const classId = String(klass._id);
    return { klass, enrollments: enrollmentsCoveringDate(byClass.get(classId) || [], { classId, date }) };
  });
}

/** Active classes of the year (natural order) with the students enrolled on the date. */
async function loadClassRosters(ctx: DbCtx, schoolYearId: string, date: string) {
  const rows = await loadClassEnrollments(ctx, schoolYearId, date);
  const students = await studentsByIds(ctx, rows.flatMap((row) => row.enrollments.map((enrollment) => enrollment.studentId)));
  return rows.map(({ klass, enrollments }) => {
    const roster = sortRosterStudents(
      enrollments.flatMap((enrollment) => {
        const student = students.get(enrollment.studentId);
        return student ? [{ studentId: String(student._id), fullName: student.fullName, rosterNumber: enrollment.rosterNumber }] : [];
      }),
    );
    return { klass, roster };
  });
}

type ClassDayMarkerRow = {
  savedAt: number;
  savedBy: string;
  source: string;
  presentCount: number;
  absentCount: number;
};

function savedSummary(marker: ClassDayMarkerRow | null | undefined, savers: Map<string, { name: string }>) {
  return marker
    ? {
        savedAt: marker.savedAt,
        savedByName: savers.get(marker.savedBy)?.name || "",
        source: marker.source,
        presentCount: marker.presentCount,
        absentCount: marker.absentCount,
      }
    : null;
}

/** Lớp 6–9 tabs always exist; other grades (if any) follow. */
function groupByGrade<T extends { gradeLevel: number }>(rows: T[]) {
  const grades = [...new Set([...BASE_GRADES, ...rows.map((row) => row.gradeLevel)])].sort((a, b) => a - b);
  return grades.map((gradeLevel) => ({ gradeLevel, classes: rows.filter((row) => row.gradeLevel === gradeLevel) }));
}

/** Whole-school roster for the Điểm danh page. Giám thị: today only; admin/mod: any past date. */
export const roster = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { actor } = await supervisorActorOrThrow(ctx);
    const today = todayYmd();
    const date = args.date ? assertYmd(args.date) : today;
    assertReadableAttendanceDate(actor, date, today);
    const canChooseDate = canChooseAttendanceDate(actor);
    const year = await yearForDate(ctx, date);
    if (!year) {
      return {
        date,
        today,
        canChooseDate,
        schoolYear: null,
        schoolDay: resolveSchoolDay(date, null, null),
        grades: groupByGrade([] as Array<{ gradeLevel: number }>),
      };
    }
    const schoolYearId = String(year._id);
    const rosters = await loadClassRosters(ctx, schoolYearId, date);
    const days = await daysForYearOnDate(ctx, schoolYearId, date);
    const absentKeys = new Set(
      days.filter((row) => row.rawObservation === "absent").map((row) => `${row.classId}|${row.studentId}`),
    );
    const markers = new Map((await classDayMarkersForYearOnDate(ctx, schoolYearId, date)).map((row) => [row.classId, row]));
    const savers = await usersByIds(ctx, [...markers.values()].map((row) => row.savedBy));
    const calendarDay = await calendarDayFor(ctx, schoolYearId, date);
    const classes = rosters.map(({ klass, roster: students }) => {
      const id = String(klass._id);
      const marker = markers.get(id);
      return {
        classId: id,
        code: klass.code,
        name: klass.name,
        gradeLevel: klass.gradeLevel,
        saved: savedSummary(marker, savers),
        students: students.map((student) => ({
          studentId: student.studentId,
          fullName: student.fullName,
          rosterNumber: student.rosterNumber ?? null,
          absent: absentKeys.has(`${id}|${student.studentId}`),
        })),
      };
    });
    return {
      date,
      today,
      canChooseDate,
      schoolYear: { _id: schoolYearId, name: year.name, startDate: year.startDate, endDate: year.endDate },
      schoolDay: resolveSchoolDay(date, calendarDay, year),
      grades: groupByGrade(classes),
    };
  },
});

/**
 * Fast class list for the web Điểm danh page: per-class sĩ số + saved marker only.
 * Reads classes, the year's enrollments and the class/day markers — never the
 * students or their day rows, so a save re-runs it cheaply. Students load per
 * class through `classRoster` when a class is opened. Same auth/date rules as `roster`.
 */
export const rosterSummary = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { actor } = await supervisorActorOrThrow(ctx);
    const today = todayYmd();
    const date = args.date ? assertYmd(args.date) : today;
    assertReadableAttendanceDate(actor, date, today);
    const canChooseDate = canChooseAttendanceDate(actor);
    const year = await yearForDate(ctx, date);
    if (!year) {
      return {
        date,
        today,
        canChooseDate,
        schoolYear: null,
        schoolDay: resolveSchoolDay(date, null, null),
        grades: groupByGrade([] as Array<{ gradeLevel: number }>),
      };
    }
    const schoolYearId = String(year._id);
    const [rows, markerRows, calendarDay] = await Promise.all([
      loadClassEnrollments(ctx, schoolYearId, date),
      classDayMarkersForYearOnDate(ctx, schoolYearId, date),
      calendarDayFor(ctx, schoolYearId, date),
    ]);
    const markers = new Map(markerRows.map((row) => [row.classId, row]));
    const savers = await usersByIds(ctx, markerRows.map((row) => row.savedBy));
    const classes = rows.map(({ klass, enrollments }) => {
      const id = String(klass._id);
      return {
        classId: id,
        code: klass.code,
        name: klass.name,
        gradeLevel: klass.gradeLevel,
        rosterCount: enrollments.length,
        saved: savedSummary(markers.get(id), savers),
      };
    });
    return {
      date,
      today,
      canChooseDate,
      schoolYear: { _id: schoolYearId, name: year.name, startDate: year.startDate, endDate: year.endDate },
      schoolDay: resolveSchoolDay(date, calendarDay, year),
      grades: groupByGrade(classes),
    };
  },
});

/** Students of one class on the date (opened from the class list). Same auth/date rules as `roster`. */
export const classRoster = query({
  args: { date: v.optional(v.string()), classId: v.string() },
  handler: async (ctx, args) => {
    const { actor } = await supervisorActorOrThrow(ctx);
    const today = todayYmd();
    const date = args.date ? assertYmd(args.date) : today;
    assertReadableAttendanceDate(actor, date, today);
    const year = await yearForDate(ctx, date);
    const klass = await getClassById(ctx, args.classId);
    // Only the classes `rosterSummary` lists: active and in the school year of the date.
    if (!year || !klass || klass.status !== "active" || klass.schoolYearId !== String(year._id)) {
      throw new Error("CLASS_NOT_FOUND");
    }
    const classId = String(klass._id);
    const [enrollments, days, marker] = await Promise.all([
      enrollmentsForClassOnDate(ctx, classId, date),
      daysForClassOnDate(ctx, classId, date),
      classDayMarker(ctx, classId, date),
    ]);
    const students = await studentsByIds(ctx, enrollments.map((row) => row.studentId));
    const savers = await usersByIds(ctx, marker ? [marker.savedBy] : []);
    return {
      date,
      classId,
      name: klass.name,
      saved: savedSummary(marker, savers),
      students: classRosterStudents(
        enrollments.flatMap((enrollment) => {
          const student = students.get(enrollment.studentId);
          return student
            ? [{ studentId: String(student._id), fullName: student.fullName, rosterNumber: enrollment.rosterNumber }]
            : [];
        }),
        days.map((row) => ({ studentId: row.studentId, rawObservation: row.rawObservation })),
      ),
    };
  },
});

/** Rows for the client-built template (Lớp học / Tên học sinh / Vắng), always from the live roster. */
export const templateRows = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { actor } = await supervisorActorOrThrow(ctx);
    const today = todayYmd();
    const date = args.date ? assertYmd(args.date) : today;
    assertReadableAttendanceDate(actor, date, today);
    const year = await yearForDate(ctx, date);
    if (!year) return { date, schoolYearName: "", rows: [] as Array<{ className: string; studentName: string }> };
    const rosters = await loadClassRosters(ctx, String(year._id), date);
    return {
      date,
      schoolYearName: year.name,
      rows: rosters.flatMap(({ klass, roster: students }) =>
        students.map((student) => ({ className: klass.name, studentName: student.fullName })),
      ),
    };
  },
});

/** Writes one class/day atomically (rows + corrections + marker). Callers already checked the date. */
async function applyClassSave(
  ctx: MutationCtx,
  actor: SupervisorActor,
  klass: ClassDoc,
  date: string,
  absentStudentIds: string[],
  source: "manual" | "import",
) {
  const classId = String(klass._id);
  const enrollments = await enrollmentsForClassOnDate(ctx, classId, date);
  const existing = await daysForClassOnDate(ctx, classId, date);
  const plan = planSupervisorClassSave({
    enrollments: enrollments.map((row) => ({
      enrollmentId: String(row._id),
      studentId: row.studentId,
      classId: row.classId,
      schoolYearId: row.schoolYearId,
    })),
    existingDays: existing.map((row) => ({
      _id: String(row._id),
      studentId: row.studentId,
      rawObservation: row.rawObservation,
      disposition: row.disposition,
      effectiveStatus: row.effectiveStatus,
      reasonCode: row.reasonCode,
      note: row.note,
    })),
    absentStudentIds,
  });
  const now = Date.now();
  for (const row of plan.inserts) {
    await ctx.db.insert("studentAttendanceDays", {
      schoolYearId: row.schoolYearId,
      classId: row.classId,
      enrollmentId: row.enrollmentId,
      studentId: row.studentId,
      attendanceDate: date,
      rawObservation: row.rawObservation,
      disposition: row.disposition,
      effectiveStatus: row.effectiveStatus,
      firstPublishedAt: now,
      updatedAt: now,
      updatedBy: actor.userId,
    });
  }
  for (const row of plan.patches) {
    await ctx.db.patch(row.dayId as Id<"studentAttendanceDays">, {
      rawObservation: row.rawObservation,
      rawObservedAt: undefined,
      sourceImportId: undefined,
      disposition: row.disposition,
      effectiveStatus: row.effectiveStatus,
      reasonCode: row.reasonCode,
      note: row.note,
      updatedAt: now,
      updatedBy: actor.userId,
    });
  }
  for (const row of plan.corrections) {
    await ctx.db.insert("studentAttendanceCorrections", {
      attendanceDayId: row.dayId,
      studentId: row.studentId,
      attendanceDate: date,
      previousDisposition: row.previousDisposition,
      nextDisposition: row.nextDisposition,
      previousEffectiveStatus: row.previousEffectiveStatus,
      nextEffectiveStatus: row.nextEffectiveStatus,
      note: source === "import" ? "Điểm danh lại (nhập Excel)" : "Điểm danh lại",
      actorUserId: actor.userId,
      at: now,
    });
  }
  const marker = await classDayMarker(ctx, classId, date);
  const markerFields = {
    savedBy: actor.userId,
    savedAt: now,
    source,
    presentCount: plan.presentCount,
    absentCount: plan.absentCount,
  };
  if (marker) await ctx.db.patch(marker._id, markerFields);
  else await ctx.db.insert("attendanceClassDays", { schoolYearId: klass.schoolYearId, classId, attendanceDate: date, ...markerFields });
  return {
    classId,
    savedAt: now,
    presentCount: plan.presentCount,
    absentCount: plan.absentCount,
    changedCount: plan.inserts.length + plan.patches.length,
  };
}

async function writableClassOrThrow(ctx: DbCtx, actor: SupervisorActor, classId: string, date: string) {
  const klass = await getClassById(ctx, classId);
  if (!klass) throw new Error("CLASS_NOT_FOUND");
  assertClassNotArchived(klass);
  const year = await getYearById(ctx, klass.schoolYearId);
  if (!year) throw new Error("SCHOOL_YEAR_NOT_FOUND");
  assertWritableAttendanceDate(actor, date, todayYmd(), year);
  return klass;
}

/** Saves one class: listed students are absent, every other enrolled student present. Re-saving overwrites. */
export const saveClass = mutation({
  args: { date: v.string(), classId: v.string(), absentStudentIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { actor } = await supervisorActorOrThrow(ctx);
    const date = assertYmd(args.date);
    const klass = await writableClassOrThrow(ctx, actor, args.classId, date);
    const result = await applyClassSave(ctx, actor, klass, date, args.absentStudentIds, "manual");
    await writeAudit(ctx, {
      actorUserId: actor.userId,
      action: "attendance.supervisorSave",
      details: JSON.stringify({ classId: result.classId, date, absent: result.absentCount, changed: result.changedCount }),
    });
    return result;
  },
});

/* ------------------------------ Excel import ------------------------------ */

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await supervisorActorOrThrow(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const registerUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await supervisorActorOrThrow(ctx);
    const today = todayYmd();
    const date = args.date ? assertYmd(args.date) : today;
    const year = await yearForDate(ctx, date);
    if (!year) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    assertWritableAttendanceDate(actor, date, today, year);
    const fileName = args.fileName.trim();
    if (!fileName.toLowerCase().endsWith(".xlsx")) throw new Error("INVALID_IMPORT_FILE");
    const stored = await ctx.db.system.get("_storage", args.storageId);
    assertStoredImportMetadata(stored, { fileSize: args.fileSize, maxBytes: SUPERVISOR_IMPORT_MAX_BYTES });
    const now = Date.now();
    const expiresAt = now + SUPERVISOR_IMPORT_TTL_MS;
    const uploadId = await ctx.db.insert("supervisorAttendanceUploads", {
      storageId: args.storageId,
      fileName,
      fileSize: args.fileSize,
      uploadedBy: actor.userId,
      schoolYearId: String(year._id),
      attendanceDate: date,
      status: "uploaded",
      createdAt: now,
      expiresAt,
    });
    // Always purge after the TTL — success or validation failure.
    await ctx.scheduler.runAfter(SUPERVISOR_IMPORT_TTL_MS, internal.supervisorAttendance.purgeUpload, { uploadId });
    await writeAudit(ctx, {
      actorUserId: actor.userId,
      action: "attendance.supervisorImport.upload",
      details: JSON.stringify({ uploadId, date, fileSize: args.fileSize }),
    });
    return { uploadId, expiresAt, attendanceDate: date };
  },
});

export const getUploadInternal = internalQuery({
  args: { uploadId: v.id("supervisorAttendanceUploads"), forCommit: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { actor } = await supervisorActorOrThrow(ctx);
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    assertImportUploadUsable(upload, { actorId: actor.userId, forCommit: args.forCommit });
    if (upload.fileSize > SUPERVISOR_IMPORT_MAX_BYTES) throw new Error("IMPORT_FILE_TOO_LARGE");
    const year = await getYearById(ctx, upload.schoolYearId);
    if (!year) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    assertWritableAttendanceDate(actor, upload.attendanceDate, todayYmd(), year);
    return upload;
  },
});

/** Classes + enrolled students on the upload date, for name matching. */
export const importContextInternal = internalQuery({
  args: { schoolYearId: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    await supervisorActorOrThrow(ctx);
    const rosters = await loadClassRosters(ctx, args.schoolYearId, assertYmd(args.date));
    return {
      classes: rosters.map(({ klass }) => ({ classId: String(klass._id), code: klass.code, name: klass.name })),
      students: rosters.flatMap(({ klass, roster: students }) =>
        students.map((student) => ({ studentId: student.studentId, classId: String(klass._id), fullName: student.fullName })),
      ),
    };
  },
});

type UploadDoc = {
  _id: Id<"supervisorAttendanceUploads">;
  storageId: Id<"_storage">;
  fileName: string;
  schoolYearId: string;
  attendanceDate: string;
  expiresAt: number;
};

type ImportClassPreview = ReturnType<typeof validateSupervisorImportRows>["classes"][number];

async function loadAndValidate(
  ctx: { runQuery: any; runAction: any },
  uploadId: Id<"supervisorAttendanceUploads">,
  forCommit = false,
): Promise<{ upload: UploadDoc; ok: boolean; errors: SupervisorImportError[]; classes: ImportClassPreview[]; totalRows: number }> {
  const upload = (await ctx.runQuery(internal.supervisorAttendance.getUploadInternal, { uploadId, forCommit })) as UploadDoc;
  const parsed = (await ctx.runAction(internal.supervisorAttendanceParse.parseStorageXlsx, {
    storageId: upload.storageId,
  })) as { ok: true; rows: SupervisorImportRow[] } | { ok: false; message: string };
  if (!parsed.ok) throw new Error(parsed.message);
  const context = await ctx.runQuery(internal.supervisorAttendance.importContextInternal, {
    schoolYearId: upload.schoolYearId,
    date: upload.attendanceDate,
  });
  const result = validateSupervisorImportRows(parsed.rows, context);
  return { upload, ok: result.ok, errors: result.errors, classes: result.classes, totalRows: result.totalRows };
}

/** Server-side parse + validation of the stored file. Preview only; writes nothing. */
export const validate = action({
  args: { uploadId: v.id("supervisorAttendanceUploads") },
  handler: async (ctx, args): Promise<{
    ok: boolean;
    fileName: string;
    attendanceDate: string;
    expiresAt: number;
    totalRows: number;
    errors: SupervisorImportError[];
    errorsTruncated: boolean;
    classes: Array<{ classId: string; code: string; name: string; rosterCount: number; absentCount: number; presentCount: number; absentNames: string[] }>;
  }> => {
    const result = await loadAndValidate(ctx, args.uploadId);
    return {
      ok: result.ok,
      fileName: result.upload.fileName,
      attendanceDate: result.upload.attendanceDate,
      expiresAt: result.upload.expiresAt,
      totalRows: result.totalRows,
      errors: result.errors.slice(0, ERROR_RETURN_LIMIT),
      errorsTruncated: result.errors.length > ERROR_RETURN_LIMIT,
      classes: result.classes.map(({ absentStudentIds: _ids, ...row }) => row),
    };
  },
});

export const claimUploadForCommit = internalMutation({
  args: { uploadId: v.id("supervisorAttendanceUploads") },
  handler: async (ctx, args) => {
    const { actor } = await supervisorActorOrThrow(ctx);
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    assertImportUploadUsable(upload, { actorId: actor.userId, forCommit: true });
    await ctx.db.patch(args.uploadId, { status: "committing" });
  },
});

export const releaseUploadClaim = internalMutation({
  args: { uploadId: v.id("supervisorAttendanceUploads") },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.status !== "committing") return;
    await ctx.db.patch(args.uploadId, { status: "uploaded" });
  },
});

/** Applies saveClass semantics per class in one transaction. Input comes from the server-side parse. */
export const commitInternal = internalMutation({
  args: {
    uploadId: v.id("supervisorAttendanceUploads"),
    classes: v.array(v.object({ classId: v.string(), absentStudentIds: v.array(v.string()) })),
  },
  handler: async (ctx, args) => {
    const { actor } = await supervisorActorOrThrow(ctx);
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    if (upload.uploadedBy !== actor.userId) throw new Error("FORBIDDEN");
    if (upload.status !== "committing") throw new Error("IMPORT_UPLOAD_IN_PROGRESS");
    const date = upload.attendanceDate;
    let absentCount = 0;
    for (const entry of args.classes) {
      const klass = await writableClassOrThrow(ctx, actor, entry.classId, date);
      if (klass.schoolYearId !== upload.schoolYearId) throw new Error("ENROLLMENT_YEAR_MISMATCH");
      const result = await applyClassSave(ctx, actor, klass, date, entry.absentStudentIds, "import");
      absentCount += result.absentCount;
    }
    await ctx.db.patch(upload._id, { status: "committed", classCount: args.classes.length });
    await writeAudit(ctx, {
      actorUserId: actor.userId,
      action: "attendance.supervisorImport.commit",
      details: JSON.stringify({ uploadId: args.uploadId, date, classCount: args.classes.length, absentCount }),
    });
    return { classCount: args.classes.length, absentCount, attendanceDate: date };
  },
});

export const commit = action({
  args: { uploadId: v.id("supervisorAttendanceUploads") },
  handler: async (ctx, args): Promise<{ classCount: number; absentCount: number; attendanceDate: string }> => {
    const result = await loadAndValidate(ctx, args.uploadId, true);
    if (!result.ok) throw new Error("IMPORT_VALIDATION_FAILED");
    await ctx.runMutation(internal.supervisorAttendance.claimUploadForCommit, { uploadId: args.uploadId });
    try {
      return await ctx.runMutation(internal.supervisorAttendance.commitInternal, {
        uploadId: args.uploadId,
        classes: result.classes.map((row) => ({ classId: row.classId, absentStudentIds: row.absentStudentIds })),
      });
    } catch (error) {
      try {
        await ctx.runMutation(internal.supervisorAttendance.releaseUploadClaim, { uploadId: args.uploadId });
      } catch {
        // Best-effort: the original error matters more than the release failure.
      }
      throw error;
    }
  },
});

export const purgeUpload = internalMutation({
  args: { uploadId: v.id("supervisorAttendanceUploads") },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.status === "expired") return;
    try {
      await ctx.storage.delete(upload.storageId);
    } catch {
      // Blob may already be gone.
    }
    await ctx.db.patch(args.uploadId, { status: "expired" });
  },
});
