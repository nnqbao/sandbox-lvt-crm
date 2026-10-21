import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { currentUserOrThrow } from "./lib";
import {
  canAccessTodo,
  cleanTodoInput,
  reminderNeedsJob,
  reminderShouldFire,
  sortTodosForList,
  TODO_SOURCE_TYPE,
} from "./personalTodoPolicy";

/**
 * "Việc của tôi". Every active account may use it, whatever its position level
 * or `work` menu access; only the owner ever reads or writes a todo.
 */
async function todoOwnerOrThrow(ctx: any) {
  const user = await currentUserOrThrow(ctx); // also rejects loginLockedAt
  if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  return user;
}

async function ownTodoOrThrow(ctx: any, userId: string, id: Id<"personalTodos">) {
  const todo = await ctx.db.get(id);
  // Someone else's todo reads exactly like a missing one.
  if (!canAccessTodo(todo, userId)) throw new Error("TODO_NOT_FOUND");
  return todo;
}

async function cancelJob(ctx: any, jobId: Id<"_scheduled_functions"> | undefined) {
  if (!jobId) return;
  try {
    await ctx.scheduler.cancel(jobId);
  } catch {
    // Already ran or was cancelled; the job re-checks the row before acting anyway.
  }
}

async function scheduleReminder(ctx: any, todoId: Id<"personalTodos">, remindAt: number) {
  return await ctx.scheduler.runAt(remindAt, internal.personalTodos.fireReminder, { todoId, remindAt });
}

function publicTodo(row: any) {
  return {
    _id: row._id,
    title: row.title,
    note: row.note || "",
    dueAt: row.dueAt ?? null,
    remindAt: row.remindAt ?? null,
    remindedAt: row.remindedAt ?? null,
    completedAt: row.completedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const todoFields = {
  title: v.string(),
  note: v.optional(v.union(v.string(), v.null())),
  dueAt: v.optional(v.union(v.number(), v.null())),
  remindAt: v.optional(v.union(v.number(), v.null())),
};

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await todoOwnerOrThrow(ctx);
    const rows = await ctx.db
      .query("personalTodos")
      .withIndex("by_user_active_due", (q) => q.eq("userId", user._id).eq("active", true))
      .collect();
    const { open, completed } = sortTodosForList(rows as any[]);
    return { open: open.map(publicTodo), completed: completed.map(publicTodo) };
  },
});

export const create = mutation({
  args: todoFields,
  handler: async (ctx, args) => {
    const user = await todoOwnerOrThrow(ctx);
    const now = Date.now();
    const input = cleanTodoInput(args, now);
    const id = await ctx.db.insert("personalTodos", {
      userId: user._id,
      title: input.title,
      note: input.note,
      dueAt: input.dueAt,
      remindAt: input.remindAt,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    if (input.remindAt !== undefined && reminderNeedsJob({ remindAt: input.remindAt }, now)) {
      const jobId = await scheduleReminder(ctx, id, input.remindAt);
      await ctx.db.patch(id, { reminderJobId: jobId });
    }
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("personalTodos"), ...todoFields },
  handler: async (ctx, args) => {
    const user = await todoOwnerOrThrow(ctx);
    const todo = await ownTodoOrThrow(ctx, String(user._id), args.id);
    const now = Date.now();
    const input = cleanTodoInput(args, now, todo);
    const reminderChanged = input.remindAt !== todo.remindAt;
    const patch: Record<string, unknown> = {
      title: input.title,
      note: input.note,
      dueAt: input.dueAt,
      remindAt: input.remindAt,
      updatedAt: now,
    };
    if (reminderChanged) {
      await cancelJob(ctx, todo.reminderJobId);
      patch.reminderJobId = undefined;
      patch.remindedAt = undefined;
      const next = { ...todo, remindAt: input.remindAt };
      if (input.remindAt !== undefined && reminderNeedsJob(next, now)) {
        patch.reminderJobId = await scheduleReminder(ctx, args.id, input.remindAt);
      }
    }
    await ctx.db.patch(args.id, patch);
  },
});

export const setCompleted = mutation({
  args: { id: v.id("personalTodos"), done: v.boolean() },
  handler: async (ctx, args) => {
    const user = await todoOwnerOrThrow(ctx);
    const todo = await ownTodoOrThrow(ctx, String(user._id), args.id);
    const now = Date.now();
    if (args.done) {
      if (todo.completedAt) return;
      await cancelJob(ctx, todo.reminderJobId);
      await ctx.db.patch(args.id, { completedAt: now, reminderJobId: undefined, updatedAt: now });
      return;
    }
    if (!todo.completedAt) return;
    const reopened = { ...todo, completedAt: undefined };
    const patch: Record<string, unknown> = { completedAt: undefined, updatedAt: now };
    // Reopening re-arms a reminder that is still ahead.
    if (reminderNeedsJob(reopened, now) && !todo.reminderJobId) {
      patch.reminderJobId = await scheduleReminder(ctx, args.id, todo.remindAt as number);
    }
    await ctx.db.patch(args.id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("personalTodos") },
  handler: async (ctx, args) => {
    const user = await todoOwnerOrThrow(ctx);
    const todo = await ownTodoOrThrow(ctx, String(user._id), args.id);
    const now = Date.now();
    await cancelJob(ctx, todo.reminderJobId);
    await ctx.db.patch(args.id, { active: false, reminderJobId: undefined, updatedAt: now });
  },
});

/**
 * Scheduled at `remindAt`. Acts only when the todo is still active, open and
 * still points at this exact reminder; marks it fired (bell item) and pushes
 * to the owner's devices.
 */
export const fireReminder = internalMutation({
  args: { todoId: v.id("personalTodos"), remindAt: v.number() },
  handler: async (ctx, args) => {
    const todo = await ctx.db.get(args.todoId);
    if (!reminderShouldFire(todo, args.remindAt) || !todo) return { fired: false };
    const owner = await ctx.db.get(todo.userId);
    const now = Date.now();
    await ctx.db.patch(args.todoId, { remindedAt: Math.max(now, args.remindAt), reminderJobId: undefined });
    if (!owner || owner.status !== "active" || owner.loginLockedAt) return { fired: false };
    await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
      userIds: [String(owner._id)],
      title: "Nhắc việc",
      body: todo.title,
      kind: "todo",
      sourceType: TODO_SOURCE_TYPE,
      sourceId: String(args.todoId),
    });
    return { fired: true };
  },
});
