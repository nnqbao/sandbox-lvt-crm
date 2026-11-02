import {
  cleanDutyContent,
  cleanDutyLocationText,
  cleanDutyOtherParticipants,
  cleanDutyTitle,
  normalizeDutyClock,
} from "./assignmentPolicy.ts";

function activePositionLevel(
  user: { positionId?: string },
  positions: { _id: string; level: number; active: boolean }[],
): number {
  if (!user.positionId) return 0;
  const position = positions.find((item) => String(item._id) === String(user.positionId));
  return position?.active ? Number(position.level) || 0 : 0;
}

function canApproveLevel(approverLevel: number, targetLevel: number): boolean {
  if (!Number.isInteger(approverLevel) || !Number.isInteger(targetLevel)) return false;
  if (approverLevel < 1 || approverLevel > 5 || targetLevel < 1 || targetLevel > 5) return false;
  return approverLevel > targetLevel;
}

function isSameDepartmentSubordinate(
  actor: { _id: string; departmentId?: string; positionId?: string },
  target: { _id: string; departmentId?: string; positionId?: string },
  positions: { _id: string; level: number; active: boolean }[],
): boolean {
  if (String(actor._id) === String(target._id)) return false;
  if (!actor.departmentId || !target.departmentId) return false;
  if (String(actor.departmentId) !== String(target.departmentId)) return false;
  return canApproveLevel(activePositionLevel(actor, positions), activePositionLevel(target, positions));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** School CRM wall-clock is Vietnam time (UTC+7, no DST). Docker/Convex often runs UTC. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Parse YYYY-MM-DD + HH:mm as Asia/Ho_Chi_Minh local time → epoch ms.
 * Do not use `new Date(y, m, d, h, min)` — that uses the server process timezone (UTC in Docker).
 */
export function parseLocalMs(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm, 0, 0) - VN_OFFSET_MS;
}

export function cleanDutyInput(args: {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  title: string;
  content: string;
  locationText: string;
  departmentIds: string[];
  unitIds?: string[];
  participantUserIds: string[];
  otherParticipants?: string;
}) {
  const startDate = args.startDate.trim();
  const endDate = args.endDate.trim();
  const startTime = normalizeDutyClock(args.startTime);
  const endTime = normalizeDutyClock(args.endTime);
  const title = cleanDutyTitle(args.title);
  const content = cleanDutyContent(args.content);
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) throw new Error("INVALID_DATE");
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) throw new Error("INVALID_TIME");
  const startMs = parseLocalMs(startDate, startTime);
  const endMs = parseLocalMs(endDate, endTime);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) throw new Error("INVALID_DATE");
  if (endMs < startMs) throw new Error("END_BEFORE_START");

  const uniq = (ids: string[]) => [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  return {
    startDate,
    endDate,
    startTime,
    endTime,
    allDay: Boolean(args.allDay),
    title,
    content,
    locationText: cleanDutyLocationText(args.locationText),
    locationIds: [] as string[],
    departmentIds: uniq(args.departmentIds || []),
    unitIds: uniq(args.unitIds || []),
    participantUserIds: uniq(args.participantUserIds || []),
    otherParticipants: cleanDutyOtherParticipants(args.otherParticipants),
  };
}

export function evaluateDutyRefs(
  input: {
    departmentIds: string[];
    unitIds?: string[];
    participantUserIds: string[];
    otherParticipants?: string;
  },
  actor: { user: any; isOps: boolean; positions: any[] },
  catalogs: {
    departments: { _id: string; active?: boolean }[];
    units?: { _id: string; active?: boolean }[];
    users: { _id: string; status?: string; departmentId?: string; positionId?: string }[];
  },
): string | null {
  if (!actor.isOps && input.departmentIds.length) {
    return "DUTY_DEPARTMENT_FORBIDDEN";
  }
  // Phòng ban, like Tổ chuyên môn, is a văn thư (admin/mod) quick pick.
  if (!actor.isOps && (input.unitIds || []).length) {
    return "DUTY_UNIT_FORBIDDEN";
  }
  for (const id of input.departmentIds) {
    const row = catalogs.departments.find((d) => String(d._id) === String(id));
    if (!row?.active) return "INVALID_DEPARTMENT";
  }
  for (const id of input.unitIds || []) {
    const row = (catalogs.units || []).find((u) => String(u._id) === String(id));
    if (!row?.active) return "INVALID_UNIT";
  }
  for (const id of input.participantUserIds) {
    const user = catalogs.users.find((row) => String(row._id) === String(id));
    if (!user || user.status !== "active") return "INVALID_PARTICIPANT";
    if (!actor.isOps && !isSameDepartmentSubordinate(actor.user, user, actor.positions)) {
      return "NOT_A_SUBORDINATE";
    }
  }
  // Văn thư may publish the 4-column sheet first and add Thành phần later.
  if (
    !actor.isOps &&
    !input.departmentIds.length &&
    !input.participantUserIds.length &&
    !String(input.otherParticipants || "").trim()
  ) {
    return "DUTY_PARTICIPANTS_REQUIRED";
  }
  return null;
}
