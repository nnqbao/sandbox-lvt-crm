import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  assertSchoolYearEditable,
  findOverlappingActiveYear,
  SCHOOL_YEAR_NAME_TAKEN,
  SCHOOL_YEAR_USAGE_TABLES,
  schoolYearRemovalBlocker,
  SCHOOL_YEAR_OVERLAP,
  validateSchoolYearInput,
} from "./homeroomCatalog";
import { homeroomActorOrThrow, writeAudit } from "./homeroomContext";
import { adminOrThrow, normalizeDisplayName } from "./lib";
import { CALENDAR_KINDS, isDefaultSchoolDay } from "./homeroomAlerts";
import { addDaysYmd, assertYmd } from "./homeroomTime";

/**
 * Năm học + lịch nghỉ thuộc Thiết lập tối cao: mọi thao tác ghi chỉ dành cho Administrator.
 * `active` là cờ "năm học mặc định" — luôn tối đa một năm, Lớp chủ nhiệm mở năm này đầu tiên.
 */

/** Một đợt nghỉ tối đa ~3 tháng (đủ cho Tết/nghỉ dài), chặn thao tác nhầm cả năm. */
export const HOLIDAY_RANGE_MAX_DAYS = 92;
const REMOVE_DATES_MAX = 200;

export const list = query({
  args: {},
  handler: async (ctx) => {
    await homeroomActorOrThrow(ctx);
    const years = await ctx.db.query("schoolYears").collect();
    return years.sort((a, b) => b.startDate.localeCompare(a.startDate));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    attendanceUploadDueTime: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    const input = validateSchoolYearInput(args);
    const years = await ctx.db.query("schoolYears").collect();
    if (years.some((year) => normalizeDisplayName(year.name) === normalizeDisplayName(input.name))) {
      throw new Error(SCHOOL_YEAR_NAME_TAKEN);
    }
    const active = args.active !== false;
    const now = Date.now();
    if (active) {
      for (const year of years) {
        if (year.active) await ctx.db.patch(year._id, { active: false, updatedBy: String(user._id), updatedAt: now });
      }
    }
    const id = await ctx.db.insert("schoolYears", {
      ...input,
      active,
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolYear.create",
      details: JSON.stringify({ id, name: input.name, active }),
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.string(),
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    attendanceUploadDueTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    const current = await ctx.db.get(args.id as Id<"schoolYears">);
    if (!current) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    assertSchoolYearEditable(current);
    const input = validateSchoolYearInput(args);
    const years = await ctx.db.query("schoolYears").collect();
    if (
      years.some(
        (year) =>
          String(year._id) !== args.id &&
          normalizeDisplayName(year.name) === normalizeDisplayName(input.name),
      )
    ) {
      throw new Error(SCHOOL_YEAR_NAME_TAKEN);
    }
    if (findOverlappingActiveYear(years, { ...input, active: current.active }, args.id)) {
      throw new Error(SCHOOL_YEAR_OVERLAP);
    }
    const now = Date.now();
    await ctx.db.patch(current._id, { ...input, updatedBy: String(user._id), updatedAt: now });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolYear.update",
      details: JSON.stringify({ id: args.id }),
    });
  },
});

/** Đặt năm học mặc định cho menu Lớp chủ nhiệm; các năm khác tự bỏ mặc định. */
export const setDefault = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    const yearId = ctx.db.normalizeId("schoolYears", args.id);
    const target = yearId ? await ctx.db.get(yearId) : null;
    if (!target) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    const now = Date.now();
    const years = await ctx.db.query("schoolYears").collect();
    for (const year of years) {
      const shouldBeActive = year._id === target._id;
      if (year.active !== shouldBeActive) {
        await ctx.db.patch(year._id, { active: shouldBeActive, updatedBy: String(user._id), updatedAt: now });
      }
    }
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolYear.setDefault",
      details: JSON.stringify({ id: args.id }),
    });
  },
});

