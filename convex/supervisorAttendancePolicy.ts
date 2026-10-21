/**
 * Pure rules for the Điểm danh menu: Giám thị (menu `attendance` = `supervisor`) or admin/mod
 * marks each class present/absent; GVCN later flips absent rows to "Vắng không phép".
 * Backend modules (supervisorAttendance.ts) must re-check every rule here server-side.
 */
import { isSupervisorAccess } from "./menuAccess.ts";
import { classMatchKey } from "./attendanceImportValidate.ts";
import { cellTextPreserve } from "./studentRosterImportSheet.ts";
import { deriveEffectiveStatus } from "./studentAttendancePolicy.ts";

export const ATTENDANCE_SUPERVISOR_REQUIRED = "SUPERVISOR_REQUIRED";
export const ATTENDANCE_DATE_TODAY_ONLY = "ATTENDANCE_DATE_TODAY_ONLY";
export const ATTENDANCE_DATE_IN_FUTURE = "ATTENDANCE_DATE_IN_FUTURE";
export const ATTENDANCE_DATE_OUTSIDE_YEAR = "ATTENDANCE_DATE_OUTSIDE_YEAR";
export const ATTENDANCE_STUDENT_NOT_IN_CLASS = "ATTENDANCE_STUDENT_NOT_IN_CLASS";
export const ATTENDANCE_CAMERA_IMPORT_RETIRED = "ATTENDANCE_CAMERA_IMPORT_RETIRED";

export const SUPERVISOR_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const SUPERVISOR_IMPORT_TTL_MS = 60 * 60 * 1000;
export const SUPERVISOR_IMPORT_MAX_ROWS = 3000;
export const SUPERVISOR_IMPORT_HEADER_SCAN = 10;
export const SUPERVISOR_SAVE_MAX_ABSENT = 200;

export type SupervisorActor = {
  userId: string;
  role: string;
  status?: string;
  mustChangePassword?: boolean;
  menuAccess: Record<string, string | undefined>;
};

export function isAttendanceManager(actor: SupervisorActor): boolean {
  return actor.role === "admin" || actor.role === "moderator";
}

/** Admin/mod, or a permission group with menu `attendance` = `supervisor`. Not tied to homeroom. */
export function canUseSupervisorAttendance(actor: SupervisorActor): boolean {
  return isAttendanceManager(actor) || isSupervisorAccess(actor.menuAccess?.attendance);
}

