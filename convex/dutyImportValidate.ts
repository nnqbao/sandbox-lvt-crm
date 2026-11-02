import { normalizeDutyClock } from "./assignmentPolicy.ts";
import { cleanDutyInput, evaluateDutyRefs } from "./dutyWritePolicy.ts";
import { normalizeEntityCode } from "./entityCodes.ts";
import { parseFlexibleSchoolDate } from "./homeroomTime.ts";
import {
  DUTY_IMPORT_DEFAULT_END_TIME,
  DUTY_IMPORT_DEFAULT_START_TIME,
  DUTY_IMPORT_MAX_ROWS,
  splitCommaList,
  type DutySheetRow,
} from "./dutyImportSheet.ts";

export const DUTY_IMPORT_MESSAGES = {
  invalidHeaders: "File không đúng mẫu. Vui lòng dùng file nhập liệu mẫu của hệ thống.",
  emptyFile: "File không có dữ liệu công tác.",
  tooManyRows: `File vượt quá ${DUTY_IMPORT_MAX_ROWS} dòng. Hãy tách thành nhiều file.`,
  titleRequired: "Vui lòng điền tên công tác.",
  titleInvalid: "Tên công tác không hợp lệ (tối đa 200 ký tự).",
  contentRequired: "Vui lòng điền nội dung công tác.",
  contentInvalid: "Nội dung công tác không hợp lệ (tối đa 200 ký tự).",
  locationRequired: "Vui lòng điền địa điểm.",
  locationInvalid: "Địa điểm không hợp lệ (tối đa 200 ký tự).",
  invalidStartDate: "Ngày bắt đầu không hợp lệ. Dùng YYYY-MM-DD hoặc dd/mm/yyyy.",
  invalidEndDate: "Ngày kết thúc không hợp lệ. Dùng YYYY-MM-DD hoặc dd/mm/yyyy.",
  invalidStartTime: "Giờ bắt đầu không hợp lệ. Dùng HH:mm.",
  invalidEndTime: "Giờ kết thúc không hợp lệ. Dùng HH:mm.",
  missingStartTime: "Vui lòng điền giờ bắt đầu (hoặc đánh dấu ca_ngay).",
  missingEndTime: "Vui lòng điền giờ kết thúc (hoặc đánh dấu ca_ngay).",
  missingEndDate: "Vui lòng điền ngày kết thúc (hoặc đánh dấu ca_ngay).",
  invalidAllDay: "Cột ca_ngay không hợp lệ. Dùng 1/0, có/không, true/false.",
  endBeforeStart: "Thời gian kết thúc phải sau thời gian bắt đầu.",
  participantsRequired: "Mỗi công tác cần ít nhất một mã tổ chuyên môn (cột ma_phong_ban), một email tham gia, hoặc thành phần khác.",
  otherParticipantsInvalid: "Thành phần khác tối đa 500 ký tự.",
  invalidDepartment: "Mã tổ chuyên môn không chính xác, vui lòng đảm bảo trùng với hệ thống.",
  departmentForbidden: "Tổ trưởng/tổ phó không được gán công tác theo tổ chuyên môn. Hãy dùng cột email_tham_gia.",
  invalidParticipant: "Email tham gia không chính xác hoặc tài khoản không còn hoạt động.",
  notSubordinate: "Chỉ được gán email cấp dưới cùng tổ chuyên môn.",
  invalidEmail: "Email tham gia không hợp lệ.",
} as const;

export type DutyImportError = {
  rowNumber: number;
  message: string;
  detail: string | null;
};

export type DutyImportPreviewRow = {
  rowNumber: number;
  title: string;
  content: string;
  locationText: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  departmentIds: string[];
  departmentCodes: string[];
  departmentNames: string[];
  participantUserIds: string[];
  participantEmails: string[];
  participantNames: string[];
  otherParticipants: string;
};

export type DutyImportActor = {
  user: { _id: string; departmentId?: string; positionId?: string };
  isOps: boolean;
  positions: { _id: string; level: number; active: boolean }[];
};

const TIME_RE = /^\d{2}:\d{2}$/;

function normalizeEmail(email: string) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email: string) {
  return Boolean(email) && email.length <= 254 && /^\S+@\S+\.\S+$/.test(email);
}

export function parseDutyAllDayFlag(value: unknown): { ok: true; value: boolean } | { ok: false } {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d");
  if (!raw) return { ok: true, value: false };
  if (["1", "x", "co", "true", "yes", "y"].includes(raw)) return { ok: true, value: true };
  if (["0", "khong", "false", "no", "n"].includes(raw)) return { ok: true, value: false };
  return { ok: false };
}

export function parseDutyImportClock(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  const normalized = normalizeDutyClock(text);
  if (!TIME_RE.test(normalized)) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  return normalized;
}

