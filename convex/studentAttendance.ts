import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  assertClassReadable,
  homeroomActorOrThrow,
  loadAssignments,
  writeAudit,
} from "./homeroomContext";
import {
  assertCanCorrectDisposition,
  assertClassNotArchived,
  assertDispositionTarget,
  canCorrectDisposition,
  canReadClass,
  filterStudentAttendanceHistory,
  type HomeroomActor,
} from "./homeroomPolicy";
import { assertYmd, assertYmdRange, vietnamDateFromUtcMs } from "./homeroomTime";
import { assertDispositionChange, deriveEffectiveStatus } from "./studentAttendancePolicy";
import { resolveSchoolDay } from "./homeroomAlerts";
import {
  calendarDayFor,
  classDayMarker,
  correctionsForStudent,
  daysForClassOnDate,
  daysForClassRange,
  daysForStudent,
  enrollmentsForClassOnDate,
  enrollmentsForStudent,
  getClassById,
  getYearById,
  studentsByIds,
  usersByIds,
} from "./homeroomData";

export const DISPOSITION_BATCH_LIMIT = 100;

export const listDailyClass = query({
  args: { classId: v.string(), attendanceDate: v.string() },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const date = assertYmd(args.attendanceDate);
    const klass = await assertClassReadable(ctx, actor, args.classId, date);
    const enrollments = await enrollmentsForClassOnDate(ctx, args.classId, date);
    const days = await daysForClassOnDate(ctx, args.classId, date);
    const students = await studentsByIds(ctx, enrollments.map((row) => row.studentId));
    const rows = [];
    for (const enrollment of enrollments) {
      const student = students.get(enrollment.studentId);
      if (!student) continue;
      const day = days.find((row) => row.studentId === enrollment.studentId);
      rows.push({
        enrollment: { _id: String(enrollment._id), rosterNumber: enrollment.rosterNumber },
        student: { _id: String(student._id), studentCode: student.studentCode, fullName: student.fullName },
        day: day
          ? {
              _id: String(day._id),
              rawObservation: day.rawObservation,
              rawObservedAt: day.rawObservedAt,
              disposition: day.disposition,
              effectiveStatus: day.effectiveStatus,
              reasonCode: day.reasonCode,
              note: day.note,
            }
          : null,
      });
    }
    rows.sort(
      (a, b) =>
        (a.enrollment.rosterNumber || 9999) - (b.enrollment.rosterNumber || 9999)
        || a.student.fullName.localeCompare(b.student.fullName, "vi"),
    );
    const assignments = await loadAssignments(ctx, klass.schoolYearId);
    const year = await getYearById(ctx, klass.schoolYearId);
    const calendarDay = await calendarDayFor(ctx, klass.schoolYearId, date);
    const marker = await classDayMarker(ctx, args.classId, date);
    const saver = marker ? (await usersByIds(ctx, [marker.savedBy])).get(marker.savedBy) : undefined;
    return {
      date,
      rows,
      published: days.length > 0,
      /** Giám thị / admin đã lưu điểm danh lớp này trên menu Điểm danh (null = chưa). */
      classSaved: marker
        ? { savedAt: marker.savedAt, savedByName: saver?.name || "", source: marker.source, absentCount: marker.absentCount }
        : null,
      archived: klass.status === "archived",
      canCorrect: klass.status !== "archived" && canCorrectDisposition(actor, assignments, args.classId, date),
      schoolDay: resolveSchoolDay(date, calendarDay, year),
    };
  },
});

export const getStudentHistory = query({
  args: { studentId: v.string(), from: v.optional(v.string()), to: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const assignments = await loadAssignments(ctx);
    const enrollments = await enrollmentsForStudent(ctx, args.studentId);
    const days = await daysForStudent(ctx, args.studentId, args.from, args.to);
    const corrections = await correctionsForStudent(ctx, args.studentId);
    return filterStudentAttendanceHistory({
      actor,
      assignments,
      enrollments,
      days,
      corrections,
      from: args.from,
      to: args.to,
    });
  },
});

export const getClassSummary = query({
  args: { classId: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const range = assertYmdRange(args.from, args.to);
    const klass = await assertClassReadable(ctx, actor, args.classId, range.from);
    const assignments = await loadAssignments(ctx, klass.schoolYearId);
    return (await daysForClassRange(ctx, args.classId, range.from, range.to)).filter((row) =>
      canReadClass(actor, assignments, row.classId, row.attendanceDate),
    );
  },
});

