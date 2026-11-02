import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { dutyPushRecipientIds } from "./assignmentPolicy";
import {
  approvalPatchForDuty,
  assertWeekStart,
  cleanReturnNote,
  discardPatchForDuty,
  dutyWeekLastDay,
  isOperationalManager,
  summarizeDutyWeek,
  type DutyApprovalRow,
} from "./dutyApproval";
import { requireDutiesAccess } from "./duties";
import { loadDutiesStartingBetween } from "./dutyRange";
import {
  isDutyWeekReviewerUser,
  listDutyWeekReviewerIds,
  loadDutyWeekRecord,
  resolveDutyScope,
} from "./dutyWeekStore";

function weekLabel(weekStart: string) {
  const format = (iso: string) => {
    const [, month, day] = iso.split("-");
    return `${day}/${month}`;
  };
  const [year, month, day] = weekStart.split("-").map(Number);
  const saturday = new Date(Date.UTC(year, month - 1, day + 5)).toISOString().slice(0, 10);
  return `${format(weekStart)} – ${format(saturday)}`;
}

async function loadWeek(ctx: any, weekStart: string) {
  const rows = (await loadDutiesStartingBetween(ctx, weekStart, dutyWeekLastDay(weekStart))) as DutyApprovalRow[];
  const school = rows.filter((row) => row.scope !== "team");
  const record = await loadDutyWeekRecord(ctx, weekStart);
  return { rows: school, record, summary: summarizeDutyWeek(weekStart, school, record) };
}

async function requireManager(ctx: any) {
  const actor = await requireDutiesAccess(ctx);
  if (!isOperationalManager(actor.user.role)) throw new Error("DUTY_WEEK_MANAGER_REQUIRED");
  return actor;
}

async function requireReviewer(ctx: any) {
  const actor = await requireDutiesAccess(ctx);
  if (!(await isDutyWeekReviewerUser(ctx, actor.user))) throw new Error("DUTY_WEEK_REVIEWER_REQUIRED");
  return actor;
}

async function writeRecord(ctx: any, weekStart: string, record: any, patch: Record<string, unknown>) {
  if (record) {
    await ctx.db.patch(record._id, patch);
    return;
  }
  const fields = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  await ctx.db.insert("dutyWeeks", { weekStart, ...fields });
}

async function audit(ctx: any, actorUserId: string, action: string, details: Record<string, unknown>, at: number) {
  await ctx.db.insert("auditLogs", { actorUserId, action, details: JSON.stringify(details), at });
}

/** Văn thư sends the week to BGH. */
export const submit = mutation({
  args: { weekStart: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireManager(ctx);
    const weekStart = assertWeekStart(args.weekStart);
    const { record, summary } = await loadWeek(ctx, weekStart);
    if (summary.status === "submitted") throw new Error("DUTY_WEEK_ALREADY_SUBMITTED");
    if (!summary.changeCount) throw new Error("DUTY_WEEK_NOTHING_TO_SUBMIT");
    const now = Date.now();
    await writeRecord(ctx, weekStart, record, {
      status: "submitted",
      submittedBy: String(user._id),
      submittedAt: now,
      returnNote: undefined,
      updatedBy: String(user._id),
      updatedAt: now,
    });
    await audit(ctx, String(user._id), "duty_week.submit", { weekStart, changes: summary.changeCount }, now);
    const reviewerIds = await listDutyWeekReviewerIds(ctx);
    if (reviewerIds.length) {
      await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
        userIds: reviewerIds,
        title: "Lịch công tác chờ duyệt",
        body: `Tuần ${weekLabel(weekStart)} · ${summary.changeCount} thay đổi`,
        kind: "duty",
        sourceType: "duty_week_review",
        sourceId: weekStart,
      });
    }
    return { submittedAt: now };
  },
});

/**
 * BGH approves the whole week in one go. `submittedAt` pins the exact submission
 * the reviewer looked at; any edit since then reopens the week and fails here.
 */
