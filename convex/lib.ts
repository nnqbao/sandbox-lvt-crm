import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  canCreateAssignments,
  normalizeWorkVisibilityMode,
  WORK_VISIBILITY_DEFAULT,
} from "./assignmentPolicy";
import {
  canOperateMenu,
  defaultAccessForMenu,
  defaultMenuAccess,
  effectiveMenuAccessLevel,
  normalizeMenuAccess,
  SYSTEM_MENU_DEFS,
  type LegacyMenuAccess,
  type MenuAccess,
  type MenuId,
} from "./menuAccess";
import {
  NOTIFICATION_MILESTONES_DEFAULT,
  resolveSourceMilestones,
} from "./notificationSettings";

export type DbCtx = QueryCtx | MutationCtx;

export {
  canOperateMenu,
  defaultAccessForMenu,
  defaultMenuAccess,
  effectiveMenuAccessLevel,
  normalizeMenuAccess,
  SYSTEM_MENU_DEFS,
};
export type { LegacyMenuAccess, MenuAccess, MenuId };

/** System setting key controlling whether duty attendance confirmation is shown. */
export const DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY = "dutyAttendanceConfirmationEnabled";
export const DUTY_ATTENDANCE_CONFIRMATION_DEFAULT = true;
export const NOTIFICATION_DUTIES_ENABLED_SETTING_KEY = "notificationDutiesEnabled";
export const NOTIFICATION_WORK_ENABLED_SETTING_KEY = "notificationWorkEnabled";
export const NOTIFICATION_MILESTONES_SETTING_KEY = "notificationMilestonesHours";
export const NOTIFICATION_DUTY_MILESTONES_SETTING_KEY = "notificationDutyMilestonesHours";
export const NOTIFICATION_WORK_MILESTONES_SETTING_KEY = "notificationWorkMilestonesHours";
export const NOTIFICATION_SOURCE_DEFAULT = true;
export { NOTIFICATION_MILESTONES_DEFAULT };

/** Who creates/assigns work items: admin_mod (default) or supervisor (legacy L2/L3). */
export const WORK_ASSIGNER_MODE_SETTING_KEY = "workAssignerMode";
export const WORK_ASSIGNER_MODE_ADMIN_MOD = "admin_mod";
export const WORK_ASSIGNER_MODE_SUPERVISOR = "supervisor";
export const WORK_ASSIGNER_MODE_DEFAULT = WORK_ASSIGNER_MODE_ADMIN_MOD;
export type WorkAssignerMode = typeof WORK_ASSIGNER_MODE_ADMIN_MOD | typeof WORK_ASSIGNER_MODE_SUPERVISOR;

/** Who may browse others' live work besides creator + assignee. */
export const WORK_VISIBILITY_SETTING_KEY = "workVisibilityMode";
export {
  WORK_VISIBILITY_CREATOR,
  WORK_VISIBILITY_DEFAULT,
  WORK_VISIBILITY_SCHOOL,
  type WorkVisibilityMode,
} from "./assignmentPolicy";

/** Failed-login lockout (SYS-008). Stored as single-element numberValues arrays. */
export const LOGIN_MAX_FAILED_ATTEMPTS_SETTING_KEY = "login.maxFailedAttempts";
export const LOGIN_ATTEMPT_WINDOW_MINUTES_SETTING_KEY = "login.attemptWindowMinutes";
export const LOGIN_MAX_FAILED_ATTEMPTS_DEFAULT = 5;
export const LOGIN_ATTEMPT_WINDOW_MINUTES_DEFAULT = 15;

export type SystemRole = "admin" | "moderator" | "user";

export const SYSTEM_ROLES: { key: SystemRole; name: string }[] = [
  { key: "admin", name: "Administrator" },
  { key: "moderator", name: "Moderator" },
  { key: "user", name: "User" },
];

export function isSystemRole(role: string): role is SystemRole {
  return role === "admin" || role === "moderator" || role === "user";
}

