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
  boarding: '/quan-ly-ban-tru',
  'work-management': '/quan-ly-cong-viec',
  users: '/thiet-lap-nguoi-dung',
  departments: '/thiet-lap-phong-ban',
  locations: '/thiet-lap-dia-diem',
  roles: '/thiet-lap-nhom-quyen',
  positions: '/thiet-lap-chuc-vu',
  'document-types': '/thiet-lap-loai-van-ban',
  'school-years': '/thiet-lap-nam-hoc',
  'display-settings': '/thiet-lap-hien-thi',
  'design-library': '/thu-vien-giao-dien',
});

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
  '/quan-ly-ban-tru': { menu: 'reports', reportSection: 'work' },
  '/bao-cao/ban-tru': { menu: 'reports', reportSection: 'work' },
  '/bao-cao/cong-tac': { menu: 'duties', dutyPath: '/cong-tac/chung' },
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

export {
  ACCOUNT_MENU_IDS,
  ACCOUNT_MENU_TITLES,
  MENU_PATHS,
  REPORT_PATHS,
  HIDDEN_MENU_ALIASES,
  dutiesPathname,
};
