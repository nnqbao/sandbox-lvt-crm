import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { homeroomActorOrThrow, loadUserAssignments, writeAudit } from "./homeroomContext";
import { canReadClassOnAnyDateInRange, HOMEROOM_SCOPE_FORBIDDEN } from "./homeroomPolicy";
import { assertSchoolYearEditable } from "./homeroomCatalog";
import { classesForYear, getClassById } from "./homeroomData";
import { assertYmd, assertYmdRange, vietnamDateFromUtcMs } from "./homeroomTime";
import { listSubjectRows } from "./teachingCatalog";
import {
  holidaysForYear,
  publicYear,
  slotsForClass,
  slotsForTeacherYear,
  userNames,
  yearOrThrow,
} from "./teachingData";
import {
  assertRating,
  assertTimetableCell,
  cleanLessonComment,
  holidaySet,
  isTimetableDay,
  isoWeekday,
  LESSON_IN_FUTURE,
  LESSON_NOT_SCHEDULED,
  slotCoversDate,
} from "./teachingPolicy";

export const LOG_RANGE_MAX_DAYS = 93;
const SESSION_ORDER: Record<string, number> = { morning: 0, afternoon: 1 };

/**
 * Lớp giảng dạy / Tổng quan / Lịch dạy của người đang đăng nhập:
 * tiết của mình trong năm học + ngày nghỉ (client trải lịch) + Sổ đầu bài mình đã ghi hôm nay.
 */
export const myTeaching = query({
  args: { schoolYearId: v.string() },
  handler: async (ctx, args) => {
    const { user } = await homeroomActorOrThrow(ctx);
    const me = String(user._id);
    const year = await yearOrThrow(ctx, args.schoolYearId);
    const today = vietnamDateFromUtcMs(Date.now());
    const [slots, holidays, classes, logs] = await Promise.all([
      slotsForTeacherYear(ctx, me, args.schoolYearId),
      holidaysForYear(ctx, args.schoolYearId),
      classesForYear(ctx, args.schoolYearId),
      ctx.db.query("lessonLogs").withIndex("by_teacher_date", (q) => q.eq("teacherId", me).eq("date", today)).collect(),
    ]);
    const used = new Set(slots.map((slot) => slot.classId));
    return {
      year: publicYear(year),
      today,
      holidays,
      slots,
      classes: classes
        .filter((row) => used.has(String(row._id)))
        .map((row) => ({ _id: String(row._id), name: row.name, gradeLevel: row.gradeLevel, status: row.status })),
      todayLogs: logs.map((row) => ({
        _id: String(row._id),
        classId: row.classId,
        date: row.date,
        session: row.session,
        period: row.period,
        rating: row.rating,
        comment: row.comment,
      })),
    };
  },
});

/** Sổ đầu bài của chính mình cho một lớp vào một ngày (popup mở lại để sửa). */
export const myLogsFor = query({
  args: { classId: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const { user } = await homeroomActorOrThrow(ctx);
    const date = assertYmd(args.date);
    const rows = await ctx.db
      .query("lessonLogs")
      .withIndex("by_teacher_date", (q) => q.eq("teacherId", String(user._id)).eq("date", date))
      .collect();
    return rows
      .filter((row) => row.classId === args.classId)
      .map((row) => ({
        _id: String(row._id),
        session: row.session,
        period: row.period,
        rating: row.rating,
        comment: row.comment,
        updatedAt: row.updatedAt,
      }));
  },
});

/**
 * Ghi / sửa Sổ đầu bài cho một tiết. Chỉ giáo viên được xếp dạy tiết đó (theo Lịch dạy) mới ghi được,
 * cho hôm nay hoặc một ngày dạy đã qua trong năm học — không ghi trước cho tiết tương lai.
 */
