import { v } from "convex/values";
import {
  activePositionLevel,
  currentUserOrThrow,
  isOperationalManagerRole,
  isSameDepartmentSubordinate,
  resolveUserMenuAccess,
  WORK_ASSIGNER_MODE_ADMIN_MOD,
  getWorkAssignerMode,
} from "./lib";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  claimDriveUploadCleanup,
  commitDriveUploadStage,
  completeDriveUploadCleanup,
  deleteConvexObject,
  finalizeDriveUploadStage,
  registerDriveUploadStage,
  releaseDriveUploadCleanup,
} from "./driveUploadStages";
import { canAddStaffFault, canSeeStaffFaultRecord, STAFF_FAULTS_MENU_ID } from "./staffFaultsPolicy";
import { moderatorDepartmentScope, opsTargetInScope } from "./moderatorScope";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SCHOOL_YEAR_RE = /^\d{4}-\d{4}$/;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg"]);
const EVAL_KINDS = new Set(["quarterly", "civil_servant", "boarding"]);

function todayInVietnam() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function assertDate(value: string) {
  if (!DATE_RE.test(value)) throw new Error("INVALID_DATE");
  return value;
}

function assertReason(value: string) {
  const reason = value.trim();
  if (!reason || reason.length > 2000) throw new Error("INVALID_FAULT_REASON");
  return reason;
}

function assertText(value: string) {
  const content = value.trim();
  if (!content || content.length > 5000) throw new Error("INVALID_EVALUATION_TEXT");
  return content;
}

function assertFileMeta(args: {
  fileName: string;
  fileType: string;
  fileSize: number;
  driveFileId: string;
}) {
  const fileName = args.fileName.trim();
  const ext = fileName.toLowerCase().split(".").pop() || "";
  if (!fileName || !ACCEPTED_EXTENSIONS.has(ext)) throw new Error("INVALID_EVALUATION_FILE");
  if (!args.driveFileId.trim()) throw new Error("INVALID_EVALUATION_FILE");
  if (!Number.isFinite(args.fileSize) || args.fileSize <= 0 || args.fileSize > MAX_FILE_SIZE) {
    throw new Error("INVALID_EVALUATION_FILE");
  }
  return {
    fileName,
    fileType: ({
      jpeg: "image/jpeg",
      jpg: "image/jpeg",
      pdf: "application/pdf",
      png: "image/png",
    } as Record<string, string>)[ext] || "application/octet-stream",
    fileSize: Math.round(args.fileSize),
    driveFileId: args.driveFileId.trim(),
  };
}

function periodKeyFor(args: {
  kind: string;
  year?: number;
  quarter?: number;
  schoolYear?: string;
  semester?: number;
}) {
  if (args.kind === "quarterly") {
    if (!args.year || args.year < 2000 || args.year > 2100) throw new Error("INVALID_EVALUATION_PERIOD");
    if (!args.quarter || args.quarter < 1 || args.quarter > 4) throw new Error("INVALID_EVALUATION_PERIOD");
    return `Q${args.quarter}-${args.year}`;
  }
  if (args.kind === "civil_servant") {
    const schoolYear = String(args.schoolYear || "");
    if (!SCHOOL_YEAR_RE.test(schoolYear)) throw new Error("INVALID_EVALUATION_PERIOD");
    const [start, end] = schoolYear.split("-").map(Number);
    if (end !== start + 1) throw new Error("INVALID_EVALUATION_PERIOD");
    return `CS-${schoolYear}`;
  }
  if (args.kind === "boarding") {
    const schoolYear = String(args.schoolYear || "");
    if (!SCHOOL_YEAR_RE.test(schoolYear)) throw new Error("INVALID_EVALUATION_PERIOD");
    if (args.semester !== 1 && args.semester !== 2) throw new Error("INVALID_EVALUATION_PERIOD");
    return `BD-${schoolYear}-HK${args.semester}`;
  }
  throw new Error("INVALID_EVALUATION_KIND");
}

type ActorCtx = {
  user: any;
  isOps: boolean;
  /** Set for a moderator limited to one department (Đánh giá nhân sự + Ghi nhận lỗi). */
  departmentScope: string | null;
  level: number;
  positions: any[];
  menuAccess: Record<string, string>;
};

async function loadPeopleReviewActor(ctx: any): Promise<ActorCtx> {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  const menuAccess = await resolveUserMenuAccess(ctx, user);
  const positions = await ctx.db.query("positions").collect();
  const isOps = isOperationalManagerRole(user.role);
  return {
    user,
    isOps,
    departmentScope: moderatorDepartmentScope(user),
    level: isOps ? 0 : activePositionLevel(user, positions),
    positions,
    menuAccess,
  };
}

function hasMenu(access: ActorCtx, menuId: string) {
  return access.isOps || access.menuAccess[menuId] !== "hidden";
}

async function requirePeopleReviewAccess(ctx: any): Promise<ActorCtx> {
  const access = await loadPeopleReviewActor(ctx);
  if (!hasMenu(access, "people-review")) {
    throw new Error("FORBIDDEN: people-review menu hidden");
  }
  return access;
}

async function requireStaffFaultsAccess(ctx: any): Promise<ActorCtx> {
  const access = await loadPeopleReviewActor(ctx);
  if (!hasMenu(access, STAFF_FAULTS_MENU_ID)) {
    throw new Error("FORBIDDEN: staff-faults menu hidden");
  }
  return access;
}

function staffFaultsAccessLevel(access: ActorCtx) {
  if (access.isOps) return "view_all";
  return access.menuAccess[STAFF_FAULTS_MENU_ID];
}

function actorSeesStaffFault(
  access: ActorCtx,
  fault: { targetUserId: string; recordedByUserId: string },
  target: { departmentId?: string } | null | undefined,
) {
  return canSeeStaffFaultRecord({
    isOps: access.isOps,
    access: staffFaultsAccessLevel(access),
    actorUserId: String(access.user._id),
    targetUserId: String(fault.targetUserId),
    recordedByUserId: String(fault.recordedByUserId),
    departmentScope: access.departmentScope,
    targetDepartmentId: target?.departmentId || null,
  });
}

