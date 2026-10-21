/**
 * Moderator department scope (pure policy, no Convex imports).
 *
 * A `moderator` with a `departmentId` only operates inside that department in
 * Công việc, Báo cáo, Đánh giá nhân sự and Ghi nhận lỗi. A moderator without a
 * department keeps school-wide power, and `admin` is never scoped. Every other
 * module (công tác, lớp chủ nhiệm, nội trú, thông báo, trao đổi, cài đặt) stays
 * school-wide for moderators.
 */

export const MODERATOR_DEPARTMENT_SCOPE_ERROR = "MODERATOR_DEPARTMENT_SCOPE";

type ScopeUser = { role?: string | null; departmentId?: string | null };
type TargetUser = { _id?: string; departmentId?: string | null };

/** `null` = not scoped (admin, user, or moderator without department); otherwise the departmentId. */
export function moderatorDepartmentScope(user: ScopeUser | null | undefined): string | null {
  if (!user || user.role !== "moderator") return null;
  const departmentId = String(user.departmentId || "").trim();
  return departmentId || null;
}

/** True when `target` belongs to the scoped department (always true when unscoped). */
export function isUserInModeratorScope(
  scope: string | null | undefined,
  target: TargetUser | null | undefined,
): boolean {
  if (!scope) return true;
  if (!target) return false;
  return String(target.departmentId || "") === String(scope);
}

/**
 * Operational-manager power over another person, narrowed by scope.
 * Self always counts as in scope (a moderator may act on their own record).
 */
export function opsTargetInScope(
  actor: { _id?: string; isOps: boolean; departmentScope?: string | null },
  target: TargetUser | null | undefined,
): boolean {
  if (!actor.isOps) return false;
  if (target && actor._id && String(target._id) === String(actor._id)) return true;
  return isUserInModeratorScope(actor.departmentScope ?? null, target);
}

/** Users visible to an ops/view_all report viewer: whole list when unscoped, else department + self. */
export function filterUsersInModeratorScope<T extends TargetUser>(
  scope: string | null | undefined,
  users: T[],
  selfId: string,
): T[] {
  if (!scope) return users;
  return users.filter(
    (user) => String(user._id) === String(selfId) || isUserInModeratorScope(scope, user),
  );
}

export type ScopeAssignment = {
  type?: string;
  assignmentType?: string;
  departmentId?: string | null;
  userIds?: string[] | null;
  assigneeUserIds?: string[] | null;
};

/** Stored assignments of a work document; legacy rows fall back to the single departmentId. */
export function workDocumentScopeAssignments(document: {
  assignments?: ScopeAssignment[] | null;
  departmentId?: string | null;
} | null | undefined): ScopeAssignment[] {
  if (!document) return [];
  if (Array.isArray(document.assignments) && document.assignments.length) return document.assignments;
  return [{ type: "department", departmentId: document.departmentId || "" }];
}

/**
 * A work document is in a moderator's scope iff every assignment targets the
 * scoped department (department assignment) or individuals whose current
 * departmentId is the scoped department. Unscoped actors see everything.
 */
export function isWorkDocumentInModeratorScope(
  scope: string | null | undefined,
  assignments: ScopeAssignment[] | null | undefined,
  usersById: Map<string, { departmentId?: string | null }>,
): boolean {
  if (!scope) return true;
  const rows = assignments || [];
  if (!rows.length) return false;
  return rows.every((assignment) => {
    const type = assignment.type || assignment.assignmentType;
    if (type === "individual") {
      const ids = (assignment.userIds || assignment.assigneeUserIds || []).map(String).filter(Boolean);
      if (!ids.length) return false;
      return ids.every((id) => isUserInModeratorScope(scope, usersById.get(id) || null));
    }
    return String(assignment.departmentId || "") === String(scope);
  });
}
