import { v } from "convex/values";
import {
  activePositionLevel,
  assignmentCreatorOrThrow,
  currentUserOrThrow,
  getWorkAssignerMode,
  getWorkVisibilityMode,
  isOperationalManagerRole,
  resolveUserMenuAccess,
  WORK_ASSIGNER_MODE_ADMIN_MOD,
  WORK_ASSIGNER_MODE_SUPERVISOR,
} from "./lib";
import {
  canAssignWorkDepartment,
  canAssignWorkToUser,
  canCreateWorkDocuments,
  canCreatorMutateWork,
  canReviewWorkCompletion,
  canSeeArchivedWork,
  canSeeLiveWork,
  cleanWorkTitle,
  cleanCompletionNote,
  isWorkItemArchived,
  isWorkReleased,
  isWorkStatusCompleted,
  workMenuBadgeCount,
  shouldBypassWorkCompletionReview,
  workAssignmentPushUserIds,
  workListTitle,
} from "./assignmentPolicy";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  claimDriveUploadCleanup,
  commitDriveUploadStage,
  completeDriveUploadCleanup,
  finalizeDriveUploadStage,
  registerDriveUploadStage,
  releaseDriveUploadCleanup,
} from "./driveUploadStages";
import {
  applyWorkApproval,
  applyWorkRejection,
  canApproveWorkDocument,
  canMutateWorkDocument,
  canRejectWorkDocument,
  cleanWorkReturnReason,
  isDesignatedWorkApprover,
  isEligibleWorkApprover,
  isWorkApprovalLocked,
  workApprovalDecidedAt,
  workApprovalSubmission,
  workDocumentRequiresApproval,
  workReturnReason,
} from "./workDocumentPolicy";
import {
  assertActiveDocumentType,
  listActiveDocumentTypes,
} from "./documentTypes";
import { requireDocumentTypeId, resolveDisplayedDocumentType } from "./documentTypePolicy";
import {
  isUserInModeratorScope,
  isWorkDocumentInModeratorScope,
  MODERATOR_DEPARTMENT_SCOPE_ERROR,
  moderatorDepartmentScope,
  workDocumentScopeAssignments,
} from "./moderatorScope";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const APPROVAL_HISTORY_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "xls", "png", "jpg", "jpeg"]);

function todayInVietnam() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function assertQualityPercent(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("INVALID_QUALITY_PERCENT");
  }
  return Math.round(value);
}

type CompletionRow = {
  userId: string;
  status: string;
  submittedAt: number;
  submittedLate: boolean;
  qualityPercent?: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectionReason?: string;
  note?: string;
  driveFileId?: string;
  driveChecksum?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  documentTypeId?: string;
};

function completionsOf(item: any): CompletionRow[] {
  return Array.isArray(item?.completions) ? item.completions : [];
}

function completionForUser(item: any, userId: string): CompletionRow | null {
  return completionsOf(item).find((row) => String(row.userId) === String(userId)) || null;
}

function isUserApproved(item: any, userId: string) {
  const row = completionForUser(item, userId);
  if (row) return row.status === "approved";
  return (item.completedUserIds || []).some((id: string) => String(id) === String(userId));
}

function approvedUserIds(item: any) {
  const fromCompletions = completionsOf(item)
    .filter((row) => row.status === "approved")
    .map((row) => String(row.userId));
  if (fromCompletions.length) {
    return [...new Set(fromCompletions)];
  }
  return (item.completedUserIds || []).map(String);
}

function upsertCompletion(item: any, next: CompletionRow) {
  const current = completionsOf(item).filter((row) => String(row.userId) !== String(next.userId));
  return [...current, next];
}

function syncApprovedArrays(completions: CompletionRow[]) {
  const approved = completions.filter((row) => row.status === "approved");
  return {
    completedUserIds: approved.map((row) => row.userId),
    completedLateUserIds: approved.filter((row) => row.submittedLate).map((row) => row.userId),
  };
}

function extensionOf(fileName: string) {
  return fileName.trim().toLowerCase().split(".").pop() || "";
}

function fileTypeForName(fileName: string) {
  const types: Record<string, string> = {
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    pdf: "application/pdf",
    png: "image/png",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return types[extensionOf(fileName)] || "application/octet-stream";
}

function assertDate(value: string) {
  const date = value.trim();
  if (!DATE_RE.test(date)) throw new Error("INVALID_WORK_DEADLINE");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("INVALID_WORK_DEADLINE");
  }
  return date;
}

function assertContent(value: string) {
  const content = value.trim();
  if (!content || content.length > 2000) throw new Error("INVALID_WORK_CONTENT");
  return content;
}

type DocumentAssignmentInput = {
  type?: "department" | "individual";
  departmentId?: string;
  userIds?: string[];
  content: string;
  deadline: string;
};

type ValidatedDocumentAssignment = {
  type: "department" | "individual";
  departmentId: string;
  userIds: string[];
  content: string;
  deadline: string;
};

function validateDocumentFile(fileNameInput: string, fileSize: number) {
  const fileName = fileNameInput.trim();
  const extension = extensionOf(fileName);
  if (!fileName || fileName.length > 255 || !ACCEPTED_EXTENSIONS.has(extension)) {
    throw new Error("INVALID_WORK_FILE");
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
    throw new Error("WORK_FILE_TOO_LARGE");
  }
  return { fileName, fileType: fileTypeForName(fileName) };
}

async function validateDocumentWorkflow(
  ctx: any,
  assignmentInputs: DocumentAssignmentInput[],
  approverInputs: string[],
) {
  if (!assignmentInputs.length) throw new Error("WORK_ASSIGNMENTS_REQUIRED");

  const [departments, users, positions] = await Promise.all([
    ctx.db.query("departments").collect(),
    ctx.db.query("users").collect(),
    ctx.db.query("positions").collect(),
  ]);
  const activeUsers = users.filter((user: any) => user.status === "active");
  const assignments: ValidatedDocumentAssignment[] = assignmentInputs.map((assignment) => {
    const type = assignment.type === "individual" ? "individual" : "department";
    const content = assertContent(assignment.content);
    const deadline = assertDate(assignment.deadline);
    if (type === "department") {
      const departmentId = String(assignment.departmentId || "").trim();
      const department = departments.find((item: any) => String(item._id) === departmentId);
      if (!departmentId || !department?.active) throw new Error("INVALID_DEPARTMENT");
      return { type, departmentId, userIds: [], content, deadline };
    }

    const userIds = [
      ...new Set((assignment.userIds || []).map((id) => String(id).trim()).filter(Boolean)),
    ];
    if (!userIds.length) throw new Error("WORK_ASSIGNEES_REQUIRED");
    for (const userId of userIds) {
      if (!activeUsers.some((user: any) => String(user._id) === userId)) {
        throw new Error("INVALID_WORK_ASSIGNEE");
      }
    }
    const firstUser = activeUsers.find((user: any) => String(user._id) === userIds[0]);
    return {
      type,
      departmentId: String(firstUser?.departmentId || ""),
      userIds,
      content,
      deadline,
    };
  });

  const departmentIds = assignments
    .filter((assignment) => assignment.type === "department")
    .map((assignment) => assignment.departmentId);
  if (new Set(departmentIds).size !== departmentIds.length) {
    throw new Error("WORK_DEPARTMENT_DUPLICATE");
  }

  const approverUserIds = [
    ...new Set(approverInputs.map((id) => String(id).trim()).filter(Boolean)),
  ];
  for (const userId of approverUserIds) {
    const approver = activeUsers.find((user: any) => String(user._id) === userId);
    if (
      !approver ||
      !isEligibleWorkApprover({
        status: approver.status,
        role: approver.role,
        level: activePositionLevel(approver, positions),
      })
    ) {
      throw new Error("INVALID_WORK_APPROVER");
    }
  }

  return { assignments, approverUserIds };
}

function storedAssignments(assignments: ValidatedDocumentAssignment[]) {
  return assignments.map((assignment) => ({
    type: assignment.type,
    departmentId: assignment.departmentId || undefined,
    userIds: assignment.type === "individual" ? assignment.userIds : undefined,
    content: assignment.content,
    deadline: assignment.deadline,
  }));
}