/** Ops power over `target`, narrowed to the department for a scoped moderator. */
function opsReaches(actor: ActorCtx, target: any) {
  return opsTargetInScope(
    { _id: String(actor.user._id), isOps: actor.isOps, departmentScope: actor.departmentScope },
    target,
  );
}

function personLabel(user: any) {
  return user?.name || user?.email || "—";
}

function departmentNameOf(user: any, departments: any[]) {
  if (!user?.departmentId) return "Chưa xác định phòng ban";
  const row = departments.find((item: any) => String(item._id) === String(user.departmentId));
  return row?.name || "Chưa xác định phòng ban";
}

function targetLevelOf(target: any, positions: any[], isOpsTarget: boolean) {
  if (isOpsTarget) return 0;
  return activePositionLevel(target, positions);
}

function canRecordFault(actor: ActorCtx, target: any) {
  const targetIsOps = isOperationalManagerRole(target.role);
  const targetLevel = targetLevelOf(target, actor.positions, targetIsOps);

  // Nobody may record a fault against L5 (principal).
  if (!targetIsOps && targetLevel === 5) return false;

  // Self: only Admin/Mod may self-record.
  if (String(actor.user._id) === String(target._id)) {
    return actor.isOps;
  }

  if (actor.isOps) {
    // Admin/Mod may fault anyone except L4/L5 (and other ops accounts);
    // a department-scoped moderator only inside their department.
    if (targetIsOps) return false;
    if (!opsReaches(actor, target)) return false;
    return targetLevel !== 4 && targetLevel !== 5;
  }

  if (actor.level === 5) {
    // Principal: L4 + Admin/Mod only.
    return targetIsOps || targetLevel === 4;
  }

  if (actor.level === 4) {
    // Vice principal does not record teacher faults; only Admin/Mod.
    return targetIsOps;
  }

  if (actor.level === 2 || actor.level === 3) {
    return isSameDepartmentSubordinate(actor.user, target, actor.positions);
  }

  return false;
}

function canUploadEvaluationFile(actor: ActorCtx, target: any) {
  const targetIsOps = isOperationalManagerRole(target.role);
  const targetLevel = targetLevelOf(target, actor.positions, targetIsOps);
  const isSelf = String(actor.user._id) === String(target._id);

  if (isSelf) {
    // L2–L5 and Admin/Mod may self-upload offline self-assessment.
    if (actor.isOps) return true;
    return actor.level >= 2 && actor.level <= 5;
  }

  // L1 files are compiled/uploaded by same-dept L2/L3 only.
  if (!targetIsOps && targetLevel === 1) {
    return (
      (actor.level === 2 || actor.level === 3) &&
      isSameDepartmentSubordinate(actor.user, target, actor.positions)
    );
  }

  // L2 files may be uploaded by same-dept L3.
  if (!targetIsOps && targetLevel === 2) {
    return actor.level === 3 && isSameDepartmentSubordinate(actor.user, target, actor.positions);
  }

  return false;
}

function canWriteEvaluationText(actor: ActorCtx, target: any) {
  const targetIsOps = isOperationalManagerRole(target.role);
  const targetLevel = targetLevelOf(target, actor.positions, targetIsOps);
  if (String(actor.user._id) === String(target._id)) return false; // never self-text
  if (!targetIsOps && targetLevel === 5) return false; // nobody texts principal

  if (targetIsOps) {
    // Only L4/L5 text-evaluate Admin/Mod.
    return actor.level === 4 || actor.level === 5;
  }

  if (targetLevel === 4) {
    return actor.level === 5;
  }

  if (targetLevel >= 1 && targetLevel <= 3) {
    return opsReaches(actor, target) || actor.level === 4 || actor.level === 5;
  }

  return false;
}

function canViewTarget(actor: ActorCtx, target: any) {
  if (String(actor.user._id) === String(target._id)) return true;
  if (actor.isOps) return opsReaches(actor, target);
  if (actor.level === 4 || actor.level === 5) return true;
  if (actor.level === 2 || actor.level === 3) {
    return isSameDepartmentSubordinate(actor.user, target, actor.positions);
  }
  return false;
}

function assignmentTypeOf(item: any): "department" | "individual" {
  return item?.assignmentType === "individual" ? "individual" : "department";
}

function individualAssigneeIdsForDocument(items: any[], documentId: any) {
  const excluded = new Set<string>();
  for (const item of items) {
    if (String(item.documentId) !== String(documentId)) continue;
    if (assignmentTypeOf(item) !== "individual") continue;
    for (const id of item.assigneeUserIds || []) excluded.add(String(id));
  }
  return excluded;
}

function departmentRosterMembers(
  item: any,
  document: any,
  activeUsers: any[],
  excludedIndividuals: Set<string>,
) {
  return activeUsers.filter((user: any) => {
    if (isOperationalManagerRole(user.role)) return false;
    if ((document.approverUserIds || []).some((id: string) => String(id) === String(user._id))) {
      return false;
    }
    if (excludedIndividuals.has(String(user._id))) return false;
    return String(user.departmentId || "") === String(item.departmentId || "");
  });
}

function isApprovedCompletion(item: any, userId: string) {
  const row = (item.completions || []).find((entry: any) => String(entry.userId) === String(userId));
  if (row) return row.status === "approved";
  return (item.completedUserIds || []).some((id: string) => String(id) === String(userId));
}

function qualityOf(item: any, userId: string) {
  const row = (item.completions || []).find(
    (entry: any) => String(entry.userId) === String(userId) && entry.status === "approved",
  );
  return row?.qualityPercent ?? null;
}

