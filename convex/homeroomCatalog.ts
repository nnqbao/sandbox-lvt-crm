import {
  addDaysYmd,
  compareYmd,
  dateInRange,
  isYmd,
  isHm,
  DEFAULT_ATTENDANCE_UPLOAD_DUE_TIME,
} from "./homeroomTime.ts";

export const SCHOOL_YEAR_NAME_TAKEN = "SCHOOL_YEAR_NAME_TAKEN";
export const SCHOOL_YEAR_OVERLAP = "SCHOOL_YEAR_OVERLAP";
export const SCHOOL_YEAR_LOCKED = "SCHOOL_YEAR_LOCKED";
export const SCHOOL_YEAR_DELETE_DEFAULT = "SCHOOL_YEAR_DELETE_DEFAULT";
export const SCHOOL_YEAR_DELETE_LOCKED = "SCHOOL_YEAR_DELETE_LOCKED";
export const SCHOOL_YEAR_DELETE_IN_USE = "SCHOOL_YEAR_DELETE_IN_USE";
export const CLASS_CODE_TAKEN = "CLASS_CODE_TAKEN";
export const INVALID_GRADE_LEVEL = "INVALID_GRADE_LEVEL";
export const INVALID_CLASS_CODE = "INVALID_CLASS_CODE";
export const HOMEROOM_TEACHER_OVERLAP = "HOMEROOM_TEACHER_OVERLAP";
export const DUPLICATE_ACTIVE_ENROLLMENT = "DUPLICATE_ACTIVE_ENROLLMENT";
export const ENROLLMENT_YEAR_MISMATCH = "ENROLLMENT_YEAR_MISMATCH";
export const TRANSFER_BEFORE_START = "TRANSFER_BEFORE_START";
export const ASSIGNMENT_BEFORE_START = "ASSIGNMENT_BEFORE_START";

export const DEFAULT_GRADE_MIN = 6;
export const DEFAULT_GRADE_MAX = 9;

export type SchoolYearRow = {
  _id?: string;
  name: string;
  startDate: string;
  endDate: string;
  attendanceUploadDueTime?: string;
  active: boolean;
  lockedAt?: number;
};

export type ClassRow = {
  _id?: string;
  schoolYearId: string;
  code: string;
  name: string;
  gradeLevel: number;
  status: string;
};

export type EnrollmentRow = {
  _id?: string;
  studentId: string;
  classId: string;
  schoolYearId: string;
  startDate: string;
  endDate?: string;
  status: string;
};

export function normalizeSchoolYearName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function normalizeClassCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isValidClassCode(code: string): boolean {
  const normalized = normalizeClassCode(code);
  return normalized.length > 0 && normalized.length <= 20 && /^[A-Z0-9_-]+$/.test(normalized);
}

export function validateSchoolYearInput(args: {
  name: string;
  startDate: string;
  endDate: string;
  attendanceUploadDueTime?: string;
}) {
  const name = normalizeSchoolYearName(args.name);
  if (!name || name.length > 40) throw new Error("INVALID_NAME");
  if (!isYmd(args.startDate) || !isYmd(args.endDate)) throw new Error("INVALID_DATE");
  if (compareYmd(args.startDate, args.endDate) > 0) throw new Error("END_BEFORE_START");
  const attendanceUploadDueTime = args.attendanceUploadDueTime || DEFAULT_ATTENDANCE_UPLOAD_DUE_TIME;
  if (!isHm(attendanceUploadDueTime)) throw new Error("INVALID_TIME");
  return { name, startDate: args.startDate, endDate: args.endDate, attendanceUploadDueTime };
}

export function findOverlappingActiveYear(
  years: SchoolYearRow[],
  candidate: { startDate: string; endDate: string; active: boolean },
  excludeId?: string,
): SchoolYearRow | null {
  if (!candidate.active) return null;
  return (
    years.find((year) => {
      if (!year.active) return false;
      if (excludeId && year._id === excludeId) return false;
      return compareYmd(candidate.startDate, year.endDate) <= 0 && compareYmd(candidate.endDate, year.startDate) >= 0;
    }) || null
  );
}

export function assertSchoolYearEditable(year: { lockedAt?: number }) {
  if (year.lockedAt) throw new Error(SCHOOL_YEAR_LOCKED);
}

/**
 * Các bảng tham chiếu `schoolYearId`. Năm học chỉ xoá được khi KHÔNG bảng nào còn dòng của năm đó
 * (lịch nghỉ `schoolCalendarDays` là dữ liệu riêng của năm, được xoá cùng năm học).
 */
export const SCHOOL_YEAR_USAGE_TABLES = [
  "homeroomClasses",
  "classEnrollments",
  "homeroomAssignments",
  "studentAttendanceDays",
  "attendanceImportUploads",
  "studentRosterImportUploads",
  "attendanceClassDays",
  "supervisorAttendanceUploads",
] as const;

/**
 * Lý do không được xoá năm học (mã lỗi) hoặc `null` nếu xoá được.
 * Thứ tự: năm mặc định → năm đã khóa → còn dữ liệu (kèm danh sách bảng, vd. `SCHOOL_YEAR_DELETE_IN_USE:homeroomClasses`).
 */
export function schoolYearRemovalBlocker(
  year: { active?: boolean; lockedAt?: number },
  usedBy: readonly string[] = [],
): string | null {
  if (year.active) return SCHOOL_YEAR_DELETE_DEFAULT;
  if (year.lockedAt) return SCHOOL_YEAR_DELETE_LOCKED;
  const tables = SCHOOL_YEAR_USAGE_TABLES.filter((table) => usedBy.includes(table));
  if (tables.length) return `${SCHOOL_YEAR_DELETE_IN_USE}:${tables.join(",")}`;
  return null;
}