function messageForCleanError(code: string) {
  if (code === "INVALID_DUTY_TITLE") return DUTY_IMPORT_MESSAGES.titleInvalid;
  if (code === "INVALID_CONTENT") return DUTY_IMPORT_MESSAGES.contentInvalid;
  if (code === "INVALID_LOCATION") return DUTY_IMPORT_MESSAGES.locationInvalid;
  if (code === "INVALID_OTHER_PARTICIPANTS") return DUTY_IMPORT_MESSAGES.otherParticipantsInvalid;
  if (code === "INVALID_DATE") return DUTY_IMPORT_MESSAGES.invalidStartDate;
  if (code === "INVALID_TIME") return DUTY_IMPORT_MESSAGES.invalidStartTime;
  if (code === "END_BEFORE_START") return DUTY_IMPORT_MESSAGES.endBeforeStart;
  return code;
}

function messageForRefError(code: string) {
  if (code === "DUTY_DEPARTMENT_FORBIDDEN") return DUTY_IMPORT_MESSAGES.departmentForbidden;
  if (code === "INVALID_DEPARTMENT") return DUTY_IMPORT_MESSAGES.invalidDepartment;
  if (code === "INVALID_PARTICIPANT") return DUTY_IMPORT_MESSAGES.invalidParticipant;
  if (code === "NOT_A_SUBORDINATE") return DUTY_IMPORT_MESSAGES.notSubordinate;
  if (code === "DUTY_PARTICIPANTS_REQUIRED") return DUTY_IMPORT_MESSAGES.participantsRequired;
  return code;
}