async function computeWorkKpi(
  ctx: any,
  targetUser: any,
  startDate: string,
  endDate: string,
) {
  const assignerMode = await getWorkAssignerMode(ctx);
  const [documents, workItems, personalTasks, users, positions] = await Promise.all([
    ctx.db.query("officeDocuments").collect(),
    ctx.db.query("workItems").collect(),
    ctx.db.query("personalTasks").collect(),
    ctx.db.query("users").collect(),
    ctx.db.query("positions").collect(),
  ]);
  const activeUsers = users.filter((user: any) => user.status === "active");
  const docsById = new Map<string, any>(
    documents.filter((doc: any) => doc.active).map((doc: any) => [String(doc._id), doc]),
  );
  const activeWorkItems = workItems.filter((item: any) => item.active);
  const today = todayInVietnam();
  const tasks: any[] = [];

  if (assignerMode === WORK_ASSIGNER_MODE_ADMIN_MOD) {
    for (const item of activeWorkItems) {
      const document = docsById.get(String(item.documentId));
      if (!document || document.status !== "approved") continue;
      if (item.deadline < startDate || item.deadline > endDate) continue;
      const siblings = activeWorkItems.filter(
        (row: any) => String(row.documentId) === String(item.documentId),
      );
      const excluded = individualAssigneeIdsForDocument(siblings, item.documentId);
      const type = assignmentTypeOf(item);
      let isAssignee = false;
      if (type === "individual") {
        isAssignee = (item.assigneeUserIds || []).some(
          (id: string) => String(id) === String(targetUser._id),
        );
      } else {
        const members = departmentRosterMembers(item, document, activeUsers, excluded);
        isAssignee = members.some((member: any) => String(member._id) === String(targetUser._id));
      }
      if (!isAssignee) continue;
      const approved = isApprovedCompletion(item, String(targetUser._id));
      const late = approved && (
        (item.completions || []).find(
          (row: any) => String(row.userId) === String(targetUser._id) && row.status === "approved",
        )?.submittedLate
        || (item.completedLateUserIds || []).some((id: string) => String(id) === String(targetUser._id))
      );
      const status = approved
        ? (late ? "completed_late" : "completed")
        : "incomplete";
      tasks.push({
        _id: item._id,
        content: item.content,
        deadline: item.deadline,
        status,
        qualityPercent: qualityOf(item, String(targetUser._id)),
      });
    }
  } else {
    for (const task of personalTasks.filter((row: any) => row.active)) {
      if (!task.assigneeUserIds.some((id: string) => String(id) === String(targetUser._id))) continue;
      if (task.deadline < startDate || task.deadline > endDate) continue;
      const item = activeWorkItems.find((row: any) => String(row._id) === String(task.workItemId));
      const document = item ? docsById.get(String(item.documentId)) : null;
      if (document && document.status !== "approved") continue;
      const approved = isApprovedCompletion(task, String(targetUser._id));
      const late = approved && (
        (task.completions || []).find(
          (row: any) => String(row.userId) === String(targetUser._id) && row.status === "approved",
        )?.submittedLate
        || (task.completedLateUserIds || []).some((id: string) => String(id) === String(targetUser._id))
      );
      tasks.push({
        _id: task._id,
        content: task.title,
        deadline: task.deadline,
        status: approved ? (late ? "completed_late" : "completed") : "incomplete",
        qualityPercent: qualityOf(task, String(targetUser._id)),
      });
    }
  }

  void positions;
  void today;
  return {
    total: tasks.length,
    onTime: tasks.filter((task) => task.status === "completed").length,
    late: tasks.filter((task) => task.status === "completed_late").length,
    incomplete: tasks.filter((task) => task.status === "incomplete").length,
    tasks: tasks.sort((a, b) => a.deadline.localeCompare(b.deadline)),
  };
}

async function boardingParticipationKeys(ctx: any, userId: string) {
  const periods = await ctx.db.query("boardingPeriods").collect();
  return periods
    .filter(
      (period: any) =>
        period.active &&
        period.participantUserIds.some((id: string) => String(id) === String(userId)),
    )
    .map((period: any) => ({
      schoolYear: period.schoolYear,
      semester: period.semester,
      periodKey: `BD-${period.schoolYear}-HK${period.semester}`,
      label: `Học kỳ ${period.semester} · Năm học ${period.schoolYear}`,
    }))
    .sort(
      (a: any, b: any) =>
        b.schoolYear.localeCompare(a.schoolYear) || b.semester - a.semester,
    );
}

async function loadEvaluationBundle(ctx: any, targetUserId: string) {
  const [files, texts, users] = await Promise.all([
    ctx.db.query("personnelEvaluationFiles").withIndex("by_target", (q: any) =>
      q.eq("targetUserId", String(targetUserId)).eq("active", true),
    ).collect(),
    ctx.db.query("personnelEvaluationTexts").withIndex("by_target", (q: any) =>
      q.eq("targetUserId", String(targetUserId)).eq("active", true),
    ).collect(),
    ctx.db.query("users").collect(),
  ]);
  const usersById = new Map(users.map((user: any) => [String(user._id), user]));
  const textsByFile = new Map<string, any[]>();
  for (const text of texts) {
    const list = textsByFile.get(String(text.fileId)) || [];
    list.push({
      _id: text._id,
      content: text.content,
      evaluatorUserId: text.evaluatorUserId,
      evaluatorName: personLabel(usersById.get(String(text.evaluatorUserId))),
      createdAt: text.createdAt,
      updatedAt: text.updatedAt,
    });
    textsByFile.set(String(text.fileId), list);
  }
  return files
    .map((file: any) => ({
      _id: file._id,
      kind: file.kind,
      year: file.year ?? null,
      quarter: file.quarter ?? null,
      schoolYear: file.schoolYear ?? null,
      semester: file.semester ?? null,
      periodKey: file.periodKey,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      versionCount: file.versionCount,
      lastUploadedAt: file.lastUploadedAt,
      uploadedByUserId: file.uploadedByUserId,
      uploadedByName: personLabel(usersById.get(String(file.uploadedByUserId))),
      textLocked: (textsByFile.get(String(file._id)) || []).length > 0,
      texts: (textsByFile.get(String(file._id)) || []).sort(
        (a, b) => a.createdAt - b.createdAt,
      ),
    }))
    .sort((a: any, b: any) => b.lastUploadedAt - a.lastUploadedAt);
}

export const authorizeFileUpload = query({
  args: {},
  handler: async (ctx) => {
    const access = await uploadActor(ctx);
    return { userId: String(access.user._id) };
  },
});

async function uploadActor(ctx: any) {
  const access = await loadPeopleReviewActor(ctx);
  if (!hasMenu(access, "people-review") && !hasMenu(access, STAFF_FAULTS_MENU_ID)) {
    throw new Error("FORBIDDEN: people-review menu hidden");
  }
  const canUpload = access.isOps || [2, 3, 4, 5].includes(access.level);
  if (!canUpload) throw new Error("PEOPLE_REVIEW_UPLOAD_FORBIDDEN");
  return access;
}