async function insertDocumentWorkItems(
  ctx: any,
  documentId: Id<"officeDocuments">,
  assignments: ValidatedDocumentAssignment[],
  actorUserId: Id<"users">,
  now: number,
) {
  for (const assignment of assignments) {
    await ctx.db.insert("workItems", {
      documentId,
      departmentId: assignment.departmentId || "",
      assignmentType: assignment.type,
      assigneeUserIds: assignment.type === "individual" ? assignment.userIds : [],
      completedUserIds: [],
      completedLateUserIds: [],
      content: assignment.content,
      deadline: assignment.deadline,
      active: true,
      createdBy: actorUserId,
      updatedBy: actorUserId,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function relatedDocumentWork(ctx: any, documentId: Id<"officeDocuments">) {
  const workItems = (await ctx.db.query("workItems").collect()).filter(
    (item: any) => String(item.documentId) === String(documentId),
  );
  const workItemIds = new Set(workItems.map((item: any) => String(item._id)));
  const personalTasks = (await ctx.db.query("personalTasks").collect()).filter(
    (task: any) => workItemIds.has(String(task.workItemId)),
  );
  return { workItems, personalTasks };
}

async function deactivateRelatedDocumentWork(
  ctx: any,
  related: { workItems: any[]; personalTasks: any[] },
  actorUserId: Id<"users">,
  now: number,
) {
  for (const task of related.personalTasks) {
    await ctx.db.patch(task._id, { active: false, updatedBy: actorUserId, updatedAt: now });
  }
  for (const item of related.workItems) {
    await ctx.db.patch(item._id, { active: false, updatedBy: actorUserId, updatedAt: now });
  }
  return {
    workItemCount: related.workItems.length,
    personalTaskCount: related.personalTasks.length,
  };
}

async function createWorkDriveCleanupJob(
  ctx: any,
  driveFileId: string | undefined,
  documentId: Id<"officeDocuments">,
  actorUserId: Id<"users">,
  now: number,
) {
  if (!driveFileId) return null;
  return await ctx.db.insert("driveCleanupJobs", {
    driveFileId,
    purpose: "work",
    resourceId: String(documentId),
    createdBy: actorUserId,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
}

function assignmentTypeOf(item: any): "department" | "individual" {
  return item?.assignmentType === "individual" ? "individual" : "department";
}

async function requireWorkWrite(ctx: any) {
  const base = await assignmentCreatorOrThrow(ctx, canCreateWorkDocuments);
  const actor = { ...base, departmentScope: moderatorDepartmentScope(base.user) };
  if (actor.isOps) return actor;
  const menuAccess = await resolveUserMenuAccess(ctx, actor.user);
  if ((menuAccess.work || "hidden") === "hidden") {
    throw new Error("FORBIDDEN: work menu hidden");
  }
  return actor;
}

function usersByIdMap(users: any[]) {
  return new Map<string, any>(users.map((user: any) => [String(user._id), user]));
}

/** Department-scoped moderators manage only documents whose every assignment is inside their department. */
function isDocumentInScope(
  scope: string | null,
  document: any,
  usersById: Map<string, { departmentId?: string | null }>,
) {
  return isWorkDocumentInModeratorScope(scope, workDocumentScopeAssignments(document), usersById);
}

function personalTaskInScope(
  scope: string | null,
  task: any,
  activeWorkItems: any[],
  docsById: Map<string, any>,
  usersById: Map<string, { departmentId?: string | null }>,
) {
  if (!scope) return true;
  const item = activeWorkItems.find((workItem: any) => String(workItem._id) === String(task.workItemId));
  const document = item ? docsById.get(String(item.documentId)) : null;
  return Boolean(document) && isDocumentInScope(scope, document, usersById);
}

async function documentInActorScope(ctx: any, scope: string | null, document: any) {
  if (!scope) return true;
  const users = await ctx.db.query("users").collect();
  return isDocumentInScope(scope, document, usersByIdMap(users));
}

/** Non-ops creator → target rule (BGH: any department, lower level; others: same department, lower level). */
function actorCanAssignUser(
  actor: { user: any; level: number; positions: any[] },
  target: any,
) {
  return canAssignWorkToUser(
    {
      _id: String(actor.user._id),
      role: String(actor.user.role || ""),
      level: actor.level,
      departmentId: actor.user.departmentId,
    },
    {
      _id: String(target._id),
      level: activePositionLevel(target, actor.positions),
      departmentId: target.departmentId,
    },
  );
}

async function assertWorkAssignmentsForActor(
  ctx: any,
  assignmentInputs: DocumentAssignmentInput[],
  actor: { user: any; isOps: boolean; level: number; positions: any[]; departmentScope: string | null },
  approverInputs: string[] = [],
) {
  const { assignments, approverUserIds } = await validateDocumentWorkflow(
    ctx,
    assignmentInputs,
    approverInputs,
  );
  if (actor.isOps && actor.departmentScope) {
    const users = await ctx.db.query("users").collect();
    if (!isWorkDocumentInModeratorScope(actor.departmentScope, assignments, usersByIdMap(users))) {
      throw new Error(MODERATOR_DEPARTMENT_SCOPE_ERROR);
    }
  }
  if (!actor.isOps) {
    for (const assignment of assignments) {
      if (assignment.type !== "individual") {
        if (!canAssignWorkDepartment(actor.user.role, actor.level)) {
          throw new Error("WORK_DEPARTMENT_FORBIDDEN");
        }
        continue;
      }
      for (const userId of assignment.userIds) {
        const target = await ctx.db.get(userId);
        if (!target || !actorCanAssignUser(actor, target)) {
          throw new Error("WORK_ASSIGNEE_NOT_SUBORDINATE");
        }
      }
    }
  }
  return { assignments, approverUserIds };
}

async function requireWorkAccess(ctx: any) {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  const menuAccess = await resolveUserMenuAccess(ctx, user);
  if (!isOperationalManagerRole(user.role) && menuAccess.work === "hidden") {
    throw new Error("FORBIDDEN: work menu hidden");
  }
  const positions = await ctx.db.query("positions").collect();
  return {
    user,
    access: isOperationalManagerRole(user.role) ? "view_all" : menuAccess.work,
    isAdmin: isOperationalManagerRole(user.role),
    departmentScope: moderatorDepartmentScope(user),
    level: isOperationalManagerRole(user.role) ? 5 : activePositionLevel(user, positions),
    positions,
  };
}

function completionStatus(tasks: any[], today = todayInVietnam()) {
  if (!tasks.length) return "unassigned";
  const statuses = tasks.map((task) => taskOverallStatus(task, today));
  if (statuses.every((status) => status === "completed" || status === "completed_late")) {
    return statuses.some((status) => status === "completed_late") ? "completed_late" : "completed";
  }
  if (statuses.some((status) => status === "pending_completion")) return "pending_completion";
  if (statuses.some((status) => status === "overdue" || status === "rejected_completion")) {
    return "not_completed";
  }
  return "in_progress";
}

function memberCompletionStatus(
  members: { _id: string }[],
  item: any,
  deadline: string,
  today = todayInVietnam(),
) {
  if (!members.length) return "completed";
  const allCompleted = members.every((member) => isUserApproved(item, String(member._id)));
  if (allCompleted) return "completed";
  const anyPending = members.some((member) => {
    const row = completionForUser(item, String(member._id));
    return row?.status === "pending_approval";
  });
  if (anyPending) return "pending_completion";
  if (deadline < today) return "not_completed";
  return "in_progress";
}

function taskStatus(task: any, userId: string, today = todayInVietnam()) {
  const row = completionForUser(task, userId);
  if (row?.status === "approved") {
    return row.submittedLate ? "completed_late" : "completed";
  }
  if (row?.status === "pending_approval") return "pending_completion";
  if (row?.status === "rejected") return "rejected_completion";
  if ((task.completedUserIds || []).some((id: string) => String(id) === String(userId))) {
    const late = (task.completedLateUserIds || []).some((id: string) => String(id) === String(userId));
    return late ? "completed_late" : "completed";
  }
  if (task.deadline < today) return "overdue";
  return "pending";
}

function taskOverallStatus(task: any, today = todayInVietnam()) {
  const completed = task.assigneeUserIds.every((id: string) => isUserApproved(task, String(id)));
  if (completed) {
    const anyLate = task.assigneeUserIds.some((id: string) => {
      const row = completionForUser(task, String(id));
      if (row) return row.status === "approved" && row.submittedLate;
      return (task.completedLateUserIds || []).some((lateId: string) => String(lateId) === String(id));
    });
    return anyLate ? "completed_late" : "completed";
  }
  if (task.assigneeUserIds.some((id: string) => completionForUser(task, String(id))?.status === "pending_approval")) {
    return "pending_completion";
  }
  if (task.assigneeUserIds.some((id: string) => completionForUser(task, String(id))?.status === "rejected")) {
    return "rejected_completion";
  }
  if (task.deadline < today) return "overdue";
  return "pending";
}

function documentAssignments(document: any) {
  if (Array.isArray(document.assignments) && document.assignments.length) {
    return document.assignments;
  }
  return [{
    type: "department",
    departmentId: document.departmentId,
    content: document.content,
    deadline: document.deadline,
  }];
}

function overallCompletionStatus(statuses: string[]) {
  if (!statuses.length || statuses.every((status) => status === "unassigned")) return "unassigned";
  if (statuses.every((status) => status === "completed" || status === "completed_late")) {
    return statuses.some((status) => status === "completed_late") ? "completed_late" : "completed";
  }
  if (statuses.some((status) => status === "pending_completion")) return "pending_completion";
  if (statuses.some((status) => status === "not_completed" || status === "overdue")) return "not_completed";
  return "in_progress";
}

function workItemsForDocument(workItems: any[], documentId: string) {
  return workItems.filter((workItem: any) => String(workItem.documentId) === String(documentId));
}

function isWorkManagementListVisible(args: {
  document: any;
  items: any[];
  actorUserId: string;
  actorRole: string;
  actorLevel: number;
  actorDepartmentId: string;
  visibilityMode: "creator" | "school";
  usersById: Map<string, { status?: string; departmentId?: string }>;
  departmentScope: string | null;
}) {
  const inModeratorScope = isDocumentInScope(args.departmentScope, args.document, args.usersById);
  const archived = args.items.some((item: any) => isWorkItemArchived(args.document, item, args.usersById))
    || isWorkItemArchived(args.document, { assignmentType: "department" }, args.usersById);
  if (archived) return canSeeArchivedWork(args.actorRole, inModeratorScope);
  const isAssignee = args.items.some((item: any) => {
    if (assignmentTypeOf(item) === "individual") {
      return (item.assigneeUserIds || []).some((id: string) => String(id) === String(args.actorUserId));
    }
    return String(item.departmentId || "") === String(args.actorDepartmentId || "");
  });
  return canSeeLiveWork({
    actorUserId: args.actorUserId,
    actorRole: args.actorRole,
    actorLevel: args.actorLevel,
    createdBy: String(args.document.createdBy),
    isAssignee,
    visibilityMode: args.visibilityMode,
    inModeratorScope,
    // Approvers review pending documents in their own "Chờ tôi duyệt" list (listMine),
    // so the management list keeps pending work to the creator and in-scope admin/mod.
    released: isWorkReleased(args.document),
  });
}

function managementDocumentWorkStatus(document: any, items: any[], catalogData: any) {
  const excludedIndividuals = individualAssigneeIdsForDocument(items, document._id);
  const statuses = items.map((item: any) => {
    const type = assignmentTypeOf(item);
    const members = type === "individual"
      ? (item.assigneeUserIds || [])
          .map((id: string) =>
            catalogData.activeUsers.find((user: any) => String(user._id) === String(id)),
          )
          .filter(Boolean)
      : departmentRosterMembers(item, document, catalogData, excludedIndividuals);
    return adminModItemStatus(item, members);
  });
  return overallCompletionStatus(statuses);
}

/** Not-yet-released documents show their approval state instead of completion progress. */
function documentListStatus(document: any, items: any[], catalogData: any) {
  if (document.status === "pending") return "awaiting_approval";
  if (document.status === "rejected") return "approval_returned";
  return managementDocumentWorkStatus(document, items, catalogData);
}

function isActorAssignedToWorkItem(
  item: any,
  document: any,
  actorUserId: string,
  catalogData: any,
  excludedIndividuals: Set<string>,
) {
  const type = assignmentTypeOf(item);
  if (type === "individual") {
    return (item.assigneeUserIds || []).some((id: string) => String(id) === String(actorUserId));
  }
  const members = departmentRosterMembers(item, document, catalogData, excludedIndividuals);
  return members.some((member: any) => String(member._id) === String(actorUserId));
}

async function catalog(ctx: any) {
  const [users, departments, positions, documentTypes] = await Promise.all([
    ctx.db.query("users").collect(),
    ctx.db.query("departments").collect(),
    ctx.db.query("positions").collect(),
    ctx.db.query("documentTypes").collect(),
  ]);
  const activeUsers = users.filter((user: any) => user.status === "active");
  const departmentMap = new Map(
    departments.map((department: any) => [String(department._id), department]),
  );
  const positionMap = new Map(
    positions.map((position: any) => [String(position._id), position]),
  );
  const documentTypeMap = new Map(
    documentTypes.map((item: any) => [String(item._id), item]),
  );
  return { users, activeUsers, departments, positions, documentTypes, departmentMap, positionMap, documentTypeMap };
}

async function resolveDocumentTypeForFile(
  ctx: any,
  hasFile: boolean,
  documentTypeId?: string | null,
) {
  const id = requireDocumentTypeId(hasFile, documentTypeId);
  if (!id) return undefined;
  await assertActiveDocumentType(ctx, id);
  return id;
}

function individualAssigneeIdsForDocument(workItems: any[], documentId: string) {
  const ids = new Set<string>();
  for (const item of workItems) {
    if (String(item.documentId) !== String(documentId)) continue;
    if (assignmentTypeOf(item) !== "individual") continue;
    for (const userId of item.assigneeUserIds || []) ids.add(String(userId));
  }
  return ids;
}

/** Live department roster for collective tasks (admin_mod mode). */
function departmentRosterMembers(
  item: any,
  document: any,
  catalogData: any,
  excludedIndividualIds: Set<string>,
) {
  return catalogData.activeUsers.filter((user: any) => {
    if (String(user.departmentId || "") !== String(item.departmentId || "")) return false;
    if (isOperationalManagerRole(user.role)) return false;
    if ((document.approverUserIds || []).some((id: string) => String(id) === String(user._id))) {
      return false;
    }
    if (excludedIndividualIds.has(String(user._id))) return false;
    return true;
  });
}

function personView(user: any, catalogData: any, status?: string) {
  return {
    _id: user._id,
    name: user.name || user.email || "Chưa đặt tên",
    email: user.email || "",
    level: activePositionLevel(user, catalogData.positions),
    positionName:
      catalogData.positions.find((position: any) => String(position._id) === String(user.positionId))
        ?.name || "",
    ...(status ? { status } : {}),
  };
}

async function documentView(ctx: any, document: any, catalogData: any, items: any[] = []) {
  const rejectedByUserIds = document.rejectedByUserIds || [];
  const assignments = documentAssignments(document).map((assignment: any) => {
    const type = assignment.type === "individual" ? "individual" : "department";
    return {
      type,
      departmentId: assignment.departmentId || "",
      departmentName: assignment.departmentId
        ? catalogData.departmentMap.get(String(assignment.departmentId))?.name || "Chưa gán phòng ban"
        : "Cá nhân",
      userIds: assignment.userIds || [],
      content: assignment.content,
      deadline: assignment.deadline,
    };
  });
  const decisions = document.approvalDecisions || [];
  const approvers = document.approverUserIds
    .map((id: string) => catalogData.users.find((user: any) => String(user._id) === String(id)))
    .filter(Boolean)
    .map((user: any) => {
      const decision = decisions.find((row: any) => String(row.userId) === String(user._id));
      return {
        _id: user._id,
        name: user.name || user.email || "Chưa đặt tên",
        email: user.email || "",
        level: activePositionLevel(user, catalogData.positions),
        approved: document.approvedByUserIds.some((id: string) => String(id) === String(user._id)),
        rejected: rejectedByUserIds.some((id: string) => String(id) === String(user._id)),
        decidedAt: decision?.at ?? null,
        reason: decision?.reason || "",
      };
    });
  const creator = catalogData.users.find((user: any) => String(user._id) === String(document.createdBy));
  return {
    _id: document._id,
    title: workListTitle(document),
    fileName: document.fileName,
    fileType: document.fileType,
    fileSize: document.fileSize,
    fileUrl: null,
    privateFile: Boolean(document.driveFileId || document.fileId),
    ...resolveDisplayedDocumentType(
      Boolean(document.driveFileId || document.fileId),
      document.documentTypeId,
      catalogData.documentTypes || [],
    ),
    content: document.content,
    deadline: document.deadline,
    status: document.status,
    departmentId: document.departmentId,
    departmentName: assignments.find((item: any) => item.type === "department")?.departmentName
      || assignments[0]?.departmentName
      || "Chưa gán phòng ban",
    assignments,
    assignmentCount: assignments.length,
    approvers,
    approvalCount: document.approvedByUserIds.length,
    approvalTotal: document.approverUserIds.length,
    requiresApproval: workDocumentRequiresApproval({
      requiresApproval: document.requiresApproval,
      creatorRole: creator?.role,
    }),
    approvalLocked: isWorkApprovalLocked(document),
    submittedAt: document.submittedAt ?? document.createdAt,
    decidedAt: workApprovalDecidedAt(document),
    returnReason: workReturnReason(document),
    createdAt: document.createdAt,
    createdBy: document.createdBy,
    creatorName: creator ? creator.name || creator.email || "—" : "—",
    archived: false,
    canEdit: canMutateWorkDocument(document, items),
    canDelete: canMutateWorkDocument(document, items),
  };
}

function adminModItemStatus(item: any, members: any[], today = todayInVietnam()) {
  if (assignmentTypeOf(item) === "individual") {
    const assignees = item.assigneeUserIds || [];
    if (!assignees.length) return "unassigned";
    const allDone = assignees.every((id: string) => isUserApproved(item, String(id)));
    if (allDone) {
      const anyLate = assignees.some((id: string) => {
        const row = completionForUser(item, String(id));
        if (row) return row.status === "approved" && row.submittedLate;
        return (item.completedLateUserIds || []).some((lateId: string) => String(lateId) === String(id));
      });
      return anyLate ? "completed_late" : "completed";
    }
    if (assignees.some((id: string) => completionForUser(item, String(id))?.status === "pending_approval")) {
      return "pending_completion";
    }
    if (item.deadline < today) return "not_completed";
    return "in_progress";
  }
  return memberCompletionStatus(members, item, item.deadline, today);
}

function userItemStatus(item: any, userId: string, today = todayInVietnam()) {
  const row = completionForUser(item, userId);
  if (row?.status === "approved") {
    return row.submittedLate ? "completed_late" : "completed";
  }
  if (row?.status === "pending_approval") return "pending_completion";
  if (row?.status === "rejected") return "rejected_completion";
  if ((item.completedUserIds || []).some((id: string) => String(id) === String(userId))) {
    const late = (item.completedLateUserIds || []).some((id: string) => String(id) === String(userId));
    return late ? "completed_late" : "completed";
  }
  if (item.deadline < today) return "overdue";
  return "pending_task";
}

function completionView(item: any, userId: string, catalogData: any) {
  const row = completionForUser(item, userId);
  if (!row) return null;
  const reviewer = row.reviewedBy
    ? catalogData.activeUsers.find((user: any) => String(user._id) === String(row.reviewedBy))
    : null;
  return {
    status: row.status,
    submittedAt: row.submittedAt,
    submittedLate: row.submittedLate,
    qualityPercent: row.qualityPercent ?? null,
    rejectionReason: row.rejectionReason || "",
    note: row.note || "",
    reviewedAt: row.reviewedAt || null,
    reviewerName: reviewer ? reviewer.name || reviewer.email || "—" : null,
  };
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireWorkAccess(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const authorizeFileUpload = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireWorkAccess(ctx);
    return { userId: String(actor.user._id) };
  },
});

export const registerDriveUpload = mutation({
  args: { cleanupToken: v.string(), driveFileId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireWorkAccess(ctx);
    await registerDriveUploadStage(ctx, args, String(actor.user._id), "work");
  },
});

export const claimStagedUploadCleanup = mutation({
  args: { cleanupToken: v.string(), claimId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireWorkAccess(ctx);
    return await claimDriveUploadCleanup(ctx, args, String(actor.user._id), "work");
  },
});

export const finalizeStagedUpload = mutation({
  args: { cleanupToken: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireWorkAccess(ctx);
    await finalizeDriveUploadStage(ctx, args.cleanupToken, String(actor.user._id), "work");
  },
});

export const completeStagedUploadCleanup = mutation({
  args: { cleanupToken: v.string(), claimId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireWorkAccess(ctx);
    await completeDriveUploadCleanup(ctx, args, String(actor.user._id), "work");
  },
});

export const releaseStagedUploadCleanup = mutation({
  args: { cleanupToken: v.string(), claimId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireWorkAccess(ctx);
    await releaseDriveUploadCleanup(ctx, args, String(actor.user._id), "work");
  },
});

export const isDriveFileReferenced = query({
  args: { driveFileId: v.string() },
  handler: async (ctx, args) => {
    await requireWorkWrite(ctx);
    const documents = await ctx.db
      .query("officeDocuments")
      .withIndex("by_drive_file", (q: any) => q.eq("driveFileId", args.driveFileId))
      .collect();
    return {
      referenced: documents.some(
        (document: any) => document.active && document.driveFileId === args.driveFileId,
      ),
    };
  },
});

export const authorizeDriveCleanupJob = query({
  args: { cleanupJobId: v.id("driveCleanupJobs") },
  handler: async (ctx, args) => {
    const actor = await requireWorkWrite(ctx);
    const job = await ctx.db.get(args.cleanupJobId);
    if (
      !job?.active
      || job.purpose !== "work"
      || String(job.createdBy) !== String(actor.user._id)
    ) {
      throw new Error("WORK_CLEANUP_JOB_NOT_FOUND");
    }
    const references = await ctx.db
      .query("officeDocuments")
      .withIndex("by_drive_file", (q: any) => q.eq("driveFileId", job.driveFileId))
      .collect();
    if (references.some((document: any) => document.active)) {
      throw new Error("WORK_FILE_STILL_REFERENCED");
    }
    return { driveFileId: job.driveFileId };
  },
});

export const completeDriveCleanupJob = mutation({
  args: { cleanupJobId: v.id("driveCleanupJobs") },
  handler: async (ctx, args) => {
    const actor = await requireWorkWrite(ctx);
    const job = await ctx.db.get(args.cleanupJobId);
    if (
      !job?.active
      || job.purpose !== "work"
      || String(job.createdBy) !== String(actor.user._id)
    ) {
      throw new Error("WORK_CLEANUP_JOB_NOT_FOUND");
    }
    const references = await ctx.db
      .query("officeDocuments")
      .withIndex("by_drive_file", (q: any) => q.eq("driveFileId", job.driveFileId))
      .collect();
    if (references.some((document: any) => document.active)) {
      throw new Error("WORK_FILE_STILL_REFERENCED");
    }
    const now = Date.now();
    await ctx.db.patch(args.cleanupJobId, {
      active: false,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      targetEmail: actor.user.email,
      action: "work.drive_cleanup.complete",
      details: JSON.stringify({
        cleanupJobId: args.cleanupJobId,
        documentId: job.resourceId,
        driveFileId: job.driveFileId,
      }),
      at: now,
    });
  },
});

export const authorizeFileDownload = query({
  args: { documentId: v.id("officeDocuments") },
  handler: async (ctx, args) => {
    const access = await requireWorkAccess(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document?.active || (!document.driveFileId && !document.fileId)) {
      throw new Error("WORK_FILE_NOT_FOUND");
    }

    let allowed = String(document.createdBy) === String(access.user._id)
      || (access.isAdmin && await documentInActorScope(ctx, access.departmentScope, document));
    if (!allowed) {
      allowed = document.approverUserIds.some(
        (id: string) => String(id) === String(access.user._id),
      );
    }

    if (!allowed && isWorkReleased(document)) {
      const workItems = (await ctx.db.query("workItems").collect()).filter(
        (item: any) => item.active && String(item.documentId) === String(document._id),
      );
      const excludedIndividuals = individualAssigneeIdsForDocument(workItems, document._id);
      allowed = workItems.some((item: any) => {
        if (assignmentTypeOf(item) === "individual") {
          return (item.assigneeUserIds || []).some(
            (id: string) => String(id) === String(access.user._id),
          );
        }
        return (
          String(item.departmentId || "") === String(access.user.departmentId || "")
          && !excludedIndividuals.has(String(access.user._id))
        );
      });
    }

    if (!allowed) throw new Error("WORK_FILE_FORBIDDEN");
    return {
      driveFileId: document.driveFileId || null,
      storageId: document.fileId || null,
      storageUrl: document.driveFileId || !document.fileId
        ? null
        : await ctx.storage.getUrl(document.fileId),
      driveChecksum: document.driveChecksum || null,
      fileName: document.fileName,
      fileType: document.fileType,
      fileSize: document.fileSize,
    };
  },
});

async function activeUsersList(ctx: any) {
  return (await ctx.db.query("users").collect()).filter((row: any) => row.status === "active");
}

/** Push the released work to its assignees (never before approval). */
async function notifyWorkAssignees(
  ctx: any,
  args: {
    assignments: Array<{ type?: string; userIds?: string[]; departmentId?: string }>;
    documentId: string;
    title: string;
    body: string;
  },
) {
  const users = await activeUsersList(ctx);
  const recipients = workAssignmentPushUserIds({ assignments: args.assignments, users });
  if (!recipients.length) return;
  await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
    userIds: recipients,
    title: args.title,
    body: args.body,
    kind: "work",
    sourceType: "department_work",
    sourceId: args.documentId,
  });
}

/** Push "Công việc chờ duyệt" to the designated approvers of a (re)submitted document. */
async function notifyWorkApprovers(
  ctx: any,
  args: { approverUserIds: string[]; documentId: string; title: string; resubmitted: boolean },
) {
  if (!args.approverUserIds.length) return;
  await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
    userIds: args.approverUserIds.map(String),
    title: args.resubmitted ? "Công việc chờ duyệt lại" : "Công việc chờ duyệt",
    body: args.title,
    kind: "work",
    sourceType: "approval",
    sourceId: args.documentId,
  });
}

export const formOptions = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireWorkWrite(ctx);
    const visibilityMode = await getWorkVisibilityMode(ctx);
    const { activeUsers, departments, positions } = await catalog(ctx);
    const users = activeUsers.filter((user: any) => {
      if (actor.isOps) return isUserInModeratorScope(actor.departmentScope, user);
      return actorCanAssignUser(actor, user);
    });
    const canAssignDepartments = canAssignWorkDepartment(actor.user.role, actor.level);
    const personOption = (user: any) => ({
      _id: user._id,
      name: user.name || user.email || "Chưa đặt tên",
      email: user.email || "",
      role: user.role,
      departmentId: user.departmentId,
      departmentName:
        departments.find((department: any) => String(department._id) === String(user.departmentId))
          ?.name || "",
      positionName:
        positions.find((position: any) => String(position._id) === String(user.positionId))?.name
        || "",
      level: activePositionLevel(user, positions),
    });
    return {
      canCreate: true,
      isOps: actor.isOps,
      /** Documents created by admin/mod need Ban giám hiệu approval before release. */
      requiresApproval: actor.isOps,
      canAssignDepartments,
      departmentScope: actor.departmentScope,
      visibilityMode,
      assignerMode: WORK_ASSIGNER_MODE_ADMIN_MOD,
      departments: canAssignDepartments
        ? departments
            .filter((department: any) => department.active)
            .filter((department: any) =>
              !actor.isOps
              || !actor.departmentScope
              || String(department._id) === String(actor.departmentScope),
            )
            .sort((a: any, b: any) => a.name.localeCompare(b.name, "vi"))
            .map((department: any) => ({
              _id: department._id,
              name: department.name,
              code: department.code,
            }))
        : [],
      users: users
        .map(personOption)
        .sort((a: any, b: any) => a.name.localeCompare(b.name, "vi")),
      documentTypes: await listActiveDocumentTypes(ctx),
      // Approvers are school-wide Ban giám hiệu, even for a department-scoped moderator.
      approvers: actor.isOps
        ? activeUsers
            .filter((user: any) =>
              isEligibleWorkApprover({
                status: user.status,
                role: user.role,
                level: activePositionLevel(user, positions),
              }),
            )
            .map(personOption)
            .sort((a: any, b: any) => b.level - a.level || a.name.localeCompare(b.name, "vi"))
        : [],
    };
  },
});

