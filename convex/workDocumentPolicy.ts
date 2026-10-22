/**
 * Work-document approval and lock policy (pure, no Convex imports).
 *
 * Creator-based rule:
 * - A document created by an operational manager (admin / moderator = văn thư)
 *   needs Ban giám hiệu approval before it is released. It stays `pending`
 *   until every designated approver approves, then becomes `approved`.
 * - Exception: a văn thư document whose only assignee is the creator (only
 *   individual assignments, each containing just the creator) is released
 *   immediately with no approvers.
 * - Documents created by anyone else are released immediately (`approved`,
 *   no approvers).
 * - The first approval permanently locks edit/delete, even while other
 *   approvers are still pending or the aggregate status is still `pending`.
 *   Exception: an `admin` (never a moderator) may still edit; that edit sends
 *   the document back to Ban giám hiệu approval (see `workDocumentEditPolicy`).
 *   Delete stays locked for everyone.
 * - Once any assignee has submitted (nộp) or been marked complete, the
 *   document is read-only for everyone (`WORK_HAS_SUBMISSIONS`).
 * - Reject is only allowed while nobody has approved; a rejected document can
 *   be edited and resubmitted (editing resets every decision).
 */

export const WORK_APPROVER_MIN_LEVEL = 4;
export const WORK_RETURN_REASON_MAX_LENGTH = 500;

export type WorkApprovalDecision = {
  userId: string;
  decision: string; // approved | rejected
  at: number;
  reason?: string;
};

export type WorkDocumentDecisionState = {
  status: string;
  active?: boolean;
  createdBy?: unknown;
  approverUserIds?: unknown[];
  approvedByUserIds?: unknown[];
  rejectedByUserIds?: unknown[];
  approvalDecisions?: WorkApprovalDecision[] | null;
};

function ids(values: unknown[] | null | undefined) {
  return (values || []).map((value) => String(value));
}

function hasBlockingSubmission(completions: Array<{ status?: string }> | null | undefined) {
  return (completions || []).some(
    (row) => row.status === "pending_approval" || row.status === "approved",
  );
}

function isOperationalManagerRole(role: string | null | undefined) {
  return role === "admin" || role === "moderator";
}

/**
 * Whether a document follows the Ban giám hiệu approval flow.
 * New rows store the decision made at creation (`requiresApproval`); legacy
 * rows without the flag fall back to the creator's current role.
 */
export function workDocumentRequiresApproval(args: {
  requiresApproval?: boolean | null;
  creatorRole?: string | null;
}) {
  if (typeof args.requiresApproval === "boolean") return args.requiresApproval;
  return isOperationalManagerRole(args.creatorRole);
}

/**
 * Whether a document is in the văn thư approval flow regardless of its current
 * assignments: stored `true`, or created by an admin/moderator. A stored
 * `false` on an ops-created document only means it was self-only when saved.
 */
export function workDocumentFollowsApprovalFlow(args: {
  requiresApproval?: boolean | null;
  creatorRole?: string | null;
}) {
  return args.requiresApproval === true || isOperationalManagerRole(args.creatorRole);
}

type SelfOnlyAssignment = {
  type?: string | null;
  userIds?: unknown[] | null;
};

/** Every assignment is individual and contains only the creator (no departments, nobody else). */
export function isSelfOnlyWorkAssignment(
  assignments: SelfOnlyAssignment[] | null | undefined,
  creatorId: unknown,
) {
  const creator = String(creatorId || "").trim();
  const rows = assignments || [];
  if (!creator || !rows.length) return false;
  return rows.every((row) => {
    if (row.type !== "individual") return false;
    const userIds = ids(row.userIds).map((id) => id.trim()).filter(Boolean);
    return userIds.length > 0 && userIds.every((id) => id === creator);
  });
}

/**
 * Approval decision for a create/edit: the văn thư flow applies unless the
 * creator assigned the work only to themselves.
 */