export const registerDriveUpload = mutation({
  args: { cleanupToken: v.string(), driveFileId: v.string() },
  handler: async (ctx, args) => {
    const access = await uploadActor(ctx);
    await registerDriveUploadStage(ctx, args, String(access.user._id), "people-review");
  },
});

export const claimStagedUploadCleanup = mutation({
  args: { cleanupToken: v.string(), claimId: v.string() },
  handler: async (ctx, args) => {
    const access = await uploadActor(ctx);
    return await claimDriveUploadCleanup(ctx, args, String(access.user._id), "people-review");
  },
});

export const finalizeStagedUpload = mutation({
  args: { cleanupToken: v.string() },
  handler: async (ctx, args) => {
    const access = await uploadActor(ctx);
    await finalizeDriveUploadStage(ctx, args.cleanupToken, String(access.user._id), "people-review");
  },
});

export const completeStagedUploadCleanup = mutation({
  args: { cleanupToken: v.string(), claimId: v.string() },
  handler: async (ctx, args) => {
    const access = await uploadActor(ctx);
    await completeDriveUploadCleanup(ctx, args, String(access.user._id), "people-review");
  },
});

export const releaseStagedUploadCleanup = mutation({
  args: { cleanupToken: v.string(), claimId: v.string() },
  handler: async (ctx, args) => {
    const access = await uploadActor(ctx);
    await releaseDriveUploadCleanup(ctx, args, String(access.user._id), "people-review");
  },
});

export const isDriveFileReferenced = query({
  args: { driveFileId: v.string() },
  handler: async (ctx, args) => {
    await uploadActor(ctx);
    const [faults, evaluations] = await Promise.all([
      ctx.db
        .query("personnelFaults")
        .withIndex("by_drive_file", (q: any) => q.eq("driveFileId", args.driveFileId))
        .collect(),
      ctx.db
        .query("personnelEvaluationFiles")
        .withIndex("by_drive_file", (q: any) => q.eq("driveFileId", args.driveFileId))
        .collect(),
    ]);
    return {
      referenced:
        faults.some((row: any) => row.active && row.driveFileId === args.driveFileId)
        || evaluations.some((row: any) => row.active && row.driveFileId === args.driveFileId),
    };
  },
});

export const authorizeFileDownload = query({
  args: {
    fileId: v.string(),
    kind: v.union(v.literal("fault"), v.literal("evaluation")),
  },
  handler: async (ctx, args) => {
    const access = await loadPeopleReviewActor(ctx);
    const peopleReviewVisible = hasMenu(access, "people-review");
    const staffFaultsVisible = hasMenu(access, STAFF_FAULTS_MENU_ID);
    if (args.kind === "fault") {
      if (!peopleReviewVisible && !staffFaultsVisible) {
        throw new Error("FORBIDDEN: people-review menu hidden");
      }
      const fault = await ctx.db.get(args.fileId as Id<"personnelFaults">);
      if (!fault?.active || !fault.driveFileId) throw new Error("PEOPLE_REVIEW_FILE_NOT_FOUND");
      const target = await ctx.db.get(fault.targetUserId as Id<"users">);
      const viaPeopleReview = peopleReviewVisible && target && canViewTarget(access, target);
      const viaStaffFaults = staffFaultsVisible && actorSeesStaffFault(access, fault, target);
      if (!viaPeopleReview && !viaStaffFaults) throw new Error("PEOPLE_REVIEW_FILE_FORBIDDEN");
      return {
        driveFileId: fault.driveFileId,
        fileName: fault.fileName,
        fileType: fault.fileType,
      };
    }
    if (!peopleReviewVisible) {
      throw new Error("FORBIDDEN: people-review menu hidden");
    }
    const file = await ctx.db.get(args.fileId as Id<"personnelEvaluationFiles">);
    if (!file?.active || !file.driveFileId) throw new Error("PEOPLE_REVIEW_FILE_NOT_FOUND");
    const target = await ctx.db.get(file.targetUserId as Id<"users">);
    if (!target || !canViewTarget(access, target)) throw new Error("PEOPLE_REVIEW_FILE_FORBIDDEN");
    return {
      driveFileId: file.driveFileId,
      fileName: file.fileName,
      fileType: file.fileType,
    };
  },
});

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const access = await requirePeopleReviewAccess(ctx);
    const [users, departments, positions] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("departments").collect(),
      ctx.db.query("positions").collect(),
    ]);
    const activeUsers = users.filter((user: any) => user.status === "active");
    const self = {
      _id: access.user._id,
      name: personLabel(access.user),
      email: access.user.email || "",
      departmentName: departmentNameOf(access.user, departments),
      positionLevel: access.isOps ? null : access.level,
      isOps: access.isOps,
    };

    let mode: "self" | "team" | "school" = "self";
    let people: any[] = [];
    if (access.isOps || access.level === 4 || access.level === 5) {
      mode = "school";
      people = activeUsers
        .filter((user: any) => !access.isOps || opsReaches(access, user))
        .map((user: any) => {
          const isOps = isOperationalManagerRole(user.role);
          const level = isOps ? null : activePositionLevel(user, positions);
          return {
            _id: user._id,
            name: personLabel(user),
            email: user.email || "",
            departmentId: user.departmentId || "",
            departmentName: departmentNameOf(user, departments),
            positionName:
              positions.find((row: any) => String(row._id) === String(user.positionId))?.name ||
              (isOps ? (user.role === "admin" ? "Administrator" : "Moderator") : "—"),
            positionLevel: level,
            isOps,
            isSelf: String(user._id) === String(access.user._id),
            canUpload: canUploadEvaluationFile(access, user),
            canWriteText: canWriteEvaluationText(access, user),
            canRecordFault: canRecordFault(access, user),
          };
        })
        .sort(
          (a, b) =>
            a.departmentName.localeCompare(b.departmentName, "vi") ||
            a.name.localeCompare(b.name, "vi"),
        );
    } else if (access.level === 2 || access.level === 3) {
      mode = "team";
      people = activeUsers
        .filter((user: any) => isSameDepartmentSubordinate(access.user, user, positions))
        .map((user: any) => ({
          _id: user._id,
          name: personLabel(user),
          email: user.email || "",
          departmentId: user.departmentId || "",
          departmentName: departmentNameOf(user, departments),
          positionName:
            positions.find((row: any) => String(row._id) === String(user.positionId))?.name || "—",
          positionLevel: activePositionLevel(user, positions),
          isOps: false,
          isSelf: false,
          canUpload: canUploadEvaluationFile(access, user),
          canWriteText: false,
          canRecordFault: canRecordFault(access, user),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "vi"));
    }

    return {
      mode,
      self,
      actor: {
        isOps: access.isOps,
        level: access.level,
        canSelfUpload: canUploadEvaluationFile(access, access.user),
        canSelfFault: canRecordFault(access, access.user),
      },
      people,
      departments: departments
        .filter((row: any) => row.active)
        .map((row: any) => ({ _id: row._id, name: row.name }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name, "vi")),
    };
  },
});