export const createDocument = mutation({
  args: {
    title: v.string(),
    fileId: v.optional(v.id("_storage")),
    driveFileId: v.optional(v.string()),
    driveChecksum: v.optional(v.string()),
    cleanupToken: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    assignments: v.array(
      v.object({
        type: v.optional(v.union(v.literal("department"), v.literal("individual"))),
        departmentId: v.optional(v.string()),
        userIds: v.optional(v.array(v.string())),
        content: v.string(),
        deadline: v.string(),
      }),
    ),
    approverUserIds: v.optional(v.array(v.string())),
    documentTypeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireWorkWrite(ctx);
    const title = cleanWorkTitle(args.title);
    const hasFile = Boolean(args.driveFileId || args.fileId);
    const documentTypeId = await resolveDocumentTypeForFile(ctx, hasFile, args.documentTypeId);
    const file = hasFile
      ? validateDocumentFile(args.fileName || "", args.fileSize || 0)
      : { fileName: "", fileType: "" };
    if (args.driveFileId && !args.cleanupToken) throw new Error("UPLOAD_NOT_FOUND");
    // Creator-based rule: admin/mod (văn thư) documents need Ban giám hiệu approval.
    const requiresApproval = workDocumentRequiresApproval({ creatorRole: actor.user.role });
    const { assignments, approverUserIds } = await assertWorkAssignmentsForActor(
      ctx,
      args.assignments,
      actor,
      requiresApproval ? args.approverUserIds || [] : [],
    );
    const approval = workApprovalSubmission(requiresApproval, approverUserIds);

    const now = Date.now();
    if (args.driveFileId && args.cleanupToken) {
      await commitDriveUploadStage(
        ctx,
        { cleanupToken: args.cleanupToken, driveFileId: args.driveFileId },
        String(actor.user._id),
        "work",
      );
    }
    const firstAssignment = assignments[0];
    const documentId = await ctx.db.insert("officeDocuments", {
      fileId: args.fileId,
      driveFileId: args.driveFileId,
      driveChecksum: args.driveChecksum,
      storageProvider: args.driveFileId ? "google_drive" : "convex",
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: hasFile ? args.fileSize || 0 : 0,
      documentTypeId,
      title,
      departmentId: firstAssignment.departmentId || "",
      content: firstAssignment.content,
      deadline: firstAssignment.deadline,
      assignments: storedAssignments(assignments),
      ...approval,
      submittedAt: now,
      active: true,
      createdBy: actor.user._id,
      updatedBy: actor.user._id,
      createdAt: now,
      updatedAt: now,
    });

    await insertDocumentWorkItems(ctx, documentId, assignments, actor.user._id, now);

    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "work.document.create",
      details: JSON.stringify({
        documentId,
        title,
        assignmentCount: assignments.length,
        departmentCount: assignments.filter((item) => item.type === "department").length,
        individualCount: assignments.filter((item) => item.type === "individual").length,
        requiresApproval: approval.requiresApproval,
        approverCount: approval.approverUserIds.length,
      }),
      at: now,
    });
    if (approval.requiresApproval) {
      await notifyWorkApprovers(ctx, {
        approverUserIds: approval.approverUserIds,
        documentId: String(documentId),
        title,
        resubmitted: false,
      });
    } else {
      await notifyWorkAssignees(ctx, {
        assignments,
        documentId: String(documentId),
        title: "Công việc mới",
        body: title,
      });
    }
    return documentId;
  },
});

