import {
  assertEntityCode,
  describeDuplicateActiveCodes,
  describeInvalidEntityCodes,
  isValidEntityCode,
  normalizeEntityCode,
} from './entityCodes.js';

export const USER_IMPORT_HEADERS = [
  'ho_ten',
  'email',
  'ma_phong_ban',
  'ma_chuc_vu',
  'ma_nhom_quyen',
  'mat_khau_tam_thoi',
];

export const USER_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const USER_IMPORT_MIN_PASSWORD = 8;

export const USER_IMPORT_MESSAGES = {
  incomplete: 'Vui lòng điền đầy đủ các cột thông tin người dùng',
  lookup:
    'Thông tin [Tổ chuyên môn, Chức vụ, Nhóm quyền] không chính xác, vui lòng đảm bảo chính xác với hệ thống',
  duplicateEmail: 'Phát hiện email trùng, vui lòng kiểm tra lại',
  shortPassword: 'Mật khẩu tạm thời phải có ít nhất 8 ký tự',
  invalidEmail: 'Email không hợp lệ',
  invalidHeaders: 'File không đúng mẫu. Vui lòng dùng file nhập liệu mẫu của hệ thống.',
  fileTooLarge: 'File vượt quá giới hạn 2 MB.',
  invalidExtension: 'Chỉ chấp nhận file Excel (.xlsx).',
};

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return Boolean(email) && email.length <= 254 && /^\S+@\S+\.\S+$/.test(email);
}

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).trim();
  return String(value).trim();
}