export const myDashboard = query({
  args: {
    faultFrom: v.optional(v.string()),
    faultTo: v.optional(v.string()),
    workFrom: v.optional(v.string()),
    workTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requirePeopleReviewAccess(ctx);
    const today = todayInVietnam();
    const faultTo = assertDate(args.faultTo || today);
    const faultFrom = assertDate(args.faultFrom || addDaysIso(faultTo, -29));
    const workTo = assertDate(args.workTo || today);
    const workFrom = assertDate(args.workFrom || addDaysIso(workTo, -29));

    const [faults, users] = await Promise.all([
      ctx.db.query("personnelFaults").withIndex("by_target", (q: any) =>
        q.eq("targetUserId", String(access.user._id)).eq("active", true),
      ).collect(),
      ctx.db.query("users").collect(),
    ]);
    const usersById = new Map(users.map((user: any) => [String(user._id), user]));
    const faultRows = faults
      .filter((fault: any) => fault.violationDate >= faultFrom && fault.violationDate <= faultTo)
      .sort((a: any, b: any) => b.violationDate.localeCompare(a.violationDate) || b.createdAt - a.createdAt)
      .map((fault: any) => ({
        _id: fault._id,
        violationDate: fault.violationDate,
        reason: fault.reason,
        fileName: fault.fileName,
        fileType: fault.fileType,
        recordedByName: personLabel(usersById.get(String(fault.recordedByUserId))),
        createdAt: fault.createdAt,
      }));

    const workKpi = await computeWorkKpi(ctx, access.user, workFrom, workTo);
    const evaluations = await loadEvaluationBundle(ctx, String(access.user._id));
    const boardingOptions = await boardingParticipationKeys(ctx, String(access.user._id));

    return {
      faultFrom,
      faultTo,
      workFrom,
      workTo,
      faults: faultRows,
      workKpi,
      evaluations,
      boardingOptions,
      canSelfUpload: canUploadEvaluationFile(access, access.user),
      canSelfFault: canRecordFault(access, access.user),
    };
  },
});

export const personDetail = query({
  args: {
    userId: v.id("users"),
    faultFrom: v.optional(v.string()),
    faultTo: v.optional(v.string()),
    workFrom: v.optional(v.string()),
    workTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requirePeopleReviewAccess(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target || target.status !== "active") throw new Error("USER_NOT_FOUND");
    if (!canViewTarget(access, target)) throw new Error("PEOPLE_REVIEW_FORBIDDEN");

    const today = todayInVietnam();
    const faultTo = assertDate(args.faultTo || today);
    const faultFrom = assertDate(args.faultFrom || addDaysIso(faultTo, -29));
    const workTo = assertDate(args.workTo || today);
    const workFrom = assertDate(args.workFrom || addDaysIso(workTo, -29));

    const [faults, users, departments] = await Promise.all([
      ctx.db.query("personnelFaults").withIndex("by_target", (q: any) =>
        q.eq("targetUserId", String(target._id)).eq("active", true),
      ).collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("departments").collect(),
    ]);
    const usersById = new Map(users.map((user: any) => [String(user._id), user]));
    const faultRows = faults
      .filter((fault: any) => fault.violationDate >= faultFrom && fault.violationDate <= faultTo)
      .sort((a: any, b: any) => b.violationDate.localeCompare(a.violationDate) || b.createdAt - a.createdAt)
      .map((fault: any) => ({
        _id: fault._id,
        violationDate: fault.violationDate,
        reason: fault.reason,
        fileName: fault.fileName,
        fileType: fault.fileType,
        recordedByName: personLabel(usersById.get(String(fault.recordedByUserId))),
        createdAt: fault.createdAt,
      }));

    return {
      person: {
        _id: target._id,
        name: personLabel(target),
        email: target.email || "",
        departmentName: departmentNameOf(target, departments),
        positionLevel: isOperationalManagerRole(target.role)
          ? null
          : activePositionLevel(target, access.positions),
        isOps: isOperationalManagerRole(target.role),
        isSelf: String(target._id) === String(access.user._id),
      },
      permissions: {
        canUpload: canUploadEvaluationFile(access, target),
        canWriteText: canWriteEvaluationText(access, target),
        canRecordFault: canRecordFault(access, target),
      },
      faultFrom,
      faultTo,
      workFrom,
      workTo,
      faults: faultRows,
      workKpi: await computeWorkKpi(ctx, target, workFrom, workTo),
      evaluations: await loadEvaluationBundle(ctx, String(target._id)),
      boardingOptions: await boardingParticipationKeys(ctx, String(target._id)),
    };
  },
});

function mapStaffFaultRow(fault: any, usersById: Map<string, any>, departments: any[], actorId: string) {
  const target = usersById.get(String(fault.targetUserId));
  const recorder = usersById.get(String(fault.recordedByUserId));
  return {
    _id: fault._id,
    violationDate: fault.violationDate,
    reason: fault.reason,
    fileName: fault.fileName,
    fileType: fault.fileType,
    targetUserId: String(fault.targetUserId),
    targetName: personLabel(target),
    departmentName: departmentNameOf(target, departments),
    recordedByUserId: String(fault.recordedByUserId),
    recordedByName: personLabel(recorder),
    isSelfTarget: String(fault.targetUserId) === actorId,
    isRecordedByMe: String(fault.recordedByUserId) === actorId,
    createdAt: fault.createdAt,
  };
}

