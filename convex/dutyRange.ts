/**
 * Date-window reads for Công tác.
 * `duties.by_active_end` is (active, endDate). Equality on active plus
 * `endDate >= windowStart` drops history that can no longer overlap the
 * window. Duties that start after windowEnd are discarded in memory.
 */

import { projectPublicDuty, type DutyPublished } from "./dutyApproval.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** List mode: one year back and one year ahead of today in Vietnam. */
export const DUTY_LIST_LOOKBACK_MONTHS = 12;
export const DUTY_LIST_LOOKAHEAD_MONTHS = 12;

export function vietnamIsoDate(now = Date.now()) {
  return new Date(now + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function addIsoMonths(isoDate: string, months: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const monthIndex = month - 1 + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  const result = new Date(Date.UTC(targetYear, targetMonth, clampedDay));
  return result.toISOString().slice(0, 10);
}

export function dutyListDateWindow(now = Date.now()) {
  const today = vietnamIsoDate(now);
  return {
    startDate: addIsoMonths(today, -DUTY_LIST_LOOKBACK_MONTHS),
    endDate: addIsoMonths(today, DUTY_LIST_LOOKAHEAD_MONTHS),
  };
}

/** Floor for bell reminders: 24h overdue window plus a timezone day. */
export function dutyNotificationEndFloor(now = Date.now()) {
  return vietnamIsoDate(now - 2 * 24 * 60 * 60 * 1000);
}

export function parseDutyDateRange(startDate: string, endDate: string) {
  const start = startDate.trim();
  const end = endDate.trim();
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || end < start) {
    throw new Error("INVALID_DATE_RANGE");
  }
  return { startDate: start, endDate: end };
}

export function dutyOverlapsWindow(
  duty: { startDate: string; endDate: string },
  startDate: string,
  endDate: string,
) {
  return duty.startDate <= endDate && duty.endDate >= startDate;
}

export type DutyWindowRow = {
  _id: string;
  active?: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  title?: string;
  content: string;
  locationIds: string[];
  locationText?: string;
  departmentIds: string[];
  unitIds?: string[];
  unitUserIds?: string[];
  participantUserIds: string[];
  otherParticipants?: string;
  scope?: "school" | "team";
  approvalTracked?: boolean;
  published?: DutyPublished;
  publishedStartDate?: string;
  publishedEndDate?: string;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
};

export async function loadDocsByIds(
  ctx: { db: { get: (id: any) => Promise<any> } },
  ids: Iterable<string | undefined | null>,
): Promise<any[]> {
  const unique = [...new Set([...ids].map((id) => String(id || "")).filter(Boolean))];
  if (!unique.length) return [];
  const rows = await Promise.all(unique.map((id) => ctx.db.get(id)));
  return rows.filter((row) => row != null);
}

export async function loadActiveDutiesFromEndDate(
  ctx: { db: { query: (table: "duties") => any } },
  endDateFloor: string,
  startDateCeiling?: string,
): Promise<DutyWindowRow[]> {
  const rows = (await ctx.db
    .query("duties")
    .withIndex("by_active_end", (q: any) => q.eq("active", true).gte("endDate", endDateFloor))
    .collect()) as DutyWindowRow[];
  return rows.filter(
    (duty) =>
      duty.active !== false &&
      duty.endDate >= endDateFloor &&
      (startDateCeiling === undefined || duty.startDate <= startDateCeiling),
  );
}

export async function loadActiveDutiesOverlapping(
  ctx: { db: { query: (table: "duties") => any } },
  startDate: string,
  endDate: string,
) {
  return loadActiveDutiesFromEndDate(ctx, startDate, endDate);
}

/**
 * Approved copies only: what a teacher may see. Reads live rows plus rows whose
 * delete still waits for BGH (inactive, published copy kept).
 */
export async function loadPublicDutiesFromEndDate(
  ctx: { db: { query: (table: "duties") => any } },
  endDateFloor: string,
  startDateCeiling?: string,
) {
  const [live, publishedRows] = await Promise.all([
    ctx.db
      .query("duties")
      .withIndex("by_active_end", (q: any) => q.eq("active", true).gte("endDate", endDateFloor))
      .collect() as Promise<DutyWindowRow[]>,
    ctx.db
      .query("duties")
      .withIndex("by_published_end", (q: any) => q.gte("publishedEndDate", endDateFloor))
      .collect() as Promise<DutyWindowRow[]>,
  ]);
  const byId = new Map<string, DutyWindowRow>();
  for (const row of [...live, ...publishedRows]) byId.set(String(row._id), row);
  const projected = [];
  for (const row of byId.values()) {
    const view = projectPublicDuty(row);
    if (!view) continue;
    if (view.endDate < endDateFloor) continue;
    if (startDateCeiling !== undefined && view.startDate > startDateCeiling) continue;
    projected.push(view);
  }
  return projected;
}

export async function loadPublicDutiesOverlapping(
  ctx: { db: { query: (table: "duties") => any } },
  startDate: string,
  endDate: string,
) {
  return loadPublicDutiesFromEndDate(ctx, startDate, endDate);
}

/** Raw rows (working or approved copy) that start inside [firstDay, lastDay]. */
export async function loadDutiesStartingBetween(
  ctx: { db: { query: (table: "duties") => any } },
  firstDay: string,
  lastDay: string,
) {
  const [working, publishedRows] = await Promise.all([
    ctx.db
      .query("duties")
      .withIndex("by_start", (q: any) => q.gte("startDate", firstDay).lte("startDate", lastDay))
      .collect() as Promise<DutyWindowRow[]>,
    ctx.db
      .query("duties")
      .withIndex("by_published_start", (q: any) =>
        q.gte("publishedStartDate", firstDay).lte("publishedStartDate", lastDay),
      )
      .collect() as Promise<DutyWindowRow[]>,
  ]);
  const byId = new Map<string, DutyWindowRow>();
  for (const row of [...working, ...publishedRows]) byId.set(String(row._id), row);
  return [...byId.values()];
}

export type DutyRevisionPart = {
  id: string;
  updatedAt?: number;
  tag?: string;
};

/**
 * Stable fingerprint for a duty window.
 * `count` and `maxUpdatedAt` are readable; the hash changes when any row's
 * id, timestamp, or tag changes, including an edit that does not set a new max.
 */
export function dutyWindowRevision(parts: DutyRevisionPart[]) {
  const rows = parts
    .map((part) => ({
      id: String(part.id),
      updatedAt: Number(part.updatedAt) || 0,
      tag: String(part.tag || ""),
    }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.tag.localeCompare(b.tag) || a.updatedAt - b.updatedAt);
  let hash = 2166136261;
  let maxUpdatedAt = 0;
  for (const row of rows) {
    if (row.updatedAt > maxUpdatedAt) maxUpdatedAt = row.updatedAt;
    const piece = `${row.id}\0${row.updatedAt}\0${row.tag}\0`;
    for (let index = 0; index < piece.length; index += 1) {
      hash ^= piece.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${rows.length}:${maxUpdatedAt}:${hash >>> 0}`;
}

/** Shared and personal schedule stamps. Attendance rows are personal-only. */
export function dutyScheduleRevision(input: {
  duties: Array<{ _id: string; updatedAt?: number; published?: { publishedAt?: number } }>;
  attendances?: Array<{ dutyId: string; userId: string; status?: string; updatedAt?: number }>;
  meta?: string;
}) {
  return dutyWindowRevision([
    ...input.duties.map((duty) => ({
      id: `duty:${String(duty._id)}`,
      updatedAt: duty.updatedAt,
      tag: String(duty.published?.publishedAt || ""),
    })),
    ...(input.attendances || []).map((row) => ({
      id: `att:${String(row.dutyId)}:${String(row.userId)}`,
      updatedAt: row.updatedAt,
      tag: String(row.status || ""),
    })),
    { id: "meta", updatedAt: 0, tag: String(input.meta || "") },
  ]);
}
