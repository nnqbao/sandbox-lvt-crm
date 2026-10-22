/** Pure assignment / visibility rules for công tác and công việc. */

export const TEAM_LEAD_LEVELS = new Set([2, 3]);

export const WORK_VISIBILITY_CREATOR = "creator";
export const WORK_VISIBILITY_SCHOOL = "school";
export const WORK_VISIBILITY_DEFAULT = WORK_VISIBILITY_SCHOOL;
export type WorkVisibilityMode =
  | typeof WORK_VISIBILITY_CREATOR
  | typeof WORK_VISIBILITY_SCHOOL;

export const DUTY_LOCATION_MAX_LENGTH = 200;
export const DUTY_TITLE_MAX_LENGTH = 200;
export const DUTY_CONTENT_MAX_LENGTH = 200;
export const DUTY_OTHER_PARTICIPANTS_MAX_LENGTH = 500;
export const WORK_TITLE_MAX_LENGTH = 200;
export const WORK_COMPLETION_NOTE_MAX_LENGTH = 500;

export function isTeamLeadLevel(level: number) {
  return level === 2 || level === 3;
}

export function isOperationalManagerRole(role: string) {
  return role === "admin" || role === "moderator";
}

/** Công tác creators: admin/mod or tổ trưởng/tổ phó (2/3★). Level 4/5 cannot create duties. */
export function canCreateAssignments(role: string, level: number) {
  if (isOperationalManagerRole(role)) return true;
  return isTeamLeadLevel(level);
}

/** Ban giám hiệu = non-ops position level 4 or 5. */
export const WORK_BGH_MIN_LEVEL = 4;

function isValidLevel(level: number) {
  return Number.isInteger(level) && level >= 1 && level <= 5;
}

/**
 * Công việc creators: admin/mod, or any non-ops user at level 2 or above
 * (tổ trưởng/tổ phó, Ban giám hiệu). Level 1 and users without a position cannot.
 */
export function canCreateWorkDocuments(role: string, level: number) {
  if (isOperationalManagerRole(role)) return true;
  return isValidLevel(level) && level >= 2;
}

/** Department-wide work assignments: admin/mod and Ban giám hiệu only. */
export function canAssignWorkDepartment(role: string, level: number) {
  if (isOperationalManagerRole(role)) return true;
  return isValidLevel(level) && level >= WORK_BGH_MIN_LEVEL;
}

/**
 * Individual work assignment target rule for non-ops creators:
 * - strictly lower position level than the creator (never self, never a peer);
 * - Ban giám hiệu (level 4+) may assign across every department;
 * - other creators (level 2/3+) only inside their own department.
 * Admin/mod are checked separately (moderator department scope).
 */
export function canAssignWorkToUser(
  actor: { _id: string; role: string; level: number; departmentId?: string | null },
  target: { _id: string; level: number; departmentId?: string | null },
) {
  if (isOperationalManagerRole(actor.role)) return true;
  if (String(actor._id) === String(target._id)) return false;
  if (!canCreateWorkDocuments(actor.role, actor.level)) return false;
  if (!isValidLevel(target.level) || target.level >= actor.level) return false;
  if (actor.level >= WORK_BGH_MIN_LEVEL) return true;
  return Boolean(
    actor.departmentId &&
    target.departmentId &&
    String(actor.departmentId) === String(target.departmentId),
  );
}

export const WORK_ASSIGNEE_BGH_FORBIDDEN = "WORK_ASSIGNEE_BGH_FORBIDDEN";
export const WORK_ASSIGNEE_OPS_FORBIDDEN = "WORK_ASSIGNEE_OPS_FORBIDDEN";