export const staffFaultLog = query({
  args: {
    faultFrom: v.optional(v.string()),
    faultTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireStaffFaultsAccess(ctx);
    const actorId = String(access.user._id);
    const viewAll = staffFaultsAccessLevel(access) === "view_all" || access.isOps;
    const faultFrom = args.faultFrom ? assertDate(args.faultFrom) : "";
    const faultTo = args.faultTo ? assertDate(args.faultTo) : "";

    const [users, departments, collected] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("departments").collect(),
      ctx.db
        .query("personnelFaults")
        .withIndex("by_violation_date", (q: any) => q.eq("active", true))
        .collect(),
    ]);

    const usersById = new Map(users.map((user: any) => [String(user._id), user]));
    const faults = collected
      .filter((fault: any) => {
        if (!fault.active) return false;
        if (faultFrom && fault.violationDate < faultFrom) return false;
        if (faultTo && fault.violationDate > faultTo) return false;
        return actorSeesStaffFault(access, fault, usersById.get(String(fault.targetUserId)));
      })
      .sort((a: any, b: any) => b.violationDate.localeCompare(a.violationDate) || b.createdAt - a.createdAt)
      .map((fault: any) => mapStaffFaultRow(fault, usersById, departments, actorId));

    return {
      faultFrom: faultFrom || null,
      faultTo: faultTo || null,
      access: viewAll ? "view_all" : "view",
      canAdd: canAddStaffFault(access),
      faults,
    };
  },
});

export const staffFaultTargets = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireStaffFaultsAccess(ctx);
    if (!canAddStaffFault(access)) {
      return { canAdd: false, people: [] as any[] };
    }
    const [users, departments] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("departments").collect(),
    ]);
    const people = users
      .filter((user: any) => user.status === "active" && canRecordFault(access, user))
      .map((user: any) => {
        const isOps = isOperationalManagerRole(user.role);
        return {
          _id: user._id,
          name: personLabel(user),
          email: user.email || "",
          departmentName: departmentNameOf(user, departments),
          positionName:
            access.positions.find((row: any) => String(row._id) === String(user.positionId))?.name ||
            (isOps ? (user.role === "admin" ? "Administrator" : "Moderator") : "—"),
          positionLevel: isOps ? null : activePositionLevel(user, access.positions),
          isOps,
        };
      })
      .sort(
        (a, b) =>
          a.departmentName.localeCompare(b.departmentName, "vi") ||
          a.name.localeCompare(b.name, "vi"),
      );
    return { canAdd: true, people };
  },
});

export const recordFault = mutation({
  args: {
    targetUserId: v.id("users"),
    violationDate: v.string(),
    reason: v.string(),
    driveFileId: v.string(),
    driveChecksum: v.optional(v.string()),
    cleanupToken: v.string(),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
  },
  handler: async (ctx, args) => {
    const access = await requireStaffFaultsAccess(ctx);
    if (!canAddStaffFault(access)) throw new Error("PEOPLE_REVIEW_FAULT_FORBIDDEN");
    const target = await ctx.db.get(args.targetUserId);
    if (!target || target.status !== "active") throw new Error("USER_NOT_FOUND");
    if (!canRecordFault(access, target)) throw new Error("PEOPLE_REVIEW_FAULT_FORBIDDEN");
    const meta = assertFileMeta(args);
    const violationDate = assertDate(args.violationDate);
    const reason = assertReason(args.reason);
    await commitDriveUploadStage(
      ctx,
      { cleanupToken: args.cleanupToken, driveFileId: meta.driveFileId },
      String(access.user._id),
      "people-review",
    );
    const now = Date.now();
    const id = await ctx.db.insert("personnelFaults", {
      targetUserId: String(target._id),
      recordedByUserId: String(access.user._id),
      violationDate,
      reason,
      driveFileId: meta.driveFileId,
      driveChecksum: args.driveChecksum,
      fileName: meta.fileName,
      fileType: meta.fileType,
      fileSize: meta.fileSize,
      active: true,
      createdBy: access.user._id,
      updatedBy: access.user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: access.user._id,
      targetUserId: target._id,
      targetEmail: target.email,
      action: "people_review.fault.create",
      details: JSON.stringify({ id, violationDate, fileName: meta.fileName }),
      at: now,
    });
    return id;
  },
});