export function validateDutyImportRows(
  rows: DutySheetRow[],
  context: {
    actor: DutyImportActor;
    departments: { _id: string; name: string; code?: string; active: boolean }[];
    users: {
      _id: string;
      name?: string;
      email?: string;
      status: string;
      departmentId?: string;
      positionId?: string;
    }[];
  },
): { ok: boolean; errors: DutyImportError[]; preview: DutyImportPreviewRow[] } {
  const errors: DutyImportError[] = [];
  const pushError = (rowNumber: number, message: string, detail: string | null = null) => {
    errors.push({ rowNumber, message, detail });
  };

  if (!rows.length) {
    pushError(0, DUTY_IMPORT_MESSAGES.emptyFile);
    return { ok: false, errors, preview: [] };
  }
  if (rows.length > DUTY_IMPORT_MAX_ROWS) {
    pushError(0, DUTY_IMPORT_MESSAGES.tooManyRows, String(rows.length));
    return { ok: false, errors, preview: [] };
  }

  const departmentsByCode = new Map(
    context.departments
      .filter((d) => d.active && d.code)
      .map((d) => [normalizeEntityCode(d.code), d] as const),
  );
  const usersByEmail = new Map(
    context.users
      .filter((u) => u.status === "active" && u.email)
      .map((u) => [normalizeEmail(u.email || ""), u] as const),
  );

  const preview: DutyImportPreviewRow[] = [];

  rows.forEach((raw, index) => {
    const rowNumber = Number(raw.rowNumber) || index + 2;
    const title = String(raw.ten_cong_tac || "").trim();
    const content = String(raw.noi_dung || "").trim();
    const locationText = String(raw.dia_diem || "").trim();
    const allDayParsed = parseDutyAllDayFlag(raw.ca_ngay);
    const startDate = parseFlexibleSchoolDate(raw.ngay_bat_dau);
    const endDateRaw = String(raw.ngay_ket_thuc || "").trim();
    const startTimeRaw = String(raw.gio_bat_dau || "").trim();
    const endTimeRaw = String(raw.gio_ket_thuc || "").trim();
    const departmentTokens = splitCommaList(raw.ma_phong_ban);
    const emailTokens = splitCommaList(raw.email_tham_gia);
    const otherParticipants = String(raw.thanh_phan_khac || "").trim();

    let rowHasError = false;
    if (!title) {
      pushError(rowNumber, DUTY_IMPORT_MESSAGES.titleRequired);
      rowHasError = true;
    }
    if (!content) {
      pushError(rowNumber, DUTY_IMPORT_MESSAGES.contentRequired);
      rowHasError = true;
    }
    if (!locationText) {
      pushError(rowNumber, DUTY_IMPORT_MESSAGES.locationRequired);
      rowHasError = true;
    }
    if (!allDayParsed.ok) {
      pushError(rowNumber, DUTY_IMPORT_MESSAGES.invalidAllDay, String(raw.ca_ngay || ""));
      rowHasError = true;
    }
    if (!startDate) {
      pushError(rowNumber, DUTY_IMPORT_MESSAGES.invalidStartDate, String(raw.ngay_bat_dau || ""));
      rowHasError = true;
    }

    const allDay = allDayParsed.ok ? allDayParsed.value : false;
    let endDate = startDate;
    if (!allDay) {
      if (!endDateRaw) {
        pushError(rowNumber, DUTY_IMPORT_MESSAGES.missingEndDate);
        rowHasError = true;
      } else {
        const parsedEnd = parseFlexibleSchoolDate(endDateRaw);
        if (!parsedEnd) {
          pushError(rowNumber, DUTY_IMPORT_MESSAGES.invalidEndDate, endDateRaw);
          rowHasError = true;
        } else {
          endDate = parsedEnd;
        }
      }
    }

    let startTime = DUTY_IMPORT_DEFAULT_START_TIME;
    let endTime = DUTY_IMPORT_DEFAULT_END_TIME;
    if (startTimeRaw) {
      const parsed = parseDutyImportClock(startTimeRaw);
      if (!parsed) {
        pushError(rowNumber, DUTY_IMPORT_MESSAGES.invalidStartTime, startTimeRaw);
        rowHasError = true;
      } else {
        startTime = parsed;
      }
    } else if (!allDay) {
      pushError(rowNumber, DUTY_IMPORT_MESSAGES.missingStartTime);
      rowHasError = true;
    }
    if (endTimeRaw) {
      const parsed = parseDutyImportClock(endTimeRaw);
      if (!parsed) {
        pushError(rowNumber, DUTY_IMPORT_MESSAGES.invalidEndTime, endTimeRaw);
        rowHasError = true;
      } else {
        endTime = parsed;
      }
    } else if (!allDay) {
      pushError(rowNumber, DUTY_IMPORT_MESSAGES.missingEndTime);
      rowHasError = true;
    }

    const departmentIds: string[] = [];
    const departmentCodes: string[] = [];
    const departmentNames: string[] = [];
    for (const token of departmentTokens) {
      const code = normalizeEntityCode(token);
      const department = departmentsByCode.get(code);
      if (!department) {
        pushError(rowNumber, DUTY_IMPORT_MESSAGES.invalidDepartment, token);
        rowHasError = true;
        continue;
      }
      if (departmentIds.includes(String(department._id))) continue;
      departmentIds.push(String(department._id));
      departmentCodes.push(code);
      departmentNames.push(department.name);
    }

    const participantUserIds: string[] = [];
    const participantEmails: string[] = [];
    const participantNames: string[] = [];
    for (const token of emailTokens) {
      const email = normalizeEmail(token);
      if (!isValidEmail(email)) {
        pushError(rowNumber, DUTY_IMPORT_MESSAGES.invalidEmail, token);
        rowHasError = true;
        continue;
      }
      const user = usersByEmail.get(email);
      if (!user) {
        pushError(rowNumber, DUTY_IMPORT_MESSAGES.invalidParticipant, email);
        rowHasError = true;
        continue;
      }
      if (participantUserIds.includes(String(user._id))) continue;
      participantUserIds.push(String(user._id));
      participantEmails.push(email);
      participantNames.push(user.name || email);
    }

    if (!context.actor.isOps && !departmentIds.length && !participantUserIds.length && !otherParticipants) {
      pushError(rowNumber, DUTY_IMPORT_MESSAGES.participantsRequired);
      rowHasError = true;
    }

    if (!context.actor.isOps && departmentIds.length) {
      pushError(rowNumber, DUTY_IMPORT_MESSAGES.departmentForbidden);
      rowHasError = true;
    }

    if (rowHasError || !startDate || !endDate) return;

    try {
      const input = cleanDutyInput({
        startDate,
        endDate,
        startTime,
        endTime,
        allDay,
        title,
        content,
        locationText,
        departmentIds,
        participantUserIds,
        otherParticipants,
      });
      const refError = evaluateDutyRefs(input, context.actor, {
        departments: context.departments,
        users: context.users,
      });
      if (refError) {
        pushError(rowNumber, messageForRefError(refError));
        return;
      }
      preview.push({
        rowNumber,
        title: input.title,
        content: input.content,
        locationText: input.locationText,
        startDate: input.startDate,
        endDate: input.endDate,
        startTime: input.startTime,
        endTime: input.endTime,
        allDay: input.allDay,
        departmentIds: input.departmentIds,
        departmentCodes,
        departmentNames,
        participantUserIds: input.participantUserIds,
        participantEmails,
        participantNames,
        otherParticipants: input.otherParticipants,
      });
    } catch (error) {
      const code = String((error as Error)?.message || error);
      pushError(rowNumber, messageForCleanError(code));
    }
  });

  return { ok: errors.length === 0, errors, preview: errors.length ? [] : preview };
}
