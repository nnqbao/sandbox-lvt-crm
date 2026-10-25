import { todoReminderNotificationItem } from "./personalTodoPolicy";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  activePositionLevel,
  currentUserOrThrow,
  getBooleanSystemSetting,
  getSourceNotificationMilestones,
  getWorkAssignerMode,
  getWorkVisibilityMode,
  isOperationalManagerRole,
  isSameDepartmentSubordinate,
  NOTIFICATION_DUTIES_ENABLED_SETTING_KEY,
  NOTIFICATION_DUTY_MILESTONES_SETTING_KEY,
  NOTIFICATION_SOURCE_DEFAULT,
  NOTIFICATION_WORK_ENABLED_SETTING_KEY,
  NOTIFICATION_WORK_MILESTONES_SETTING_KEY,
  resolveUserMenuAccess,
  canOperateMenu,
  WORK_ASSIGNER_MODE_ADMIN_MOD,
} from "./lib";
import {
  dutyListTitle,
  isDutyParticipant,
  isWorkNotificationAssignee,
  isWorkReleased,
  workListTitle,
} from "./assignmentPolicy";
import {
  canApproveWorkDocument,
  workApprovalDecidedAt,
  workApprovalRequestText,
  workApprovalResubmittedBy,
  workCreatorApprovalNotice,
} from "./workDocumentPolicy";
import {
  buildChatNotificationItem,
  CHAT_NOTIFICATION_TTL_MS,
  selectVisibleChatNotifications,
  shouldNotifyChatViewer,
} from "./chatMessagePolicy";
import { chatEventToFeedItem, mergeChatFeedItems } from "./chatNotifications";
import { canAccessDutyChat } from "./dutyMessagePolicy";
import { canAccessWorkChat } from "./workMessagePolicy";
import { moderatorDepartmentScope } from "./moderatorScope";
import { createMilestones, mergeMilestoneItems, unionMilestoneHours } from "./notificationSettings";
import { dutyNotificationEndFloor, loadPublicDutiesFromEndDate } from "./dutyRange";
import { projectPublicDuty } from "./dutyApproval";
import {
  canWriteEvaluationTextRule,
  evaluationPeriodLabel,
  evaluationReviewNotificationKey,
  evaluationWriterNotice,
  formatIsoDateVi,
  hasCountedEvaluation,
  isBghReviewer,
  STAFF_FAULT_NOTICE_MS,
  staffFaultNoticeVisible,
} from "./peopleReviewPolicy";

const HOUR_MS = 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * HOUR_MS;

type NotificationSource = {
  kind: "duty" | "work";
  sourceType: "duty" | "duty_assigned" | "approval" | "department_work" | "personal_task" | "completion_rejected" | "work_assigned" | "work_chat" | "duty_chat" | "work_approved" | "work_returned";
  sourceId: string;
  title: string;
  description: string;
  dueAt: number;
  priority?: "high" | "normal";
};