export const upsertEvaluationFile = mutation({
  args: {
    targetUserId: v.id("users"),
    kind: v.string(),
    year: v.optional(v.number()),
    quarter: v.optional(v.number()),
    schoolYear: v.optional(v.string()),
    semester: v.optional(v.number()),
    driveFileId: v.string(),
    driveChecksum: v.optional(v.string()),
    cleanupToken: v.string(),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
  },
  handler: async (ctx, args) => {
    const access = await requirePeopleReviewAccess(ctx);
    if (!EVAL_KINDS.has(args.kind)) throw new Error("INVALID_EVALUATION_KIND");
    const target = await ctx.db.get(args.targetUserId);
    if (!target || target.status !== "active") throw new Error("USER_NOT_FOUND");
    if (!canUploadEvaluationFile(access, target)) throw new Error("PEOPLE_REVIEW_UPLOAD_FORBIDDEN");

    if (args.kind === "boarding") {
      const options = await boardingParticipationKeys(ctx, String(target._id));
      const key = periodKeyFor(args);
      if (!options.some((option: any) => option.periodKey === key)) {
        throw new Error("BOARDING_NOT_PARTICIPATING");
      }
    }

    const periodKey = periodKeyFor(args);
    const meta = assertFileMeta(args);
    await commitDriveUploadStage(
      ctx,
      { cleanupToken: args.cleanupToken, driveFileId: meta.driveFileId },
      String(access.user._id),
      "people-review",
    );
    const existing = await ctx.db
      .query("personnelEvaluationFiles")
      .withIndex("by_target_kind_period", (q: any) =>
        q.eq("targetUserId", String(target._id)).eq("kind", args.kind).eq("periodKey", periodKey),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      if (existing.active) {
        const texts = await ctx.db
          .query("personnelEvaluationTexts")
          .withIndex("by_file", (q: any) => q.eq("fileId", String(existing._id)).eq("active", true))
          .collect();
        if (texts.length) throw new Error("EVALUATION_FILE_LOCKED");
      }
      const previousDriveFileId = existing.active ? existing.driveFileId : null;
      await ctx.db.patch(existing._id, {
        driveFileId: meta.driveFileId,
        driveChecksum: args.driveChecksum,
        fileName: meta.fileName,
        fileType: meta.fileType,
        fileSize: meta.fileSize,
        uploadedByUserId: String(access.user._id),
        versionCount: existing.active ? (existing.versionCount || 1) + 1 : 1,
        lastUploadedAt: now,
        updatedBy: access.user._id,
        updatedAt: now,
        active: true,
        year: args.year,
        quarter: args.quarter,
        schoolYear: args.schoolYear,
        semester: args.semester,
      });
      await ctx.db.insert("auditLogs", {
        actorUserId: access.user._id,
        targetUserId: target._id,
        targetEmail: target.email,
        action: existing.active
          ? "people_review.evaluation_file.replace"
          : "people_review.evaluation_file.reactivate",
        details: JSON.stringify({
          id: existing._id,
          kind: args.kind,
          periodKey,
          previousDriveFileId,
          versionCount: existing.active ? (existing.versionCount || 1) + 1 : 1,
          fileName: meta.fileName,
        }),
        at: now,
      });
      return {
        fileId: existing._id,
        previousDriveFileId,
        versionCount: existing.active ? (existing.versionCount || 1) + 1 : 1,
      };
    }

    const fileId = await ctx.db.insert("personnelEvaluationFiles", {
      targetUserId: String(target._id),
      kind: args.kind,
      year: args.year,
      quarter: args.quarter,
      schoolYear: args.schoolYear,
      semester: args.semester,
      periodKey,
      driveFileId: meta.driveFileId,
      driveChecksum: args.driveChecksum,
      fileName: meta.fileName,
      fileType: meta.fileType,
      fileSize: meta.fileSize,
      uploadedByUserId: String(access.user._id),
      versionCount: 1,
      lastUploadedAt: now,
      active: true,
      createdBy: access.user._id,
      updatedBy: access.user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: access.user._id,
      targetUserId: target._id,
      targetEmail: target.email,
      action: "people_review.evaluation_file.create",
      details: JSON.stringify({ id: fileId, kind: args.kind, periodKey, fileName: meta.fileName }),
      at: now,
    });
    return { fileId, previousDriveFileId: null, versionCount: 1 };
  },
});