export function workDocumentNeedsApproval(args: {
  followsApprovalFlow: boolean;
  assignments: SelfOnlyAssignment[] | null | undefined;
  creatorId: unknown;
}) {
  return args.followsApprovalFlow && !isSelfOnlyWorkAssignment(args.assignments, args.creatorId);
}

/** A valid approver: active, not admin/moderator, position level 4 or above. */
export function isEligibleWorkApprover(user: {
  status?: string | null;
  role?: string | null;
  level: number;
}) {
  return (
    user.status === "active" &&
    !isOperationalManagerRole(user.role) &&
    Number(user.level) >= WORK_APPROVER_MIN_LEVEL
  );
}

/** First approval permanently locks edit/delete (independent of aggregate status). */
export function isWorkApprovalLocked(document: WorkDocumentDecisionState) {
  return ids(document.approvedByUserIds).length > 0;
}

/**
 * Edit/delete is allowed while the document is active, nobody has approved it,
 * and no assignee has submitted (nộp) or been marked complete.
 * `pending`, `rejected` and overdue documents stay editable under these rules.
 */
export function canMutateWorkDocument(
  document: WorkDocumentDecisionState,
  items: Array<{ completions?: Array<{ status?: string }> }> = [],
) {
  if (document.active === false) return false;
  if (isWorkApprovalLocked(document)) return false;
  return !items.some((item) => hasBlockingSubmission(item.completions));
}

export const WORK_HAS_SUBMISSIONS = "WORK_HAS_SUBMISSIONS";
export const WORK_DOCUMENT_IMMUTABLE = "WORK_DOCUMENT_IMMUTABLE";

type SubmissionRow = {
  completions?: Array<{ status?: string }> | null;
  completedUserIds?: unknown[] | null;
};

/**
 * Any assignee of the document's active work items / personal tasks has
 * submitted (`pending_approval`) or been marked complete (`approved`, or a
 * legacy `completedUserIds` entry). Returned (`rejected`) completions do not count.
 */
export function workHasSubmissions(rows: SubmissionRow[] | null | undefined) {
  return (rows || []).some(
    (row) => hasBlockingSubmission(row.completions) || ids(row.completedUserIds).length > 0,
  );
}

export type WorkEditPolicy = {
  canEdit: boolean;
  canDelete: boolean;
  /** An admin edit of an approved/released or partially approved document resubmits it to BGH. */
  editRequiresReapproval: boolean;
  editError: string | null;
  deleteError: string | null;
};

/**
 * Edit/delete decision for an actor who already manages the document (its
 * creator, an in-scope admin/moderator; authority is checked by the caller):
 * - inactive → nothing;
 * - any submission → read-only for everyone (`WORK_HAS_SUBMISSIONS`);
 * - first approval → locked (`WORK_DOCUMENT_IMMUTABLE`), except that `admin`
 *   may still edit — the edit puts the document back into BGH approval;
 * - delete of an approval-locked document stays forbidden for everyone.
 * An admin editing an `approved` document that was released without approval
 * (BGH/superior creator) also goes back through approval.
 */
export function workDocumentEditPolicy(args: {
  document: WorkDocumentDecisionState;
  actorRole: string | null | undefined;
  canManage: boolean;
  hasSubmissions: boolean;
}): WorkEditPolicy {
  const deny = (error: string): WorkEditPolicy => ({
    canEdit: false,
    canDelete: false,
    editRequiresReapproval: false,
    editError: error,
    deleteError: error,
  });
  if (args.document.active === false) return deny("WORK_DOCUMENT_NOT_FOUND");
  if (!args.canManage) return deny("WORK_UPDATE_FORBIDDEN");
  if (args.hasSubmissions) return deny(WORK_HAS_SUBMISSIONS);
  const locked = isWorkApprovalLocked(args.document);
  const isAdmin = args.actorRole === "admin";
  const editError = locked && !isAdmin ? WORK_DOCUMENT_IMMUTABLE : null;
  const deleteError = locked ? WORK_DOCUMENT_IMMUTABLE : null;
  return {
    canEdit: !editError,
    canDelete: !deleteError,
    editRequiresReapproval: isAdmin && (locked || args.document.status === "approved"),
    editError,
    deleteError,
  };
}