export const updateDocument = mutation({
  args: {
    documentId: v.id("officeDocuments"),
    title: v.optional(v.string()),
    driveFileId: v.optional(v.string()),
    driveChecksum: v.optional(v.string()),
    cleanupToken: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    assignments: v.array(
      v.object({
        type: v.optional(v.union(v.literal("department"), v.literal("individual"))),
        departmentId: v.optional(v.string()),
        userIds: v.optional(v.array(v.string())),
        content: v.string(),
        deadline: v.string(),
      }),
    ),
    approverUserIds: v.optional(v.array(v.string())),
    documentTypeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireWorkWrite(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document?.active) throw new Error("WORK_DOCUMENT_NOT_FOUND");
    const relatedBefore = await relatedDocumentWork(ctx, args.documentId);
    const creatorMutable = canCreatorMutateWork(relatedBefore.workItems);
    // Out-of-scope documents fall back to ordinary creator rules for a scoped moderator.
    const managesAsOps = actor.isOps
      && await documentInActorScope(ctx, actor.departmentScope, document);
    if (!managesAsOps && String(document.createdBy) !== String(actor.user._id)) {
      throw new Error(actor.isOps ? MODERATOR_DEPARTMENT_SCOPE_ERROR : "WORK_UPDATE_FORBIDDEN");
    }
    // The first approval locks the document for everyone, admin/mod included.
    if (isWorkApprovalLocked(document)) throw new Error("WORK_DOCUMENT_IMMUTABLE");
    if (!managesAsOps && !creatorMutable) throw new Error("WORK_DOCUMENT_IMMUTABLE");

    const replacementRequested =
      args.driveFileId !== undefined
      || args.driveChecksum !== undefined
      || args.cleanupToken !== undefined
      || args.fileName !== undefined
      || args.fileType !== undefined
      || args.fileSize !== undefined;
    let replacement: {
      driveFileId: string;
      driveChecksum?: string;
      cleanupToken: string;
      fileName: string;
      fileType: string;
      fileSize: number;
    } | null = null;
    if (replacementRequested) {
      if (!args.driveFileId || !args.cleanupToken || args.fileName === undefined || args.fileSize === undefined) {
        throw new Error("WORK_REPLACEMENT_FILE_REQUIRED");
      }
      const file = validateDocumentFile(args.fileName, args.fileSize);
      replacement = {
        driveFileId: args.driveFileId,
        driveChecksum: args.driveChecksum,
        cleanupToken: args.cleanupToken,
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: args.fileSize,
      };
    }

    const creator = await ctx.db.get(document.createdBy as Id<"users">);
    const requiresApproval = workDocumentRequiresApproval({
      requiresApproval: document.requiresApproval,
      creatorRole: creator?.role,
    });
    const { assignments, approverUserIds } = await assertWorkAssignmentsForActor(
      ctx,
      args.assignments,
      actor,
      requiresApproval ? args.approverUserIds ?? document.approverUserIds ?? [] : [],
    );
    // Editing resets every prior decision and resubmits approval-required documents.
    const approval = workApprovalSubmission(requiresApproval, approverUserIds);
    if (replacement) {
      await commitDriveUploadStage(
        ctx,
        { cleanupToken: replacement.cleanupToken, driveFileId: replacement.driveFileId },
        String(actor.user._id),
        "work",
      );
    }

    const related = relatedBefore;
    const now = Date.now();
    const firstAssignment = assignments[0];
    const title = args.title !== undefined ? cleanWorkTitle(args.title) : document.title;
    const requestedType = args.documentTypeId !== undefined ? args.documentTypeId : document.documentTypeId;
    const documentTypeId = await resolveDocumentTypeForFile(
      ctx,
      Boolean(replacement) || Boolean(requestedType),
      requestedType,
    );
    await ctx.db.patch(args.documentId, {
      ...(replacement
        ? {
            fileId: undefined,
            driveFileId: replacement.driveFileId,
            driveChecksum: replacement.driveChecksum,
            storageProvider: "google_drive",
            fileName: replacement.fileName,
            fileType: replacement.fileType,
            fileSize: replacement.fileSize,
          }
        : {}),
      ...(documentTypeId ? { documentTypeId } : {}),
      ...(title ? { title } : {}),
      departmentId: firstAssignment.departmentId || "",
      content: firstAssignment.content,
      deadline: firstAssignment.deadline,
      assignments: storedAssignments(assignments),
      ...approval,
      ...(approval.requiresApproval ? { submittedAt: now } : {}),
      updatedBy: actor.user._id,
      updatedAt: now,
    });
    await insertDocumentWorkItems(ctx, args.documentId, assignments, actor.user._id, now);
    const deactivated = await deactivateRelatedDocumentWork(ctx, related, actor.user._id, now);

    const supersededDriveFileId = replacement && document.driveFileId !== replacement.driveFileId
      ? document.driveFileId
      : undefined;
    const cleanupJobId = await createWorkDriveCleanupJob(
      ctx,
      supersededDriveFileId,
      args.documentId,
      actor.user._id,
      now,
    );
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      targetEmail: actor.user.email,
      action: "work.document.update",
      details: JSON.stringify({
        documentId: args.documentId,
        replacementFile: Boolean(replacement),
        cleanupJobId,
        assignmentCount: assignments.length,
        requiresApproval: approval.requiresApproval,
        approverCount: approval.approverUserIds.length,
        deactivatedWorkItemCount: deactivated.workItemCount,
        deactivatedPersonalTaskCount: deactivated.personalTaskCount,
      }),
      at: now,
    });
    const displayTitle = workListTitle({
      title,
      fileName: replacement?.fileName || document.fileName,
      content: firstAssignment.content,
    });
    if (approval.requiresApproval) {
      await notifyWorkApprovers(ctx, {
        approverUserIds: approval.approverUserIds,
        documentId: String(args.documentId),
        title: displayTitle,
        resubmitted: true,
      });
    } else {
      await notifyWorkAssignees(ctx, {
        assignments,
        documentId: String(args.documentId),
        title: "Công việc đã cập nhật",
        body: displayTitle,
      });
    }
    return { documentId: args.documentId, cleanupJobId };
  },
});

