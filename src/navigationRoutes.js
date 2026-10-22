import { DUTY_MENU_PATH, dutiesPathname, parseDutyPath } from './duties/dutyRoutes.js';

const MENU_PATHS = Object.freeze({
  reports: '/bao-cao/cong-viec',
  notifications: '/thong-bao',
  duties: '/cong-tac',
  chat: '/trao-doi',
  work: '/cong-viec',
  homeroom: '/lop-chu-nhiem',
  attendance: '/diem-danh',
  'people-review': '/danh-gia-nhan-su',
  'staff-faults': '/ghi-nhan-loi',
  profile: '/thong-tin-ca-nhan',
  'change-password': '/doi-mat-khau',
  devices: '/quan-ly-thiet-bi-dang-nhap',
  'duties-management': '/quan-ly-cong-tac',
  boarding: '/ban-tru',
  'work-management': '/quan-ly-cong-viec',
  users: '/thiet-lap-nguoi-dung',
  departments: '/thiet-lap-phong-ban',
  roles: '/thiet-lap-nhom-quyen',
  positions: '/thiet-lap-chuc-vu',
  'document-types': '/thiet-lap-loai-van-ban',
  'school-years': '/thiet-lap-nam-hoc',
  'display-settings': '/thiet-lap-hien-thi',
  'design-library': '/thu-vien-giao-dien',
});

/** Left-sidebar "Chức năng chính" in display order. */
const PRIMARY_MENUS = Object.freeze([
  ['reports', 'Báo cáo'],
  ['notifications', 'Thông báo'],
  ['chat', 'Trao đổi'],
  ['duties', 'Lịch công tác'],
  ['work', 'Công việc'],
  ['homeroom', 'Lớp chủ nhiệm'],
  ['attendance', 'Điểm danh'],
  ['boarding', 'Bán trú'],
  ['people-review', 'Đánh giá nhân sự'],
  ['staff-faults', 'Ghi nhận lỗi'],
]);

/** "Thiết lập tối cao" (Administrator only). */
const SUPREME_SETTINGS = Object.freeze([
  ['users', 'Thiết lập người dùng'],
  ['departments', 'Thiết lập phòng ban'],
  ['roles', 'Thiết lập nhóm quyền'],
  ['positions', 'Thiết lập chức vụ'],
  ['document-types', 'Thiết lập loại văn bản'],
  ['school-years', 'Thiết lập năm học'],
  ['display-settings', 'Thiết lập hiển thị'],
  ['design-library', 'Thư viện giao diện'],
]);

/**
 * Sidebar visibility (UX only; every Convex query re-checks on the server).
 * - Trao đổi and Công việc ("Việc của tôi") are open to every active account.
 * - Bán trú has no permission-matrix key: convex/boarding.ts lets operational
 *   managers manage periods and anyone whose Báo cáo menu is not hidden read the
 *   participant list, so the menu follows the Báo cáo level.
 * @param {string} menuId
 * @param {{ canManageOperations?: boolean, menuAccess?: Record<string, string> | null }} [options]
 */
export function isPrimaryMenuVisible(menuId, { canManageOperations = false, menuAccess = {} } = {}) {
  if (canManageOperations) return true;
  if (menuId === 'chat' || menuId === 'work') return true;
  const level = menuId === 'boarding' ? menuAccess?.reports : menuAccess?.[menuId];
  return Boolean(level) && level !== 'hidden';
}

const REPORT_PATHS = Object.freeze({
  work: '/bao-cao/cong-viec',
  boarding: '/bao-cao/ban-tru',
});

/** Primary menus kept off the left sidebar; still reachable (e.g. header bell). */
const SIDEBAR_HIDDEN_MENUS = Object.freeze(['notifications', 'chat']);

/** Account pages live in the header avatar menu, not the left sidebar. */
const ACCOUNT_MENU_IDS = Object.freeze(['profile', 'change-password', 'devices']);

const ACCOUNT_MENU_TITLES = Object.freeze({
  profile: 'Hồ sơ nội bộ',
  'change-password': 'Đổi mật khẩu',
  devices: 'Quản lý thiết bị đăng nhập',
});