export function validateClassInput(args: { code: string; name: string; gradeLevel: number }) {
  const code = normalizeClassCode(args.code);
  const name = args.name.trim();
  if (!isValidClassCode(code)) throw new Error(INVALID_CLASS_CODE);
  if (!name || name.length > 120) throw new Error("INVALID_NAME");
  if (
    !Number.isInteger(args.gradeLevel) ||
    args.gradeLevel < DEFAULT_GRADE_MIN ||
    args.gradeLevel > DEFAULT_GRADE_MAX
  ) {
    throw new Error(INVALID_GRADE_LEVEL);
  }
  return { code, name, gradeLevel: args.gradeLevel };
}

export function findDuplicateClassCode(
  classes: ClassRow[],
  args: { schoolYearId: string; code: string },
  excludeId?: string,
): ClassRow | null {
  const code = normalizeClassCode(args.code);
  return (
    classes.find(
      (row) =>
        row.schoolYearId === args.schoolYearId &&
        normalizeClassCode(row.code) === code &&
        row.status !== "archived" &&
        row._id !== excludeId,
    ) || null
  );
}

export function findOverlappingHomeroomTeacher(
  assignments: Array<{
    _id?: string;
    classId: string;
    assignmentType: string;
    active: boolean;
    effectiveFrom: string;
    effectiveTo?: string;
    userId: string;
  }>,
  args: { classId: string; effectiveFrom: string; effectiveTo?: string; userId?: string },
) {
  return assignments.find((row) => {
    if (!row.active || row.assignmentType !== "homeroom_teacher" || row.classId !== args.classId) return false;
    const startOk = !args.effectiveTo || row.effectiveFrom <= args.effectiveTo;
    const endOk = !row.effectiveTo || args.effectiveFrom <= row.effectiveTo;
    return startOk && endOk;
  });
}

/**
 * Inclusive date coverage for enrollments and teacher assignments.
 *
 * Contract: a transfer or GVCN replacement date belongs only to the new
 * class/teacher. The old row ends the day before (`addDaysYmd(date, -1)`),
 * so every prior date stays on the old row and the boundary date is not
 * shared. `endDate` / `effectiveTo` remain inclusive. A GVCN replacement
 * keeps the outgoing row `active: true`; `active: false` is reserved for
 * revocation that must erase current and future access.
 */
export function enrollmentCoversDate(
  enrollment: { startDate: string; endDate?: string },
  date: string,
): boolean {
  return dateInRange(date, enrollment.startDate, enrollment.endDate);
}

export function enrollmentsCoveringDate<T extends { classId: string; startDate: string; endDate?: string }>(
  enrollments: T[],
  args: { classId: string; date: string },
): T[] {
  return enrollments.filter(
    (row) => row.classId === args.classId && enrollmentCoversDate(row, args.date),
  );
}

export function assertSingleActiveEnrollment(
  enrollments: EnrollmentRow[],
  args: { studentId: string; schoolYearId: string },
  excludeId?: string,
) {
  const conflict = enrollments.find(
    (row) =>
      row.studentId === args.studentId &&
      row.schoolYearId === args.schoolYearId &&
      row.status === "active" &&
      !row.endDate &&
      row._id !== excludeId,
  );
  if (conflict) throw new Error(DUPLICATE_ACTIVE_ENROLLMENT);
}

export function planStudentTransfer(args: {
  enrollment: EnrollmentRow;
  toClassId: string;
  date: string;
  reason?: string;
}) {
  if (args.enrollment.schoolYearId && args.enrollment.status !== "active") {
    throw new Error("ENROLLMENT_NOT_ACTIVE");
  }
  if (args.enrollment.classId === args.toClassId) throw new Error("INVALID_TRANSFER");
  if (compareYmd(args.date, args.enrollment.startDate) < 0) {
    throw new Error(TRANSFER_BEFORE_START);
  }
  return {
    close: {
      endDate: addDaysYmd(args.date, -1),
      status: "transferred",
      transferReason: args.reason?.trim() || undefined,
    },
    open: {
      studentId: args.enrollment.studentId,
      classId: args.toClassId,
      schoolYearId: args.enrollment.schoolYearId,
      startDate: args.date,
      status: "active",
    },
  };
}

export function toAssignmentCandidate(user: {
  _id: unknown;
  name?: string | null;
  role: string;
}): { _id: string; name: string; role: string } {
  return {
    _id: String(user._id),
    name: String(user.name || "").trim(),
    role: user.role,
  };
}

export function isActiveAssignmentCandidate(user: { status?: string }): boolean {
  return user.status === "active";
}

export function toSafeAssignmentUser(
  user: { _id?: unknown; name?: string | null; role?: string } | null | undefined,
  userId: string,
): { _id: string; name: string; role: string } {
  return {
    _id: user ? String(user._id) : String(userId),
    name: String(user?.name || "").trim() || "Người dùng không còn hoạt động",
    role: user?.role || "",
  };
}

export function planHomeroomTeacherReplacement(args: {
  assignment: { effectiveFrom: string };
  date: string;
}) {
  if (compareYmd(args.date, args.assignment.effectiveFrom) < 0) {
    throw new Error(ASSIGNMENT_BEFORE_START);
  }
  return {
    close: {
      effectiveTo: addDaysYmd(args.date, -1),
      active: true,
    },
  };
}
