/**
 * Canonical menu-access helpers.
 * Giám thị (`supervisor`) is valid only on the `attendance` menu (Điểm danh); that menu
 * accepts only `hidden` or `supervisor` for ordinary users (admin/mod get full access by role).
 */

export const SYSTEM_MENU_DEFS = [
  { id: "reports", label: "Báo cáo" },
  { id: "notifications", label: "Thông báo" },
  { id: "duties", label: "Lịch công tác" },
  { id: "work", label: "Công việc" },
  { id: "homeroom", label: "Lớp chủ nhiệm" },
  { id: "attendance", label: "Điểm danh" },
  { id: "people-review", label: "Đánh giá nhân sự" },
  { id: "staff-faults", label: "Ghi nhận lỗi" },
] as const;

export type MenuId = (typeof SYSTEM_MENU_DEFS)[number]["id"];
/** Stored/legacy values. `edit` remains readable so existing groups keep write semantics. */
export type MenuAccess = "hidden" | "view" | "view_all" | "edit" | "supervisor";
export type LegacyMenuAccess = MenuAccess | "edit";
export type CanonicalMenuAccess = "hidden" | "view" | "view_all" | "supervisor";

export const HOMEROOM_MENU_ID: MenuId = "homeroom";
export const ATTENDANCE_MENU_ID: MenuId = "attendance";
/** The only menu where `supervisor` (Giám thị) is a valid level. */
export const SUPERVISOR_MENU_ID: MenuId = ATTENDANCE_MENU_ID;
export const INVALID_MENU_ACCESS = "INVALID_MENU_ACCESS";

const ATTENDANCE_LEVELS: readonly string[] = ["hidden", "supervisor"];

export function defaultAccessForMenu(menuId: string): MenuAccess {
  return menuId === "notifications" ? "view" : "hidden";
}

export function defaultMenuAccess(): { menu: string; access: MenuAccess }[] {
  return SYSTEM_MENU_DEFS.map((item) => ({
    menu: item.id,
    access: defaultAccessForMenu(item.id),
  }));
}

export function canonicalizeMenuAccessLevel(access: string | undefined): CanonicalMenuAccess {
  if (access === "edit") return "view";
  if (access === "supervisor") return "supervisor";
  if (access === "hidden" || access === "view" || access === "view_all") return access;
  return "hidden";
}

export function isMenuVisible(access: MenuAccess | CanonicalMenuAccess | undefined): boolean {
  return access != null && access !== "hidden";
}

export function isViewAllAccess(access: MenuAccess | CanonicalMenuAccess | undefined): boolean {
  return access === "view_all";
}

export function isSupervisorAccess(access: MenuAccess | CanonicalMenuAccess | string | undefined): boolean {
  return access === "supervisor";
}

/** True when the level is allowed on that menu (ignores unknown levels, which resolve to hidden). */
export function isLevelAllowedOnMenu(menu: string, access: string | undefined): boolean {
  if (menu === ATTENDANCE_MENU_ID) return access == null || ATTENDANCE_LEVELS.includes(access);
  return access !== "supervisor";
}

/**
 * Runtime resolution keeps legacy `edit` so canOperateMenu still matches stored rows.
 * `supervisor` exists only on `attendance`, never grants another menu and never satisfies view_all.
 */
export function effectiveMenuAccessLevel(
  menu: string,
  raw: string | undefined,
): MenuAccess {
  if (!raw) return defaultAccessForMenu(menu);
  if (!isLevelAllowedOnMenu(menu, raw)) return "hidden";
  if (raw === "supervisor") return "supervisor";
  if (raw === "edit") return "edit";
  if (raw === "view" || raw === "view_all" || raw === "hidden") return raw;
  return "hidden";
}

/** View, view_all, and legacy edit allow module business operations; hidden and supervisor do not. */
export function canOperateMenu(access: string | undefined): boolean {
  return access === "view" || access === "view_all" || access === "edit";
}

export function assertValidMenuAccessEntries(
  entries: { menu: string; access: string }[] | undefined,
) {
  for (const entry of entries || []) {
    if (!isLevelAllowedOnMenu(entry.menu, entry.access)) {
      throw new Error(INVALID_MENU_ACCESS);
    }
  }
}