export function isAccountMenu(menuId) {
  return ACCOUNT_MENU_IDS.some((id) => id === menuId);
}

export function isSidebarPrimaryMenu(menuId) {
  return !SIDEBAR_HIDDEN_MENUS.includes(menuId) && !isAccountMenu(menuId);
}

export function titleForAccountMenu(menuId) {
  if (menuId === 'change-password' || menuId === 'devices') {
    return ACCOUNT_MENU_TITLES[menuId];
  }
  return ACCOUNT_MENU_TITLES.profile;
}

const HIDDEN_MENU_ALIASES = Object.freeze({
  '/quan-ly-cong-tac': { menu: 'duties' },
  '/quan-ly-cong-viec': { menu: 'work' },
  '/quan-ly-ban-tru': { menu: 'boarding' },
  '/bao-cao/cong-tac': { menu: 'duties', dutyPath: '/cong-tac/chung' },
  // Thiết lập địa điểm was removed: duty locations are free text now.
  '/thiet-lap-dia-diem': { menu: 'departments' },
  '/ho-so-noi-bo': { menu: 'profile' },
});

/** @type {Map<string, { menu: string, reportSection?: string }>} */
const PATH_ROUTES = new Map(
  Object.entries(MENU_PATHS).map(([menu, pathname]) => [pathname, { menu }]),
);
for (const [reportSection, pathname] of Object.entries(REPORT_PATHS)) {
  PATH_ROUTES.set(pathname, { menu: 'reports', reportSection });
}

function normalizePathname(pathname) {
  const raw = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  if (raw === '/') return '/';
  return `/${raw.replace(/^\/+|\/+$/g, '')}`;
}

export function homeroomPathname(args = {}) {
  if (args.studentId) return `/lop-chu-nhiem/hoc-sinh/${encodeURIComponent(args.studentId)}`;
  if (args.manageClasses) return '/lop-chu-nhiem/quan-ly-lop';
  if (args.classId && args.tab) {
    return `/lop-chu-nhiem/lop/${encodeURIComponent(args.classId)}/${args.tab}`;
  }
  if (args.classId) return `/lop-chu-nhiem/lop/${encodeURIComponent(args.classId)}`;
  return MENU_PATHS.homeroom;
}

const CHAT_KIND_PATHS = Object.freeze({
  'cong-viec': 'work',
  'cong-tac': 'duty',
  nhom: 'group',
});

export function chatPathname(args) {
  const kind = args?.kind;
  const entityId = args?.entityId;
  if (kind === 'work' && entityId) return `/trao-doi/cong-viec/${encodeURIComponent(entityId)}`;
  if (kind === 'duty' && entityId) return `/trao-doi/cong-tac/${encodeURIComponent(entityId)}`;
  if (kind === 'group' && entityId) return `/trao-doi/nhom/${encodeURIComponent(entityId)}`;
  return MENU_PATHS.chat;
}

export function parseChatPath(pathname) {
  const normalized = normalizePathname(pathname);
  if (normalized === MENU_PATHS.chat) {
    return { kind: '', entityId: '', chatPath: normalized };
  }
  const match = normalized.match(/^\/trao-doi\/(cong-viec|cong-tac|nhom)\/([^/]+)$/);
  if (!match) return null;
  return {
    kind: CHAT_KIND_PATHS[match[1]],
    entityId: decodeURIComponent(match[2]),
    chatPath: normalized,
  };
}

