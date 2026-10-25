/**
 * Đánh giá nhân sự / Ghi nhận lỗi notification + "BGH đánh giá" approval policy
 * (pure, no Convex imports).
 *
 * BGH đánh giá (`personnelEvaluationTexts`):
 * - Written by Ban giám hiệu (active, non-admin/mod, level ≥ 4) → `approved` at once.
 * - Written by admin/moderator (văn thư, on behalf of BGH) → `pending` until a BGH
 *   member who could write that same comment approves it. A returned comment goes
 *   back to the writer, who edits and resubmits it (pending again).
 * - Rows without `status` are legacy and count as approved.
 * - Only approved comments count: they lock the period file and fill the
 *   one-comment-per-evaluator slot. An approved on-behalf comment counts as the
 *   approving BGH member's comment (and stays the writer's row).
 * - Pending/returned comments are never shown to the evaluated person; only the
 *   writer, in-scope admin/mod and eligible BGH approvers see them.
 */

export type EvaluationTextStatus = "pending" | "approved" | "returned";

export type EvaluationTextRow = {
  _id?: unknown;
  fileId?: string;
  targetUserId?: string;
  evaluatorUserId: string;
  active?: boolean;
  status?: string;
  writtenOnBehalf?: boolean;
  submittedAt?: number;
  reviewedByUserId?: string;
  reviewedAt?: number;
  returnReason?: string;
  createdAt?: number;
};

export const EVALUATION_RETURN_REASON_MAX = 1000;
/** Bell items for the evaluated person about a newly recorded fault stay this long. */
export const STAFF_FAULT_NOTICE_MS = 30 * 24 * 60 * 60 * 1000;
/** "Nhận xét đã được duyệt" stays in the writer's bell this long. */
export const EVALUATION_APPROVED_NOTICE_MS = 7 * 24 * 60 * 60 * 1000;

export function evaluationTextStatus(text: { status?: string } | null | undefined): EvaluationTextStatus {
  if (text?.status === "pending" || text?.status === "returned") return text.status;
  return "approved";
}

export function isEvaluationTextApproved(text: EvaluationTextRow | null | undefined) {
  return Boolean(text) && text!.active !== false && evaluationTextStatus(text) === "approved";
}

/** A comment written by an operational manager needs Ban giám hiệu approval. */
export function evaluationTextNeedsBghApproval(writer: { isOps: boolean }) {
  return writer.isOps;
}

/** Ban giám hiệu for this module: active non-ops user at position level 4 or 5. */
export function isBghReviewer(actor: { isOps: boolean; level: number }) {
  return !actor.isOps && actor.level >= 4;
}

/**
 * Existing write rule for "BGH đánh giá" (unchanged): never self, never the
 * principal (5★); ops targets only by 4–5★; 4★ targets only by 5★; 1–3★ targets
 * by in-scope admin/mod or 4–5★.
 */
export function canWriteEvaluationTextRule(args: {
  actorUserId: string;
  actorIsOps: boolean;
  actorLevel: number;
  /** Admin/mod reaches the target (moderator department scope applied). */
  actorReachesTarget: boolean;
  targetUserId: string;
  targetIsOps: boolean;
  targetLevel: number;
}) {
  if (String(args.actorUserId) === String(args.targetUserId)) return false;
  if (!args.targetIsOps && args.targetLevel === 5) return false;
  if (args.targetIsOps) return args.actorLevel === 4 || args.actorLevel === 5;
  if (args.targetLevel === 4) return args.actorLevel === 5;
  if (args.targetLevel >= 1 && args.targetLevel <= 3) {
    return (args.actorIsOps && args.actorReachesTarget) || args.actorLevel === 4 || args.actorLevel === 5;
  }
  return false;
}

/** The BGH member an approved comment counts for (null while pending/returned). */
export function countedEvaluatorId(text: EvaluationTextRow): string | null {
  if (!isEvaluationTextApproved(text)) return null;
  if (text.writtenOnBehalf) return text.reviewedByUserId ? String(text.reviewedByUserId) : null;
  return String(text.evaluatorUserId);
}