export const submitEvaluationText = mutation({
  args: {
    fileId: v.id("personnelEvaluationFiles"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requirePeopleReviewAccess(ctx);
    const file = await ctx.db.get(args.fileId);
    if (!file?.active) throw new Error("EVALUATION_FILE_NOT_FOUND");
    const target = await ctx.db.get(file.targetUserId as Id<"users">);
    if (!target || target.status !== "active") throw new Error("USER_NOT_FOUND");
    if (!canWriteEvaluationText(access, target)) throw new Error("PEOPLE_REVIEW_TEXT_FORBIDDEN");
    const content = assertText(args.content);

    const existing = await ctx.db
      .query("personnelEvaluationTexts")
      .withIndex("by_file_evaluator", (q: any) =>
        q.eq("fileId", String(file._id)).eq("evaluatorUserId", String(access.user._id)),
      )
      .unique();
    if (existing?.active) throw new Error("EVALUATION_TEXT_ALREADY_SUBMITTED");

    const now = Date.now();
    const id = await ctx.db.insert("personnelEvaluationTexts", {
      fileId: String(file._id),
      targetUserId: String(target._id),
      evaluatorUserId: String(access.user._id),
      content,
      active: true,
      createdBy: access.user._id,
      updatedBy: access.user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: access.user._id,
      targetUserId: target._id,
      targetEmail: target.email,
      action: "people_review.evaluation_text.create",
      details: JSON.stringify({ id, fileId: file._id, kind: file.kind, periodKey: file.periodKey }),
      at: now,
    });
    return id;
  },
});

export const saveEvaluationBatch = mutation({
  args: {
    targetUserId: v.id("users"),
    requestId: v.string(),
    sections: v.array(v.object({
      kind: v.string(),
      year: v.optional(v.number()),
      quarter: v.optional(v.number()),
      schoolYear: v.optional(v.string()),
      semester: v.optional(v.number()),
      content: v.optional(v.string()),
      upload: v.optional(v.object({
        driveFileId: v.string(),
        driveChecksum: v.optional(v.string()),
        cleanupToken: v.string(),
        fileName: v.string(),
        fileType: v.string(),
        fileSize: v.number(),
      })),
    })),
  },
  handler: async (ctx, args) => {
    const access = await requirePeopleReviewAccess(ctx);
    const requestId = args.requestId.trim();
    if (!requestId || requestId.length > 100) throw new Error("INVALID_EVALUATION_REQUEST_ID");
    const priorRequest = await ctx.db
      .query("peopleReviewSaveRequests")
      .withIndex("by_user_request", (q: any) =>
        q.eq("userId", String(access.user._id)).eq("requestId", requestId),
      )
      .unique();
    if (priorRequest) return { cleanupJobIds: priorRequest.cleanupJobIds };
    const target = await ctx.db.get(args.targetUserId);
    if (!target || target.status !== "active") throw new Error("USER_NOT_FOUND");
    if (!args.sections.length || args.sections.length > 3) throw new Error("INVALID_EVALUATION_BATCH");
    const boardingOptions = await boardingParticipationKeys(ctx, String(target._id));
    const prepared: any[] = [];
    const keys = new Set<string>();

    for (const section of args.sections) {
      if (!EVAL_KINDS.has(section.kind)) throw new Error("INVALID_EVALUATION_KIND");
      const periodKey = periodKeyFor(section);
      const key = `${section.kind}:${periodKey}`;
      if (keys.has(key)) throw new Error("DUPLICATE_EVALUATION_SECTION");
      keys.add(key);
      if (section.kind === "boarding" && !boardingOptions.some((option: any) => option.periodKey === periodKey)) {
        throw new Error("BOARDING_NOT_PARTICIPATING");
      }
      if (!section.upload && !section.content?.trim()) throw new Error("EMPTY_EVALUATION_SECTION");
      if (section.upload && !canUploadEvaluationFile(access, target)) {
        throw new Error("PEOPLE_REVIEW_UPLOAD_FORBIDDEN");
      }
      if (section.content?.trim() && !canWriteEvaluationText(access, target)) {
        throw new Error("PEOPLE_REVIEW_TEXT_FORBIDDEN");
      }
      const existing = await ctx.db
        .query("personnelEvaluationFiles")
        .withIndex("by_target_kind_period", (q: any) =>
          q.eq("targetUserId", String(target._id)).eq("kind", section.kind).eq("periodKey", periodKey),
        )
        .unique();
      const texts = existing
        ? await ctx.db
            .query("personnelEvaluationTexts")
            .withIndex("by_file", (q: any) => q.eq("fileId", String(existing._id)).eq("active", true))
            .collect()
        : [];
      if (section.upload && existing?.active && texts.length) throw new Error("EVALUATION_FILE_LOCKED");
      if (section.content?.trim() && !section.upload && !existing?.active) {
        throw new Error("EVALUATION_FILE_REQUIRED");
      }
      if (section.content?.trim() && texts.some(
        (text: any) => text.active && String(text.evaluatorUserId) === String(access.user._id),
      )) {
        throw new Error("EVALUATION_TEXT_ALREADY_SUBMITTED");
      }
      prepared.push({
        section,
        periodKey,
        existing,
        content: section.content?.trim() ? assertText(section.content) : null,
        meta: section.upload ? assertFileMeta(section.upload) : null,
      });
    }

    const now = Date.now();
    const cleanupJobIds: Id<"driveCleanupJobs">[] = [];
    for (const item of prepared) {
      if (!item.meta || !item.section.upload) continue;
      await commitDriveUploadStage(
        ctx,
        {
          cleanupToken: item.section.upload.cleanupToken,
          driveFileId: item.meta.driveFileId,
        },
        String(access.user._id),
        "people-review",
      );
    }
    for (const item of prepared) {
      const { section, periodKey, existing, meta, content } = item;
      let fileId = existing?._id || null;
      if (meta && section.upload) {
        if (existing) {
          if (existing.active && existing.driveFileId !== meta.driveFileId) {
            cleanupJobIds.push(await ctx.db.insert("driveCleanupJobs", {
              driveFileId: existing.driveFileId,
              purpose: "people-review",
              resourceId: String(existing._id),
              createdBy: String(access.user._id),
              active: true,
              createdAt: now,
              updatedAt: now,
            }));
          }
          await ctx.db.patch(existing._id, {
            driveFileId: meta.driveFileId,
            driveChecksum: section.upload.driveChecksum,
            fileName: meta.fileName,
            fileType: meta.fileType,
            fileSize: meta.fileSize,
            uploadedByUserId: String(access.user._id),
            versionCount: existing.active ? (existing.versionCount || 1) + 1 : 1,
            lastUploadedAt: now,
            active: true,
            year: section.year,
            quarter: section.quarter,
            schoolYear: section.schoolYear,
            semester: section.semester,
            updatedBy: access.user._id,
            updatedAt: now,
          });
        } else {
          fileId = await ctx.db.insert("personnelEvaluationFiles", {
            targetUserId: String(target._id),
            kind: section.kind,
            year: section.year,
            quarter: section.quarter,
            schoolYear: section.schoolYear,
            semester: section.semester,
            periodKey,
            driveFileId: meta.driveFileId,
            driveChecksum: section.upload.driveChecksum,
            fileName: meta.fileName,
            fileType: meta.fileType,
            fileSize: meta.fileSize,
            uploadedByUserId: String(access.user._id),
            versionCount: 1,
            lastUploadedAt: now,
            active: true,
            createdBy: access.user._id,
            updatedBy: access.user._id,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      if (content && fileId) {
        await ctx.db.insert("personnelEvaluationTexts", {
          fileId: String(fileId),
          targetUserId: String(target._id),
          evaluatorUserId: String(access.user._id),
          content,
          active: true,
          createdBy: access.user._id,
          updatedBy: access.user._id,
          createdAt: now,
          updatedAt: now,
        });
      }
      await ctx.db.insert("auditLogs", {
        actorUserId: access.user._id,
        targetUserId: target._id,
        targetEmail: target.email,
        action: "people_review.evaluation_batch.save",
        details: JSON.stringify({ fileId, kind: section.kind, periodKey, hasUpload: Boolean(meta), hasText: Boolean(content) }),
        at: now,
      });
    }
    await ctx.db.insert("peopleReviewSaveRequests", {
      userId: String(access.user._id),
      requestId,
      cleanupJobIds: cleanupJobIds.map(String),
      createdAt: now,
    });
    return { cleanupJobIds };
  },
});

export const authorizeDriveCleanupJob = query({
  args: { cleanupJobId: v.id("driveCleanupJobs") },
  handler: async (ctx, args) => {
    const access = await requirePeopleReviewAccess(ctx);
    const job = await ctx.db.get(args.cleanupJobId);
    if (!job?.active) throw new Error("DRIVE_CLEANUP_NOT_FOUND");
    if (String(job.createdBy) !== String(access.user._id)) throw new Error("DRIVE_CLEANUP_FORBIDDEN");
    return { driveFileId: job.driveFileId };
  },
});

export const completeDriveCleanupJob = mutation({
  args: { cleanupJobId: v.id("driveCleanupJobs") },
  handler: async (ctx, args) => {
    const access = await requirePeopleReviewAccess(ctx);
    const job = await ctx.db.get(args.cleanupJobId);
    if (!job?.active) return;
    if (String(job.createdBy) !== String(access.user._id)) throw new Error("DRIVE_CLEANUP_FORBIDDEN");
    const [faults, evaluations] = await Promise.all([
      ctx.db
        .query("personnelFaults")
        .withIndex("by_drive_file", (q: any) => q.eq("driveFileId", job.driveFileId))
        .collect(),
      ctx.db
        .query("personnelEvaluationFiles")
        .withIndex("by_drive_file", (q: any) => q.eq("driveFileId", job.driveFileId))
        .collect(),
    ]);
    // Never delete a stored object that an active record still points at.
    if (![...faults, ...evaluations].some((row: any) => row.active)) {
      await deleteConvexObject(ctx, job.driveFileId);
    }
    await ctx.db.patch(args.cleanupJobId, { active: false, updatedAt: Date.now() });
  },
});