/**
 * Approval decision for an edit. On the admin re-approval path the document
 * needs BGH approval again unless the editing admin assigned it only to
 * themselves; otherwise the creator-based rule (`workDocumentNeedsApproval`) applies.
 */
export function workEditNeedsApproval(args: {
  editRequiresReapproval: boolean;
  followsApprovalFlow: boolean;
  assignments: SelfOnlyAssignment[] | null | undefined;
  creatorId: unknown;
  editorId: unknown;
}) {
  if (args.editRequiresReapproval) return !isSelfOnlyWorkAssignment(args.assignments, args.editorId);
  return workDocumentNeedsApproval({
    followsApprovalFlow: args.followsApprovalFlow,
    assignments: args.assignments,
    creatorId: args.creatorId,
  });
}

type ComparableWorkItem = {
  assignmentType?: string | null;
  departmentId?: string | null;
  assigneeUserIds?: unknown[] | null;
  content?: string | null;
  deadline?: string | null;
};

type ComparableAssignment = {
  type?: string | null;
  departmentId?: string | null;
  userIds?: unknown[] | null;
  content?: string | null;
  deadline?: string | null;
};

function assignmentKey(type: string, departmentId: unknown, userIds: unknown[], content: unknown, deadline: unknown) {
  const individual = type === "individual";
  return JSON.stringify([
    individual ? "individual" : "department",
    individual ? "" : String(departmentId || ""),
    individual ? [...new Set(ids(userIds))].sort() : [],
    String(content || ""),
    String(deadline || ""),
  ]);
}

/**
 * True when the edit keeps exactly the same assignments as the document's
 * active work items (same type, department / assignees, content and deadline),
 * so the existing work items and personal tasks can be kept as they are.
 */
export function workAssignmentsUnchanged(
  activeItems: ComparableWorkItem[] | null | undefined,
  assignments: ComparableAssignment[] | null | undefined,
) {
  const current = (activeItems || []).map((item) =>
    assignmentKey(
      item.assignmentType === "individual" ? "individual" : "department",
      item.departmentId,
      item.assigneeUserIds || [],
      item.content,
      item.deadline,
    ),
  ).sort();
  const next = (assignments || []).map((row) =>
    assignmentKey(
      row.type === "individual" ? "individual" : "department",
      row.departmentId,
      row.userIds || [],
      row.content,
      row.deadline,
    ),
  ).sort();
  return current.length > 0
    && current.length === next.length
    && current.every((key, index) => key === next[index]);
}

/**
 * Reject is only allowed while the document is still pending and nobody has
 * approved. A later reject after a partial approval would leave the document
 * both rejected and immutable (no edit/resubmit path).
 */
export function canRejectWorkDocument(document: WorkDocumentDecisionState) {
  return (
    document.status === "pending" &&
    ids(document.approvedByUserIds).length === 0 &&
    ids(document.rejectedByUserIds).length === 0
  );
}

export function isDesignatedWorkApprover(document: WorkDocumentDecisionState, userId: string) {
  return ids(document.approverUserIds).includes(String(userId));
}

/** The approver still has to decide on this document. */
export function canApproveWorkDocument(document: WorkDocumentDecisionState, userId: string) {
  const id = String(userId);
  return (
    document.active !== false &&
    document.status === "pending" &&
    isDesignatedWorkApprover(document, id) &&
    !ids(document.approvedByUserIds).includes(id) &&
    ids(document.rejectedByUserIds).length === 0
  );
}