export function isOperationalManagerRole(role: string): role is "admin" | "moderator" {
  return role === "admin" || role === "moderator";
}

/**
 * Approval hierarchy: higher star level may approve lower levels.
 * Level 5 can approve 4,3,2,1. Level 4 can approve 3,2,1 but not 5.
 * Level 1 cannot approve anyone. Same level cannot approve each other.
 */
export function canApproveLevel(approverLevel: number, targetLevel: number): boolean {
  if (!Number.isInteger(approverLevel) || !Number.isInteger(targetLevel)) return false;
  if (approverLevel < 1 || approverLevel > 5 || targetLevel < 1 || targetLevel > 5) return false;
  return approverLevel > targetLevel;
}

export function activePositionLevel(
  user: { positionId?: string },
  positions: { _id: string; level: number; active: boolean }[],
): number {
  if (!user.positionId) return 0;
  const position = positions.find((item) => String(item._id) === String(user.positionId));
  return position?.active ? Number(position.level) || 0 : 0;
}

export function isSameDepartmentSubordinate(
  actor: { _id: string; departmentId?: string; positionId?: string },
  target: { _id: string; departmentId?: string; positionId?: string },
  positions: { _id: string; level: number; active: boolean }[],
): boolean {
  if (String(actor._id) === String(target._id)) return false;
  if (!actor.departmentId || !target.departmentId) return false;
  if (String(actor.departmentId) !== String(target.departmentId)) return false;
  return canApproveLevel(
    activePositionLevel(actor, positions),
    activePositionLevel(target, positions),
  );
}

/** Higher rank may approve on behalf of any lower required rank on a multi-step task. */
export function canApproveOnBehalf(approverLevel: number, requiredLevel: number): boolean {
  return canApproveLevel(approverLevel, requiredLevel) || approverLevel === requiredLevel;
}

export function assertPositionLevel(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > 5) throw new Error("INVALID_POSITION_LEVEL");
}

export async function authUserIdOrThrow(ctx: { auth: QueryCtx["auth"] }): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("UNAUTHENTICATED");
  return userId;
}

export async function currentUserOrThrow(ctx: DbCtx) {
  const userId = await authUserIdOrThrow(ctx);
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("UNAUTHENTICATED");
  if (user.loginLockedAt) throw new Error("ACCOUNT_LOCKED");
  return user;
}

export async function getBooleanSystemSetting(
  ctx: DbCtx,
  key: string,
  fallback: boolean,
): Promise<boolean> {
  const row = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return row?.value ?? fallback;
}

export async function getNumberArraySystemSetting(
  ctx: DbCtx,
  key: string,
  fallback: readonly number[],
): Promise<number[]> {
  const row = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return row?.numberValues ? [...row.numberValues] : [...fallback];
}

export async function getNumberArraySystemSettingIfPresent(
  ctx: DbCtx,
  key: string,
): Promise<number[] | null> {
  const row = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return row?.numberValues ? [...row.numberValues] : null;
}

export async function getSourceNotificationMilestones(ctx: DbCtx, sourceKey: string): Promise<number[]> {
  const [specific, shared] = await Promise.all([
    getNumberArraySystemSettingIfPresent(ctx, sourceKey),
    getNumberArraySystemSettingIfPresent(ctx, NOTIFICATION_MILESTONES_SETTING_KEY),
  ]);
  return resolveSourceMilestones(specific, shared, NOTIFICATION_MILESTONES_DEFAULT);
}