/**
 * Individual work targets for an admin/mod creator ("Văn thư"):
 * - self is always allowed (a self-only document needs no approval);
 * - another admin/moderator only when both have the same non-empty
 *   departmentId (`WORK_ASSIGNEE_OPS_FORBIDDEN`);
 * - never Ban giám hiệu individually — non-ops position level 4+ (Hiệu
 *   trưởng, Hiệu phó) — even though BGH sit in Tổ Văn phòng
 *   (`WORK_ASSIGNEE_BGH_FORBIDDEN`). BGH stay selectable as approvers.
 * Department assignments remain allowed: a department assignment is handled by
 * the department, not by BGH individually. (Lịch công tác is unaffected: văn
 * thư may still add BGH as duty participants.) Moderator department scope is
 * checked separately. Returns the error code, or `null` when allowed.
 *
 * `allowOpsAnyDepartment`: an `admin` editing an existing document may keep or
 * assign admin/moderator accounts of any department (the same-department rule
 * does not block the save). The BGH rule still applies.
 */
export function opsWorkAssigneeError(
  actor: { _id: string; departmentId?: string | null },
  target: { _id: string; role?: string | null; level: number; departmentId?: string | null },
  options: { allowOpsAnyDepartment?: boolean } = {},
): string | null {
  if (String(actor._id) === String(target._id)) return null;
  if (isOperationalManagerRole(String(target.role || ""))) {
    if (options.allowOpsAnyDepartment) return null;
    const actorDepartment = String(actor.departmentId || "").trim();
    const targetDepartment = String(target.departmentId || "").trim();
    return actorDepartment && actorDepartment === targetDepartment
      ? null
      : WORK_ASSIGNEE_OPS_FORBIDDEN;
  }
  return Number(target.level) >= WORK_BGH_MIN_LEVEL ? WORK_ASSIGNEE_BGH_FORBIDDEN : null;
}

export function opsCanAssignWorkToUser(
  actor: { _id: string; departmentId?: string | null },
  target: { _id: string; role?: string | null; level: number; departmentId?: string | null },
  options: { allowOpsAnyDepartment?: boolean } = {},
) {
  return opsWorkAssigneeError(actor, target, options) === null;
}

export function normalizeWorkVisibilityMode(value: string | null | undefined): WorkVisibilityMode {
  return value === WORK_VISIBILITY_CREATOR ? WORK_VISIBILITY_CREATOR : WORK_VISIBILITY_SCHOOL;
}

/** Accept HH:mm, H:mm, or HH:mm:ss from datetime-local. */
export function normalizeDutyClock(value: string) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function cleanDutyTitle(value: string) {
  const title = String(value || "").trim();
  if (!title || title.length > DUTY_TITLE_MAX_LENGTH) throw new Error("INVALID_DUTY_TITLE");
  return title;
}

export function dutyListTitle(duty: { title?: string; content?: string }) {
  const title = String(duty.title || "").trim();
  if (title) return title;
  return String(duty.content || "").trim() || "Công tác";
}

export function isDutyParticipant(
  user: { _id: string; departmentId?: string },
  duty: { departmentIds?: string[]; participantUserIds?: string[] },
) {
  const userId = String(user._id || "");
  if (!userId) return false;
  if ((duty.participantUserIds || []).some((id) => String(id) === userId)) return true;
  return Boolean(
    user.departmentId &&
    (duty.departmentIds || []).some((id) => String(id) === String(user.departmentId)),
  );
}

/** Push recipients for a duty create/update, including the creator when they are a participant. */
export function dutyPushRecipientIds(args: {
  departmentIds: string[];
  participantUserIds: string[];
  users: Array<{ _id: string; departmentId?: string }>;
}): string[] {
  const duty = {
    departmentIds: args.departmentIds || [],
    participantUserIds: args.participantUserIds || [],
  };
  const recipients = new Set<string>();
  for (const id of duty.participantUserIds) {
    if (id) recipients.add(String(id));
  }
  for (const user of args.users) {
    if (isDutyParticipant(user, duty)) recipients.add(String(user._id));
  }
  return [...recipients];
}

export function cleanDutyContent(value: string) {
  const content = String(value || "").trim();
  if (!content || content.length > DUTY_CONTENT_MAX_LENGTH) throw new Error("INVALID_CONTENT");
  return content;
}

