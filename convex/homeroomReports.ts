import { v } from "convex/values";
import { query } from "./_generated/server";
import type { DbCtx } from "./lib";
import { homeroomActorOrThrow, loadAssignments } from "./homeroomContext";
import {
  canCorrectDisposition,
  canReadClass,
  classVisibleInScope,
  findEffectiveHomeroomTeacherAssignment,
  isHomeroomOperationalManager,
  resolveOverviewScope,
  type HomeroomAssignment,
} from "./homeroomPolicy";
import {
  authorizeAttendanceSummaryRows,
  buildAttendanceExportPayload,
  enrichAttendanceSummaryRows,
  resolveScopedExportTitles,
  summarizeAttendanceDays,
  summarizeByStudent,
} from "./homeroomReportPolicy";
import { enrollmentsCoveringDate } from "./homeroomCatalog";
import { evaluateScopedMissingUploadAlerts, resolveSchoolDay } from "./homeroomAlerts";
import {
  addDaysYmd,
  assertYmd,
  assertYmdRange,
  DEFAULT_ATTENDANCE_UPLOAD_DUE_TIME,
  vietnamDateFromUtcMs,
} from "./homeroomTime";
import {
  calendarDayFor,
  classDayMarker,
  classDayMarkersForYearOnDate,
  classesForYear,
  daysForClassOnDate,
  daysForClassRange,
  daysForYearOnDate,
  enrollmentsForClass,
  enrollmentsForYear,
  getClassById,
  getYearById,
  pendingDaysForClass,
  pendingDaysForYear,
  studentsByIds,
  usersByIds,
} from "./homeroomData";
import { compareClasses, sortClassesNatural } from "./classOrder";

export const REPORT_RANGE_MAX_DAYS = 400;
const PENDING_LIST_LIMIT = 500;

const EMPTY_COUNTS = () => ({
  present: 0,
  late: 0,
  absent_excused: 0,
  absent_unexcused: 0,
  absent_pending: 0,
  no_data: 0,
  exempt: 0,
});

async function resolveYear(ctx: DbCtx, schoolYearId?: string) {
  if (schoolYearId) return await getYearById(ctx, schoolYearId);
  const years = await ctx.db.query("schoolYears").collect();
  return years.find((row) => row.active) || null;
}

const sortClasses = sortClassesNatural;

function assertRangeWithinLimit(from: string, to: string) {
  if (addDaysYmd(from, REPORT_RANGE_MAX_DAYS) < to) throw new Error("REPORT_RANGE_TOO_LONG");
}

export const attendanceSummary = query({
  args: {
    classId: v.string(),
    schoolYearId: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, actor } = await homeroomActorOrThrow(ctx);
    const range = assertYmdRange(args.from, args.to);
    assertRangeWithinLimit(range.from, range.to);
    const klass = await getClassById(ctx, args.classId);
    if (!klass) throw new Error("CLASS_NOT_FOUND");
    const schoolYearId = klass.schoolYearId;
    const assignments = await loadAssignments(ctx, schoolYearId);
    const days = authorizeAttendanceSummaryRows({
      actor,
      assignments,
      days: await daysForClassRange(ctx, args.classId, range.from, range.to),
      classId: args.classId,
      from: range.from,
      to: range.to,
      schoolYearId,
    });
    const studentMap = await studentsByIds(ctx, days.map((row) => row.studentId));
    const students = [...studentMap.values()].map((row) => ({
      _id: String(row._id),
      studentCode: row.studentCode,
      fullName: row.fullName,
      status: row.status,
    }));
    const enrichedDays = enrichAttendanceSummaryRows(days, students).sort(
      (a, b) => a.attendanceDate.localeCompare(b.attendanceDate) || a.fullName.localeCompare(b.fullName, "vi"),
    );
    const summary = summarizeAttendanceDays(enrichedDays, { classIds: [args.classId], from: range.from, to: range.to });
    const studentTotals = summarizeByStudent(enrichedDays);
    const year = await getYearById(ctx, schoolYearId);
    const titles = resolveScopedExportTitles({
      classId: args.classId,
      schoolYearId,
      scopedClassIds: [args.classId],
      classes: [{ _id: String(klass._id), name: klass.name, code: klass.code, schoolYearId }],
      schoolYears: year ? [{ _id: String(year._id), name: year.name }] : [],
    });
    return {
      summary,
      studentTotals,
      exportPayload: buildAttendanceExportPayload({
        summary,
        studentTotals,
        className: titles.className,
        schoolYearName: titles.schoolYearName,
        from: range.from,
        to: range.to,
        generatedAt: Date.now(),
        generatedByUserId: String(user._id),
        generatedByName: user.name,
      }),
    };
  },
});