export function routeForPathname(pathname) {
  const normalized = normalizePathname(pathname);
  if (normalized === MENU_PATHS.chat || normalized.startsWith(`${MENU_PATHS.chat}/`)) {
    const parsed = parseChatPath(normalized);
    if (!parsed) return null;
    return {
      menu: 'chat',
      reportSection: undefined,
      chatPath: parsed.chatPath,
      chatKind: parsed.kind,
      chatEntityId: parsed.entityId,
    };
  }
  if (normalized === MENU_PATHS.homeroom || normalized.startsWith(`${MENU_PATHS.homeroom}/`)) {
    return { menu: 'homeroom', reportSection: undefined, homeroomPath: normalized };
  }
  if (normalized === DUTY_MENU_PATH || normalized.startsWith(`${DUTY_MENU_PATH}/`)) {
    const parsed = parseDutyPath(normalized);
    return {
      menu: 'duties',
      reportSection: undefined,
      dutyPath: parsed?.dutyPath || DUTY_MENU_PATH,
    };
  }
  const alias = HIDDEN_MENU_ALIASES[normalized];
  if (alias) {
    return {
      menu: alias.menu,
      reportSection: alias.reportSection,
      ...(alias.dutyPath ? { dutyPath: alias.dutyPath } : {}),
    };
  }
  const route = PATH_ROUTES.get(normalized);
  return route ? { menu: route.menu, reportSection: route.reportSection } : null;
}

export function pathnameForMenu(menu, reportSection = 'work') {
  if (menu === 'reports') return REPORT_PATHS[reportSection] || REPORT_PATHS.work;
  return MENU_PATHS[menu] || '/';
}

export function pathnameForReportSection(reportSection) {
  if (reportSection === 'duties') return dutiesPathname({ view: 'shared' });
  return REPORT_PATHS[reportSection] || REPORT_PATHS.work;
}

// ---------------------------------------------------------------- in-app guide

/** Static guide built by `npm run guide:build` (public/huong-dan-su-dung.html). */
export const GUIDE_PATH = '/huong-dan-su-dung.html';

/**
 * Menu id -> topic id in docs/guide/outline.json, shown by the "?" button.
 * tests/page-help.test.mjs checks every sidebar, settings and account page.
 */
const GUIDE_ANCHORS = Object.freeze({
  reports: 'menu-bao-cao',
  notifications: 'tb-thong-bao',
  chat: 'td-trao-doi',
  duties: 'menu-lich-cong-tac',
  work: 'menu-cong-viec',
  homeroom: 'menu-lop-chu-nhiem',
  attendance: 'menu-diem-danh',
  boarding: 'bt-ban-tru',
  'people-review': 'menu-danh-gia-nhan-su',
  'staff-faults': 'ln-ghi-nhan-loi',
  profile: 'tai-khoan-ca-nhan',
  settings: 'tai-khoan-ca-nhan',
  'change-password': 'doi-mat-khau',
  devices: 'thiet-bi-dang-nhap',
  users: 'tl-nguoi-dung',
  departments: 'tl-phong-ban',
  roles: 'tl-nhom-quyen',
  positions: 'tl-chuc-vu',
  'document-types': 'tl-loai-van-ban',
  'school-years': 'nh-thiet-lap-nam-hoc',
  'display-settings': 'tl-hien-thi',
  'design-library': 'menu-thiet-lap',
});

export function guideAnchorForMenu(menuId) {
  return GUIDE_ANCHORS[menuId] || '';
}

/** Compact guide (no hero, sidebar or search) showing only that topic. */
export function guideEmbedUrl(anchor) {
  return `${GUIDE_PATH}?embed=1${anchor ? `#${anchor}` : ''}`;
}

export function guideFullUrl(anchor) {
  return `${GUIDE_PATH}${anchor ? `#${anchor}` : ''}`;
}

/** Plain menu name for labels ("Hướng dẫn: Bán trú"). */
export function menuLabel(menuId) {
  if (menuId === 'settings') return ACCOUNT_MENU_TITLES.profile;
  if (isAccountMenu(menuId)) return titleForAccountMenu(menuId);
  return [...PRIMARY_MENUS, ...SUPREME_SETTINGS].find(([id]) => id === menuId)?.[1] || '';
}

export {
  GUIDE_ANCHORS,
  PRIMARY_MENUS,
  SUPREME_SETTINGS,
  ACCOUNT_MENU_IDS,
  ACCOUNT_MENU_TITLES,
  MENU_PATHS,
  REPORT_PATHS,
  HIDDEN_MENU_ALIASES,
  dutiesPathname,
};