export const save = mutation({
  args: {
    classId: v.string(),
    date: v.string(),
    session: v.string(),
    period: v.number(),
    rating: v.number(),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await homeroomActorOrThrow(ctx);
    const me = String(user._id);
    const date = assertYmd(args.date);
    const cell = assertTimetableCell({ weekday: isoWeekday(date), session: args.session, period: args.period });
    const rating = assertRating(args.rating);
    const comment = cleanLessonComment(args.comment);
    if (date > vietnamDateFromUtcMs(Date.now())) throw new Error(LESSON_IN_FUTURE);
    const klass = await getClassById(ctx, args.classId);
    if (!klass) throw new Error("CLASS_NOT_FOUND");
    const year = await yearOrThrow(ctx, klass.schoolYearId);
    assertSchoolYearEditable(year);
    const holidays = holidaySet(
      await ctx.db.query("schoolCalendarDays").withIndex("by_year_date", (q) => q.eq("schoolYearId", klass.schoolYearId).eq("date", date)).collect(),
    );
    if (!isTimetableDay(date, year, holidays)) throw new Error(LESSON_NOT_SCHEDULED);
    const slot = (await slotsForClass(ctx, args.classId)).find(
      (row) =>
        row.weekday === cell.weekday && row.session === cell.session && row.period === cell.period && slotCoversDate(row, date),
    );
    if (!slot || slot.teacherId !== me) throw new Error(LESSON_NOT_SCHEDULED);
    const now = Date.now();
    const existing = (
      await ctx.db.query("lessonLogs").withIndex("by_class_date", (q) => q.eq("classId", args.classId).eq("date", date)).collect()
    ).find((row) => row.session === cell.session && row.period === cell.period);
    if (existing) {
      await ctx.db.patch(existing._id, { teacherId: me, subjectId: slot.subjectId, rating, comment, updatedAt: now });
    } else {
      await ctx.db.insert("lessonLogs", {
        schoolYearId: klass.schoolYearId,
        classId: args.classId,
        date,
        session: cell.session,
        period: cell.period,
        teacherId: me,
        subjectId: slot.subjectId,
        rating,
        comment,
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeAudit(ctx, {
      actorUserId: me,
      action: existing ? "lessonLog.update" : "lessonLog.create",
      details: JSON.stringify({ classId: args.classId, date, session: cell.session, period: cell.period }),
    });
  },
});

/** Đánh giá tiết học của một lớp — cho GVCN của lớp, admin/mod và người xem toàn trường. */
export const listForClass = query({
  args: { classId: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    const range = assertYmdRange(args.from, args.to);
    const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
    if (days > LOG_RANGE_MAX_DAYS) throw new Error("REPORT_RANGE_TOO_LONG");
    const klass = await getClassById(ctx, args.classId);
    if (!klass) throw new Error("CLASS_NOT_FOUND");
    const assignments = await loadUserAssignments(ctx, actor.userId);
    if (!canReadClassOnAnyDateInRange(actor, assignments, args.classId, { ...range, schoolYearId: klass.schoolYearId })) {
      throw new Error(HOMEROOM_SCOPE_FORBIDDEN);
    }
    const rows = await ctx.db
      .query("lessonLogs")
      .withIndex("by_class_date", (q) => q.eq("classId", args.classId).gte("date", range.from).lte("date", range.to))
      .collect();
    const [names, subjects] = await Promise.all([userNames(ctx, rows.map((row) => row.teacherId)), listSubjectRows(ctx)]);
    const subjectNames = new Map(subjects.map((row) => [String(row._id), row.name]));
    return rows
      .map((row) => ({
        _id: String(row._id),
        date: row.date,
        session: row.session,
        period: row.period,
        teacherName: names.get(row.teacherId) || "",
        subjectName: subjectNames.get(row.subjectId) || "",
        rating: row.rating,
        comment: row.comment,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || (SESSION_ORDER[a.session] ?? 0) - (SESSION_ORDER[b.session] ?? 0) || a.period - b.period);
  },
});
