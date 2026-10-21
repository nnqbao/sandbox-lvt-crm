/**
 * Weekly approval for the school-wide Lịch công tác.
 *
 * - Văn thư (admin/mod) writes "school" duties. Working fields on the row are the
 *   draft; `published` is the copy BGH approved and the only one teachers see.
 * - Duties written by a level 2/3 team lead are "team" duties: visible to their
 *   members at once, never on the shared sheet, never part of approval.
 * - Rows from before this feature carry no `approvalTracked` flag. They count as
 *   approved as-is until their first edit or delete snapshots them into `published`.
 * - A week is Monday-based and a duty belongs to the week of its start date.
 * - BGH = active, non-admin/mod, position level 4 or 5. One approval is enough.
 */

export const DUTY_REVIEWER_MIN_LEVEL = 4;
export const DUTY_WEEK_RETURN_NOTE_MAX = 500;

export const DUTY_PUBLISHED_FIELDS = [
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "allDay",
  "title",
  "content",
  "locationIds",
  "locationText",
  "departmentIds",
  "participantUserIds",
  "otherParticipants",
] as const;

export type DutyPublishedFields = {
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
  participantUserIds: string[];
  otherParticipants?: string;
};

export type DutyPublished = DutyPublishedFields & {
  allDay: boolean;
  /** Working `updatedAt` at approval time; keeps the "đã chỉnh sửa" marker honest. */
  updatedAt: number;
  publishedAt: number;
};

export type DutyApprovalRow = DutyPublishedFields & {
  _id: string;
  active?: boolean;
  scope?: "school" | "team";
  approvalTracked?: boolean;
  published?: DutyPublished;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
};

export type DutyWeekRecord = {
  weekStart: string;
  status: "draft" | "submitted" | "returned" | "approved";
  submittedBy?: string;
  submittedAt?: number;
  returnedBy?: string;
  returnedAt?: number;
  returnNote?: string;
  approvedBy?: string;
  approvedAt?: number;
  updatedAt: number;
};

