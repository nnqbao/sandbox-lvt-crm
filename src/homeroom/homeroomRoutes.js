import { routeForPathname } from '../navigationRoutes.js';

export const CLASS_TABS = ['hoc-sinh', 'diem-danh', 'so-dau-bai', 'bao-cao', 'quan-ly'];

/**
 * Map a /lop-chu-nhiem/... pathname to the homeroom view to render.
 * Old links to the retired pages (vang-cho-xu-ly, nhap-diem-danh) fall back to the overview.
 */
export function parseHomeroomPath(pathname) {
  const normalized = routeForPathname(pathname)?.homeroomPath || '/lop-chu-nhiem';
  const parts = normalized.split('/').filter(Boolean);
  if (parts[1] === 'quan-ly-lop') return { view: 'manage' };
  if (parts[1] === 'chu-nhiem') return { view: 'homeroom' };
  if (parts[1] === 'giang-day') return { view: 'teaching' };
  if (parts[1] === 'lich-day') return { view: 'schedule' };
  if (parts[1] === 'hoc-ba') {
    if (parts[2] === 'lop' && parts[3]) return { view: 'gradebookClass', classId: decodeURIComponent(parts[3]) };
    if (parts[2] === 'hoc-sinh' && parts[3]) return { view: 'gradebookStudent', studentId: decodeURIComponent(parts[3]) };
    return { view: 'gradebook' };
  }
  if (parts[1] === 'hoc-sinh' && parts[2]) return { view: 'student', studentId: decodeURIComponent(parts[2]) };
  if (parts[1] === 'lop' && parts[2]) {
    const tab = CLASS_TABS.includes(parts[3]) ? parts[3] : 'hoc-sinh';
    return { view: 'class', classId: decodeURIComponent(parts[2]), tab };
  }
  return { view: 'overview' };
}

/** UI-level role flags; the backend re-checks every permission. Giám thị lives on the Điểm danh menu. */
export function homeroomRoles(session) {
  const level = session?.menuAccess?.homeroom;
  const isManager = Boolean(session?.isOperationalManager);
  return {
    isManager,
    isViewAll: !isManager && level === 'view_all',
  };
}