/** Only approved comments lock the period file against re-upload. */
export function evaluationFileTextLocked(texts: EvaluationTextRow[]) {
  return texts.some((text) => isEvaluationTextApproved(text));
}

export function hasCountedEvaluation(texts: EvaluationTextRow[], userId: string) {
  return texts.some((text) => countedEvaluatorId(text) === String(userId));
}

/**
 * Whether `actor` may write (create, or edit+resubmit) their comment on a file
 * whose active comments are `texts`. `own` is the actor's own row (any status).
 */
export function evaluationTextWriteDecision(args: {
  actorUserId: string;
  actorIsOps: boolean;
  texts: EvaluationTextRow[];
  own: EvaluationTextRow | null | undefined;
}):
  | { ok: true; mode: "create" | "update"; status: EvaluationTextStatus; writtenOnBehalf: boolean }
  | { ok: false; error: string } {
  const own = args.own && args.own.active !== false ? args.own : null;
  if (own && evaluationTextStatus(own) === "approved") {
    return { ok: false, error: "EVALUATION_TEXT_ALREADY_SUBMITTED" };
  }
  if (!args.actorIsOps && hasCountedEvaluation(args.texts, args.actorUserId)) {
    return { ok: false, error: "EVALUATION_TEXT_ALREADY_SUBMITTED" };
  }
  const writtenOnBehalf = evaluationTextNeedsBghApproval({ isOps: args.actorIsOps });
  return {
    ok: true,
    mode: args.own ? "update" : "create",
    status: writtenOnBehalf ? "pending" : "approved",
    writtenOnBehalf,
  };
}

/**
 * A BGH member may review a pending comment when they could write that comment
 * for the target themselves, did not write it, and do not already have an
 * approved comment counted on the same file.
 */
export function canReviewEvaluationText(args: {
  text: EvaluationTextRow;
  reviewerUserId: string;
  reviewerIsOps: boolean;
  reviewerLevel: number;
  reviewerCanWriteForTarget: boolean;
  fileTexts: EvaluationTextRow[];
}) {
  return evaluationTextReviewError({ ...args, decision: "approve" }) === null;
}

export function evaluationTextReviewError(args: {
  text: EvaluationTextRow | null | undefined;
  reviewerUserId: string;
  reviewerIsOps: boolean;
  reviewerLevel: number;
  reviewerCanWriteForTarget: boolean;
  fileTexts: EvaluationTextRow[];
  decision: "approve" | "return";
  reason?: string;
}): string | null {
  const text = args.text;
  if (!text || text.active === false) return "EVALUATION_TEXT_NOT_FOUND";
  if (evaluationTextStatus(text) !== "pending") return "EVALUATION_TEXT_NOT_PENDING";
  if (!isBghReviewer({ isOps: args.reviewerIsOps, level: args.reviewerLevel })) {
    return "PEOPLE_REVIEW_TEXT_REVIEW_FORBIDDEN";
  }
  if (!args.reviewerCanWriteForTarget) return "PEOPLE_REVIEW_TEXT_REVIEW_FORBIDDEN";
  if (String(text.evaluatorUserId) === String(args.reviewerUserId)) return "PEOPLE_REVIEW_TEXT_REVIEW_FORBIDDEN";
  if (args.decision === "approve" && hasCountedEvaluation(args.fileTexts, args.reviewerUserId)) {
    return "EVALUATION_TEXT_ALREADY_SUBMITTED";
  }
  if (args.decision === "return") {
    const reason = String(args.reason || "").trim();
    if (!reason || reason.length > EVALUATION_RETURN_REASON_MAX) return "EVALUATION_RETURN_REASON_INVALID";
  }
  return null;
}

/**
 * Who sees a comment. Approved comments follow the existing "can view the
 * target" rule (checked by the caller). Pending/returned ones: writer, in-scope
 * admin/mod and eligible BGH approvers only — never the evaluated person.
 */