export type DutyWeekStatus = "empty" | "draft" | "submitted" | "returned" | "approved" | "approved_changed";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoToUtcDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addIsoDays(iso: string, days: number) {
  const date = isoToUtcDay(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Monday of the week that contains `iso` (Sunday belongs to the week before). */
export function dutyWeekStart(iso: string) {
  if (!DATE_RE.test(String(iso || ""))) throw new Error("INVALID_DATE");
  const weekday = isoToUtcDay(iso).getUTCDay();
  return addIsoDays(iso, weekday === 0 ? -6 : 1 - weekday);
}

export function assertWeekStart(iso: string) {
  const value = String(iso || "").trim();
  if (!DATE_RE.test(value) || dutyWeekStart(value) !== value) throw new Error("INVALID_WEEK");
  return value;
}

/** Last calendar day of the week (Sunday); the printed sheet stops on Saturday. */
export function dutyWeekLastDay(weekStart: string) {
  return addIsoDays(weekStart, 6);
}

/** Every Monday whose week overlaps [startDate, endDate]. */
export function dutyWeeksInRange(startDate: string, endDate: string) {
  const weeks: string[] = [];
  for (let week = dutyWeekStart(startDate); week <= endDate; week = addIsoDays(week, 7)) {
    weeks.push(week);
  }
  return weeks;
}

export function isOperationalManager(role: string | undefined) {
  return role === "admin" || role === "moderator";
}

export function isDutyWeekReviewer(user: { role?: string; status?: string }, level: number) {
  if (user.status !== undefined && user.status !== "active") return false;
  if (isOperationalManager(user.role)) return false;
  return Number(level) >= DUTY_REVIEWER_MIN_LEVEL;
}

export function isTeamDuty(duty: { scope?: string }) {
  return duty.scope === "team";
}

export function dutyScopeForCreator(isOps: boolean): "school" | "team" {
  return isOps ? "school" : "team";
}

export function pickPublishedFields(duty: DutyPublishedFields): DutyPublishedFields & { allDay: boolean } {
  return {
    startDate: duty.startDate,
    endDate: duty.endDate,
    startTime: duty.startTime,
    endTime: duty.endTime,
    allDay: Boolean(duty.allDay),
    title: duty.title === undefined ? undefined : String(duty.title),
    content: duty.content,
    locationIds: [...(duty.locationIds || [])].map(String),
    locationText: duty.locationText === undefined ? undefined : String(duty.locationText),
    departmentIds: [...(duty.departmentIds || [])].map(String),
    participantUserIds: [...(duty.participantUserIds || [])].map(String),
    otherParticipants: duty.otherParticipants === undefined ? undefined : String(duty.otherParticipants),
  };
}

function comparableFields(duty: DutyPublishedFields) {
  const fields = pickPublishedFields(duty);
  return JSON.stringify({
    ...fields,
    title: String(fields.title || ""),
    locationText: String(fields.locationText || ""),
    otherParticipants: String(fields.otherParticipants || "").trim(),
    locationIds: [...fields.locationIds].sort(),
    departmentIds: [...fields.departmentIds].sort(),
    participantUserIds: [...fields.participantUserIds].sort(),
  });
}

export function sameDutyFields(a: DutyPublishedFields, b: DutyPublishedFields) {
  return comparableFields(a) === comparableFields(b);
}

/** Legacy rows predate approval and stand for an already approved schedule. */
export function isApprovalTracked(duty: { approvalTracked?: boolean; scope?: string }) {
  return !isTeamDuty(duty) && duty.approvalTracked === true;
}

/** The approved copy a teacher may see, or null when nothing is approved. */
export function publishedDutyFields(duty: DutyApprovalRow): (DutyPublishedFields & { updatedAt: number; publishedAt: number }) | null {
  if (!isApprovalTracked(duty)) {
    if (duty.active === false) return null;
    return { ...pickPublishedFields(duty), updatedAt: duty.updatedAt, publishedAt: duty.createdAt };
  }
  return duty.published ? { ...duty.published } : null;
}

/**
 * Same shape as a duty row, with the approved fields swapped in.
 * Use it for every teacher-facing read: lists, attendance, chat, reminders.
 */
export function projectPublicDuty<T extends DutyApprovalRow>(duty: T | null | undefined): (T & { publishedAt: number }) | null {
  if (!duty) return null;
  const published = publishedDutyFields(duty);
  if (!published) return null;
  return {
    ...duty,
    ...pickPublishedFields(published),
    active: true,
    updatedAt: published.updatedAt,
    publishedAt: published.publishedAt,
  };
}

/** True when the working copy differs from what teachers see. */
export function dutyHasPendingChange(duty: DutyApprovalRow) {
  if (!isApprovalTracked(duty)) return false;
  const live = duty.active !== false;
  if (!duty.published) return live;
  if (!live) return true;
  return !sameDutyFields(duty, duty.published);
}

export function dutyWorkingWeek(duty: DutyApprovalRow) {
  return duty.active === false ? null : dutyWeekStart(duty.startDate);
}

export function dutyPublishedWeek(duty: DutyApprovalRow) {
  const published = publishedDutyFields(duty);
  return published ? dutyWeekStart(published.startDate) : null;
}

export function dutyTouchesWeek(duty: DutyApprovalRow, weekStart: string) {
  if (isTeamDuty(duty)) return false;
  return dutyWorkingWeek(duty) === weekStart || dutyPublishedWeek(duty) === weekStart;
}

/** Weeks whose approval state a write to this row can change. */
export function weeksAffectedByDuty(before: DutyApprovalRow | null, after: DutyApprovalRow | null) {
  const weeks = new Set<string>();
  for (const row of [before, after]) {
    if (!row || isTeamDuty(row)) continue;
    const working = dutyWorkingWeek(row);
    const published = dutyPublishedWeek(row);
    if (working) weeks.add(working);
    if (published) weeks.add(published);
  }
  return [...weeks].sort();
}

export type DutyWeekChange = {
  id: string;
  kind: "added" | "changed" | "removed" | "moved_out";
  title: string;
};

function dutyLabel(duty: { title?: string; content?: string }) {
  return String(duty.title || duty.content || "").trim();
}

export function dutyWeekChanges(weekStart: string, duties: DutyApprovalRow[]): DutyWeekChange[] {
  const changes: DutyWeekChange[] = [];
  for (const duty of duties) {
    if (!dutyTouchesWeek(duty, weekStart) || !dutyHasPendingChange(duty)) continue;
    const workingWeek = dutyWorkingWeek(duty);
    const publishedWeek = dutyPublishedWeek(duty);
    let kind: DutyWeekChange["kind"];
    if (!publishedWeek) kind = "added";
    else if (!workingWeek) kind = "removed";
    else if (workingWeek !== weekStart) kind = "moved_out";
    else if (publishedWeek !== weekStart) kind = "added";
    else kind = "changed";
    const published = publishedDutyFields(duty);
    changes.push({
      id: String(duty._id),
      kind,
      title: dutyLabel(kind === "removed" || kind === "moved_out" ? published || duty : duty),
    });
  }
  return changes.sort((a, b) => a.title.localeCompare(b.title, "vi"));
}

export function summarizeDutyWeek(
  weekStart: string,
  duties: DutyApprovalRow[],
  record: DutyWeekRecord | null | undefined,
) {
  const inWeek = duties.filter((duty) => dutyTouchesWeek(duty, weekStart));
  const working = inWeek.filter((duty) => dutyWorkingWeek(duty) === weekStart);
  const publishedCount = inWeek.filter((duty) => dutyPublishedWeek(duty) === weekStart).length;
  const changes = dutyWeekChanges(weekStart, inWeek);
  const missingParticipants = working.filter(
    (duty) =>
      !(duty.departmentIds || []).length &&
      !(duty.participantUserIds || []).length &&
      !String(duty.otherParticipants || "").trim(),
  ).length;
  const hasApprovedVersion = publishedCount > 0 || Boolean(record?.approvedAt);

  let status: DutyWeekStatus;
  if (record?.status === "submitted") status = "submitted";
  else if (changes.length) {
    if (record?.status === "returned") status = "returned";
    else status = hasApprovedVersion ? "approved_changed" : "draft";
  } else if (working.length || publishedCount) status = "approved";
  else status = "empty";

  return {
    weekStart,
    weekEnd: addIsoDays(weekStart, 5),
    status,
    dutyCount: working.length,
    publishedCount,
    changeCount: changes.length,
    changes,
    missingParticipants,
    hasApprovedVersion,
    submittedBy: record?.submittedBy,
    submittedAt: record?.submittedAt,
    returnedBy: record?.returnedBy,
    returnedAt: record?.returnedAt,
    returnNote: record?.returnNote,
    approvedBy: record?.approvedBy,
    approvedAt: record?.approvedAt,
  };
}

export function cleanReturnNote(value: string) {
  const note = String(value || "").trim();
  if (!note) throw new Error("DUTY_WEEK_RETURN_NOTE_REQUIRED");
  if (note.length > DUTY_WEEK_RETURN_NOTE_MAX) throw new Error("DUTY_WEEK_RETURN_NOTE_TOO_LONG");
  return note;
}

/**
 * Patch that approves a week for one duty row, or null when the row is untouched.
 * Moved-out rows lose their old published copy here; the week they moved into
 * publishes the new one when it is approved.
 */
export function approvalPatchForDuty(duty: DutyApprovalRow, weekStart: string, now: number) {
  if (!dutyTouchesWeek(duty, weekStart) || !dutyHasPendingChange(duty)) return null;
  if (dutyWorkingWeek(duty) === weekStart) {
    const fields = pickPublishedFields(duty);
    return {
      kind: duty.published ? ("changed" as const) : ("added" as const),
      patch: {
        // Draft edits before the first approval are not "đã chỉnh sửa" for teachers.
        published: { ...fields, updatedAt: duty.published ? duty.updatedAt : duty.createdAt, publishedAt: now },
        publishedStartDate: fields.startDate,
        publishedEndDate: fields.endDate,
      },
    };
  }
  return {
    kind: "removed" as const,
    patch: { published: undefined, publishedStartDate: undefined, publishedEndDate: undefined },
  };
}

/** Patch that throws away unapproved edits for one row. */
export function discardPatchForDuty(duty: DutyApprovalRow, weekStart: string, now: number, actorId: string) {
  if (!dutyTouchesWeek(duty, weekStart) || !dutyHasPendingChange(duty)) return null;
  if (!duty.published) {
    return { active: false, updatedAt: now, updatedBy: actorId };
  }
  return {
    ...pickPublishedFields(duty.published),
    active: true,
    updatedAt: now,
    updatedBy: actorId,
  };
}

/**
 * First write to a legacy school row: freeze what teachers already see so the
 * edit waits for approval instead of going live.
 */
export function legacySnapshotPatch(duty: DutyApprovalRow, now: number) {
  if (isTeamDuty(duty) || duty.approvalTracked === true) return {};
  if (duty.active === false) return { approvalTracked: true };
  const fields = pickPublishedFields(duty);
  return {
    approvalTracked: true,
    published: { ...fields, updatedAt: duty.updatedAt, publishedAt: duty.createdAt || now },
    publishedStartDate: fields.startDate,
    publishedEndDate: fields.endDate,
  };
}

/**
 * BGH (the weekly approver) may correct any active school row directly.
 * Team rows belong to their team lead and stay out of reach; BGH never
 * creates or deletes through this path.
 */
export function canReviewerEditDuty(
  reviewer: { role?: string; status?: string },
  reviewerLevel: number,
  duty: { scope?: string; active?: boolean } | null | undefined,
) {
  if (!duty || duty.active === false) return false;
  if (!isDutyWeekReviewer(reviewer, reviewerLevel)) return false;
  return duty.scope === "school";
}

/**
 * Patch for a BGH edit of a school row (`duty.scope` already resolved).
 *
 * BGH is the approver, so the edit is live at once:
 * - the working fields take the new values;
 * - when teachers already see an approved copy (or the row is a legacy row that
 *   counts as approved), `published` takes the same values, so the row has no
 *   pending change afterwards and the week does not turn `approved_changed`;
 * - a row that was never approved only changes its working fields; it goes out
 *   with the next weekly approval.
 * If văn thư had unapproved edits on this row, the values BGH saves (the editor
 * starts from the working copy) are what gets published: BGH approves the merged
 * result for this one row. Callers must NOT reopen submitted weeks for this write,
 * so a pending submission keeps its `submittedAt` and can still be approved.
 */
export function reviewerEditPatchForDuty(
  duty: DutyApprovalRow,
  input: DutyPublishedFields,
  now: number,
) {
  const legacy = legacySnapshotPatch(duty, now) as { published?: DutyPublished };
  const hadPublished = Boolean(duty.published || legacy.published);
  const fields = pickPublishedFields(input);
  const working = {
    ...fields,
    title: fields.title ?? "",
    locationText: fields.locationText ?? "",
    otherParticipants: fields.otherParticipants ?? "",
  };
  if (!hadPublished) {
    return {
      publishes: false as const,
      patch: { ...working, scope: "school" as const, approvalTracked: true },
    };
  }
  return {
    publishes: true as const,
    patch: {
      ...working,
      scope: "school" as const,
      approvalTracked: true,
      published: { ...working, updatedAt: now, publishedAt: now },
      publishedStartDate: fields.startDate,
      publishedEndDate: fields.endDate,
    },
  };
}