/** Approve by one approver; status becomes `approved` only when all designated approvers approved. */
export function applyWorkApproval(document: WorkDocumentDecisionState, userId: string, at: number) {
  const id = String(userId);
  const approvedByUserIds = [...new Set([...ids(document.approvedByUserIds), id])];
  const approvers = ids(document.approverUserIds);
  const status = approvers.length > 0 && approvers.every((approverId) => approvedByUserIds.includes(approverId))
    ? "approved"
    : "pending";
  const approvalDecisions = [
    ...(document.approvalDecisions || []).filter((row) => String(row.userId) !== id),
    { userId: id, decision: "approved", at },
  ];
  return { approvedByUserIds, status, approvalDecisions };
}

export function applyWorkRejection(
  document: WorkDocumentDecisionState,
  userId: string,
  reason: string,
  at: number,
) {
  const id = String(userId);
  return {
    rejectedByUserIds: [...new Set([...ids(document.rejectedByUserIds), id])],
    status: "rejected",
    approvalDecisions: [
      ...(document.approvalDecisions || []).filter((row) => String(row.userId) !== id),
      { userId: id, decision: "rejected", at, reason },
    ],
  };
}

export function cleanWorkReturnReason(value: string | null | undefined) {
  const reason = String(value || "").trim();
  if (!reason || reason.length > WORK_RETURN_REASON_MAX_LENGTH) {
    throw new Error("WORK_RETURN_REASON_INVALID");
  }
  return reason;
}

/**
 * Approval fields for a create or an edit (edit resets every prior decision).
 * Approval-required documents need at least one approver and start `pending`;
 * every other document is released immediately with no approvers.
 */
export function workApprovalSubmission(requiresApproval: boolean, approverUserIds: string[]) {
  const approvers = [...new Set((approverUserIds || []).map(String).filter(Boolean))];
  if (!requiresApproval) {
    return {
      requiresApproval: false,
      status: "approved",
      approverUserIds: [] as string[],
      approvedByUserIds: [] as string[],
      rejectedByUserIds: [] as string[],
      approvalDecisions: [] as WorkApprovalDecision[],
    };
  }
  if (!approvers.length) throw new Error("WORK_APPROVER_REQUIRED");
  return {
    requiresApproval: true,
    status: "pending",
    approverUserIds: approvers,
    approvedByUserIds: [] as string[],
    rejectedByUserIds: [] as string[],
    approvalDecisions: [] as WorkApprovalDecision[],
  };
}

/** Final decision time: last approval when released, the rejection when returned. */
export function workApprovalDecidedAt(document: WorkDocumentDecisionState) {
  const decisions = document.approvalDecisions || [];
  if (document.status === "rejected") {
    const rejection = decisions.filter((row) => row.decision === "rejected");
    return rejection.length ? Math.max(...rejection.map((row) => Number(row.at) || 0)) : null;
  }
  if (document.status === "approved") {
    const approvals = decisions.filter((row) => row.decision === "approved");
    return approvals.length ? Math.max(...approvals.map((row) => Number(row.at) || 0)) : null;
  }
  return null;
}

export function workReturnReason(document: WorkDocumentDecisionState) {
  if (document.status !== "rejected") return "";
  const rejection = (document.approvalDecisions || []).find((row) => row.decision === "rejected");
  return String(rejection?.reason || "");
}

/** Creator's "đã duyệt" bell item stays for 7 days; "bị trả lại" stays until resubmitted. */
export const WORK_APPROVED_NOTICE_MS = 7 * 24 * 60 * 60 * 1000;

export function workCreatorApprovalNotice(
  document: WorkDocumentDecisionState,
  userId: string,
  now: number,
): { decision: "approved" | "rejected"; at: number; reason: string } | null {
  if (document.active === false || String(document.createdBy) !== String(userId)) return null;
  if (!ids(document.approverUserIds).length) return null;
  const at = workApprovalDecidedAt(document);
  if (!at) return null;
  if (document.status === "rejected") {
    return { decision: "rejected", at, reason: workReturnReason(document) };
  }
  if (document.status === "approved" && at >= now - WORK_APPROVED_NOTICE_MS) {
    return { decision: "approved", at, reason: "" };
  }
  return null;
}
