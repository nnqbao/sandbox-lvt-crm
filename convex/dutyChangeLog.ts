/**
 * Field-level change history for Lịch công tác rows (`dutyChangeLogs`).
 * Pure helpers only: the mutations in duties.ts / dutyImport.ts load names and
 * write the rows. Values are stored as display strings so history stays
 * readable after a department or user is renamed or removed.
 */

export type DutyActorKind = "manager" | "reviewer" | "team_lead";
export type DutyChangeAction = "create" | "update" | "reviewer_edit" | "remove" | "import";
export type DutyFieldChange = { field: string; before: string; after: string };

export const DUTY_ACTOR_KIND_LABELS: Record<DutyActorKind, string> = {
  manager: "Văn thư",
  reviewer: "Ban giám hiệu",
  team_lead: "Tổ trưởng",
};

export const DUTY_CHANGE_ACTION_LABELS: Record<DutyChangeAction, string> = {
  create: "Tạo công tác",
  update: "Sửa công tác",
  reviewer_edit: "Ban giám hiệu sửa trực tiếp",
  remove: "Xóa công tác",
  import: "Nhập từ Excel",
};

export type DutyLogFields = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  title?: string;
  content?: string;
  locationText?: string;
  departmentIds?: string[];
  participantUserIds?: string[];
  otherParticipants?: string;
};

export type DutyLogNames = {
  departments: Map<string, string>;
  users: Map<string, string>;
};

/** Creating/updating/removing: admin/mod act as văn thư, everyone else as a team lead. */
export function dutyWriterKind(isOps: boolean): DutyActorKind {
  return isOps ? "manager" : "team_lead";
}

/** admin/mod, BGH, and whoever created the row may read its history. */
export function canViewDutyChangeHistory(args: {
  isOps: boolean;
  isReviewer: boolean;
  isCreator: boolean;
}) {
  return Boolean(args.isOps || args.isReviewer || args.isCreator);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` → `dd/MM/yyyy`; anything else is returned as-is. */
export function formatDutyLogDate(iso: string) {
  const match = DATE_RE.exec(String(iso || "").trim());
  if (!match) return String(iso || "").trim();
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Duty dates/times are already Vietnam wall-clock values. */
export function formatDutyLogMoment(date: string, time: string, allDay = false) {
  const day = formatDutyLogDate(date);
  if (allDay) return `${day} (cả ngày)`;
  return `${day} ${String(time || "").trim()}`.trim();
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Epoch ms → `HH:mm dd/MM/yyyy` in Asia/Ho_Chi_Minh (UTC+7, no DST). */
export function formatDutyLogTimestamp(ms: number) {
  const date = new Date(Number(ms) + VN_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} ${pad(date.getUTCDate())}/${pad(
    date.getUTCMonth() + 1,
  )}/${date.getUTCFullYear()}`;
}

function namesFor(ids: string[] | undefined, map: Map<string, string>) {
  return [...new Set((ids || []).map(String))]
    .map((id) => map.get(id) || "(không rõ)")
    .sort((a, b) => a.localeCompare(b, "vi"))
    .join(", ");
}

function displayFields(duty: DutyLogFields | null, names: DutyLogNames): [string, string][] {
  if (!duty) return [];
  const allDay = Boolean(duty.allDay);
  return [
    ["Tên công tác", String(duty.title || "").trim()],
    ["Nội dung", String(duty.content || "").trim()],
    ["Bắt đầu", formatDutyLogMoment(duty.startDate, duty.startTime, allDay)],
    ["Kết thúc", allDay ? "" : formatDutyLogMoment(duty.endDate, duty.endTime)],
    ["Địa điểm", String(duty.locationText || "").trim()],
    ["Phòng ban tham gia", namesFor(duty.departmentIds, names.departments)],
    ["Cá nhân tham gia", namesFor(duty.participantUserIds, names.users)],
    ["Thành phần khác", String(duty.otherParticipants || "").trim()],
  ];
}

/**
 * Human-readable diff between two versions of a duty. `before = null` is a
 * create (every non-empty field), `after = null` a removal (every non-empty
 * field cleared). Unchanged fields are left out.
 */
export function buildDutyChangeDiff(
  before: DutyLogFields | null,
  after: DutyLogFields | null,
  names: DutyLogNames,
): DutyFieldChange[] {
  const left = new Map(displayFields(before, names));
  const right = displayFields(after, names);
  const fields = right.length ? right.map(([field]) => field) : [...left.keys()];
  const rightMap = new Map(right);
  const changes: DutyFieldChange[] = [];
  for (const field of fields) {
    const was = left.get(field) || "";
    const now = rightMap.get(field) || "";
    if (was === now) continue;
    changes.push({ field, before: was, after: now });
  }
  return changes;
}

/** Ids whose names a diff between these versions needs. */
export function dutyLogReferencedIds(...rows: (DutyLogFields | null | undefined)[]) {
  const departmentIds = new Set<string>();
  const userIds = new Set<string>();
  for (const row of rows) {
    for (const id of row?.departmentIds || []) departmentIds.add(String(id));
    for (const id of row?.participantUserIds || []) userIds.add(String(id));
  }
  return { departmentIds: [...departmentIds], userIds: [...userIds] };
}