export const lock = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    const current = await ctx.db.get(args.id as Id<"schoolYears">);
    if (!current) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    const now = Date.now();
    await ctx.db.patch(current._id, {
      lockedAt: current.lockedAt || now,
      updatedBy: String(user._id),
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolYear.lock",
      details: JSON.stringify({ id: args.id }),
    });
  },
});

/** Bảng nào còn dữ liệu của năm học (mỗi bảng chỉ đọc tối đa 1 dòng). */
async function schoolYearUsage(ctx: any, schoolYearId: string): Promise<string[]> {
  const probes: Record<(typeof SCHOOL_YEAR_USAGE_TABLES)[number], () => Promise<unknown>> = {
    homeroomClasses: () =>
      ctx.db.query("homeroomClasses").withIndex("by_year", (q: any) => q.eq("schoolYearId", schoolYearId)).first(),
    classEnrollments: () =>
      ctx.db.query("classEnrollments").withIndex("by_year_status", (q: any) => q.eq("schoolYearId", schoolYearId)).first(),
    homeroomAssignments: () =>
      ctx.db.query("homeroomAssignments").withIndex("by_year_user", (q: any) => q.eq("schoolYearId", schoolYearId)).first(),
    studentAttendanceDays: () =>
      ctx.db.query("studentAttendanceDays").withIndex("by_year_date", (q: any) => q.eq("schoolYearId", schoolYearId)).first(),
    // Hai bảng upload không có index theo năm; thao tác xoá năm hiếm và chỉ Admin dùng nên quét có điều kiện là chấp nhận được.
    attendanceImportUploads: () =>
      ctx.db.query("attendanceImportUploads").filter((q: any) => q.eq(q.field("schoolYearId"), schoolYearId)).first(),
    studentRosterImportUploads: () =>
      ctx.db.query("studentRosterImportUploads").filter((q: any) => q.eq(q.field("schoolYearId"), schoolYearId)).first(),
    attendanceClassDays: () =>
      ctx.db.query("attendanceClassDays").withIndex("by_year_date", (q: any) => q.eq("schoolYearId", schoolYearId)).first(),
    supervisorAttendanceUploads: () =>
      ctx.db.query("supervisorAttendanceUploads").filter((q: any) => q.eq(q.field("schoolYearId"), schoolYearId)).first(),
  };
  const used: string[] = [];
  for (const table of SCHOOL_YEAR_USAGE_TABLES) {
    if (await probes[table]()) used.push(table);
  }
  return used;
}

/** Cho giao diện biết trước năm học có xoá được không (null = xoá được). */
export const removalCheck = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await adminOrThrow(ctx);
    const yearId = ctx.db.normalizeId("schoolYears", args.id);
    const year = yearId ? await ctx.db.get(yearId) : null;
    if (!year) return { blocker: "SCHOOL_YEAR_NOT_FOUND", calendarDays: 0 };
    const quick = schoolYearRemovalBlocker(year);
    if (quick) return { blocker: quick, calendarDays: 0 };
    const days = await ctx.db
      .query("schoolCalendarDays")
      .withIndex("by_year_date", (q) => q.eq("schoolYearId", String(year._id)))
      .collect();
    return {
      blocker: schoolYearRemovalBlocker(year, await schoolYearUsage(ctx, String(year._id))),
      calendarDays: days.length,
    };
  },
});

/**
 * Xoá hẳn một năm học tạo nhầm / không dùng: chỉ Administrator, không phải năm mặc định, chưa khóa,
 * và chưa có lớp, học sinh, phân công, điểm danh hay file nhập nào. Lịch nghỉ / học bù của năm bị xoá theo.
 */