async function applyDisposition(
  ctx: MutationCtx,
  actor: HomeroomActor,
  args: { attendanceDayId: string; nextDisposition: string; reasonCode?: string; note?: string },
) {
  const dayId = ctx.db.normalizeId("studentAttendanceDays", args.attendanceDayId);
  const day = dayId ? await ctx.db.get(dayId) : null;
  if (!day) throw new Error("ATTENDANCE_DAY_NOT_FOUND");
  const klass = await getClassById(ctx, day.classId);
  if (!klass) throw new Error("CLASS_NOT_FOUND");
  assertClassNotArchived(klass);
  const assignments = await loadAssignments(ctx, klass.schoolYearId);
  assertCanCorrectDisposition(actor, assignments, day.classId, day.attendanceDate);
  const nextDisposition = args.nextDisposition.trim();
  assertDispositionTarget(day, nextDisposition);
  const reasonCode = args.reasonCode?.trim() || undefined;
  const note = args.note?.trim() || undefined;
  if (note && note.length > 500) throw new Error("INVALID_DISPOSITION_NOTE");
  assertDispositionChange({
    previousDisposition: day.disposition,
    nextDisposition,
    reasonCode,
    note,
  });
  if (day.disposition === nextDisposition && day.reasonCode === reasonCode && day.note === note) {
    return { attendanceDayId: String(day._id), effectiveStatus: day.effectiveStatus, unchanged: true };
  }
  const nextEffective = deriveEffectiveStatus(day.rawObservation, nextDisposition);
  const now = Date.now();
  await ctx.db.insert("studentAttendanceCorrections", {
    attendanceDayId: String(day._id),
    studentId: day.studentId,
    attendanceDate: day.attendanceDate,
    previousDisposition: day.disposition,
    nextDisposition,
    previousEffectiveStatus: day.effectiveStatus,
    nextEffectiveStatus: nextEffective,
    reasonCode,
    note,
    actorUserId: actor.userId,
    at: now,
  });
  await ctx.db.patch(day._id as Id<"studentAttendanceDays">, {
    disposition: nextDisposition,
    effectiveStatus: nextEffective,
    reasonCode,
    note,
    updatedAt: now,
    updatedBy: actor.userId,
  });
  return { attendanceDayId: String(day._id), effectiveStatus: nextEffective, unchanged: false };
}

/** GVCN (lớp mình) hoặc Admin/Mod đánh dấu một buổi "Vắng" là có phép / không phép. */
export const setDisposition = mutation({
  args: {
    attendanceDayId: v.string(),
    nextDisposition: v.string(),
    reasonCode: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const result = await applyDisposition(ctx, actor, args);
    if (!result.unchanged) {
      await writeAudit(ctx, {
        actorUserId: actor.userId,
        action: "attendance.disposition",
        details: JSON.stringify({ dayId: result.attendanceDayId, next: args.nextDisposition }),
      });
    }
    return result;
  },
});

/** Phân loại nhiều buổi vắng cùng lúc (tối đa 100) với cùng lý do. All-or-nothing. */
export const setDispositionMany = mutation({
  args: {
    attendanceDayIds: v.array(v.string()),
    nextDisposition: v.string(),
    reasonCode: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const ids = [...new Set(args.attendanceDayIds)];
    if (!ids.length) return { updated: 0 };
    if (ids.length > DISPOSITION_BATCH_LIMIT) throw new Error("DISPOSITION_BATCH_TOO_LARGE");
    let updated = 0;
    for (const attendanceDayId of ids) {
      const result = await applyDisposition(ctx, actor, {
        attendanceDayId,
        nextDisposition: args.nextDisposition,
        reasonCode: args.reasonCode,
        note: args.note,
      });
      if (!result.unchanged) updated += 1;
    }
    await writeAudit(ctx, {
      actorUserId: actor.userId,
      action: "attendance.disposition.batch",
      details: JSON.stringify({ count: updated, next: args.nextDisposition, date: vietnamDateFromUtcMs(Date.now()) }),
    });
    return { updated };
  },
});