export const deleteDocument = mutation({
  args: { documentId: v.id("officeDocuments") },
  handler: async (ctx, args) => {
    const actor = await requireWorkWrite(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document?.active) throw new Error("WORK_DOCUMENT_NOT_FOUND");
    const related = await relatedDocumentWork(ctx, args.documentId);
    const managesAsOps = actor.isOps
      && await documentInActorScope(ctx, actor.departmentScope, document);
    if (!managesAsOps && String(document.createdBy) !== String(actor.user._id)) {
      throw new Error(actor.isOps ? MODERATOR_DEPARTMENT_SCOPE_ERROR : "WORK_UPDATE_FORBIDDEN");
    }
    if (isWorkApprovalLocked(document)) throw new Error("WORK_DOCUMENT_IMMUTABLE");
    if (!managesAsOps && !canCreatorMutateWork(related.workItems)) {
      throw new Error("WORK_DOCUMENT_IMMUTABLE");
    }

    const now = Date.now();
    await ctx.db.patch(args.documentId, {
      active: false,
      updatedBy: actor.user._id,
      updatedAt: now,
    });
    const deactivated = await deactivateRelatedDocumentWork(ctx, related, actor.user._id, now);
    const cleanupJobId = await createWorkDriveCleanupJob(
      ctx,
      document.driveFileId,
      args.documentId,
      actor.user._id,
      now,
    );
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      targetEmail: actor.user.email,
      action: "work.document.delete",
      details: JSON.stringify({
        documentId: args.documentId,
        cleanupJobId,
        deactivatedWorkItemCount: deactivated.workItemCount,
        deactivatedPersonalTaskCount: deactivated.personalTaskCount,
      }),
      at: now,
    });
    return { documentId: args.documentId, cleanupJobId };
  },
});

export const finalizeDriveMigration = internalMutation({
  args: {
    documentId: v.id("officeDocuments"),
    driveFileId: v.string(),
    driveChecksum: v.string(),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document?.active) throw new Error("WORK_DOCUMENT_NOT_FOUND");
    if (document.driveFileId) {
      return { applied: false, driveFileId: document.driveFileId };
    }
    if (document.fileId) await ctx.storage.delete(document.fileId);
    await ctx.db.patch(args.documentId, {
      fileId: undefined,
      driveFileId: args.driveFileId,
      driveChecksum: args.driveChecksum,
      storageProvider: "google_drive",
      updatedAt: Date.now(),
    });
    return { applied: true, driveFileId: args.driveFileId };
  },
});

export const driveMigrationStatus = internalQuery({
  args: { documentId: v.id("officeDocuments") },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document?.active) throw new Error("WORK_DOCUMENT_NOT_FOUND");
    return {
      migrated: Boolean(document.driveFileId),
      driveFileId: document.driveFileId || null,
    };
  },
});

export const listAdmin = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireWorkWrite(ctx);
    const visibilityMode = await getWorkVisibilityMode(ctx);
    const [documents, workItems, catalogData] = await Promise.all([
      ctx.db.query("officeDocuments").collect(),
      ctx.db.query("workItems").collect(),
      catalog(ctx),
    ]);
    const activeDocuments = documents.filter((document: any) => document.active);
    const activeWorkItems = workItems.filter((item: any) => item.active);
    const usersById = new Map<string, { status?: string; departmentId?: string }>(
      catalogData.users.map((user: any) => [String(user._id), user]),
    );
    const visibleDocuments = activeDocuments.filter((document: any) =>
      isWorkManagementListVisible({
        document,
        items: workItemsForDocument(activeWorkItems, document._id),
        actorUserId: String(actor.user._id),
        actorRole: actor.user.role,
        actorLevel: actor.level,
        actorDepartmentId: String(actor.user.departmentId || ""),
        visibilityMode,
        usersById,
        departmentScope: actor.departmentScope,
      }),
    );
    const views = await Promise.all(
      visibleDocuments.map(async (document: any) => {
        const items = activeWorkItems.filter(
          (workItem: any) => String(workItem.documentId) === String(document._id),
        );
        const excludedIndividuals = individualAssigneeIdsForDocument(items, document._id);
        const assignmentViews = items.map((item: any) => {
          const type = assignmentTypeOf(item);
          const members = type === "individual"
            ? (item.assigneeUserIds || [])
                .map((id: string) =>
                  catalogData.activeUsers.find((user: any) => String(user._id) === String(id)),
                )
                .filter(Boolean)
            : departmentRosterMembers(item, document, catalogData, excludedIndividuals);
          const approvedIds = approvedUserIds(item);
          return {
            _id: item._id,
            type,
            departmentId: item.departmentId,
            departmentName:
              type === "individual"
                ? "Cá nhân"
                : String((catalogData.departmentMap.get(String(item.departmentId)) as any)?.name || "")
                  || "Chưa gán phòng ban",
            content: item.content,
            deadline: item.deadline,
            status: adminModItemStatus(item, members),
            taskCount: members.length,
            taskCompletedCount: members.filter((member: any) =>
              approvedIds.some((id: string) => String(id) === String(member._id)),
            ).length,
            members: members.map((member: any) => ({
              ...personView(member, catalogData, userItemStatus(item, String(member._id))),
              qualityPercent: completionForUser(item, String(member._id))?.qualityPercent ?? null,
              rejectionReason: completionForUser(item, String(member._id))?.rejectionReason || "",
            })),
          };
        });
        const view = await documentView(ctx, document, catalogData, items);
        // UX only (server re-checks): a scoped moderator cannot manage out-of-scope
        // documents they did not create, even when they see them as an assignee.
        const isCreator = String(document.createdBy) === String(actor.user._id);
        const outOfScopeForMod = Boolean(actor.departmentScope)
          && !isCreator
          && !isDocumentInScope(actor.departmentScope, document, usersById);
        // Non-ops viewers (e.g. Ban giám hiệu in school mode) only manage their own documents.
        const readOnly = outOfScopeForMod || (!actor.isOps && !isCreator);
        return {
          ...view,
          ...(readOnly ? { canEdit: false, canDelete: false } : {}),
          assignments: assignmentViews,
          workStatus: documentListStatus(document, items, catalogData),
          taskCount: assignmentViews.reduce(
            (total: number, assignment: any) => total + assignment.taskCount,
            0,
          ),
        };
      }),
    );
    const pendingCompletionReviews = [];
    for (const item of activeWorkItems) {
      const document = activeDocuments.find(
        (row: any) => String(row._id) === String(item.documentId),
      );
      if (!document || !isWorkReleased(document)) continue;
      if (!canReviewWorkCompletion({ actorUserId: String(actor.user._id), createdBy: String(document.createdBy) })) {
        continue;
      }
      for (const row of completionsOf(item)) {
        if (row.status !== "pending_approval") continue;
        const person = catalogData.activeUsers.find(
          (user: any) => String(user._id) === String(row.userId),
        );
        pendingCompletionReviews.push({
          kind: "work_item",
          workItemId: item._id,
          taskId: null,
          userId: row.userId,
          userName: person?.name || person?.email || "—",
          content: item.content,
          deadline: item.deadline,
          submittedAt: row.submittedAt,
          submittedLate: row.submittedLate,
          note: row.note || "",
          type: assignmentTypeOf(item),
          departmentName:
            assignmentTypeOf(item) === "individual"
              ? "Cá nhân"
              : String((catalogData.departmentMap.get(String(item.departmentId)) as any)?.name || "")
                || "Chưa gán phòng ban",
        });
      }
    }

    return {
      assignerMode: WORK_ASSIGNER_MODE_ADMIN_MOD,
      visibilityMode,
      canCreate: true,
      isOps: actor.isOps,
      documents: views.sort((a, b) => b.createdAt - a.createdAt),
      documentTypes: await listActiveDocumentTypes(ctx),
      pendingCompletionReviews: pendingCompletionReviews.sort(
        (a, b) => a.deadline.localeCompare(b.deadline) || a.submittedAt - b.submittedAt,
      ),
    };
  },
});

/** Designated Ban giám hiệu approver gate (never admin/moderator, level 4+). */
async function requireDocumentApprover(ctx: any, documentId: Id<"officeDocuments">) {
  const access = await requireWorkAccess(ctx);
  if (access.isAdmin) throw new Error("ADMIN_USE_MANAGEMENT");
  const document = await ctx.db.get(documentId);
  if (!document?.active) throw new Error("WORK_DOCUMENT_NOT_FOUND");
  if (
    !isDesignatedWorkApprover(document, String(access.user._id))
    || !isEligibleWorkApprover({ status: access.user.status, role: access.user.role, level: access.level })
  ) {
    throw new Error("WORK_APPROVER_FORBIDDEN");
  }
  return { access, document };
}

export const approveDocument = mutation({
  args: { documentId: v.id("officeDocuments") },
  handler: async (ctx, args) => {
    const { access, document } = await requireDocumentApprover(ctx, args.documentId);
    const userId = String(access.user._id);
    if (document.approvedByUserIds.some((id: string) => String(id) === userId)) return;
    if (!canApproveWorkDocument(document, userId)) throw new Error("WORK_DOCUMENT_ALREADY_DECIDED");
    const now = Date.now();
    const next = applyWorkApproval(document, userId, now);
    await ctx.db.patch(args.documentId, {
      ...next,
      updatedBy: access.user._id,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: access.user._id,
      targetEmail: access.user.email,
      action: "work.document.approve",
      details: JSON.stringify({ documentId: args.documentId, status: next.status }),
      at: now,
    });
    if (next.status !== "approved") return;
    const title = workListTitle(document);
    await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
      userIds: [String(document.createdBy)],
      title: "Công việc đã được duyệt",
      body: title,
      kind: "work",
      sourceType: "work_approved",
      sourceId: String(args.documentId),
    });
    await notifyWorkAssignees(ctx, {
      assignments: documentAssignments(document),
      documentId: String(args.documentId),
      title: "Công việc mới",
      body: title,
    });
  },
});

