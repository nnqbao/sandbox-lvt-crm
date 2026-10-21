/** Visibility and add-button rules for menu `staff-faults` (Ghi nhận lỗi). */

export const STAFF_FAULTS_MENU_ID = "staff-faults";

export function canAddStaffFault(actor: { isOps: boolean; level: number }): boolean {
  if (actor.isOps) return true;
  return actor.level >= 2 && actor.level <= 5;
}

/**
 * `view`: faults targeting the actor, plus faults the actor recorded.
 * `view_all` / operational managers: every active fault in the query result.
 * A department-scoped moderator (`departmentScope`) sees, beyond their own,
 * only faults whose target belongs to that department.
 */
export function canSeeStaffFaultRecord(args: {
  isOps: boolean;
  access: string | undefined;
  actorUserId: string;
  targetUserId: string;
  recordedByUserId: string;
  departmentScope?: string | null;
  targetDepartmentId?: string | null;
}): boolean {
  const me = String(args.actorUserId);
  if (String(args.targetUserId) === me || String(args.recordedByUserId) === me) return true;
  if (args.isOps) {
    if (!args.departmentScope) return true;
    return String(args.targetDepartmentId || "") === String(args.departmentScope);
  }
  return args.access === "view_all";
}