export function normalizeMenuAccess(
  entries: { menu: string; access: MenuAccess | string }[] | undefined,
): { menu: string; access: MenuAccess }[] {
  const map = new Map((entries || []).map((e) => [e.menu, e.access]));
  return SYSTEM_MENU_DEFS.map((item) => {
    const raw = map.get(item.id);
    if (raw === undefined) {
      return { menu: item.id, access: defaultAccessForMenu(item.id) };
    }
    if (!isLevelAllowedOnMenu(item.id, raw)) {
      return { menu: item.id, access: "hidden" as MenuAccess };
    }
    return {
      menu: item.id,
      access: canonicalizeMenuAccessLevel(raw) as MenuAccess,
    };
  });
}

/**
 * One-time move of Giám thị from the homeroom menu to the attendance menu:
 * homeroom=supervisor → homeroom=hidden + attendance=supervisor. Groups without it get
 * attendance=hidden. Idempotent: running it on migrated entries returns them unchanged.
 */
export function migrateSupervisorMenuAccess(
  entries: { menu: string; access: MenuAccess | string }[] | undefined,
): { menuAccess: { menu: string; access: MenuAccess }[]; movedSupervisor: boolean } {
  const list = entries || [];
  const movedSupervisor = list.some(
    (entry) => entry.menu === HOMEROOM_MENU_ID && entry.access === "supervisor",
  );
  if (!movedSupervisor) return { menuAccess: normalizeMenuAccess(list), movedSupervisor };
  const rewritten = list
    .filter((entry) => entry.menu !== HOMEROOM_MENU_ID && entry.menu !== ATTENDANCE_MENU_ID)
    .concat([
      { menu: HOMEROOM_MENU_ID, access: "hidden" },
      { menu: ATTENDANCE_MENU_ID, access: "supervisor" },
    ]);
  return { menuAccess: normalizeMenuAccess(rewritten), movedSupervisor };
}

/**
 * Same menu → access mapping, ignoring entry order and object key order
 * (Convex may return stored objects with keys in a different order, so a
 * JSON.stringify comparison reports a change on every run).
 */
export function menuAccessEntriesEqual(
  a: { menu: string; access: string }[] | undefined,
  b: { menu: string; access: string }[] | undefined,
): boolean {
  const left = a || [];
  const right = b || [];
  if (left.length !== right.length) return false;
  const leftMap = new Map(left.map((entry) => [String(entry.menu), String(entry.access)]));
  if (leftMap.size !== left.length) return false;
  const rightMap = new Map(right.map((entry) => [String(entry.menu), String(entry.access)]));
  if (rightMap.size !== right.length) return false;
  for (const [menu, access] of leftMap) {
    if (rightMap.get(menu) !== access) return false;
  }
  return true;
}

/** Shared create/update boundary: reject supervisor outside `attendance` and view levels on it. */
export function cleanPermissionGroupMenuAccess(
  entries: { menu: string; access: MenuAccess | string }[] | undefined,
): { menu: string; access: MenuAccess }[] {
  assertValidMenuAccessEntries(entries);
  const known = new Set(SYSTEM_MENU_DEFS.map((m) => m.id));
  for (const entry of entries || []) {
    if (entry.menu && !known.has(entry.menu as MenuId)) {
      throw new Error("INVALID_MENU");
    }
  }
  return normalizeMenuAccess(entries);
}

/**
 * Operator CLI change of one menu on one permission group (pure part of
 * `permissionGroups.operatorSetMenuAccess`). Goes through the same boundary as
 * create/update (`cleanPermissionGroupMenuAccess`), so `supervisor` stays
 * attendance-only and unknown menus are rejected. Only canonical levels are
 * accepted (no legacy `edit`). `changed` is false when the stored rows already
 * match, so the caller skips the patch and the audit entry.
 */
export function planOperatorMenuAccessChange(
  current: { menu: string; access: MenuAccess | string }[] | undefined,
  menu: string,
  access: string,
): { menuAccess: { menu: string; access: MenuAccess }[]; changed: boolean; before: string } {
  const menuId = String(menu || "").trim();
  const level = String(access || "").trim();
  if (!["hidden", "view", "view_all", "supervisor"].includes(level)) throw new Error(INVALID_MENU_ACCESS);
  const base = migrateSupervisorMenuAccess(current).menuAccess;
  const before = base.find((entry) => entry.menu === menuId)?.access || "";
  const requested = base.filter((entry) => entry.menu !== menuId).concat([{ menu: menuId, access: level as MenuAccess }]);
  const menuAccess = cleanPermissionGroupMenuAccess(requested);
  return { menuAccess, changed: !menuAccessEntriesEqual(menuAccess, current), before };
}