export const rejectDocument = mutation({
  args: { documentId: v.id("officeDocuments"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { access, document } = await requireDocumentApprover(ctx, args.documentId);
    const userId = String(access.user._id);
    if ((document.rejectedByUserIds || []).some((id: string) => String(id) === userId)) return;
    if (!canRejectWorkDocument(document)) throw new Error("WORK_DOCUMENT_ALREADY_DECIDED");
    const reason = cleanWorkReturnReason(args.reason);
    const now = Date.now();
    const next = applyWorkRejection(document, userId, reason, now);
    // Work items stay as they are: a returned document is not released, and the
    // creator's edit replaces them (or delete deactivates them).
    await ctx.db.patch(args.documentId, {
      ...next,
      updatedBy: access.user._id,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: access.user._id,
      targetEmail: access.user.email,
      action: "work.document.reject",
      details: JSON.stringify({ documentId: args.documentId, status: next.status }),
      at: now,
    });
    await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
      userIds: [String(document.createdBy)],
      title: "Công việc bị trả lại",
      body: `${workListTitle(document)}: ${reason}`,
      kind: "work",
      sourceType: "work_returned",
      sourceId: String(args.documentId),
    });
  },
});

export const createPersonalTask = mutation({
  args: {
    workItemId: v.id("workItems"),
    title: v.string(),
    assigneeUserIds: v.array(v.id("users")),
    deadline: v.string(),
  },
  handler: async (ctx, args) => {
    const assignerMode = await getWorkAssignerMode(ctx);
    if (assignerMode !== WORK_ASSIGNER_MODE_SUPERVISOR) {
      throw new Error("WORK_SUPERVISOR_MODE_REQUIRED");
    }
    const access = await requireWorkAccess(ctx);
    if (access.isAdmin || (access.level !== 2 && access.level !== 3)) {
      throw new Error("WORK_ASSIGNER_REQUIRED");
    }
    const item = await ctx.db.get(args.workItemId);
    if (!item?.active) throw new Error("WORK_ITEM_NOT_FOUND");
    if (assignmentTypeOf(item) === "individual") throw new Error("WORK_ITEM_NOT_ASSIGNABLE");
    if (String(item.departmentId) !== String(access.user.departmentId)) {
      throw new Error("WORK_DEPARTMENT_FORBIDDEN");
    }
    const document = await ctx.db.get(item.documentId as Id<"officeDocuments">);
    if (!isWorkReleased(document)) throw new Error("WORK_NOT_APPROVED");
    const title = args.title.trim();
    if (!title || title.length > 200) throw new Error("INVALID_PERSONAL_WORK_TITLE");
    const deadline = assertDate(args.deadline);
    const selectedIds = [...new Set(args.assigneeUserIds.map((id) => String(id)))];
    if (!selectedIds.length) throw new Error("WORK_ASSIGNEES_REQUIRED");
    const users = await ctx.db.query("users").collect();
    const positions = await ctx.db.query("positions").collect();
    for (const userId of selectedIds) {
      const target = users.find((user: any) => String(user._id) === userId && user.status === "active");
      if (
        !target ||
        String(target.departmentId || "") !== String(access.user.departmentId || "") ||
        activePositionLevel(target, positions) >= access.level
      ) {
        throw new Error("INVALID_WORK_ASSIGNEE");
      }
    }
    const now = Date.now();
    const taskId = await ctx.db.insert("personalTasks", {
      workItemId: args.workItemId,
      title,
      assigneeUserIds: selectedIds,
      completedUserIds: [],
      completedLateUserIds: [],
      deadline,
      active: true,
      createdBy: access.user._id,
      updatedBy: access.user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
      userIds: selectedIds,
      title: "Bạn có công việc mới",
      body: title,
      kind: "work",
      sourceType: "personal_task",
      sourceId: String(taskId),
    });
    return taskId;
  },
});

export const completePersonalTask = mutation({
  args: {
    taskId: v.id("personalTasks"),
    qualityPercent: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkAccess(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task?.active) throw new Error("PERSONAL_WORK_NOT_FOUND");
    if (!task.assigneeUserIds.some((id: string) => String(id) === String(access.user._id))) {
      throw new Error("PERSONAL_WORK_FORBIDDEN");
    }
    const parentItem = await ctx.db.get(task.workItemId as Id<"workItems">);
    if (!parentItem?.active) throw new Error("WORK_ITEM_NOT_FOUND");
    const parentDocument = await ctx.db.get(parentItem.documentId as Id<"officeDocuments">);
    if (!isWorkReleased(parentDocument)) {
      throw new Error("WORK_NOT_APPROVED");
    }
    const existing = completionForUser(task, String(access.user._id));
    if (existing?.status === "approved" || existing?.status === "pending_approval") return;
    if (!existing && isUserApproved(task, String(access.user._id))) return;

    const late = task.deadline < todayInVietnam();
    const now = Date.now();
    const note = cleanCompletionNote(args.note);
    const bypassReview = shouldBypassWorkCompletionReview(access.isAdmin, args.qualityPercent);
    if (access.isAdmin && args.qualityPercent === undefined) {
      throw new Error("QUALITY_PERCENT_REQUIRED");
    }
    if (bypassReview) {
      const qualityPercent = assertQualityPercent(args.qualityPercent as number);
      const completions = upsertCompletion(task, {
        userId: String(access.user._id),
        status: "approved",
        submittedAt: now,
        submittedLate: late,
        qualityPercent,
        reviewedAt: now,
        reviewedBy: String(access.user._id),
        ...(note ? { note } : {}),
      });
      const synced = syncApprovedArrays(completions);
      await ctx.db.patch(args.taskId, {
        completions,
        ...synced,
        updatedBy: access.user._id,
        updatedAt: now,
      });
      return;
    }

    const completions = upsertCompletion(task, {
      userId: String(access.user._id),
      status: "pending_approval",
      submittedAt: now,
      submittedLate: late,
      ...(note ? { note } : {}),
    });
    await ctx.db.patch(args.taskId, {
      completions,
      updatedBy: access.user._id,
      updatedAt: now,
    });
  },
});

export const completeWorkItem = mutation({
  args: {
    workItemId: v.id("workItems"),
    qualityPercent: v.optional(v.number()),
    driveFileId: v.optional(v.string()),
    driveChecksum: v.optional(v.string()),
    cleanupToken: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    note: v.optional(v.string()),
    documentTypeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkAccess(ctx);
    const item = await ctx.db.get(args.workItemId);
    if (!item?.active) throw new Error("WORK_ITEM_NOT_FOUND");
    const document = await ctx.db.get(item.documentId as Id<"officeDocuments">);
    if (!isWorkReleased(document)) throw new Error("WORK_NOT_APPROVED");

    const catalogData = await catalog(ctx);
    const siblingItems = (await ctx.db.query("workItems").collect()).filter(
      (row: any) => row.active && String(row.documentId) === String(item.documentId),
    );
    const excludedIndividuals = individualAssigneeIdsForDocument(siblingItems, item.documentId);
    const type = assignmentTypeOf(item);
    let allowed = false;
    if (type === "individual") {
      allowed = (item.assigneeUserIds || []).some((id: string) => String(id) === String(access.user._id));
    } else {
      const members = departmentRosterMembers(item, document, catalogData, excludedIndividuals);
      allowed = members.some((member: any) => String(member._id) === String(access.user._id));
    }
    if (!allowed) throw new Error("WORK_ITEM_FORBIDDEN");

    const existing = completionForUser(item, String(access.user._id));
    if (existing?.status === "approved" || existing?.status === "pending_approval") return;
    if (!existing && isUserApproved(item, String(access.user._id))) return;

    const hasEvidence = Boolean(args.driveFileId);
    const documentTypeId = await resolveDocumentTypeForFile(ctx, hasEvidence, args.documentTypeId);
    const note = cleanCompletionNote(args.note);
    let evidence: {
      driveFileId?: string;
      driveChecksum?: string;
      fileName?: string;
      fileType?: string;
      fileSize?: number;
      documentTypeId?: string;
    } = {};
    if (hasEvidence) {
      if (!args.cleanupToken || args.fileName === undefined || args.fileSize === undefined) {
        throw new Error("WORK_EVIDENCE_REQUIRED");
      }
      const file = validateDocumentFile(args.fileName, args.fileSize);
      await commitDriveUploadStage(
        ctx,
        { cleanupToken: args.cleanupToken, driveFileId: args.driveFileId as string },
        String(access.user._id),
        "work",
      );
      evidence = {
        driveFileId: args.driveFileId,
        driveChecksum: args.driveChecksum,
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: args.fileSize,
        documentTypeId,
      };
    }

    const late = item.deadline < todayInVietnam();
    const now = Date.now();
    if (shouldBypassWorkCompletionReview(access.isAdmin, args.qualityPercent)) {
      const qualityPercent = assertQualityPercent(args.qualityPercent as number);
      const completions = upsertCompletion(item, {
        userId: String(access.user._id),
        status: "approved",
        submittedAt: now,
        submittedLate: late,
        qualityPercent,
        reviewedAt: now,
        reviewedBy: String(access.user._id),
        ...evidence,
        ...(note ? { note } : {}),
      });
      const synced = syncApprovedArrays(completions);
      await ctx.db.patch(args.workItemId, {
        completions,
        ...synced,
        updatedBy: access.user._id,
        updatedAt: now,
      });
      return;
    }

    const completions = upsertCompletion(item, {
      userId: String(access.user._id),
      status: "pending_approval",
      submittedAt: now,
      submittedLate: late,
      ...evidence,
      ...(note ? { note } : {}),
    });
    await ctx.db.patch(args.workItemId, {
      completions,
      updatedBy: access.user._id,
      updatedAt: now,
    });
  },
});

export const reviewWorkCompletion = mutation({
  args: {
    workItemId: v.id("workItems"),
    userId: v.string(),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    qualityPercent: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    deadline: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkAccess(ctx);
    const item = await ctx.db.get(args.workItemId);
    if (!item?.active) throw new Error("WORK_ITEM_NOT_FOUND");
    const document = await ctx.db.get(item.documentId as Id<"officeDocuments">);
    if (!isWorkReleased(document)) throw new Error("WORK_NOT_APPROVED");
    if (!canReviewWorkCompletion({ actorUserId: String(access.user._id), createdBy: String(document.createdBy) })) {
      throw new Error("WORK_COMPLETION_REVIEWER_REQUIRED");
    }
    const existing = completionForUser(item, args.userId);
    if (!existing || existing.status !== "pending_approval") {
      throw new Error("WORK_COMPLETION_NOT_PENDING");
    }
    const now = Date.now();
    const nextDeadline = args.deadline ? assertDate(args.deadline) : item.deadline;
    if (args.decision === "approve") {
      if (args.qualityPercent === undefined) throw new Error("QUALITY_PERCENT_REQUIRED");
      const qualityPercent = assertQualityPercent(args.qualityPercent);
      const completions = upsertCompletion(item, {
        ...existing,
        status: "approved",
        qualityPercent,
        reviewedAt: now,
        reviewedBy: String(access.user._id),
        rejectionReason: undefined,
      });
      const synced = syncApprovedArrays(completions);
      await ctx.db.patch(args.workItemId, {
        completions,
        ...synced,
        deadline: nextDeadline,
        updatedBy: access.user._id,
        updatedAt: now,
      });
      return;
    }
    const reason = String(args.rejectionReason || "").trim();
    if (!reason || reason.length > 500) throw new Error("INVALID_REJECTION_REASON");
    const completions = upsertCompletion(item, {
      ...existing,
      status: "rejected",
      reviewedAt: now,
      reviewedBy: String(access.user._id),
      rejectionReason: reason,
      qualityPercent: undefined,
    });
    const synced = syncApprovedArrays(completions);
    await ctx.db.patch(args.workItemId, {
      completions,
      ...synced,
      deadline: nextDeadline,
      updatedBy: access.user._id,
      updatedAt: now,
    });
  },
});