export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    const yearId = ctx.db.normalizeId("schoolYears", args.id);
    const year = yearId ? await ctx.db.get(yearId) : null;
    if (!year) throw new Error("SCHOOL_YEAR_NOT_FOUND");
    const quick = schoolYearRemovalBlocker(year);
    if (quick) throw new Error(quick);
    const blocker = schoolYearRemovalBlocker(year, await schoolYearUsage(ctx, String(year._id)));
    if (blocker) throw new Error(blocker);
    const days = await ctx.db
      .query("schoolCalendarDays")
      .withIndex("by_year_date", (q) => q.eq("schoolYearId", String(year._id)))
      .collect();
    for (const row of days) await ctx.db.delete(row._id);
    await ctx.db.delete(year._id);
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolYear.remove",
      details: JSON.stringify({ id: args.id, name: year.name, calendarDays: days.length }),
    });
    return { calendarDays: days.length };
  },
});

/** Ngoại lệ lịch học của năm: ngày nghỉ (holiday) và ngày học bù (extra_teaching). Mặc định T2–T6 là ngày học. */
export const listCalendarDays = query({
  args: { schoolYearId: v.string(), from: v.optional(v.string()), to: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await homeroomActorOrThrow(ctx);
    const yearId = ctx.db.normalizeId("schoolYears", args.schoolYearId);
    const year = yearId ? await ctx.db.get(yearId) : null;
    // Năm vừa bị xoá: trả null thay vì ném lỗi để trang đang mở không vỡ trong lúc danh sách cập nhật.
    if (!year) return null;
    const from = args.from ? assertYmd(args.from) : undefined;
    const to = args.to ? assertYmd(args.to) : undefined;
    const days = await ctx.db
      .query("schoolCalendarDays")
      .withIndex("by_year_date", (q) => {
        const base = q.eq("schoolYearId", args.schoolYearId);
        return from && to ? base.gte("date", from).lte("date", to) : base;
      })
      .collect();
    return {
      schoolYear: {
        _id: String(year._id),
        name: year.name,
        startDate: year.startDate,
        endDate: year.endDate,
        attendanceUploadDueTime: year.attendanceUploadDueTime,
      },
      days: days
        .map((row) => ({ _id: String(row._id), date: row.date, kind: row.kind, note: row.note || "" }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  },
});

async function editableYearOrThrow(ctx: any, schoolYearId: string) {
  const yearId = ctx.db.normalizeId("schoolYears", schoolYearId);
  const year = yearId ? await ctx.db.get(yearId) : null;
  if (!year) throw new Error("SCHOOL_YEAR_NOT_FOUND");
  assertSchoolYearEditable(year);
  return year;
}

function cleanCalendarNote(note?: string) {
  const value = note?.trim() || undefined;
  if (value && value.length > 120) throw new Error("INVALID_CALENDAR_NOTE");
  return value;
}

async function calendarRow(ctx: any, schoolYearId: string, date: string) {
  return await ctx.db
    .query("schoolCalendarDays")
    .withIndex("by_year_date", (q: any) => q.eq("schoolYearId", schoolYearId).eq("date", date))
    .unique();
}

export const upsertCalendarDay = mutation({
  args: {
    schoolYearId: v.string(),
    date: v.string(),
    kind: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    const year = await editableYearOrThrow(ctx, args.schoolYearId);
    if (!(CALENDAR_KINDS as readonly string[]).includes(args.kind)) throw new Error("INVALID_CALENDAR_DAY");
    const date = assertYmd(args.date);
    if (date < year.startDate || date > year.endDate) throw new Error("CALENDAR_DATE_OUTSIDE_YEAR");
    const note = cleanCalendarNote(args.note);
    const existing = await calendarRow(ctx, args.schoolYearId, date);
    const now = Date.now();
    let id;
    if (existing) {
      await ctx.db.patch(existing._id, {
        kind: args.kind,
        note,
        updatedBy: String(user._id),
        updatedAt: now,
      });
      id = existing._id;
    } else {
      id = await ctx.db.insert("schoolCalendarDays", {
        schoolYearId: args.schoolYearId,
        date,
        kind: args.kind,
        note,
        createdBy: String(user._id),
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolCalendar.upsert",
      details: JSON.stringify({ schoolYearId: args.schoolYearId, date, kind: args.kind }),
    });
    return id;
  },
});

/**
 * Đánh dấu một đợt nghỉ (Thứ 2 – Thứ 6 trong khoảng) trong một giao dịch.
 * `replaceDates` (tùy chọn) xóa các ngày nghỉ cũ của đợt đang sửa trước khi ghi đợt mới.
 */
export const setHolidayRange = mutation({
  args: {
    schoolYearId: v.string(),
    from: v.string(),
    to: v.string(),
    note: v.optional(v.string()),
    replaceDates: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    const year = await editableYearOrThrow(ctx, args.schoolYearId);
    const from = assertYmd(args.from);
    const to = assertYmd(args.to);
    if (from > to) throw new Error("INVALID_DATE_RANGE");
    if (from < year.startDate || to > year.endDate) throw new Error("CALENDAR_DATE_OUTSIDE_YEAR");
    if (addDaysYmd(from, HOLIDAY_RANGE_MAX_DAYS - 1) < to) throw new Error("HOLIDAY_RANGE_TOO_LONG");
    if ((args.replaceDates?.length || 0) > REMOVE_DATES_MAX) throw new Error("HOLIDAY_RANGE_TOO_LONG");
    const note = cleanCalendarNote(args.note);
    const now = Date.now();

    for (const raw of args.replaceDates || []) {
      const row = await calendarRow(ctx, args.schoolYearId, assertYmd(raw));
      if (row?.kind === "holiday") await ctx.db.delete(row._id);
    }

    let count = 0;
    for (let date = from; date <= to; date = addDaysYmd(date, 1)) {
      if (!isDefaultSchoolDay(date)) continue;
      const existing = await calendarRow(ctx, args.schoolYearId, date);
      if (existing) {
        await ctx.db.patch(existing._id, { kind: "holiday", note, updatedBy: String(user._id), updatedAt: now });
      } else {
        await ctx.db.insert("schoolCalendarDays", {
          schoolYearId: args.schoolYearId,
          date,
          kind: "holiday",
          note,
          createdBy: String(user._id),
          createdAt: now,
          updatedAt: now,
        });
      }
      count += 1;
    }
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolCalendar.setHolidayRange",
      details: JSON.stringify({ schoolYearId: args.schoolYearId, from, to, count }),
    });
    return count;
  },
});

export const removeCalendarDay = mutation({
  args: { schoolYearId: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    await editableYearOrThrow(ctx, args.schoolYearId);
    const date = assertYmd(args.date);
    const existing = await calendarRow(ctx, args.schoolYearId, date);
    if (!existing) return;
    await ctx.db.delete(existing._id);
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolCalendar.remove",
      details: JSON.stringify({ schoolYearId: args.schoolYearId, date }),
    });
  },
});

/** Xóa cả một đợt nghỉ / nhiều ngày đặc biệt cùng lúc (trả các ngày về lịch mặc định). */
export const removeCalendarDays = mutation({
  args: { schoolYearId: v.string(), dates: v.array(v.string()) },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    await editableYearOrThrow(ctx, args.schoolYearId);
    if (args.dates.length > REMOVE_DATES_MAX) throw new Error("HOLIDAY_RANGE_TOO_LONG");
    let count = 0;
    for (const raw of args.dates) {
      const row = await calendarRow(ctx, args.schoolYearId, assertYmd(raw));
      if (!row) continue;
      await ctx.db.delete(row._id);
      count += 1;
    }
    await writeAudit(ctx, {
      actorUserId: String(user._id),
      action: "schoolCalendar.removeMany",
      details: JSON.stringify({ schoolYearId: args.schoolYearId, count }),
    });
    return count;
  },
});