export function cleanDutyLocationText(value: string) {
  const locationText = String(value || "").trim();
  if (!locationText) throw new Error("INVALID_LOCATION");
  if (locationText.length > DUTY_LOCATION_MAX_LENGTH) throw new Error("INVALID_LOCATION");
  return locationText;
}

/** Free-text guests; empty is allowed. Does not create notification recipients. */
export function cleanDutyOtherParticipants(value: string | null | undefined) {
  const otherParticipants = String(value || "").trim();
  if (otherParticipants.length > DUTY_OTHER_PARTICIPANTS_MAX_LENGTH) {
    throw new Error("INVALID_OTHER_PARTICIPANTS");
  }
  return otherParticipants;
}

export function dutyLocationLabel(
  duty: { locationText?: string; locationIds?: string[] },
  locationNames: string[] = [],
) {
  const text = String(duty.locationText || "").trim();
  if (text) return text;
  return locationNames.filter(Boolean).join(", ");
}

export function cleanWorkTitle(value: string) {
  const title = String(value || "").trim();
  if (!title || title.length > WORK_TITLE_MAX_LENGTH) throw new Error("INVALID_WORK_TITLE");
  return title;
}

/** Optional text the assignee sends to the creator when submitting completion evidence. */
export function cleanCompletionNote(value: string | null | undefined) {
  const note = String(value || "").trim();
  if (!note) return undefined;
  if (note.length > WORK_COMPLETION_NOTE_MAX_LENGTH) throw new Error("INVALID_COMPLETION_NOTE");
  return note;
}

export function workListTitle(document: { title?: string; fileName?: string; content?: string }) {
  const title = String(document.title || "").trim();
  if (title) return title;
  const fileName = String(document.fileName || "").trim();
  if (fileName) return fileName;
  return String(document.content || "").trim() || "Công việc";
}

/** Released = active and fully approved. Pending/rejected documents stay hidden from assignees. */
export function isWorkReleased<T extends { active?: boolean; status?: string }>(
  document: T | null | undefined,
): document is T & { active: true } {
  return Boolean(document?.active) && document?.status === "approved";
}

export function userIsActive(user: { status?: string } | null | undefined) {
  return user?.status === "active";
}

/** Whole document archives when the creator is no longer active. */
export function isDocumentArchived(
  document: { createdBy?: string },
  usersById: Map<string, { status?: string }>,
) {
  const creator = usersById.get(String(document.createdBy || ""));
  return !userIsActive(creator);
}

/**
 * Individual work archives when every named assignee is inactive.
 * Department assignments follow the creator only.
 */
export function isWorkItemArchived(
  document: { createdBy?: string },
  item: { assignmentType?: string; assigneeUserIds?: string[] },
  usersById: Map<string, { status?: string }>,
) {
  if (isDocumentArchived(document, usersById)) return true;
  if (item.assignmentType !== "individual") return false;
  const ids = (item.assigneeUserIds || []).map(String).filter(Boolean);
  if (!ids.length) return false;
  return ids.every((id) => !userIsActive(usersById.get(id)));
}

export function hasBlockingSubmission(
  completions: Array<{ status?: string }> | null | undefined,
) {
  return (completions || []).some(
    (row) => row.status === "pending_approval" || row.status === "approved",
  );
}

export function canCreatorMutateWork(items: Array<{ completions?: Array<{ status?: string }> }>) {
  return !items.some((item) => hasBlockingSubmission(item.completions));
}

/**
 * Who may see a live (non-archived) work document.
 * Assignees always see their own released assignment. Mode `creator` limits the
 * management/overview list to the creator; mode `school` also includes
 * admin/mod and level 4/5.
 * While a document is not released (pending approval or returned), only the
 * creator, its designated approvers and in-scope admin/mod (mode `school`) see it.
 */