export const reviewPersonalCompletion = mutation({
  args: {
    taskId: v.id("personalTasks"),
    userId: v.string(),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    qualityPercent: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const assignerMode = await getWorkAssignerMode(ctx);
    const access = await requireWorkAccess(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task?.active) throw new Error("PERSONAL_WORK_NOT_FOUND");
    const parentItem = await ctx.db.get(task.workItemId as Id<"workItems">);
    if (!parentItem?.active) throw new Error("WORK_ITEM_NOT_FOUND");
    const parentDocument = await ctx.db.get(parentItem.documentId as Id<"officeDocuments">);
    if (!isWorkReleased(parentDocument)) {
      throw new Error("WORK_NOT_APPROVED");
    }
    const existing = completionForUser(task, args.userId);
    if (!existing || existing.status !== "pending_approval") {
      throw new Error("WORK_COMPLETION_NOT_PENDING");
    }

    const target = await ctx.db.get(args.userId as Id<"users">);
    const targetLevel = target ? activePositionLevel(target, access.positions) : 0;
    let canReview = access.isAdmin
      && await documentInActorScope(ctx, access.departmentScope, parentDocument);
    if (!canReview && assignerMode === WORK_ASSIGNER_MODE_SUPERVISOR) {
      // L2/L3 review level-1 subordinates only (matches listMine badge/UI).
      canReview =
        (access.level === 2 || access.level === 3) &&
        targetLevel === 1 &&
        String(target?.departmentId || "") === String(access.user.departmentId || "");
    }
    if (!canReview) throw new Error("WORK_COMPLETION_REVIEWER_REQUIRED");

    const now = Date.now();
    if (args.decision === "approve") {
      if (args.qualityPercent === undefined) throw new Error("QUALITY_PERCENT_REQUIRED");
      const qualityPercent = assertQualityPercent(args.qualityPercent);
      const completions = upsertCompletion(task, {
        ...existing,
        status: "approved",
        qualityPercent,
        reviewedAt: now,
        reviewedBy: String(access.user._id),
        rejectionReason: undefined,
      });
      const synced = syncApprovedArrays(completions);
      await ctx.db.patch(args.taskId, {
        completions,
        ...synced,
        updatedBy: access.user._id,
        updatedAt: now,
      });
      return;
    }
    const reason = String(args.rejectionReason || "").trim();
    if (!reason || reason.length > 500) throw new Error("INVALID_REJECTION_REASON");
    const completions = upsertCompletion(task, {
      ...existing,
      status: "rejected",
      reviewedAt: now,
      reviewedBy: String(access.user._id),
      rejectionReason: reason,
      qualityPercent: undefined,
    });
    const synced = syncApprovedArrays(completions);
    await ctx.db.patch(args.taskId, {
      completions,
      ...synced,
      updatedBy: access.user._id,
      updatedAt: now,
    });
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireWorkAccess(ctx);
    const assignerMode = await getWorkAssignerMode(ctx);
    const [documents, workItems, personalTasks, catalogData] = await Promise.all([
      ctx.db.query("officeDocuments").collect(),
      ctx.db.query("workItems").collect(),
      ctx.db.query("personalTasks").collect(),
      catalog(ctx),
    ]);
    const activeDocuments = documents.filter((document: any) => document.active);
    const activeWorkItems = workItems.filter((item: any) => item.active);
    const docsById = new Map(activeDocuments.map((document: any) => [String(document._id), document]));
    const tasksByItem = new Map<string, any[]>();
    for (const task of personalTasks.filter((item: any) => item.active)) {
      const list = tasksByItem.get(String(task.workItemId)) || [];
      list.push(task);
      tasksByItem.set(String(task.workItemId), list);
    }

    // Documents this Ban giám hiệu member was designated to approve (any decision state).
    // Decided documents stay listed for 30 days so the approver can see the outcome.
    const decidedSince = Date.now() - APPROVAL_HISTORY_MS;
    const visibleApprovalDocs = access.isAdmin
      ? []
      : activeDocuments.filter((document: any) =>
          isDesignatedWorkApprover(document, String(access.user._id))
          && (
            document.status === "pending"
            || (workApprovalDecidedAt(document) ?? document.updatedAt ?? 0) >= decidedSince
          ),
        );

    const approvalViews = await Promise.all(
      visibleApprovalDocs.map(async (document: any) => {
        const items = activeWorkItems.filter(
          (workItem: any) => String(workItem.documentId) === String(document._id),
        );
        const excludedIndividuals = individualAssigneeIdsForDocument(items, document._id);
        const assignments = items.map((item: any) => {
          if (assignerMode === WORK_ASSIGNER_MODE_ADMIN_MOD) {
            const type = assignmentTypeOf(item);
            const members = type === "individual"
              ? (item.assigneeUserIds || [])
                  .map((id: string) =>
                    catalogData.activeUsers.find((user: any) => String(user._id) === String(id)),
                  )
                  .filter(Boolean)
              : departmentRosterMembers(item, document, catalogData, excludedIndividuals);
            return {
              _id: item._id,
              type,
              departmentId: item.departmentId,
              departmentName:
                type === "individual"
                  ? "Cá nhân"
                  : String((catalogData.departmentMap.get(String(item.departmentId)) as any)?.name || "")
                    || "Chưa gán phòng ban",
              content: item.content,
              deadline: item.deadline,
              status: adminModItemStatus(item, members),
              taskCount: members.length,
            };
          }
          const tasks = tasksByItem.get(String(item._id)) || [];
          return {
            _id: item._id,
            type: assignmentTypeOf(item),
            departmentId: item.departmentId,
            departmentName:
              String((catalogData.departmentMap.get(String(item.departmentId)) as any)?.name || "")
              || "Chưa gán phòng ban",
            content: item.content,
            deadline: item.deadline,
            status: completionStatus(tasks),
            taskCount: tasks.length,
          };
        });
        return {
          ...(await documentView(ctx, document, catalogData, items)),
          // Approvers never edit or delete; the creator does.
          canEdit: false,
          canDelete: false,
          awaitingMyDecision: canApproveWorkDocument(document, String(access.user._id)),
          canReject:
            canApproveWorkDocument(document, String(access.user._id)) && canRejectWorkDocument(document),
          assignments,
          workStatus: overallCompletionStatus(
            assignments.map((assignment: any) => assignment.status),
          ),
          taskCount: assignments.reduce(
            (total: number, assignment: any) => total + assignment.taskCount,
            0,
          ),
        };
      }),
    );

    if (assignerMode === WORK_ASSIGNER_MODE_ADMIN_MOD) {
      const myWorkItems = [];
      for (const item of activeWorkItems) {
        const document = docsById.get(String(item.documentId));
        if (!document || !isWorkReleased(document)) continue;
        const siblings = activeWorkItems.filter(
          (row: any) => String(row.documentId) === String(item.documentId),
        );
        const excludedIndividuals = individualAssigneeIdsForDocument(siblings, item.documentId);
        const type = assignmentTypeOf(item);
        let members: any[] = [];
        let isMine = false;
        if (type === "individual") {
          members = (item.assigneeUserIds || [])
            .map((id: string) =>
              catalogData.activeUsers.find((user: any) => String(user._id) === String(id)),
            )
            .filter(Boolean);
          isMine = (item.assigneeUserIds || []).some(
            (id: string) => String(id) === String(access.user._id),
          );
        } else {
          members = departmentRosterMembers(item, document, catalogData, excludedIndividuals);
          isMine = members.some((member: any) => String(member._id) === String(access.user._id));
        }
        if (!isMine) continue;
        const myCompletion = completionView(item, String(access.user._id), catalogData);
        myWorkItems.push({
          _id: item._id,
          type,
          content: item.content,
          deadline: item.deadline,
          departmentId: item.departmentId,
          departmentName:
            type === "individual"
              ? "Cá nhân"
              : String((catalogData.departmentMap.get(String(item.departmentId)) as any)?.name || "")
                || "Chưa gán phòng ban",
          status: userItemStatus(item, String(access.user._id)),
          collectiveStatus: adminModItemStatus(item, members),
          documentId: document._id,
          documentTitle: workListTitle(document),
          documentContent: document.content,
          fileName: document.fileName,
          fileUrl: null,
          privateFile: Boolean(document.driveFileId || document.fileId),
          completion: myCompletion,
          qualityPercent: myCompletion?.qualityPercent ?? null,
          rejectionReason: myCompletion?.status === "rejected" ? myCompletion.rejectionReason : "",
          members: type === "department"
            ? members.map((member: any) => ({
                ...personView(member, catalogData, userItemStatus(item, String(member._id))),
                qualityPercent: completionForUser(item, String(member._id))?.qualityPercent ?? null,
              }))
            : [],
          pendingMembers: type === "department"
            ? members
                .filter((member: any) => {
                  const status = userItemStatus(item, String(member._id));
                  return status === "pending_task" || status === "overdue" || status === "rejected_completion"
                    || status === "pending_completion";
                })
                .map((member: any) => ({
                  ...personView(member, catalogData, userItemStatus(item, String(member._id))),
                  qualityPercent: completionForUser(item, String(member._id))?.qualityPercent ?? null,
                }))
            : [],
        });
      }

      const pendingCompletionReviews = [];
      for (const item of activeWorkItems) {
        const document = docsById.get(String(item.documentId));
        if (!document || !isWorkReleased(document)) continue;
        if (!canReviewWorkCompletion({ actorUserId: String(access.user._id), createdBy: String(document.createdBy) })) {
          continue;
        }
          for (const row of completionsOf(item)) {
            if (row.status !== "pending_approval") continue;
            const person = catalogData.activeUsers.find(
              (user: any) => String(user._id) === String(row.userId),
            );
            pendingCompletionReviews.push({
              kind: "work_item",
              workItemId: item._id,
              taskId: null,
              userId: row.userId,
              userName: person?.name || person?.email || "—",
              content: item.content,
              deadline: item.deadline,
              submittedAt: row.submittedAt,
              submittedLate: row.submittedLate,
              note: row.note || "",
              type: assignmentTypeOf(item),
              departmentName:
                assignmentTypeOf(item) === "individual"
                  ? "Cá nhân"
                  : String((catalogData.departmentMap.get(String(item.departmentId)) as any)?.name || "")
                    || "Chưa gán phòng ban",
            });
          }
      }

      return {
        userId: access.user._id,
        level: access.level,
        isAdmin: access.isAdmin,
        canCreate: canCreateWorkDocuments(access.user.role, access.level),
        assignerMode: WORK_ASSIGNER_MODE_ADMIN_MOD,
        assignableUsers: [],
        approvals: approvalViews.sort(
          (a, b) => Number(b.awaitingMyDecision) - Number(a.awaitingMyDecision)
            || (b.submittedAt || 0) - (a.submittedAt || 0),
        ),
        departmentWorks: [],
        personalTasks: [],
        myTasks: myWorkItems.sort((a, b) => a.deadline.localeCompare(b.deadline)),
        documentTypes: await listActiveDocumentTypes(ctx),
        pendingCompletionReviews: pendingCompletionReviews.sort(
          (a, b) => a.deadline.localeCompare(b.deadline) || a.submittedAt - b.submittedAt,
        ),
      };
    }

    // Supervisor mode (legacy)
    const visibleItems = access.level >= 2 && access.level <= 3
      ? activeWorkItems.filter((item: any) => {
          const document = docsById.get(String(item.documentId));
          return (
            document?.status === "approved" &&
            assignmentTypeOf(item) === "department" &&
            String(item.departmentId) === String(access.user.departmentId || "")
          );
        })
      : [];

    const departmentWorkViews = await Promise.all(
      visibleItems.map(async (item: any) => {
        const document = docsById.get(String(item.documentId));
        if (!document) return null;
        return {
          ...(await workItemViewWithContext(
            ctx,
            document,
            item,
            tasksByItem.get(String(item._id)) || [],
            catalogData,
          )),
          canAssign: access.level === 2 || access.level === 3,
        };
      }),
    );

    const personalTaskViews = await Promise.all(
      personalTasks
        .filter((task: any) =>
          task.active &&
          task.assigneeUserIds.some((id: string) => String(id) === String(access.user._id)),
        )
        .map(async (task: any) => {
          const item = activeWorkItems.find(
            (workItem: any) => String(workItem._id) === String(task.workItemId),
          );
          const document = item ? docsById.get(String(item.documentId)) : null;
          if (document && document.status !== "approved") return null;
          const completion = completionView(task, String(access.user._id), catalogData);
          return {
            _id: task._id,
            title: task.title,
            deadline: task.deadline,
            status: taskStatus(task, String(access.user._id)),
            documentId: document?._id ?? null,
            documentTitle: document ? workListTitle(document) : "",
            documentContent: document?.content || "",
            fileName: document?.fileName || "",
            fileUrl: null,
            privateFile: Boolean(document?.driveFileId || document?.fileId),
            departmentName: item
              ? String((catalogData.departmentMap.get(String(item.departmentId)) as any)?.name || "")
              : "",
            completion,
            qualityPercent: completion?.qualityPercent ?? null,
            rejectionReason: completion?.status === "rejected" ? completion.rejectionReason : "",
          };
        }),
    );

    const pendingCompletionReviews = [];
    for (const task of personalTasks.filter((item: any) => item.active)) {
      for (const row of completionsOf(task)) {
        if (row.status !== "pending_approval") continue;
        const target = catalogData.activeUsers.find(
          (user: any) => String(user._id) === String(row.userId),
        );
        const targetLevel = target ? activePositionLevel(target, catalogData.positions) : 0;
        const canReview = (
          access.isAdmin
          && personalTaskInScope(
            access.departmentScope,
            task,
            activeWorkItems,
            docsById,
            usersByIdMap(catalogData.users),
          )
        )
          || (
            (access.level === 2 || access.level === 3) &&
            targetLevel > 0 &&
            targetLevel < access.level &&
            String(target?.departmentId || "") === String(access.user.departmentId || "")
          );
        if (!canReview) continue;
        if (!access.isAdmin && targetLevel >= 2) continue;
        const item = activeWorkItems.find(
          (workItem: any) => String(workItem._id) === String(task.workItemId),
        );
        pendingCompletionReviews.push({
          kind: "personal_task",
          workItemId: item?._id || null,
          taskId: task._id,
          userId: row.userId,
          userName: target?.name || target?.email || "—",
          content: task.title,
          deadline: task.deadline,
          submittedAt: row.submittedAt,
          submittedLate: row.submittedLate,
          note: row.note || "",
          type: "individual",
          departmentName: item
            ? String((catalogData.departmentMap.get(String(item.departmentId)) as any)?.name || "")
            : "",
        });
      }
    }

    return {
      userId: access.user._id,
      level: access.level,
      isAdmin: access.isAdmin,
      assignerMode,
      assignableUsers:
        access.level === 2 || access.level === 3
          ? catalogData.activeUsers
              .filter(
                (user: any) =>
                  String(user.departmentId || "") === String(access.user.departmentId || "") &&
                  activePositionLevel(user, catalogData.positions) < access.level,
              )
              .map((user: any) => ({
                _id: user._id,
                name: user.name || user.email || "Chưa đặt tên",
                positionName:
                  catalogData.positions.find(
                    (position: any) => String(position._id) === String(user.positionId),
                  )?.name || "Chưa gán chức vụ",
                email: user.email || "",
                level: activePositionLevel(user, catalogData.positions),
              }))
              .sort((a: any, b: any) => b.level - a.level || a.name.localeCompare(b.name, "vi"))
          : [],
      approvals: approvalViews.sort(
        (a, b) => Number(b.awaitingMyDecision) - Number(a.awaitingMyDecision)
          || (b.submittedAt || 0) - (a.submittedAt || 0),
      ),
      departmentWorks: departmentWorkViews.filter(Boolean),
      personalTasks: personalTaskViews.filter(Boolean).sort((a: any, b: any) =>
        a.deadline.localeCompare(b.deadline),
      ),
      myTasks: [],
      documentTypes: await listActiveDocumentTypes(ctx),
      pendingCompletionReviews: pendingCompletionReviews.sort(
        (a, b) => a.deadline.localeCompare(b.deadline) || a.submittedAt - b.submittedAt,
      ),
    };
  },
});

