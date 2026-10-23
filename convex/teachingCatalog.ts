import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertEntityCode } from "./entityCodes";
import { adminOrThrow, hasActiveNameConflict, type DbCtx } from "./lib";
import { homeroomActorOrThrow, writeAudit } from "./homeroomContext";
import { vietnamDateFromUtcMs } from "./homeroomTime";
import {
  assertCoefficient,
  DEFAULT_SUBJECTS,
  DEFAULT_TEST_TYPES,
  slotReachesDate,
} from "./teachingPolicy";

/**
 * Thiết lập Môn học + Thiết lập Loại kiểm tra (Thiết lập tối cao, Administrator).
 * Both are soft-deleted so timetable rows, sổ đầu bài and học bạ keep their names.
 * Defaults are seeded only while a table is completely empty, so a deleted default stays deleted.
 */

function cleanName(raw: string, max = 120) {
  const name = String(raw || "").trim().replace(/\s+/g, " ");
  if (!name || name.length > max) throw new Error("INVALID_NAME");
  return name;
}

export async function listSubjectRows(ctx: DbCtx) {
  const rows = await ctx.db.query("subjects").collect();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "vi"));
}

export async function listTestTypeRows(ctx: DbCtx) {
  const rows = await ctx.db.query("testTypes").collect();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "vi"));
}

const toSubject = (row: { _id: Id<"subjects">; name: string; code: string; active: boolean }) => ({
  _id: String(row._id),
  name: row.name,
  code: row.code,
  active: row.active,
});

const toTestType = (row: { _id: Id<"testTypes">; name: string; coefficient: number; active: boolean }) => ({
  _id: String(row._id),
  name: row.name,
  coefficient: row.coefficient,
  active: row.active,
});

/** Mọi người dùng mở được Lớp học đều cần tên môn / loại kiểm tra để đọc lịch dạy và học bạ. */
export const catalog = query({
  args: {},
  handler: async (ctx) => {
    await homeroomActorOrThrow(ctx);
    const [subjects, testTypes] = await Promise.all([listSubjectRows(ctx), listTestTypeRows(ctx)]);
    return { subjects: subjects.map(toSubject), testTypes: testTypes.map(toTestType) };
  },
});

export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await adminOrThrow(ctx);
    const now = Date.now();
    let created = 0;
    if (!(await ctx.db.query("subjects").first())) {
      for (const [index, item] of DEFAULT_SUBJECTS.entries()) {
        await ctx.db.insert("subjects", { ...item, sortOrder: index + 1, active: true, createdAt: now, updatedAt: now });
        created += 1;
      }
    }
    if (!(await ctx.db.query("testTypes").first())) {
      for (const [index, item] of DEFAULT_TEST_TYPES.entries()) {
        await ctx.db.insert("testTypes", { ...item, sortOrder: index + 1, active: true, createdAt: now, updatedAt: now });
        created += 1;
      }
    }
    return { created };
  },
});

// ------------------------------------------------------------------ Môn học

export const createSubject = mutation({
  args: { name: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    const name = cleanName(args.name);
    const code = assertEntityCode(args.code);
    const rows = await listSubjectRows(ctx);
    if (hasActiveNameConflict(rows, name)) throw new Error("SUBJECT_NAME_TAKEN");
    const now = Date.now();
    const sameCode = rows.find((row) => row.code === code);
    if (sameCode?.active) throw new Error("SUBJECT_CODE_TAKEN");
    let id: string;
    if (sameCode) {
      // Tạo lại mã đã xoá → khôi phục dòng cũ để lịch dạy / học bạ cũ vẫn trỏ đúng môn.
      await ctx.db.patch(sameCode._id, { name, active: true, updatedAt: now });
      id = String(sameCode._id);
    } else {
      const sortOrder = rows.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1;
      id = String(await ctx.db.insert("subjects", { name, code, sortOrder, active: true, createdAt: now, updatedAt: now }));
    }
    await writeAudit(ctx, { actorUserId: String(user._id), action: "subject.create", details: JSON.stringify({ id, code }) });
    return id;
  },
});

