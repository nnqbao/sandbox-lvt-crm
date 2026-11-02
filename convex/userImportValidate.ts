import {
  isValidEntityCode,
  listDuplicateActiveCodes,
  listInvalidActiveCodes,
  normalizeEntityCode,
} from "./entityCodes";

export const USER_IMPORT_MIN_PASSWORD = 8;

export const USER_IMPORT_MESSAGES = {
  incomplete: "Vui lòng điền đầy đủ các cột thông tin người dùng",
  lookup:
    "Thông tin [Tổ chuyên môn, Chức vụ, Nhóm quyền] không chính xác, vui lòng đảm bảo chính xác với hệ thống",
  duplicateEmail: "Phát hiện email trùng, vui lòng kiểm tra lại",
  shortPassword: "Mật khẩu tạm thời phải có ít nhất 8 ký tự",
  invalidEmail: "Email không hợp lệ",
} as const;

export type ImportRowInput = {
  rowNumber: number;
  ho_ten?: string;
  email?: string;
  ma_phong_ban?: string;
  ma_chuc_vu?: string;
  ma_nhom_quyen?: string;
  mat_khau_tam_thoi?: string;
};

function normalizeEmail(email: string) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email: string) {
  return Boolean(email) && email.length <= 254 && /^\S+@\S+\.\S+$/.test(email);
}

function cellText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim();
  return String(value).trim();
}

export function validateUserImportRows(
  rows: ImportRowInput[],
  context: {
    departments: { _id: string; name: string; code: string; active: boolean }[];
    positions: { _id: string; name: string; code: string; active: boolean }[];
    permissionGroups: { _id: string; name: string; code?: string; active: boolean }[];
    existingEmails: string[];
  },
) {
  const errors: { rowNumber: number; message: string; detail: string | null }[] = [];
  const pushError = (rowNumber: number, message: string, detail: string | null = null) => {
    errors.push({ rowNumber, message, detail });
  };

  const groupsForCatalog = context.permissionGroups.map((g) => ({ ...g, code: g.code || "" }));
  const invalidCatalog = [
    ...listInvalidActiveCodes(context.departments, "Tổ chuyên môn"),
    ...listInvalidActiveCodes(context.positions, "Chức vụ"),
    ...listInvalidActiveCodes(groupsForCatalog, "Nhóm quyền"),
  ];
  const duplicateCatalog = [
    ...listDuplicateActiveCodes(context.departments, "Tổ chuyên môn"),
    ...listDuplicateActiveCodes(context.positions, "Chức vụ"),
    ...listDuplicateActiveCodes(groupsForCatalog, "Nhóm quyền"),
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
    return { ok: false as const, errors, preview: [] as const };
  }

  const departmentsByCode = new Map(
    context.departments
      .filter((d) => d.active)
      .map((d) => [normalizeEntityCode(d.code), d] as const),
  );
  const positionsByCode = new Map(
    context.positions
      .filter((p) => p.active)
      .map((p) => [normalizeEntityCode(p.code), p] as const),
  );
  const groupsByCode = new Map(
    context.permissionGroups
      .filter((g) => g.active && g.code)
      .map((g) => [normalizeEntityCode(g.code), g] as const),
  );
  const existingEmails = new Set(context.existingEmails.map(normalizeEmail).filter(Boolean));
  const seenInFile = new Map<string, number>();
  const preview: {
    rowNumber: number;
    name: string;
    email: string;
    role: "user";
    departmentCode: string;
    positionCode: string;
    permissionGroupCode: string;
    departmentId: string;
    positionId: string;
    permissionGroupId: string;
    departmentName: string;
    positionName: string;
    permissionGroupName: string;
    temporaryPassword: string;
  }[] = [];

  if (!rows.length) {
    pushError(0, "File không có dữ liệu người dùng.");
    return { ok: false as const, errors, preview: [] };
  }

  rows.forEach((raw, index) => {
    const rowNumber = Number(raw.rowNumber) || index + 2;
    const name = cellText(raw.ho_ten);
    const email = normalizeEmail(cellText(raw.email));
    const departmentCode = normalizeEntityCode(cellText(raw.ma_phong_ban));
    const positionCode = normalizeEntityCode(cellText(raw.ma_chuc_vu));
    const groupCode = normalizeEntityCode(cellText(raw.ma_nhom_quyen));
    const temporaryPassword = cellText(raw.mat_khau_tam_thoi);

    if (!name || !email || !departmentCode || !positionCode || !groupCode || !temporaryPassword) {
      pushError(rowNumber, USER_IMPORT_MESSAGES.incomplete);
      return;
    }
    if (!isValidEmail(email)) {
      pushError(rowNumber, USER_IMPORT_MESSAGES.invalidEmail, email);
      return;
    }
    if (temporaryPassword.length < USER_IMPORT_MIN_PASSWORD) {
      pushError(rowNumber, USER_IMPORT_MESSAGES.shortPassword);
    }

    const department = departmentsByCode.get(departmentCode);
    const position = positionsByCode.get(positionCode);
    const group = groupsByCode.get(groupCode);
    const missingParts: string[] = [];
    if (!department) missingParts.push("Tổ chuyên môn");
    if (!position) missingParts.push("Chức vụ");
    if (!group) missingParts.push("Nhóm quyền");
    if (missingParts.length) {
      pushError(
        rowNumber,
        USER_IMPORT_MESSAGES.lookup,
        `${missingParts.join(", ")} không khớp hệ thống (mã: ${[
          !department ? departmentCode : null,
          !position ? positionCode : null,
          !group ? groupCode : null,
        ]
          .filter(Boolean)
          .join(", ")}).`,
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

    if (!errors.some((e) => e.rowNumber === rowNumber) && department && position && group) {
      preview.push({
        rowNumber,
        name,
        email,
        role: "user",
        departmentCode,
        positionCode,
        permissionGroupCode: groupCode,
        departmentId: department._id,
        positionId: position._id,
        permissionGroupId: group._id,
        departmentName: department.name,
        positionName: position.name,
        permissionGroupName: group.name,
        temporaryPassword,
      });
    }
  });

  return { ok: errors.length === 0, errors, preview };
}

export { isValidEntityCode, normalizeEntityCode };
