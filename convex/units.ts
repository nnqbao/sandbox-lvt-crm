import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertEntityCode } from "./entityCodes";
import { adminPermissionOrThrow, hasActiveNameConflict } from "./lib";
import { syncDutiesForUnit } from "./unitRoster";

/**
 * Phòng ban: admin-managed membership groups with no permissions. A user may
 * belong to several units; Tổ chuyên môn (`departments`) stays one per user.
 */

function cleanUnit(args: { name: string; code: string }) {
  const name = args.name.trim();
  const code = assertEntityCode(args.code);
  if (!name || name.length > 120) throw new Error("INVALID_NAME");
  return { name, code };
}

async function assertUnitNameAvailable(ctx: { db: any }, name: string, excludeId?: string) {
  const units = await ctx.db.query("units").collect();
  if (hasActiveNameConflict(units, name, excludeId)) {
    throw new Error("UNIT_NAME_TAKEN");
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await adminPermissionOrThrow(ctx, "units:write");
    const [units, members, users] = await Promise.all([
      ctx.db.query("units").collect(),
      ctx.db.query("unitMembers").collect(),
      ctx.db.query("users").collect(),
    ]);
    const memberIdsByUnit = new Map<string, string[]>();
    for (const row of members) {
      const list = memberIdsByUnit.get(String(row.unitId)) || [];
      list.push(String(row.userId));
      memberIdsByUnit.set(String(row.unitId), list);
    }
    return {
      units: units
        .sort((a, b) => a.name.localeCompare(b.name, "vi"))
        .map((unit) => ({ ...unit, memberUserIds: memberIdsByUnit.get(String(unit._id)) || [] })),
      users: users.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        status: u.status,
        departmentId: u.departmentId,
        role: u.role,
      })),
    };
  },
});

export const create = mutation({
  args: { name: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "units:write");
    const input = cleanUnit(args);
    const existing = await ctx.db
      .query("units")
      .withIndex("by_code", (q) => q.eq("code", input.code))
      .unique();
    await assertUnitNameAvailable(ctx, input.name, existing && !existing.active ? existing._id : undefined);
    const now = Date.now();
    if (existing) {
      if (existing.active) throw new Error("CODE_TAKEN");
      // Soft-deleted code match → reactivate.
      await ctx.db.patch(existing._id, { ...input, active: true, updatedAt: now });
      await ctx.db.insert("auditLogs", {
        actorUserId: actor.user._id,
        action: "unit.reactivate",
        details: JSON.stringify({ id: existing._id, ...input }),
        at: now,
      });
      return existing._id;
    }
    const id = await ctx.db.insert("units", { ...input, active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "unit.create",
      details: JSON.stringify({ id, ...input }),
      at: now,
    });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("units"), name: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "units:write");
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("UNIT_NOT_FOUND");
    const input = cleanUnit(args);
    const duplicate = await ctx.db
      .query("units")
      .withIndex("by_code", (q) => q.eq("code", input.code))
      .unique();
    if (duplicate && duplicate._id !== args.id) throw new Error("CODE_TAKEN");
    await assertUnitNameAvailable(ctx, input.name, args.id);
    const now = Date.now();
    await ctx.db.patch(args.id, { ...input, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "unit.update",
      details: JSON.stringify({ id: args.id, ...input }),
      at: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("units") },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "units:write");
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("UNIT_NOT_FOUND");
    const member = await ctx.db
      .query("unitMembers")
      .withIndex("by_unit", (q) => q.eq("unitId", args.id))
      .first();
    // Same rule as Tổ chuyên môn: remove the members first.
    if (member) throw new Error("HAS_ASSIGNED_USERS");
    const now = Date.now();
    await ctx.db.patch(args.id, { active: false, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "unit.remove",
      details: JSON.stringify({ id: args.id, code: current.code }),
      at: now,
    });
  },
});

export const addMember = mutation({
  args: { unitId: v.id("units"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "units:write");
    const unit = await ctx.db.get(args.unitId);
    if (!unit?.active) throw new Error("INVALID_UNIT");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
    const existing = await ctx.db
      .query("unitMembers")
      .withIndex("by_unit_user", (q) => q.eq("unitId", args.unitId).eq("userId", args.userId))
      .first();
    if (existing) return;
    const now = Date.now();
    await ctx.db.insert("unitMembers", {
      unitId: args.unitId,
      userId: args.userId,
      createdBy: String(actor.user._id),
      createdAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "unit.add_member",
      targetUserId: args.userId,
      targetEmail: user.email,
      details: JSON.stringify({ unitId: args.unitId }),
      at: now,
    });
    await syncDutiesForUnit(ctx, String(args.unitId), now);
  },
});

export const removeMember = mutation({
  args: { unitId: v.id("units"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await adminPermissionOrThrow(ctx, "units:write");
    const rows = await ctx.db
      .query("unitMembers")
      .withIndex("by_unit_user", (q) => q.eq("unitId", args.unitId).eq("userId", args.userId))
      .collect();
    if (!rows.length) return;
    for (const row of rows) await ctx.db.delete(row._id);
    const user = await ctx.db.get(args.userId);
    const now = Date.now();
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "unit.remove_member",
      targetUserId: args.userId,
      targetEmail: user?.email,
      details: JSON.stringify({ unitId: args.unitId }),
      at: now,
    });
    await syncDutiesForUnit(ctx, String(args.unitId), now);
  },
});