export const updateSubject = mutation({
  args: { id: v.string(), name: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    const id = ctx.db.normalizeId("subjects", args.id);
    const current = id ? await ctx.db.get(id) : null;
    if (!current || !current.active) throw new Error("SUBJECT_NOT_FOUND");
    const name = cleanName(args.name);
    const code = assertEntityCode(args.code);
    const rows = await listSubjectRows(ctx);
    if (hasActiveNameConflict(rows, name, args.id)) throw new Error("SUBJECT_NAME_TAKEN");
    if (rows.some((row) => row.code === code && String(row._id) !== args.id)) throw new Error("SUBJECT_CODE_TAKEN");
    await ctx.db.patch(current._id, { name, code, updatedAt: Date.now() });
    await writeAudit(ctx, { actorUserId: String(user._id), action: "subject.update", details: JSON.stringify({ id: args.id }) });
  },
});

export const removeSubject = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    const id = ctx.db.normalizeId("subjects", args.id);
    const current = id ? await ctx.db.get(id) : null;
    if (!current || !current.active) throw new Error("SUBJECT_NOT_FOUND");
    // Không xoá môn còn trong lịch dạy hiện tại / sắp tới (lịch cũ vẫn đọc được tên môn).
    const today = vietnamDateFromUtcMs(Date.now());
    const inUse = (await ctx.db.query("timetableSlots").collect()).some(
      (slot) => slot.subjectId === args.id && slotReachesDate(slot, today),
    );
    if (inUse) throw new Error("SUBJECT_IN_USE");
    await ctx.db.patch(current._id, { active: false, updatedAt: Date.now() });
    await writeAudit(ctx, { actorUserId: String(user._id), action: "subject.remove", details: JSON.stringify({ id: args.id, code: current.code }) });
  },
});

// ------------------------------------------------------------------ Loại kiểm tra

export const createTestType = mutation({
  args: { name: v.string(), coefficient: v.number() },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    const name = cleanName(args.name, 60);
    const coefficient = assertCoefficient(args.coefficient);
    const rows = await listTestTypeRows(ctx);
    if (hasActiveNameConflict(rows, name)) throw new Error("TEST_TYPE_NAME_TAKEN");
    const now = Date.now();
    const sortOrder = rows.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1;
    const id = await ctx.db.insert("testTypes", { name, coefficient, sortOrder, active: true, createdAt: now, updatedAt: now });
    await writeAudit(ctx, { actorUserId: String(user._id), action: "testType.create", details: JSON.stringify({ id, coefficient }) });
    return String(id);
  },
});

/** Đổi hệ số chỉ áp dụng cho điểm nhập sau đó; điểm đã nhập giữ hệ số lúc nhập. */
export const updateTestType = mutation({
  args: { id: v.string(), name: v.string(), coefficient: v.number() },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    const id = ctx.db.normalizeId("testTypes", args.id);
    const current = id ? await ctx.db.get(id) : null;
    if (!current || !current.active) throw new Error("TEST_TYPE_NOT_FOUND");
    const name = cleanName(args.name, 60);
    const coefficient = assertCoefficient(args.coefficient);
    if (hasActiveNameConflict(await listTestTypeRows(ctx), name, args.id)) throw new Error("TEST_TYPE_NAME_TAKEN");
    await ctx.db.patch(current._id, { name, coefficient, updatedAt: Date.now() });
    await writeAudit(ctx, { actorUserId: String(user._id), action: "testType.update", details: JSON.stringify({ id: args.id, coefficient }) });
  },
});

export const removeTestType = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const user = await adminOrThrow(ctx);
    const id = ctx.db.normalizeId("testTypes", args.id);
    const current = id ? await ctx.db.get(id) : null;
    if (!current || !current.active) throw new Error("TEST_TYPE_NOT_FOUND");
    await ctx.db.patch(current._id, { active: false, updatedAt: Date.now() });
    await writeAudit(ctx, { actorUserId: String(user._id), action: "testType.remove", details: JSON.stringify({ id: args.id }) });
  },
});