export const approve = mutation({
  args: { weekStart: v.string(), submittedAt: v.number() },
  handler: async (ctx, args) => {
    const { user } = await requireReviewer(ctx);
    const weekStart = assertWeekStart(args.weekStart);
    const { rows, record } = await loadWeek(ctx, weekStart);
    if (record?.status !== "submitted") throw new Error("DUTY_WEEK_NOT_SUBMITTED");
    if (record.submittedAt !== args.submittedAt) throw new Error("DUTY_WEEK_CHANGED");
    const now = Date.now();
    const published: DutyApprovalRow[] = [];
    let removed = 0;
    for (const row of rows) {
      const change = approvalPatchForDuty(row, weekStart, now);
      if (!change) continue;
      await ctx.db.patch(row._id as any, change.patch);
      if (change.kind === "removed") removed += 1;
      else published.push(row);
    }
    await writeRecord(ctx, weekStart, record, {
      status: "approved",
      approvedBy: String(user._id),
      approvedAt: now,
      returnNote: undefined,
      updatedBy: String(user._id),
      updatedAt: now,
    });
    await audit(ctx, String(user._id), "duty_week.approve", { weekStart, published: published.length, removed }, now);

    const users = (await ctx.db.query("users").collect()).filter((row: any) => row.status === "active");
    for (const row of published) {
      const userIds = dutyPushRecipientIds({
        departmentIds: row.departmentIds,
        participantUserIds: row.participantUserIds,
        unitUserIds: row.unitUserIds,
        users,
      });
      if (!userIds.length) continue;
      await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
        userIds,
        title: row.published ? "Công tác đã cập nhật" : "Công tác mới",
        body: String(row.title || row.content || "").trim(),
        kind: "duty",
        sourceType: "duty_assigned",
        sourceId: String(row._id),
      });
    }
    if (record.submittedBy) {
      await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
        userIds: [record.submittedBy],
        title: "Lịch công tác đã được duyệt",
        body: `Tuần ${weekLabel(weekStart)}`,
        kind: "duty",
        sourceType: "duty_week_approved",
        sourceId: weekStart,
      });
    }
    return { approvedAt: now, published: published.length, removed };
  },
});

/** BGH sends the week back to văn thư with a reason. */
export const returnWeek = mutation({
  args: { weekStart: v.string(), submittedAt: v.number(), note: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireReviewer(ctx);
    const weekStart = assertWeekStart(args.weekStart);
    const note = cleanReturnNote(args.note);
    const record = await loadDutyWeekRecord(ctx, weekStart);
    if (record?.status !== "submitted") throw new Error("DUTY_WEEK_NOT_SUBMITTED");
    if (record.submittedAt !== args.submittedAt) throw new Error("DUTY_WEEK_CHANGED");
    const now = Date.now();
    await ctx.db.patch(record._id, {
      status: "returned",
      returnedBy: String(user._id),
      returnedAt: now,
      returnNote: note,
      updatedBy: String(user._id),
      updatedAt: now,
    });
    await audit(ctx, String(user._id), "duty_week.return", { weekStart }, now);
    if (record.submittedBy) {
      await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
        userIds: [record.submittedBy],
        title: "Lịch công tác bị trả lại",
        body: `Tuần ${weekLabel(weekStart)}: ${note}`,
        kind: "duty",
        sourceType: "duty_week_returned",
        sourceId: weekStart,
      });
    }
  },
});

/** Văn thư throws away everything BGH has not approved yet for this week. */
export const discardChanges = mutation({
  args: { weekStart: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireManager(ctx);
    const weekStart = assertWeekStart(args.weekStart);
    const { rows, record, summary } = await loadWeek(ctx, weekStart);
    if (summary.status === "submitted") throw new Error("DUTY_WEEK_ALREADY_SUBMITTED");
    if (!summary.hasApprovedVersion) throw new Error("DUTY_WEEK_NO_APPROVED_VERSION");
    const now = Date.now();
    let reverted = 0;
    for (const row of rows) {
      const patch = discardPatchForDuty(row, weekStart, now, String(user._id));
      if (!patch) continue;
      await ctx.db.patch(row._id as any, patch);
      reverted += 1;
    }
    if (record?.status === "returned") {
      await ctx.db.patch(record._id, { status: "approved", updatedBy: String(user._id), updatedAt: now });
    }
    await audit(ctx, String(user._id), "duty_week.discard", { weekStart, reverted }, now);
    return { reverted };
  },
});

/**
 * One-off: label rows written before approval existed. Admin/mod rows become
 * "school", team-lead rows "team". Safe to run again; it only fills blanks.
 */
export const backfillScope = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("duties").collect();
    let school = 0;
    let team = 0;
    for (const row of rows) {
      if (row.scope) continue;
      const scope = await resolveDutyScope(ctx, row as any);
      await ctx.db.patch(row._id, { scope });
      if (scope === "school") school += 1;
      else team += 1;
    }
    return { school, team };
  },
});