export const overview = query({
  args: { schoolYearId: v.optional(v.string()), date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const today = vietnamDateFromUtcMs(Date.now());
    const date = args.date ? assertYmd(args.date) : today;
    const year = await resolveYear(ctx, args.schoolYearId);
    if (!year) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    const schoolYearId = String(year._id);
    const assignments = await loadAssignments(ctx, schoolYearId);
    const scope = resolveOverviewScope(actor, assignments, { date, schoolYearId });
    const classes = sortClasses(
      (await classesForYear(ctx, schoolYearId)).filter(
        (row) => row.status === "active" && classVisibleInScope(String(row._id), scope),
      ),
    );
    const classIds = classes.map((row) => String(row._id));
    const visible = new Set(classIds);

    const days =
      scope.mode === "school"
        ? (await daysForYearOnDate(ctx, schoolYearId, date)).filter((row) => visible.has(row.classId))
        : (await Promise.all(classIds.map((id) => daysForClassOnDate(ctx, id, date)))).flat();
    const enrollments =
      scope.mode === "school"
        ? await enrollmentsForYear(ctx, schoolYearId)
        : (await Promise.all(classIds.map((id) => enrollmentsForClass(ctx, id)))).flat();
    const pending =
      scope.mode === "school"
        ? (await pendingDaysForYear(ctx, schoolYearId)).filter((row) => visible.has(row.classId))
        : (await Promise.all(classIds.map((id) => pendingDaysForClass(ctx, id)))).flat();
    const pendingInScope = pending.filter(
      (row) => row.attendanceDate <= today && canReadClass(actor, assignments, row.classId, row.attendanceDate),
    );

    const teacherIds = classes
      .map((row) => findEffectiveHomeroomTeacherAssignment(assignments, { classId: String(row._id), date })?.userId)
      .filter((id): id is string => Boolean(id));
    const teachers = await usersByIds(ctx, teacherIds);

    // Điểm danh menu markers; old camera-era days (sourceImportId) also count as "done" for history.
    const markers = new Set(
      (scope.mode === "school"
        ? await classDayMarkersForYearOnDate(ctx, schoolYearId, date)
        : (await Promise.all(classIds.map((id) => classDayMarker(ctx, id, date)))).filter((row) => row !== null)
      ).map((row) => row!.classId),
    );

    const classRows = classes.map((row) => {
      const id = String(row._id);
      const counts = EMPTY_COUNTS();
      const classDays = days.filter((day) => day.classId === id);
      const saved = markers.has(id) || classDays.some((day) => Boolean(day.sourceImportId));
      for (const day of classDays) {
        if (day.effectiveStatus in counts) counts[day.effectiveStatus as keyof typeof counts] += 1;
      }
      const teacher = findEffectiveHomeroomTeacherAssignment(assignments, { classId: id, date });
      return {
        _id: id,
        code: row.code,
        name: row.name,
        gradeLevel: row.gradeLevel,
        status: row.status,
        rosterCount: enrollmentsCoveringDate(enrollments, { classId: id, date }).length,
        teacherName: teacher ? teachers.get(String(teacher.userId))?.name || "" : "",
        published: classDays.length > 0,
        saved,
        counts,
        pendingTotal: pendingInScope.filter((day) => day.classId === id).length,
        canCorrect: canCorrectDisposition(actor, assignments, id, date),
      };
    });

    const summary = summarizeAttendanceDays(days, { classIds, from: date, to: date });
    const calendarDay = await calendarDayFor(ctx, schoolYearId, date);
    const schoolDay = resolveSchoolDay(date, calendarDay, year);
    const cutoffTime = year.attendanceUploadDueTime || DEFAULT_ATTENDANCE_UPLOAD_DUE_TIME;
    const missingUpload = evaluateScopedMissingUploadAlerts({
      date,
      nowMs: Date.now(),
      cutoffTime,
      calendarDay: schoolDay.isSchoolDay ? calendarDay : { date, kind: "holiday" },
      visibleClassIds: classIds,
      publishedClassIds: classRows.filter((row) => row.saved).map((row) => row._id),
    });

    return {
      date,
      today,
      mode: scope.mode,
      schoolYear: {
        _id: schoolYearId,
        name: year.name,
        startDate: year.startDate,
        endDate: year.endDate,
        cutoffTime,
      },
      schoolDay,
      classes: classRows,
      studentCount: classRows.reduce((sum, row) => sum + row.rosterCount, 0),
      summary: {
        counts: summary.counts,
        attendanceRate: summary.attendanceRate,
        ratedRows: summary.ratedRows,
        totalRows: summary.totalRows,
      },
      missingUpload: {
        shouldAlert: missingUpload.shouldAlert,
        cutoffTime,
        missingClasses: classRows
          .filter((row) => missingUpload.missingClassIds.includes(row._id))
          .map((row) => ({ classId: row._id, code: row.code, name: row.name })),
      },
      pendingTotal: pendingInScope.length,
      permissions: {
        isManager: isHomeroomOperationalManager(actor),
        /** Admin/mod also have the Điểm danh menu (role-based full access). */
        canMarkAttendance: isHomeroomOperationalManager(actor),
        canCorrectAny: classRows.some((row) => row.canCorrect),
      },
    };
  },
});