export async function getStringSystemSetting(
  ctx: DbCtx,
  key: string,
  fallback: string,
): Promise<string> {
  const row = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  const value = row?.stringValue;
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export async function getNumberSystemSetting(
  ctx: DbCtx,
  key: string,
  fallback: number,
): Promise<number> {
  const row = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  const value = row?.numberValues?.[0];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function getWorkAssignerMode(ctx: DbCtx): Promise<WorkAssignerMode> {
  const value = await getStringSystemSetting(
    ctx,
    WORK_ASSIGNER_MODE_SETTING_KEY,
    WORK_ASSIGNER_MODE_DEFAULT,
  );
  return value === WORK_ASSIGNER_MODE_SUPERVISOR
    ? WORK_ASSIGNER_MODE_SUPERVISOR
    : WORK_ASSIGNER_MODE_ADMIN_MOD;
}

export async function getWorkVisibilityMode(ctx: DbCtx) {
  const value = await getStringSystemSetting(
    ctx,
    WORK_VISIBILITY_SETTING_KEY,
    WORK_VISIBILITY_DEFAULT,
  );
  return normalizeWorkVisibilityMode(value);
}

/**
 * Active creator gate. Công tác uses `canCreateAssignments` (default); Công việc
 * passes `canCreateWorkDocuments` (any non-ops level 2+).
 */
export async function assignmentCreatorOrThrow(
  ctx: DbCtx,
  canCreate: (role: string, level: number) => boolean = canCreateAssignments,
) {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  const positions = await ctx.db.query("positions").collect();
  const level = activePositionLevel(user, positions);
  if (!canCreate(user.role, level)) throw new Error("ASSIGNMENT_CREATE_FORBIDDEN");
  return {
    user,
    level,
    isOps: isOperationalManagerRole(user.role),
    positions,
  };
}

/** Administrator-only gate for supreme settings and user lifecycle operations. */
export async function adminOrThrow(ctx: DbCtx) {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active" || user.role !== "admin") throw new Error("FORBIDDEN: admin role required");
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  return user;
}

/**
 * Admin-only gate. Permission strings are retained for audit/call-site clarity;
 * admin role grants every permission (highest privilege).
 */
export async function adminPermissionOrThrow(ctx: DbCtx, permission: string) {
  const user = await adminOrThrow(ctx);
  return { user, role: { key: "admin" as const, permissions: [permission, "*"] } };
}

/** Administrator/Moderator gate for operational management modules. */
export async function operationalManagerOrThrow(ctx: DbCtx) {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active" || !isOperationalManagerRole(user.role)) {
    throw new Error("FORBIDDEN: operational manager role required");
  }
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  return user;
}

export async function operationalManagerPermissionOrThrow(ctx: DbCtx, permission: string) {
  const user = await operationalManagerOrThrow(ctx);
  return { user, role: { key: user.role, permissions: [permission, "*"] } };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Normalize display names for duplicate checks (trim + Vietnamese-aware lower case). */
export function normalizeDisplayName(name: string): string {
  return name.trim().toLocaleLowerCase("vi");
}

export function namesMatch(a: string, b: string): boolean {
  return normalizeDisplayName(a) === normalizeDisplayName(b);
}

/**
 * True if another active row already uses this name.
 * Soft-deleted (active=false) names may be reused.
 */
export function hasActiveNameConflict(
  rows: { _id: string; name: string; active?: boolean }[],
  name: string,
  excludeId?: string,
): boolean {
  const target = normalizeDisplayName(name);
  return rows.some(
    (row) =>
      row.active !== false &&
      row._id !== excludeId &&
      normalizeDisplayName(row.name) === target,
  );
}

export async function resolveUserMenuAccess(
  ctx: DbCtx,
  user: { role: string; permissionGroupId?: string },
): Promise<Record<string, MenuAccess>> {
  const full = Object.fromEntries(SYSTEM_MENU_DEFS.map((m) => [m.id, "view_all" as MenuAccess]));
  if (isOperationalManagerRole(user.role)) return full;

  const empty = Object.fromEntries(
    SYSTEM_MENU_DEFS.map((m) => [m.id, defaultAccessForMenu(m.id)]),
  );
  if (!user.permissionGroupId) return empty;

  const group = await ctx.db
    .query("permissionGroups")
    .collect()
    .then((rows) => rows.find((row) => row._id === user.permissionGroupId));
  if (!group?.active) return empty;

  const result = { ...empty };
  for (const entry of group.menuAccess || []) {
    result[entry.menu] = effectiveMenuAccessLevel(entry.menu, entry.access);
  }
  return result;
}