function weekRangeLabel(weekStart: string) {
  const [year, month, day] = weekStart.split("-").map(Number);
  const saturday = new Date(Date.UTC(year, month - 1, day + 5));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(day)}/${pad(month)} – ${pad(saturday.getUTCDate())}/${pad(saturday.getUTCMonth() + 1)}`;
}

const DUTY_WEEK_APPROVED_NOTICE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Weekly Lịch công tác approval: BGH sees weeks waiting for them; văn thư sees
 * weeks sent back or approved in the last 7 days.
 */
async function dutyWeekNotificationItems(ctx: any, user: any, level: number, now: number) {
  const base = { kind: "duty" as const, milestoneHours: 0 };
  if (!isOperationalManagerRole(user.role)) {
    if (level < 4) return [];
    const waiting = await ctx.db
      .query("dutyWeeks")
      .withIndex("by_status", (q: any) => q.eq("status", "submitted"))
      .collect();
    return waiting.map((row: any) => ({
      ...base,
      key: `duty:duty_week_review:${row.weekStart}:${row.submittedAt}`,
      sourceType: "duty_week_review" as const,
      sourceId: String(row.weekStart),
      title: `Lịch công tác tuần ${weekRangeLabel(row.weekStart)} chờ duyệt`,
      description: "Văn thư đã nộp lịch tuần, cần Ban Giám hiệu duyệt.",
      dueAt: Number(row.submittedAt) || now,
      milestoneLabel: "Cần duyệt",
      availableAt: Number(row.submittedAt) || now,
    }));
  }
  const [returned, approved] = await Promise.all([
    ctx.db.query("dutyWeeks").withIndex("by_status", (q: any) => q.eq("status", "returned")).collect(),
    ctx.db.query("dutyWeeks").withIndex("by_status", (q: any) => q.eq("status", "approved")).collect(),
  ]);
  return [
    ...returned.map((row: any) => ({
      ...base,
      key: `duty:duty_week_returned:${row.weekStart}:${row.returnedAt}`,
      sourceType: "duty_week_returned" as const,
      sourceId: String(row.weekStart),
      title: `Lịch công tác tuần ${weekRangeLabel(row.weekStart)} bị trả lại`,
      description: String(row.returnNote || "Ban Giám hiệu yêu cầu sửa lại."),
      dueAt: Number(row.returnedAt) || now,
      milestoneLabel: "Bị trả lại",
      availableAt: Number(row.returnedAt) || now,
      priority: "high" as const,
    })),
    ...approved
      .filter((row: any) => Number(row.approvedAt) >= now - DUTY_WEEK_APPROVED_NOTICE_MS)
      .map((row: any) => ({
        ...base,
        key: `duty:duty_week_approved:${row.weekStart}:${row.approvedAt}`,
        sourceType: "duty_week_approved" as const,
        sourceId: String(row.weekStart),
        title: `Lịch công tác tuần ${weekRangeLabel(row.weekStart)} đã được duyệt`,
        description: "Giáo viên đã thấy lịch tuần này.",
        dueAt: Number(row.approvedAt),
        milestoneLabel: "Đã duyệt",
        availableAt: Number(row.approvedAt),
      })),
  ];
}

/**
 * Đánh giá nhân sự / Ghi nhận lỗi bell items (kind "people", `menu` = web menu to open):
 * - the evaluated person: faults recorded for them in the last 30 days (never
 *   ones they recorded themselves), only when they can open Ghi nhận lỗi or
 *   Đánh giá nhân sự; the text carries the date only, never the reason;
 * - Ban giám hiệu: comments văn thư wrote on their behalf, waiting for them;
 * - the writer: their on-behalf comment was returned / approved.
 * Comment text and return reasons never appear here (Android shows feed text on the lock screen).
 */
async function peopleNotificationItems(
  ctx: any,
  user: any,
  menuAccess: Record<string, string>,
  level: number,
  positions: any[],
  now: number,
) {
  const isOps = isOperationalManagerRole(user.role);
  const canSeeStaffFaults = isOps || menuAccess["staff-faults"] !== "hidden";
  const canSeePeopleReview = isOps || menuAccess["people-review"] !== "hidden";
  const items: any[] = [];
  const userCache = new Map<string, any>();
  const loadUser = async (id: string) => {
    if (!userCache.has(id)) userCache.set(id, await ctx.db.get(id).catch(() => null));
    return userCache.get(id);
  };
  const nameOf = (row: any) => String(row?.name || row?.email || "Người dùng").trim() || "Người dùng";

  if (canSeeStaffFaults || canSeePeopleReview) {
    const faults = await ctx.db
      .query("personnelFaults")
      .withIndex("by_target", (q: any) => q.eq("targetUserId", String(user._id)).eq("active", true))
      .collect();
    for (const fault of faults) {
      if (fault.createdAt < now - STAFF_FAULT_NOTICE_MS) continue;
      if (!staffFaultNoticeVisible(fault, String(user._id), now)) continue;
      items.push({
        key: `people:staff_fault:${String(fault._id)}`,
        kind: "people" as const,
        sourceType: "staff_fault" as const,
        sourceId: String(fault._id),
        menu: canSeeStaffFaults ? "staff-faults" : "people-review",
        title: "Ghi nhận lỗi mới",
        description: `Ngày vi phạm ${formatIsoDateVi(fault.violationDate)}. Mở để xem chi tiết.`,
        dueAt: fault.createdAt,
        milestoneHours: 0,
        milestoneLabel: "Ghi nhận lỗi",
        availableAt: fault.createdAt,
      });
    }
  }

  if (!canSeePeopleReview) return items;

  if (isBghReviewer({ isOps, level })) {
    const pending = await ctx.db
      .query("personnelEvaluationTexts")
      .withIndex("by_status", (q: any) => q.eq("status", "pending").eq("active", true))
      .collect();
    for (const text of pending) {
      if (String(text.targetUserId) === String(user._id)) continue;
      if (String(text.evaluatorUserId) === String(user._id)) continue;
      const target = await loadUser(String(text.targetUserId));
      if (!target || target.status !== "active") continue;
      const targetIsOps = isOperationalManagerRole(target.role);
      const canWrite = canWriteEvaluationTextRule({
        actorUserId: String(user._id),
        actorIsOps: false,
        actorLevel: level,
        actorReachesTarget: false,
        targetUserId: String(target._id),
        targetIsOps,
        targetLevel: targetIsOps ? 0 : activePositionLevel(target, positions),
      });
      if (!canWrite) continue;
      const file = await ctx.db.get(text.fileId);
      if (!file?.active) continue;
      const fileTexts = await ctx.db
        .query("personnelEvaluationTexts")
        .withIndex("by_file", (q: any) => q.eq("fileId", String(file._id)).eq("active", true))
        .collect();
      if (hasCountedEvaluation(fileTexts, String(user._id))) continue;
      const writer = await loadUser(String(text.evaluatorUserId));
      const submittedAt = Number(text.submittedAt || text.createdAt) || now;
      items.push({
        key: evaluationReviewNotificationKey(String(text._id), submittedAt),
        kind: "people" as const,
        sourceType: "evaluation_text_review" as const,
        sourceId: String(text._id),
        menu: "people-review",
        title: `Nhận xét chờ duyệt: ${nameOf(target)}`,
        description: `${evaluationPeriodLabel(file)} · ${nameOf(writer)} (văn thư) viết thay, cần Ban Giám hiệu duyệt.`,
        dueAt: submittedAt,
        milestoneHours: 0,
        milestoneLabel: "Cần duyệt",
        availableAt: submittedAt,
      });
    }
  }

  const written = await ctx.db
    .query("personnelEvaluationTexts")
    .withIndex("by_evaluator", (q: any) => q.eq("evaluatorUserId", String(user._id)).eq("active", true))
    .collect();
  for (const text of written) {
    const notice = evaluationWriterNotice(text, String(user._id), now);
    if (!notice) continue;
    const target = await loadUser(String(text.targetUserId));
    const file = await ctx.db.get(text.fileId);
    if (!target || !file?.active) continue;
    const reviewer = text.reviewedByUserId ? await loadUser(String(text.reviewedByUserId)) : null;
    const returned = notice.decision === "returned";
    items.push({
      key: `people:${returned ? "evaluation_text_returned" : "evaluation_text_approved"}:${String(text._id)}:${notice.at}`,
      kind: "people" as const,
      sourceType: returned ? ("evaluation_text_returned" as const) : ("evaluation_text_approved" as const),
      sourceId: String(text._id),
      menu: "people-review",
      title: returned
        ? `Nhận xét bị trả lại: ${nameOf(target)}`
        : `Nhận xét đã được duyệt: ${nameOf(target)}`,
      description: returned
        ? `${evaluationPeriodLabel(file)} · ${nameOf(reviewer)} trả lại, hãy xem lý do, sửa và gửi duyệt lại.`
        : `${evaluationPeriodLabel(file)} · ${nameOf(reviewer)} đã duyệt.`,
      dueAt: notice.at,
      milestoneHours: 0,
      milestoneLabel: returned ? "Bị trả lại" : "Đã duyệt",
      availableAt: notice.at,
      ...(returned ? { priority: "high" as const } : {}),
    });
  }
  return items;
}

function dutyDueAt(duty: { endDate: string; endTime: string }) {
  const [year, month, day] = duty.endDate.split("-").map(Number);
  const [hour, minute] = duty.endTime.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) - VN_OFFSET_MS;
}

function workDueAt(deadline: string) {
  const [year, month, day] = deadline.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 23, 59) - VN_OFFSET_MS;
}

function taskCompletedForAll(task: any) {
  return task.assigneeUserIds.every((id: string) =>
    task.completedUserIds.some((completedId: string) => String(completedId) === String(id)),
  );
}

function workItemCompleted(tasks: any[]) {
  return tasks.length > 0 && tasks.every(taskCompletedForAll);
}

async function notificationContext(ctx: any) {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  const menuAccess = await resolveUserMenuAccess(ctx, user);
  if (!isOperationalManagerRole(user.role) && menuAccess.notifications === "hidden") {
    throw new Error("FORBIDDEN: notifications menu hidden");
  }
  return { user, menuAccess };
}

async function notificationItems(ctx: any, requestedNow?: number) {
  const now =
    requestedNow && Math.abs(requestedNow - Date.now()) <= 5 * 60 * 1000
      ? requestedNow
      : Date.now();
  const chatSince = now - CHAT_NOTIFICATION_TTL_MS;
  const dutyEndFloor = dutyNotificationEndFloor(now);
  const { user, menuAccess } = await notificationContext(ctx);
  const [dutiesEnabled, workEnabled, dutyMilestonesHours, workMilestonesHours] = await Promise.all([
    getBooleanSystemSetting(
      ctx,
      NOTIFICATION_DUTIES_ENABLED_SETTING_KEY,
      NOTIFICATION_SOURCE_DEFAULT,
    ),
    getBooleanSystemSetting(
      ctx,
      NOTIFICATION_WORK_ENABLED_SETTING_KEY,
      NOTIFICATION_SOURCE_DEFAULT,
    ),
    getSourceNotificationMilestones(ctx, NOTIFICATION_DUTY_MILESTONES_SETTING_KEY),
    getSourceNotificationMilestones(ctx, NOTIFICATION_WORK_MILESTONES_SETTING_KEY),
  ]);
  const canSeeDutiesModule =
    isOperationalManagerRole(user.role) || menuAccess.duties !== "hidden";
  const canSeeWorkModule =
    isOperationalManagerRole(user.role) || menuAccess.work !== "hidden";
  const canUseDuties = dutiesEnabled && canSeeDutiesModule;
  const canUseWork = workEnabled && canSeeWorkModule;
  const personalRows = await ctx.db
    .query("personalReminders")
    .withIndex("by_user", (q: any) => q.eq("userId", String(user._id)))
    .collect();
  const enabledPersonal = personalRows.filter(
    (row: any) => row.enabled && Array.isArray(row.milestonesHours) && row.milestonesHours.length,
  );
  const needDuties =
    canUseDuties ||
    canSeeDutiesModule ||
    enabledPersonal.some((row: any) => row.kind === "duty");
  const needWork =
    canUseWork ||
    canSeeWorkModule ||
    enabledPersonal.some((row: any) => row.kind === "work");

  const [duties, documents, workItems, personalTasks, positions, departments, users, workMessages, dutyMessages, storedChatEvents] = await Promise.all([
    // Reminders follow the approved schedule only.
    needDuties ? loadPublicDutiesFromEndDate(ctx, dutyEndFloor) : Promise.resolve([]),
    needWork ? ctx.db.query("officeDocuments").collect() : Promise.resolve([]),
    needWork ? ctx.db.query("workItems").collect() : Promise.resolve([]),
    needWork ? ctx.db.query("personalTasks").collect() : Promise.resolve([]),
    ctx.db.query("positions").collect(),
    ctx.db.query("departments").collect(),
    canSeeWorkModule || canSeeDutiesModule || canUseWork || canUseDuties
      ? ctx.db.query("users").collect()
      : Promise.resolve([]),
    canSeeWorkModule
      ? ctx.db.query("workMessages").withIndex("by_created", (q: any) => q.gte("createdAt", chatSince)).collect()
      : Promise.resolve([]),
    canSeeDutiesModule
      ? ctx.db.query("dutyMessages").withIndex("by_created", (q: any) => q.gte("createdAt", chatSince)).collect()
      : Promise.resolve([]),
    ctx.db
      .query("chatNotificationEvents")
      .withIndex("by_user_created", (q: any) => q.eq("userId", String(user._id)))
      .order("desc")
      .take(80),
  ]);
  const departmentMap = new Map(
    departments.map((department: any) => [String(department._id), department.name]),
  );
  const level = isOperationalManagerRole(user.role)
    ? 5
    : activePositionLevel(user, positions);
  const activeDocuments = documents.filter((document: any) => document.active);
  const activeWorkItems = workItems.filter((item: any) => item.active);
  const activeTasks = personalTasks.filter((task: any) => task.active);
  const documentsById = new Map(
    activeDocuments.map((document: any) => [String(document._id), document]),
  );
  const tasksByWorkItem = new Map<string, any[]>();
  for (const task of activeTasks) {
    const list = tasksByWorkItem.get(String(task.workItemId)) || [];
    list.push(task);
    tasksByWorkItem.set(String(task.workItemId), list);
  }

  const dutySources: NotificationSource[] = needDuties
    ? duties
        .filter(
          (duty: any) =>
            duty.active &&
            isDutyParticipant(user, duty),
        )
        .map((duty: any) => ({
          kind: "duty" as const,
          sourceType: "duty" as const,
          sourceId: String(duty._id),
          title: dutyListTitle(duty),
          description: `${duty.startDate} · ${duty.startTime}–${duty.endTime}`,
          dueAt: dutyDueAt(duty),
        }))
    : [];

  const assignerMode = await getWorkAssignerMode(ctx);
  const workSources: NotificationSource[] = [];
  const submittedAtByDocument = new Map<string, number>();
  if (canSeeWorkModule && level >= 4 && !isOperationalManagerRole(user.role)) {
    // Ban giám hiệu: documents waiting for my approval decision (workflow, not a reminder switch).
    const userNameById = new Map<string, string>(
      users.map((row: any) => [String(row._id), String(row.name || "").trim()]),
    );
    for (const document of activeDocuments) {
      if (!canApproveWorkDocument(document, String(user._id))) continue;
      submittedAtByDocument.set(String(document._id), Number(document.submittedAt || document.createdAt) || now);
      const resubmittedBy = workApprovalResubmittedBy(document);
      const { description } = workApprovalRequestText({
        title: workListTitle(document),
        editorName: resubmittedBy ? userNameById.get(resubmittedBy) || "Người dùng" : null,
      });
      workSources.push({
        kind: "work",
        sourceType: "approval",
        sourceId: String(document._id),
        title: `Công việc chờ duyệt: ${workListTitle(document)}`,
        description,
        dueAt: workDueAt(document.deadline),
      });
    }
  }

  if (needWork && assignerMode === WORK_ASSIGNER_MODE_ADMIN_MOD) {
    for (const item of activeWorkItems) {
      const document = documentsById.get(String(item.documentId)) as any;
      if (document?.status !== "approved") continue;
      const completed = (item.completedUserIds || []).some(
        (id: string) => String(id) === String(user._id),
      );
      if (completed) continue;
      const pendingOrRejected = (item.completions || []).find(
        (completion: any) =>
          String(completion.userId) === String(user._id) &&
          (completion.status === "pending_approval" || completion.status === "rejected"),
      );
      // Rejected has its own high-priority card; pending approval shouldn't re-ping due milestones.
      if (pendingOrRejected?.status === "pending_approval") continue;
      if (pendingOrRejected?.status === "rejected") {
        // still show due? No — rejection card covers it; skip duplicate due items.
        continue;
      }
      const type = item.assignmentType === "individual" ? "individual" : "department";
      const excluded = new Set<string>();
      for (const sibling of activeWorkItems) {
        if (String(sibling.documentId) !== String(item.documentId)) continue;
        if (sibling.assignmentType !== "individual") continue;
        for (const id of sibling.assigneeUserIds || []) excluded.add(String(id));
      }
      if (!isWorkNotificationAssignee({
        user,
        item,
        document,
        excludedIndividualIds: excluded,
      })) continue;
      workSources.push({
        kind: "work",
        sourceType: type === "individual" ? "personal_task" : "department_work",
        sourceId: String(item._id),
        title: item.content,
        description:
          type === "individual"
            ? "Công việc cá nhân cần hoàn thành."
            : `${departmentMap.get(String(item.departmentId)) || "Phòng ban"} · Công việc phòng ban`,
        dueAt: workDueAt(item.deadline),
      });
    }
  } else if (needWork && level >= 4) {
    for (const item of activeWorkItems) {
      const document = documentsById.get(String(item.documentId)) as any;
      const isApprover = document?.approverUserIds.some(
        (id: string) => String(id) === String(user._id),
      );
      if (
        document?.status === "approved" &&
        isApprover &&
        !workItemCompleted(tasksByWorkItem.get(String(item._id)) || [])
      ) {
        workSources.push({
          kind: "work",
          sourceType: "department_work",
          sourceId: String(item._id),
          title: item.content,
          description: `${departmentMap.get(String(item.departmentId)) || "Phòng ban"} · Công việc phòng ban`,
          dueAt: workDueAt(item.deadline),
        });
      }
    }
  } else if (needWork && (level === 2 || level === 3)) {
    for (const item of activeWorkItems) {
      const document = documentsById.get(String(item.documentId)) as any;
      if (
        document?.status === "approved" &&
        String(item.departmentId) === String(user.departmentId || "") &&
        !workItemCompleted(tasksByWorkItem.get(String(item._id)) || [])
      ) {
        workSources.push({
          kind: "work",
          sourceType: "department_work",
          sourceId: String(item._id),
          title: item.content,
          description: "Công việc của phòng ban cần hoàn thành.",
          dueAt: workDueAt(item.deadline),
        });
      }
    }
  } else if (needWork && level === 1) {
    for (const task of activeTasks) {
      const isAssigned = task.assigneeUserIds.some(
        (id: string) => String(id) === String(user._id),
      );
      const isCompleted = task.completedUserIds.some(
        (id: string) => String(id) === String(user._id),
      );
      const pendingRow = (task.completions || []).find(
        (completion: any) =>
          String(completion.userId) === String(user._id) &&
          (completion.status === "pending_approval" || completion.status === "rejected"),
      );
      if (isAssigned && !isCompleted && !pendingRow) {
        workSources.push({
          kind: "work",
          sourceType: "personal_task",
          sourceId: String(task._id),
          title: task.title,
          description: "Công việc cá nhân cần hoàn thành.",
          dueAt: workDueAt(task.deadline),
        });
      }
    }
  }

  if (canUseWork) {
    for (const item of activeWorkItems) {
      const row = (item.completions || []).find(
        (completion: any) =>
          String(completion.userId) === String(user._id) &&
          completion.status === "rejected",
      );
      if (!row) continue;
      workSources.push({
        kind: "work",
        sourceType: "completion_rejected",
        sourceId: String(item._id),
        title: `Bị từ chối: ${item.content}`,
        description: row.rejectionReason || "Task bị trả về — hãy hoàn thành lại sớm.",
        dueAt: row.reviewedAt || workDueAt(item.deadline),
        priority: "high",
      });
    }
    for (const task of activeTasks) {
      const row = (task.completions || []).find(
        (completion: any) =>
          String(completion.userId) === String(user._id) &&
          completion.status === "rejected",
      );
      if (!row) continue;
      workSources.push({
        kind: "work",
        sourceType: "completion_rejected",
        sourceId: String(task._id),
        title: `Bị từ chối: ${task.title}`,
        description: row.rejectionReason || "Task bị trả về — hãy hoàn thành lại sớm.",
        dueAt: row.reviewedAt || workDueAt(task.deadline),
        priority: "high",
      });
    }
  }

  // A new duty is an assignment event, not a deadline reminder. Keep it visible
  // until the duty ends so an assignee who opens the app after creation still sees it.
  const newDutyAssignments = canUseDuties
    ? duties
        .filter(
          (duty: any) =>
            duty.active &&
            isDutyParticipant(user, duty) &&
            duty.createdAt &&
            dutyDueAt(duty) >= now,
        )
        .map((duty: any) => ({
          key: `duty:duty_assigned:${String(duty._id)}:new`,
          kind: "duty" as const,
          sourceType: "duty_assigned" as const,
          sourceId: String(duty._id),
          title: `Công tác mới: ${dutyListTitle(duty)}`,
          description: `${duty.startDate} · ${duty.startTime}–${duty.endTime}`,
          dueAt: dutyDueAt(duty),
          milestoneHours: 0,
          milestoneLabel: "Mới phân công",
          availableAt: Number(duty.publishedAt) || duty.createdAt,
        }))
    : [];
  const newWorkAssignments = canUseWork
    ? activeWorkItems
        .filter((item: any) => {
          const document = documentsById.get(String(item.documentId)) as any;
          if (!isWorkReleased(document) || !item.createdAt) return false;
          if (workDueAt(item.deadline) < now) return false;
          const completed = (item.completedUserIds || []).some(
            (id: string) => String(id) === String(user._id),
          );
          if (completed) return false;
          const pendingOrRejected = (item.completions || []).find(
            (completion: any) =>
              String(completion.userId) === String(user._id) &&
              (completion.status === "pending_approval" || completion.status === "rejected"),
          );
          if (pendingOrRejected) return false;
          const excluded = new Set<string>();
          for (const sibling of activeWorkItems) {
            if (String(sibling.documentId) !== String(item.documentId)) continue;
            if (sibling.assignmentType !== "individual") continue;
            for (const id of sibling.assigneeUserIds || []) excluded.add(String(id));
          }
          return isWorkNotificationAssignee({
            user,
            item,
            document,
            excludedIndividualIds: excluded,
          });
        })
        .map((item: any) => {
          const document = documentsById.get(String(item.documentId)) as any;
          const type = item.assignmentType === "individual" ? "individual" : "department";
          // An admin edit can send a released document back to approval while keeping
          // its work items; the re-release is a new "Công việc mới" for the assignee.
          const resubmittedAt = Number(document?.submittedAt) || 0;
          const releaseSuffix = resubmittedAt > (Number(item.createdAt) || 0) ? `:${resubmittedAt}` : "";
          return {
            key: `work:work_assigned:${String(item._id)}:new${releaseSuffix}`,
            kind: "work" as const,
            sourceType: "work_assigned" as const,
            sourceId: String(item._id),
            title: `Công việc mới: ${item.content || workListTitle(document || {})}`,
            description:
              type === "individual"
                ? "Công việc cá nhân cần hoàn thành."
                : `${departmentMap.get(String(item.departmentId)) || "Phòng ban"} · Công việc phòng ban`,
            dueAt: workDueAt(item.deadline),
            milestoneHours: 0,
            milestoneLabel: "Mới phân công",
            // Approval-required work becomes visible when Ban giám hiệu releases it.
            availableAt: Math.max(Number(item.createdAt) || 0, workApprovalDecidedAt(document) || 0),
          };
        })
    : [];
  const sourceByKindId = new Map(
    [...dutySources, ...workSources].map((source) => [`${source.kind}:${source.sourceId}`, source]),
  );
  const personalScheduled = enabledPersonal.flatMap((row: any) => {
    const source = sourceByKindId.get(`${row.kind}:${row.sourceId}`);
    if (!source) return [];
    return createMilestones([source], row.milestonesHours, now);
  });
  const noMilestones: ReturnType<typeof createMilestones> = [];
  const scheduledMilestones = mergeMilestoneItems([
    canUseDuties ? createMilestones(dutySources, dutyMilestonesHours, now) : noMilestones,
    canUseWork ? createMilestones(workSources, workMilestonesHours, now) : noMilestones,
    personalScheduled,
  ]);
  const approvalIdsWithMilestone = new Set(
    scheduledMilestones
      .filter((item) => item.sourceType === "approval")
      .map((item) => item.sourceId),
  );
  const pendingApprovalItems = workSources
    .filter(
      (source) =>
        source.sourceType === "approval" &&
        !approvalIdsWithMilestone.has(source.sourceId),
    )
    .map((source) => {
      const submittedAt = submittedAtByDocument.get(source.sourceId) || now;
      return {
        // A resubmission is a new request: the key changes so it shows as unread again.
        key: `work:approval:${source.sourceId}:${submittedAt}`,
        ...source,
        milestoneHours: 0,
        milestoneLabel: "Cần duyệt",
        availableAt: submittedAt,
      };
    });
  // Creator (văn thư): approval outcome of documents they sent to Ban giám hiệu.
  const creatorApprovalItems = canSeeWorkModule
    ? activeDocuments.flatMap((document: any) => {
        const notice = workCreatorApprovalNotice(document, String(user._id), now);
        if (!notice) return [];
        const returned = notice.decision === "rejected";
        return [{
          key: `work:${returned ? "work_returned" : "work_approved"}:${String(document._id)}:${notice.at}`,
          kind: "work" as const,
          sourceType: returned ? ("work_returned" as const) : ("work_approved" as const),
          sourceId: String(document._id),
          title: returned
            ? `Công việc bị trả lại: ${workListTitle(document)}`
            : `Công việc đã được duyệt: ${workListTitle(document)}`,
          description: returned
            ? notice.reason || "Ban giám hiệu đã trả lại, hãy sửa và gửi duyệt lại."
            : "Ban giám hiệu đã duyệt, công việc đã được giao.",
          dueAt: notice.at,
          milestoneHours: 0,
          milestoneLabel: returned ? "Bị trả lại" : "Đã duyệt",
          availableAt: notice.at,
          ...(returned ? { priority: "high" as const } : {}),
        }];
      })
    : [];
  // Approval steps are workflow, not deadline reminders: they ignore the duty reminder switch.
  const dutyWeekItems = canSeeDutiesModule
    ? await dutyWeekNotificationItems(ctx, user, level, now)
    : [];
  const usersById = new Map(users.map((row: any) => [String(row._id), row]));
  const displayUserName = (id: string) => {
    const row = usersById.get(String(id)) as { name?: string; email?: string } | undefined;
    return String(row?.name || row?.email || "Người dùng").trim() || "Người dùng";
  };
  const visibilityMode = canSeeWorkModule ? await getWorkVisibilityMode(ctx) : null;
  const workItemsByDocument = new Map<string, any[]>();
  const personalTasksByDocument = new Map<string, any[]>();
  if (canSeeWorkModule) {
    for (const item of activeWorkItems) {
      const list = workItemsByDocument.get(String(item.documentId)) || [];
      list.push(item);
      workItemsByDocument.set(String(item.documentId), list);
    }
    for (const task of activeTasks) {
      const parent = activeWorkItems.find((item: any) => String(item._id) === String(task.workItemId));
      if (!parent) continue;
      const list = personalTasksByDocument.get(String(parent.documentId)) || [];
      list.push(task);
      personalTasksByDocument.set(String(parent.documentId), list);
    }
  }
  const workChatAccess = new Map<string, boolean>();
  const dutyChatAccess = new Map<string, boolean>();
  const dutySubordinates = canSeeDutiesModule
    ? users.filter(
        (target: any) =>
          target.status === "active" && isSameDepartmentSubordinate(user, target, positions),
      )
    : [];
  const dutyById = new Map<string, any>(duties.map((duty: any) => [String(duty._id), duty]));
  if (canSeeDutiesModule && dutyMessages.length) {
    const missingDutyIds = [
      ...new Set(
        dutyMessages
          .map((row: any) => String(row.dutyId || ""))
          .filter((dutyId: string) => dutyId && !dutyById.has(dutyId)),
      ),
    ];
    const extraDuties = await Promise.all(missingDutyIds.map((dutyId) => ctx.db.get(dutyId)));
    for (const duty of extraDuties) {
      const visible = isOperationalManagerRole(user.role) ? duty : projectPublicDuty(duty);
      if (visible) dutyById.set(String(visible._id), visible);
    }
  }
  const computedChatItems = selectVisibleChatNotifications(
    [
      ...(canSeeWorkModule
        ? workMessages
            .filter((row: any) => {
              const documentId = String(row.documentId || "");
              if (!workChatAccess.has(documentId)) {
                const document = documentsById.get(documentId);
                const items = workItemsByDocument.get(documentId) || [];
                const assigned = isWorkReleased(document as any) && items.some((item: any) =>
                  isWorkNotificationAssignee({
                    user,
                    item,
                    document: document as { approverUserIds?: string[] } | undefined,
                  }),
                );
                workChatAccess.set(
                  documentId,
                  assigned ||
                  canAccessWorkChat({
                    actorUserId: String(user._id),
                    actorRole: user.role,
                    actorLevel: level,
                    actorDepartmentId: String(user.departmentId || ""),
                    visibilityMode: visibilityMode || "school",
                    document: document as { active?: boolean; createdBy?: string; status?: string } | undefined,
                    workItems: items,
                    personalTasks: personalTasksByDocument.get(documentId) || [],
                    usersById: usersById as Map<string, { status?: string }>,
                    departmentScope: moderatorDepartmentScope(user),
                  }),
                );
              }
              return shouldNotifyChatViewer({
                viewerUserId: String(user._id),
                authorUserId: String(row.authorUserId),
                canSeeChat: Boolean(workChatAccess.get(documentId)),
                recalledAt: row.recalledAt,
                active: row.active,
              });
            })
            .map((row: any) => {
              const document = documentsById.get(String(row.documentId));
              return buildChatNotificationItem({
                kind: "work",
                messageId: String(row._id),
                entityId: String(row.documentId),
                entityTitle: workListTitle(document || {}),
                authorName: displayUserName(row.authorUserId),
                bodyText: String(row.bodyText || ""),
                createdAt: row.createdAt,
              });
            })
        : []),
      ...(canSeeDutiesModule
        ? dutyMessages
            .filter((row: any) => {
              const dutyId = String(row.dutyId || "");
              if (!dutyChatAccess.has(dutyId)) {
                const duty = dutyById.get(dutyId);
                dutyChatAccess.set(
                  dutyId,
                  canAccessDutyChat({
                    actorUserId: String(user._id),
                    actorRole: String(user.role || ""),
                    actorAccess: String(menuAccess.duties || ""),
                    actorDepartmentId: user.departmentId,
                    duty,
                    subordinateUsers: dutySubordinates,
                  }),
                );
              }
              return shouldNotifyChatViewer({
                viewerUserId: String(user._id),
                authorUserId: String(row.authorUserId),
                canSeeChat: Boolean(dutyChatAccess.get(dutyId)),
                recalledAt: row.recalledAt,
                active: row.active,
              });
            })
            .map((row: any) => {
              const duty = dutyById.get(String(row.dutyId));
              return buildChatNotificationItem({
                kind: "duty",
                messageId: String(row._id),
                entityId: String(row.dutyId),
                entityTitle: duty ? dutyListTitle(duty) : "Công tác",
                authorName: displayUserName(row.authorUserId),
                bodyText: String(row.bodyText || ""),
                createdAt: row.createdAt,
              });
            })
        : []),
    ],
    now,
  );
  const storedChatItems = storedChatEvents
    .filter((row: any) => {
      if (row.active === false) return false;
      if (row.kind === "group" || row.sourceType === "group_chat") return true;
      if (row.kind === "duty") return canSeeDutiesModule;
      return canSeeWorkModule;
    })
    .map((row: any) => chatEventToFeedItem(row));
  const chatItems = mergeChatFeedItems([storedChatItems, computedChatItems], now);
  // "Việc của tôi": owner's own fired reminders only; independent of work/duties menus.
  const todoRows = await ctx.db
    .query("personalTodos")
    .withIndex("by_user_active_due", (q: any) => q.eq("userId", user._id).eq("active", true))
    .collect();
  const todoItems = todoRows
    .map((row: any) => todoReminderNotificationItem(row))
    .filter((item: any): item is NonNullable<ReturnType<typeof todoReminderNotificationItem>> => item !== null);
  const peopleItems = await peopleNotificationItems(ctx, user, menuAccess, level, positions, now);
  const milestones = [...newDutyAssignments, ...newWorkAssignments, ...pendingApprovalItems, ...creatorApprovalItems, ...dutyWeekItems, ...chatItems, ...scheduledMilestones, ...todoItems, ...peopleItems]
    .sort((a, b) => b.availableAt - a.availableAt || a.title.localeCompare(b.title, "vi"));
  const [reads, dismissals] = await Promise.all([
    ctx.db
      .query("notificationReads")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect(),
    ctx.db
      .query("notificationDismissals")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect(),
  ]);
  const readMap = new Map(
    reads.map((read: any) => [read.notificationKey, read.readAt]),
  );
  const dismissedKeys = new Set(dismissals.map((item: any) => item.notificationKey));
  const items = milestones.filter((item) => !dismissedKeys.has(item.key)).map((item) => ({
    ...item,
    read: readMap.has(item.key),
    readAt: readMap.get(item.key) || null,
  }));
  return {
    items,
    unreadCount: items.filter((item) => !item.read).length,
    canDelete: canOperateMenu(menuAccess.notifications),
    settings: {
      dutiesEnabled,
      workEnabled,
      dutyMilestonesHours,
      workMilestonesHours,
      milestonesHours: unionMilestoneHours(dutyMilestonesHours, workMilestonesHours),
    },
  };
}

export const feed = query({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => notificationItems(ctx, args.now),
});

export const markRead = mutation({
  args: { notificationKey: v.string() },
  handler: async (ctx, args) => {
    const { user } = await notificationContext(ctx);
    const notificationKey = args.notificationKey.trim();
    if (!notificationKey || notificationKey.length > 300) {
      throw new Error("INVALID_NOTIFICATION_KEY");
    }
    const existing = await ctx.db
      .query("notificationReads")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", user._id).eq("notificationKey", notificationKey),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("notificationReads", {
        userId: user._id,
        notificationKey,
        readAt: Date.now(),
      });
    }
  },
});

export const markAllRead = mutation({
  args: { notificationKeys: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { user } = await notificationContext(ctx);
    const keys = [...new Set(args.notificationKeys.map((key) => key.trim()).filter(Boolean))];
    if (keys.length > 500 || keys.some((key) => key.length > 300)) {
      throw new Error("INVALID_NOTIFICATION_KEYS");
    }
    const existing = await ctx.db
      .query("notificationReads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const existingKeys = new Set(existing.map((read) => read.notificationKey));
    const now = Date.now();
    for (const notificationKey of keys) {
      if (!existingKeys.has(notificationKey)) {
        await ctx.db.insert("notificationReads", {
          userId: user._id,
          notificationKey,
          readAt: now,
        });
      }
    }
  },
});

export const dismiss = mutation({
  args: { notificationKey: v.string() },
  handler: async (ctx, args) => {
    const { user, menuAccess } = await notificationContext(ctx);
    if (!canOperateMenu(menuAccess.notifications)) {
      throw new Error("FORBIDDEN: notifications access required");
    }
    const notificationKey = args.notificationKey.trim();
    if (!notificationKey || notificationKey.length > 300) {
      throw new Error("INVALID_NOTIFICATION_KEY");
    }
    const existing = await ctx.db
      .query("notificationDismissals")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", user._id).eq("notificationKey", notificationKey),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("notificationDismissals", {
        userId: user._id,
        notificationKey,
        dismissedAt: Date.now(),
      });
    }
  },
});