/** Legacy "Vắng chờ xử lý" inbox. The web no longer shows it; kept read-only for older native apps. */
export const pendingAbsences = query({
  args: {
    schoolYearId: v.optional(v.string()),
    classId: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const today = vietnamDateFromUtcMs(Date.now());
    const year = await resolveYear(ctx, args.schoolYearId);
    if (!year) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    const schoolYearId = String(year._id);
    const from = args.from ? assertYmd(args.from) : undefined;
    const to = args.to ? assertYmd(args.to) : undefined;
    if (from && to) assertYmdRange(from, to);
    const assignments: HomeroomAssignment[] = await loadAssignments(ctx, schoolYearId);
    const scope = resolveOverviewScope(actor, assignments, { date: today, schoolYearId });

    const allClasses = await classesForYear(ctx, schoolYearId);
    const classById = new Map(allClasses.map((row) => [String(row._id), row]));
    let rows;
    if (args.classId) {
      rows = await pendingDaysForClass(ctx, args.classId);
    } else if (scope.mode === "school") {
      rows = await pendingDaysForYear(ctx, schoolYearId);
    } else {
      // A GVCN also sees pending rows from earlier dates of classes they led, if still readable.
      const teacherClassIds = [
        ...new Set(
          assignments
            .filter((row) => String(row.userId) === actor.userId && row.active && row.scopeKind === "class")
            .map((row) => row.classId),
        ),
      ];
      rows = (await Promise.all(teacherClassIds.map((id) => pendingDaysForClass(ctx, id)))).flat();
    }

    const filtered = rows
      .filter((row) => row.schoolYearId === schoolYearId)
      .filter((row) => row.attendanceDate <= today)
      .filter((row) => (!from || row.attendanceDate >= from) && (!to || row.attendanceDate <= to))
      .filter((row) => classById.get(row.classId)?.status === "active")
      .filter((row) => canReadClass(actor, assignments, row.classId, row.attendanceDate))
      .sort((a, b) => {
        const classA = classById.get(a.classId);
        const classB = classById.get(b.classId);
        return (
          b.attendanceDate.localeCompare(a.attendanceDate)
          || (classA && classB ? compareClasses(classA, classB) : a.classId.localeCompare(b.classId))
          || a.classId.localeCompare(b.classId)
        );
      });

    const limited = filtered.slice(0, PENDING_LIST_LIMIT);
    const students = await studentsByIds(ctx, limited.map((row) => row.studentId));
    return {
      total: filtered.length,
      truncated: filtered.length > limited.length,
      mode: scope.mode,
      rows: limited.map((row) => {
        const klass = classById.get(row.classId);
        const student = students.get(row.studentId);
        return {
          _id: String(row._id),
          attendanceDate: row.attendanceDate,
          classId: row.classId,
          classCode: klass?.code || "",
          className: klass?.name || "",
          gradeLevel: klass?.gradeLevel ?? null,
          studentId: row.studentId,
          studentCode: student?.studentCode || "—",
          fullName: student?.fullName || "Học sinh không còn hiệu lực",
          note: row.note || "",
          canCorrect: canCorrectDisposition(actor, assignments, row.classId, row.attendanceDate),
        };
      }),
    };
  },
});
