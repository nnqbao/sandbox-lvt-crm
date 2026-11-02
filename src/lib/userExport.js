import * as XLSX from 'xlsx';

export const USER_EXPORT_HEADERS = [
  'Họ tên',
  'Email',
  'Mã tổ chuyên môn',
  'Tên tổ chuyên môn',
  'Mã chức vụ',
  'Tên chức vụ',
  'Mã nhóm quyền',
  'Tên nhóm quyền',
];

const EXPORT_SEQ_PREFIX = 'lvt-user-export-seq-';

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatExportDateStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}${m}${d}`;
}

/** Daily sequence stored in localStorage; resets automatically when the date stamp changes. */
export function nextUserExportSequence(dateStamp, storage = globalThis.localStorage) {
  const key = `${EXPORT_SEQ_PREFIX}${dateStamp}`;
  let current = 0;
  try {
    current = Number(storage?.getItem?.(key) || 0);
  } catch {
    current = 0;
  }
  if (!Number.isFinite(current) || current < 0) current = 0;
  const next = current + 1;
  try {
    storage?.setItem?.(key, String(next));
  } catch {
    // Ignore quota / private-mode failures; still return a sequence for this call.
  }
  return next;
}

export function buildUserExportFileName(date = new Date(), storage = globalThis.localStorage) {
  const stamp = formatExportDateStamp(date);
  const seq = nextUserExportSequence(stamp, storage);
  return `danh_sach_nguoi_dung_${stamp}_${pad2(seq)}.xlsx`;
}

/**
 * Active users only. Admin/moderator have empty permission-group code and
 * display name "Quản trị viên". No role/password columns.
 */
export function buildUserExportRows({
  users = [],
  departments = [],
  positions = [],
  permissionGroups = [],
} = {}) {
  const deptById = new Map(departments.map((d) => [String(d._id), d]));
  const posById = new Map(positions.map((p) => [String(p._id), p]));
  const groupById = new Map(permissionGroups.map((g) => [String(g._id), g]));

  return users
    .filter((user) => user.status === 'active')
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'))
    .map((user) => {
      const department = user.departmentId ? deptById.get(String(user.departmentId)) : null;
      const position = user.positionId ? posById.get(String(user.positionId)) : null;
      const isOpsManager = user.role === 'admin' || user.role === 'moderator';
      const group = !isOpsManager && user.permissionGroupId
        ? groupById.get(String(user.permissionGroupId))
        : null;

      return {
        'Họ tên': user.name || '',
        Email: user.email || '',
        'Mã tổ chuyên môn': department?.code || '',
        'Tên tổ chuyên môn': department?.name || '',
        'Mã chức vụ': position?.code || '',
        'Tên chức vụ': position?.name || '',
        'Mã nhóm quyền': isOpsManager ? '' : group?.code || '',
        'Tên nhóm quyền': isOpsManager ? 'Quản trị viên' : group?.name || '',
      };
    });
}

export function downloadActiveUsersWorkbook(catalog, options = {}) {
  const rows = buildUserExportRows(catalog);
  const sheet = XLSX.utils.json_to_sheet(rows, { header: USER_EXPORT_HEADERS });
  sheet['!cols'] = USER_EXPORT_HEADERS.map((header) => ({
    wch: Math.max(14, header.length + 2),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'nguoi_dung');
  const fileName =
    options.fileName ||
    buildUserExportFileName(options.date || new Date(), options.storage || globalThis.localStorage);
  XLSX.writeFile(workbook, fileName);
  return { fileName, rowCount: rows.length };
}
