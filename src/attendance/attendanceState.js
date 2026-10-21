/** Pure helpers for the Điểm danh page (tests/attendance-page.test.mjs). */

export const GRADE_TABS = [6, 7, 8, 9];
export const GRADE_TAB_STORAGE_KEY = 'lvt.attendance.gradeTab';
export const SUPERVISOR_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Last chosen "Lớp N" tab; storage may be missing or throw (private mode) → Lớp 6. */
export function readStoredGrade(storage = globalThis.localStorage) {
  try {
    const value = Number(storage?.getItem(GRADE_TAB_STORAGE_KEY));
    return GRADE_TABS.includes(value) ? value : GRADE_TABS[0];
  } catch {
    return GRADE_TABS[0];
  }
}

export function writeStoredGrade(grade, storage = globalThis.localStorage) {
  try {
    storage?.setItem(GRADE_TAB_STORAGE_KEY, String(grade));
  } catch {
    // Per-viewer convenience only.
  }
}

/** HH:mm in Asia/Ho_Chi_Minh (fixed UTC+7). */
export function vietnamHm(ms) {
  if (!ms) return '';
  return new Date(Number(ms) + VIETNAM_UTC_OFFSET_MS).toISOString().slice(11, 16);
}

export function classStatusText(saved) {
  return saved ? `Đã lưu ${vietnamHm(saved.savedAt)} · ${saved.absentCount} vắng` : 'Chưa điểm danh';
}

export function absentIdsOf(students) {
  return new Set((students || []).filter((row) => row.absent).map((row) => row.studentId));
}

export function sameIdSet(a, b) {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export function toggleId(set, id) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function classesForGrade(roster, grade) {
  return roster?.grades?.find((row) => row.gradeLevel === grade)?.classes || [];
}

export function templateFileName(date) {
  return `mau_diem_danh_${String(date || '').replaceAll('-', '')}.xlsx`;
}

/** Client-side pre-check only; the server re-validates type and size. */
export function precheckImportFile(file) {
  if (!file) return 'Hãy chọn file Excel.';
  if (!file.name.toLowerCase().endsWith('.xlsx')) return 'Chỉ nhận file Excel .xlsx theo mẫu điểm danh.';
  if (!file.size) return 'File trống.';
  if (file.size > SUPERVISOR_IMPORT_MAX_BYTES) return 'File vượt quá 2 MB.';
  return '';
}