export function canSeeLiveWork(args: {
  actorUserId: string;
  actorRole: string;
  actorLevel: number;
  createdBy: string;
  isAssignee: boolean;
  visibilityMode: WorkVisibilityMode;
  /** False when a department-scoped moderator looks at an out-of-scope document. */
  inModeratorScope?: boolean;
  /** False while the document is pending approval or returned. Defaults to released. */
  released?: boolean;
  /** Actor is one of the document's designated approvers. */
  isApprover?: boolean;
}) {
  if (String(args.actorUserId) === String(args.createdBy)) return true;
  if (args.released === false) {
    if (args.isApprover) return true;
    if (args.visibilityMode === WORK_VISIBILITY_CREATOR) return false;
    return isOperationalManagerRole(args.actorRole) && args.inModeratorScope !== false;
  }
  if (args.isAssignee) return true;
  if (args.visibilityMode === WORK_VISIBILITY_CREATOR) return false;
  if (isOperationalManagerRole(args.actorRole)) return args.inModeratorScope !== false;
  return args.actorLevel === 4 || args.actorLevel === 5;
}

export function canSeeArchivedWork(actorRole: string, inModeratorScope = true) {
  return isOperationalManagerRole(actorRole) && inModeratorScope;
}

const WORK_COMPLETED_STATUSES = new Set(["completed", "completed_late"]);

/** Matches web tab filter: only fully approved work counts as done. */
export function isWorkStatusCompleted(status: string | null | undefined) {
  return WORK_COMPLETED_STATUSES.has(String(status || ""));
}

/** Sidebar Công việc badge = chờ duyệt + việc chưa xong của tôi + việc chưa xong tôi tạo. */
export function workMenuBadgeCount(parts: {
  pendingApprovalCount: number;
  incompleteMineCount: number;
  incompleteCreatedCount: number;
}) {
  return (
    Math.max(0, Number(parts.pendingApprovalCount) || 0) +
    Math.max(0, Number(parts.incompleteMineCount) || 0) +
    Math.max(0, Number(parts.incompleteCreatedCount) || 0)
  );
}

export function canReviewWorkCompletion(args: {
  actorUserId: string;
  createdBy: string;
}) {
  return String(args.actorUserId) === String(args.createdBy);
}

/**
 * Admin/mod completing their own assignment with a quality score
 * skip the creator review queue (they already self-score in the app).
 * Web submit-with-file still omits qualityPercent and stays pending.
 */
export function shouldBypassWorkCompletionReview(
  isOperationalManager: boolean,
  qualityPercent: number | undefined,
) {
  return Boolean(isOperationalManager && qualityPercent !== undefined);
}

/** Who should get a work-assignment notification for this work item. */
export function isWorkNotificationAssignee(args: {
  user: { _id: string; role?: string; departmentId?: string };
  item: { assignmentType?: string; assigneeUserIds?: string[]; departmentId?: string };
  document?: { approverUserIds?: string[] } | null;
  excludedIndividualIds?: Iterable<string>;
}) {
  const userId = String(args.user._id || "");
  if (!userId) return false;
  if (args.item.assignmentType === "individual") {
    return (args.item.assigneeUserIds || []).some((id) => String(id) === userId);
  }
  if (isOperationalManagerRole(String(args.user.role || ""))) return false;
  if ((args.document?.approverUserIds || []).some((id) => String(id) === userId)) return false;
  const excluded = new Set([...(args.excludedIndividualIds || [])].map(String));
  if (excluded.has(userId)) return false;
  return String(args.user.departmentId || "") === String(args.item.departmentId || "");
}

/** Push recipients for a create/update: assignees, including the creator when they assigned themselves. */
export function workAssignmentPushUserIds(args: {
  assignments: Array<{
    type?: string;
    userIds?: string[];
    departmentId?: string;
  }>;
  users: Array<{ _id: string; role?: string; departmentId?: string }>;
}): string[] {
  const recipients = new Set<string>();
  for (const assignment of args.assignments) {
    if (assignment.type === "individual") {
      for (const id of assignment.userIds || []) {
        if (id) recipients.add(String(id));
      }
      continue;
    }
    for (const user of args.users) {
      if (
        isWorkNotificationAssignee({
          user,
          item: {
            assignmentType: "department",
            departmentId: assignment.departmentId,
          },
        })
      ) {
        recipients.add(String(user._id));
      }
    }
  }
  return [...recipients];
}