export function assertSupervisorAttendanceActor(actor: SupervisorActor) {
  if (actor.status && actor.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (actor.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  if (!canUseSupervisorAttendance(actor)) throw new Error(ATTENDANCE_SUPERVISOR_REQUIRED);
}

/** Only admin/mod may look at or save another (past) date. */
export function canChooseAttendanceDate(actor: SupervisorActor): boolean {
  return isAttendanceManager(actor);
}

/** Reads: Giám thị sees today only; admin/mod any date up to today. */
export function assertReadableAttendanceDate(actor: SupervisorActor, date: string, today: string) {
  if (date > today) throw new Error(ATTENDANCE_DATE_IN_FUTURE);
  if (!canChooseAttendanceDate(actor) && date !== today) throw new Error(ATTENDANCE_DATE_TODAY_ONLY);
}

/** Writes: never future; Giám thị today only; admin/mod today or a past date inside the school year. */
export function assertWritableAttendanceDate(
  actor: SupervisorActor,
  date: string,
  today: string,
  year: { startDate: string; endDate: string },
) {
  assertReadableAttendanceDate(actor, date, today);
  if (date < year.startDate || date > year.endDate) throw new Error(ATTENDANCE_DATE_OUTSIDE_YEAR);
}

/** The year containing the date; the default (active) year wins when several overlap. */
export function pickSchoolYearForDate<T extends { startDate: string; endDate: string; active?: boolean }>(
  years: T[],
  date: string,
): T | null {
  const covering = years.filter((year) => year.startDate <= date && date <= year.endDate);
  return covering.find((year) => year.active) || covering[0] || null;
}

export type ExistingDay = {
  _id: string;
  studentId: string;
  rawObservation: string;
  disposition: string;
  effectiveStatus: string;
  reasonCode?: string;
  note?: string;
};

export type ClassEnrollment = {
  enrollmentId: string;
  studentId: string;
  classId: string;
  schoolYearId: string;
};

/**
 * Plans the writes for one class/day. Present → raw present + disposition none.
 * Absent → raw absent + "excused" by default, but an existing absent row already marked
 * "unexcused" by the GVCN stays unexcused. Every change of effective status on an existing row
 * yields a correction entry so history stays auditable.
 */
export function planSupervisorClassSave(args: {
  enrollments: ClassEnrollment[];
  existingDays: ExistingDay[];
  absentStudentIds: string[];
}) {
  const enrolledIds = new Set(args.enrollments.map((row) => row.studentId));
  const absent = new Set(args.absentStudentIds.map(String));
  if (absent.size > SUPERVISOR_SAVE_MAX_ABSENT) throw new Error("ATTENDANCE_TOO_MANY_ABSENT");
  for (const id of absent) {
    if (!enrolledIds.has(id)) throw new Error(ATTENDANCE_STUDENT_NOT_IN_CLASS);
  }
  const existingByStudent = new Map(args.existingDays.map((row) => [row.studentId, row]));
  const inserts: Array<ClassEnrollment & {
    rawObservation: string;
    disposition: string;
    effectiveStatus: string;
  }> = [];
  const patches: Array<{
    dayId: string;
    studentId: string;
    rawObservation: string;
    disposition: string;
    effectiveStatus: string;
    reasonCode?: string;
    note?: string;
  }> = [];
  const corrections: Array<{
    dayId: string;
    studentId: string;
    previousDisposition: string;
    nextDisposition: string;
    previousEffectiveStatus: string;
    nextEffectiveStatus: string;
  }> = [];
  for (const enrollment of args.enrollments) {
    const isAbsent = absent.has(enrollment.studentId);
    const existing = existingByStudent.get(enrollment.studentId);
    const rawObservation = isAbsent ? "absent" : "present";
    const keepUnexcused = Boolean(
      isAbsent && existing && existing.rawObservation === "absent" && existing.disposition === "unexcused",
    );
    const disposition = isAbsent ? (keepUnexcused ? "unexcused" : "excused") : "none";
    const effectiveStatus = deriveEffectiveStatus(rawObservation, disposition);
    if (!existing) {
      inserts.push({ ...enrollment, rawObservation, disposition, effectiveStatus });
      continue;
    }
    const unchanged =
      existing.rawObservation === rawObservation
      && existing.disposition === disposition
      && existing.effectiveStatus === effectiveStatus;
    if (unchanged) continue;
    // A student marked present again loses the absence reason/note; a kept absence keeps it.
    patches.push({
      dayId: existing._id,
      studentId: enrollment.studentId,
      rawObservation,
      disposition,
      effectiveStatus,
      reasonCode: isAbsent ? existing.reasonCode : undefined,
      note: isAbsent ? existing.note : undefined,
    });
    if (existing.effectiveStatus !== effectiveStatus) {
      corrections.push({
        dayId: existing._id,
        studentId: enrollment.studentId,
        previousDisposition: existing.disposition,
        nextDisposition: disposition,
        previousEffectiveStatus: existing.effectiveStatus,
        nextEffectiveStatus: effectiveStatus,
      });
    }
  }
  const absentCount = args.enrollments.filter((row) => absent.has(row.studentId)).length;
  return {
    inserts,
    patches,
    corrections,
    absentCount,
    presentCount: args.enrollments.length - absentCount,
  };
}

/* ------------------------------ Excel import ------------------------------ */

export const SUPERVISOR_IMPORT_HEADERS = ["Lớp học", "Tên học sinh", "Vắng"] as const;
type SupervisorColumn = "className" | "studentName" | "absent";
const HEADER_ALIASES: Record<SupervisorColumn, string[]> = {
  className: ["lop_hoc", "lop", "ten_lop", "ma_lop"],
  studentName: ["ten_hoc_sinh", "ho_va_ten", "ho_ten", "ho_ten_hoc_sinh", "hoc_sinh"],
  absent: ["vang"],
};

export function supervisorHeaderKey(value: unknown) {
  return cellTextPreserve(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export type SupervisorImportRow = {
  rowNumber: number;
  className: string;
  studentName: string;
  absent: string;
};

/** First row (within the first 10) holding all three headers wins. Blank rows are skipped. */
export function rowsFromSupervisorMatrix(matrix: unknown[][]):
  | { ok: true; rows: SupervisorImportRow[] }
  | { ok: false; message: string } {
  const limit = Math.min(matrix.length, SUPERVISOR_IMPORT_HEADER_SCAN);
  let headerRow = -1;
  let columns: Record<SupervisorColumn, number> | null = null;
  for (let r = 0; r < limit && !columns; r += 1) {
    const keys = (matrix[r] || []).map(supervisorHeaderKey);
    const found = {} as Record<SupervisorColumn, number>;
    for (const key of Object.keys(HEADER_ALIASES) as SupervisorColumn[]) {
      found[key] = keys.findIndex((header) => header && HEADER_ALIASES[key].includes(header));
    }
    if (Object.values(found).every((index) => index >= 0)) {
      columns = found;
      headerRow = r;
    }
  }
  if (!columns) return { ok: false, message: "SUPERVISOR_IMPORT_HEADERS" };
  const rows: SupervisorImportRow[] = [];
  for (let r = headerRow + 1; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    if (line.every((value) => cellTextPreserve(value) === "")) continue;
    if (rows.length >= SUPERVISOR_IMPORT_MAX_ROWS) return { ok: false, message: "IMPORT_TOO_MANY_ROWS" };
    rows.push({
      rowNumber: r + 1,
      className: cellTextPreserve(line[columns.className]),
      studentName: cellTextPreserve(line[columns.studentName]),
      absent: cellTextPreserve(line[columns.absent]),
    });
  }
  if (!rows.length) return { ok: false, message: "IMPORT_FILE_EMPTY" };
  return { ok: true, rows };
}

/** Họ tên không phân biệt dấu / hoa thường / khoảng trắng (Thuỳ = Thùy = THUY). */
export function studentNameKey(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, "");
}

/** "" = có mặt, "x"/"X" = vắng, anything else = invalid. */
export function parseAbsentCell(value: string): boolean | null {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text === "x" || text === "X") return true;
  return null;
}

export type SupervisorImportError = { rowNumber: number; code: string; message: string };

export type SupervisorImportContext = {
  classes: Array<{ classId: string; code: string; name: string }>;
  students: Array<{ studentId: string; classId: string; fullName: string }>;
};

/**
 * All-or-nothing validation. Classes are matched by name or code ("6/1" ~ "6-1"), students by
 * normalized full name among those enrolled in that class on the date. Students of a class in the
 * file but missing from it count as present; classes absent from the file are untouched.
 */
export function validateSupervisorImportRows(rows: SupervisorImportRow[], context: SupervisorImportContext) {
  const errors: SupervisorImportError[] = [];
  const classByKey = new Map<string, SupervisorImportContext["classes"][number]>();
  for (const klass of context.classes) classByKey.set(classMatchKey(klass.code), klass);
  for (const klass of context.classes) classByKey.set(classMatchKey(klass.name), klass);
  const studentsByClass = new Map<string, Map<string, string[]>>();
  for (const student of context.students) {
    const byName = studentsByClass.get(student.classId) || new Map<string, string[]>();
    const key = studentNameKey(student.fullName);
    byName.set(key, [...(byName.get(key) || []), student.studentId]);
    studentsByClass.set(student.classId, byName);
  }
  const seen = new Map<string, number>();
  const absentByClass = new Map<string, Set<string>>();
  for (const row of rows) {
    const push = (code: string, message: string) => errors.push({ rowNumber: row.rowNumber, code, message });
    if (!row.className.trim()) {
      push("CLASS_REQUIRED", "Thiếu Lớp học.");
      continue;
    }
    const klass = classByKey.get(classMatchKey(row.className));
    if (!klass) {
      push("CLASS_NOT_FOUND", `Không tìm thấy lớp “${row.className}” trong năm học.`);
      continue;
    }
    if (!absentByClass.has(klass.classId)) absentByClass.set(klass.classId, new Set());
    const isAbsent = parseAbsentCell(row.absent);
    if (isAbsent === null) push("INVALID_ABSENT_VALUE", `Cột Vắng chỉ nhận “x” hoặc để trống (đang là “${row.absent}”).`);
    if (!row.studentName.trim()) {
      push("STUDENT_REQUIRED", "Thiếu Tên học sinh.");
      continue;
    }
    const nameKey = studentNameKey(row.studentName);
    const matches = studentsByClass.get(klass.classId)?.get(nameKey) || [];
    if (!matches.length) {
      push("STUDENT_NOT_FOUND", `Không có học sinh “${row.studentName}” trong lớp ${klass.name}.`);
      continue;
    }
    if (matches.length > 1) {
      push("STUDENT_AMBIGUOUS", `Lớp ${klass.name} có ${matches.length} học sinh trùng tên “${row.studentName}”. Hãy điểm danh lớp này trên phần mềm.`);
      continue;
    }
    const dupKey = `${klass.classId}|${nameKey}`;
    const firstRow = seen.get(dupKey);
    if (firstRow) {
      push("DUPLICATE_ROW", `Học sinh “${row.studentName}” lớp ${klass.name} bị lặp (đã có ở dòng ${firstRow}).`);
      continue;
    }
    seen.set(dupKey, row.rowNumber);
    if (isAbsent) absentByClass.get(klass.classId)!.add(matches[0]);
  }
  const classes = context.classes
    .filter((klass) => absentByClass.has(klass.classId))
    .map((klass) => {
      const roster = context.students.filter((student) => student.classId === klass.classId);
      const absentIds = absentByClass.get(klass.classId)!;
      return {
        classId: klass.classId,
        code: klass.code,
        name: klass.name,
        rosterCount: roster.length,
        absentCount: absentIds.size,
        presentCount: roster.length - absentIds.size,
        absentStudentIds: [...absentIds],
        absentNames: roster.filter((student) => absentIds.has(student.studentId)).map((student) => student.fullName),
      };
    });
  return { ok: errors.length === 0 && rows.length > 0, errors, classes, totalRows: rows.length };
}