function headerKey(value) {
  return cellText(value)
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/** Build lookup maps keyed by uppercase code for active entities only. */
export function buildCodeMaps({ departments = [], positions = [], permissionGroups = [] }) {
  const departmentsByCode = new Map();
  const positionsByCode = new Map();
  const groupsByCode = new Map();
  for (const item of departments.filter((d) => d.active !== false)) {
    if (!item.code) continue;
    departmentsByCode.set(normalizeEntityCode(item.code), item);
  }
  for (const item of positions.filter((p) => p.active !== false)) {
    if (!item.code) continue;
    positionsByCode.set(normalizeEntityCode(item.code), item);
  }
  for (const item of permissionGroups.filter((g) => g.active !== false)) {
    if (!item.code) continue;
    groupsByCode.set(normalizeEntityCode(item.code), item);
  }
  return { departmentsByCode, positionsByCode, groupsByCode };
}

/**
 * Validate import rows against catalogs and existing emails.
 * Returns { ok, errors, preview, invalidCatalog }.
 */
export function validateUserImportRows(rows, context) {
  const errors = [];
  const pushError = (rowNumber, message, detail) => {
    errors.push({ rowNumber, message, detail: detail || null });
  };

  const invalidCatalog = [
    ...describeInvalidEntityCodes(context.departments, 'Tổ chuyên môn'),
    ...describeInvalidEntityCodes(context.positions, 'Chức vụ'),
    ...describeInvalidEntityCodes(context.permissionGroups, 'Nhóm quyền'),
  ];
  const duplicateCatalog = [
    ...describeDuplicateActiveCodes(context.departments, 'Tổ chuyên môn'),
    ...describeDuplicateActiveCodes(context.positions, 'Chức vụ'),
    ...describeDuplicateActiveCodes(context.permissionGroups, 'Nhóm quyền'),
  ];
  if (invalidCatalog.length || duplicateCatalog.length) {
    for (const item of invalidCatalog) {
      pushError(
        0,
        `Mã ${item.label} không hợp lệ — vui lòng sửa trước khi import`,
        `${item.name} (mã hiện tại: ${item.code}). Mã tối đa 20 ký tự, chỉ gồm chữ, số, _ và -.`,
      );
    }
    for (const item of duplicateCatalog) {
      pushError(
        0,
        `Mã ${item.label} bị trùng — vui lòng sửa trước khi import`,
        `${item.name} (mã hiện tại: ${item.code}).`,
      );
    }
    return { ok: false, errors, preview: [], invalidCatalog: [...invalidCatalog, ...duplicateCatalog] };
  }

  const { departmentsByCode, positionsByCode, groupsByCode } = buildCodeMaps(context);
  const existingEmails = new Set((context.existingEmails || []).map(normalizeEmail).filter(Boolean));
  const seenInFile = new Map();
  const preview = [];

  if (!Array.isArray(rows) || rows.length === 0) {
    pushError(0, 'File không có dữ liệu người dùng.', null);
    return { ok: false, errors, preview: [], invalidCatalog };
  }

  rows.forEach((raw, index) => {
    const rowNumber = Number(raw.rowNumber) || index + 2; // header is row 1
    const name = cellText(raw.ho_ten ?? raw.name);
    const email = normalizeEmail(raw.email);
    const departmentCode = normalizeEntityCode(raw.ma_phong_ban);
    const positionCode = normalizeEntityCode(raw.ma_chuc_vu);
    const groupCode = normalizeEntityCode(raw.ma_nhom_quyen);
    const temporaryPassword = cellText(raw.mat_khau_tam_thoi);

    if (!name || !email || !departmentCode || !positionCode || !groupCode || !temporaryPassword) {
      pushError(rowNumber, USER_IMPORT_MESSAGES.incomplete, null);
      return;
    }

    if (!isValidEmail(email)) {
      pushError(rowNumber, USER_IMPORT_MESSAGES.invalidEmail, email);
      return;
    }

    if (temporaryPassword.length < USER_IMPORT_MIN_PASSWORD) {
      pushError(rowNumber, USER_IMPORT_MESSAGES.shortPassword, null);
    }

    const missingParts = [];
    const department = departmentsByCode.get(departmentCode);
    const position = positionsByCode.get(positionCode);
    const group = groupsByCode.get(groupCode);
    if (!department) missingParts.push('Tổ chuyên môn');
    if (!position) missingParts.push('Chức vụ');
    if (!group) missingParts.push('Nhóm quyền');
    if (missingParts.length) {
      pushError(
        rowNumber,
        USER_IMPORT_MESSAGES.lookup,
        `${missingParts.join(', ')} không khớp hệ thống (mã: ${[
          !department ? departmentCode : null,
          !position ? positionCode : null,
          !group ? groupCode : null,
        ]
          .filter(Boolean)
          .join(', ')}).`,
      );
    }

    if (seenInFile.has(email)) {
      pushError(
        rowNumber,
        USER_IMPORT_MESSAGES.duplicateEmail,
        `Trùng với dòng ${seenInFile.get(email)} trong file (${email}).`,
      );
    } else {
      seenInFile.set(email, rowNumber);
    }

    if (existingEmails.has(email)) {
      pushError(
        rowNumber,
        USER_IMPORT_MESSAGES.duplicateEmail,
        `Email đã tồn tại trong hệ thống (${email}).`,
      );
    }

    if (!errors.some((e) => e.rowNumber === rowNumber)) {
      preview.push({
        rowNumber,
        name,
        email,
        role: 'user',
        departmentCode,
        positionCode,
        permissionGroupCode: groupCode,
        departmentId: department?._id,
        positionId: position?._id,
        permissionGroupId: group?._id,
        departmentName: department?.name,
        positionName: position?.name,
        permissionGroupName: group?.name,
        temporaryPassword,
      });
    }
  });

  return { ok: errors.length === 0, errors, preview, invalidCatalog };
}

/** Map a sheet.js AoA / object rows into normalized import rows. */
export function rowsFromSheetMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) {
    return { headersOk: false, rows: [] };
  }
  const headers = (matrix[0] || []).map(headerKey);
  const expected = USER_IMPORT_HEADERS;
  const headersOk =
    expected.length === headers.length && expected.every((key, i) => headers[i] === key);
  if (!headersOk) {
    // Also accept if all required headers exist (order flexible)
    const set = new Set(headers.filter(Boolean));
    const flexibleOk = expected.every((key) => set.has(key));
    if (!flexibleOk) return { headersOk: false, rows: [] };
    const rows = [];
    for (let r = 1; r < matrix.length; r += 1) {
      const line = matrix[r] || [];
      if (line.every((cell) => cellText(cell) === '')) continue;
      const obj = { rowNumber: r + 1 };
      headers.forEach((key, i) => {
        if (key) obj[key] = cellText(line[i]);
      });
      rows.push(obj);
    }
    return { headersOk: true, rows };
  }

  const rows = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    if (line.every((cell) => cellText(cell) === '')) continue;
    const obj = { rowNumber: r + 1 };
    expected.forEach((key, i) => {
      obj[key] = cellText(line[i]);
    });
    rows.push(obj);
  }
  return { headersOk: true, rows };
}

export function assertImportFileMeta(file) {
  const name = String(file?.name || '').toLowerCase();
  const size = Number(file?.size || 0);
  if (!name.endsWith('.xlsx')) {
    return { ok: false, message: USER_IMPORT_MESSAGES.invalidExtension };
  }
  if (size <= 0 || size > USER_IMPORT_MAX_BYTES) {
    return { ok: false, message: USER_IMPORT_MESSAGES.fileTooLarge };
  }
  return { ok: true, message: null };
}

export { assertEntityCode, isValidEntityCode, normalizeEntityCode };