export function canSeeEvaluationText(args: {
  text: EvaluationTextRow;
  viewerUserId: string;
  targetUserId: string;
  viewerOpsInScope: boolean;
  viewerIsEligibleReviewer: boolean;
}) {
  if (isEvaluationTextApproved(args.text)) return true;
  if (String(args.viewerUserId) === String(args.targetUserId)) return false;
  if (String(args.text.evaluatorUserId) === String(args.viewerUserId)) return true;
  return args.viewerOpsInScope || args.viewerIsEligibleReviewer;
}

/**
 * Writer-side bell item for a comment written on behalf of BGH: returned
 * (until resubmitted) or approved (for a few days). Null otherwise.
 */
export function evaluationWriterNotice(text: EvaluationTextRow, writerUserId: string, now: number) {
  if (text.active === false || !text.writtenOnBehalf) return null;
  if (String(text.evaluatorUserId) !== String(writerUserId)) return null;
  const status = evaluationTextStatus(text);
  const at = Number(text.reviewedAt) || 0;
  if (!at) return null;
  if (status === "returned") return { decision: "returned" as const, at };
  if (status === "approved" && at >= now - EVALUATION_APPROVED_NOTICE_MS) {
    return { decision: "approved" as const, at };
  }
  return null;
}

/** Bell key for a pending comment; a resubmission is a new request (new key). */
export function evaluationReviewNotificationKey(textId: string, submittedAt: number) {
  return `people:evaluation_text_review:${textId}:${submittedAt}`;
}

/** Fault bell item for the evaluated person: never for faults they recorded themselves. */
export function staffFaultNoticeVisible(
  fault: { targetUserId: string; recordedByUserId: string; active?: boolean; createdAt: number },
  viewerUserId: string,
  now: number,
) {
  if (fault.active === false) return false;
  if (String(fault.targetUserId) !== String(viewerUserId)) return false;
  if (String(fault.recordedByUserId) === String(viewerUserId)) return false;
  return fault.createdAt >= now - STAFF_FAULT_NOTICE_MS;
}

/** dd/MM/yyyy from YYYY-MM-DD. */
export function formatIsoDateVi(iso: string) {
  const [y, m, d] = String(iso || "").split("-");
  if (!y || !m || !d) return String(iso || "");
  return `${d}/${m}/${y}`;
}

/** Push copy for a new fault: lock screens show it, so never the reason. */
export function staffFaultPushText(violationDate: string) {
  return {
    title: "Ghi nhận lỗi mới",
    body: `Có một ghi nhận lỗi ngày ${formatIsoDateVi(violationDate)}. Mở ứng dụng để xem chi tiết.`,
  };
}

/** Human label of an evaluation period (matches the web labels). */
export function evaluationPeriodLabel(file: {
  kind?: string;
  quarter?: number | null;
  year?: number | null;
  schoolYear?: string | null;
  semester?: number | null;
  periodKey?: string;
}) {
  if (file.kind === "quarterly") return `Quý ${file.quarter}/${file.year}`;
  if (file.kind === "civil_servant") return `Viên chức năm học ${file.schoolYear}`;
  if (file.kind === "boarding") return `Bán trú HK${file.semester} ${file.schoolYear}`;
  return String(file.periodKey || "");
}

/** Push copy for the review flow: never the comment text or the return reason. */
export function evaluationReviewPushText(args: {
  kind: "submitted" | "approved" | "returned";
  targetName: string;
  periodLabel: string;
}) {
  const subject = `${args.targetName} (${args.periodLabel})`;
  if (args.kind === "submitted") {
    return { title: "Nhận xét chờ duyệt", body: `Văn thư đã viết BGH đánh giá cho ${subject}, cần Ban Giám hiệu duyệt.` };
  }
  if (args.kind === "approved") {
    return { title: "Nhận xét đã được duyệt", body: `Ban Giám hiệu đã duyệt BGH đánh giá cho ${subject}.` };
  }
  return { title: "Nhận xét bị trả lại", body: `Ban Giám hiệu đã trả lại BGH đánh giá cho ${subject}. Mở ứng dụng để xem lý do.` };
}