async function workItemViewWithContext(
  ctx: any,
  document: any,
  item: any,
  tasks: any[],
  catalogData: any,
) {
  const department = catalogData.departmentMap.get(String(item.departmentId));
  return {
    _id: item._id,
    documentId: item.documentId,
    content: item.content,
    deadline: item.deadline,
    departmentId: item.departmentId,
    departmentName: department?.name || "Chưa gán phòng ban",
    status: completionStatus(tasks),
    tasks: tasks.map((task: any) => ({
      _id: task._id,
      title: task.title,
      deadline: task.deadline,
      assigneeUserIds: task.assigneeUserIds,
      assignees: task.assigneeUserIds
        .map((id: string) => catalogData.activeUsers.find((user: any) => String(user._id) === String(id)))
        .filter(Boolean)
        .map((user: any) => ({
          _id: user._id,
          name: user.name || user.email || "Chưa đặt tên",
          email: user.email || "",
          level: activePositionLevel(user, catalogData.positions),
          status: taskStatus(task, String(user._id)),
        })),
      status: taskOverallStatus(task),
    })),
    document: await documentView(ctx, document, catalogData, [item]),
  };
}

export const badge = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireWorkAccess(ctx);
    const assignerMode = await getWorkAssignerMode(ctx);
    const visibilityMode = await getWorkVisibilityMode(ctx);
    const canCreate = canCreateWorkDocuments(access.user.role, access.level);
    const [documents, workItems, personalTasks] = await Promise.all([
      ctx.db.query("officeDocuments").collect(),
      ctx.db.query("workItems").collect(),
      ctx.db.query("personalTasks").collect(),
    ]);
    const catalogData = await catalog(ctx);
    const activeDocuments = documents.filter((document: any) => document.active);
    const activeWorkItems = workItems.filter((item: any) => item.active);
    const docsById = new Map(activeDocuments.map((document: any) => [String(document._id), document]));
    const usersById = new Map<string, { status?: string; departmentId?: string }>(
      catalogData.users.map((user: any) => [String(user._id), user]),
    );
    const tasksByItem = new Map<string, any[]>();
    for (const task of personalTasks.filter((item: any) => item.active)) {
      const list = tasksByItem.get(String(task.workItemId)) || [];
      list.push(task);
      tasksByItem.set(String(task.workItemId), list);
    }

    // Documents waiting for this Ban giám hiệu member's approval decision.
    let pendingApprovalCount = access.isAdmin
      ? 0
      : activeDocuments.filter((document: any) =>
          canApproveWorkDocument(document, String(access.user._id)),
        ).length;
    if (assignerMode === WORK_ASSIGNER_MODE_ADMIN_MOD) {
      for (const item of activeWorkItems) {
        const document = docsById.get(String(item.documentId));
        if (!document || !isWorkReleased(document)) continue;
        if (!canReviewWorkCompletion({
          actorUserId: String(access.user._id),
          createdBy: String(document.createdBy),
        })) continue;
        pendingApprovalCount += completionsOf(item).filter(
          (row: any) => row.status === "pending_approval",
        ).length;
      }
    } else {
      for (const task of personalTasks.filter((item: any) => item.active)) {
        for (const row of completionsOf(task)) {
          if (row.status !== "pending_approval") continue;
          const target = catalogData.activeUsers.find(
            (user: any) => String(user._id) === String(row.userId),
          );
          const targetLevel = target ? activePositionLevel(target, catalogData.positions) : 0;
          const canReview = (
            access.isAdmin
            && personalTaskInScope(access.departmentScope, task, activeWorkItems, docsById, usersById)
          )
            || (
              (access.level === 2 || access.level === 3) &&
              targetLevel > 0 &&
              targetLevel < access.level &&
              String(target?.departmentId || "") === String(access.user.departmentId || "")
            );
          if (!canReview) continue;
          if (!access.isAdmin && targetLevel >= 2) continue;
          pendingApprovalCount += 1;
        }
      }
    }

    let incompleteMineCount = 0;
    if (assignerMode === WORK_ASSIGNER_MODE_ADMIN_MOD) {
      for (const item of activeWorkItems) {
        const document = docsById.get(String(item.documentId));
        if (!document || !isWorkReleased(document)) continue;
        const siblings = workItemsForDocument(activeWorkItems, item.documentId);
        const excludedIndividuals = individualAssigneeIdsForDocument(siblings, item.documentId);
        if (!isActorAssignedToWorkItem(
          item,
          document,
          String(access.user._id),
          catalogData,
          excludedIndividuals,
        )) continue;
        if (!isWorkStatusCompleted(userItemStatus(item, String(access.user._id)))) {
          incompleteMineCount += 1;
        }
      }
    } else if (access.level === 2 || access.level === 3) {
      incompleteMineCount = activeWorkItems.filter((item: any) => {
        const document = docsById.get(String(item.documentId));
        return (
          document?.status === "approved" &&
          assignmentTypeOf(item) === "department" &&
          String(item.departmentId) === String(access.user.departmentId || "") &&
          !isWorkStatusCompleted(completionStatus(tasksByItem.get(String(item._id)) || []))
        );
      }).length;
    } else {
      incompleteMineCount = personalTasks.filter((task: any) => {
        if (!task.active) return false;
        if (!task.assigneeUserIds.some((id: string) => String(id) === String(access.user._id))) {
          return false;
        }
        return !isWorkStatusCompleted(taskStatus(task, String(access.user._id)));
      }).length;
    }

    let incompleteCreatedCount = 0;
    if (canCreate) {
      for (const document of activeDocuments) {
        // Non-ops creators (incl. Ban giám hiệu, who may see school-wide documents)
        // only count what they created themselves.
        if (!access.isAdmin && String(document.createdBy) !== String(access.user._id)) continue;
        const items = workItemsForDocument(activeWorkItems, document._id);
        if (!isWorkManagementListVisible({
          document,
          items,
          actorUserId: String(access.user._id),
          actorRole: access.user.role,
          actorLevel: access.level,
          actorDepartmentId: String(access.user.departmentId || ""),
          visibilityMode,
          usersById,
          departmentScope: access.departmentScope,
        })) continue;
        if (!isWorkStatusCompleted(managementDocumentWorkStatus(document, items, catalogData))) {
          incompleteCreatedCount += 1;
        }
      }
    }

    return {
      count: workMenuBadgeCount({
        pendingApprovalCount,
        incompleteMineCount,
        incompleteCreatedCount,
      }),
      level: access.level,
      assignerMode,
    };
  },
});
