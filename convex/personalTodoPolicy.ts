/**
 * "Việc của tôi": private to-dos for every active account.
 * Pure rules only (no Convex server imports) so tests can load them directly.
 *
 * - Strictly owner-only: nobody else (admin and moderator included) reads or
 *   writes another user's todos.
 * - Independent of the `work` menu access and of work documents/approval.
 */

export const TODO_TITLE_MAX = 200;
export const TODO_NOTE_MAX = 2000;
export const TODO_COMPLETED_LIMIT = 30;
export const TODO_SOURCE_TYPE = "todo_reminder";

export type PersonalTodoRow = {
  _id: string;
  userId: string;
  title: string;
  note?: string;
  dueAt?: number;
  remindAt?: number;
  remindedAt?: number;
  reminderJobId?: string;
  completedAt?: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

/** Owner-only, active rows. Everything else reads as not found (no existence leak). */
export function canAccessTodo(
  todo: { userId?: string; active?: boolean } | null | undefined,
  userId: string,
): boolean {
  if (!todo || todo.active === false) return false;
  return Boolean(userId) && String(todo.userId || "") === String(userId);
}

function cleanTime(value: number | null | undefined) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error("INVALID_TODO_TIME");
  return Math.floor(value);
}

/**
 * Validates a create/update payload. A reminder must lie in the future when it
 * is new or changed; an unchanged reminder that already fired may stay as is.
 */
export function cleanTodoInput(
  args: { title: string; note?: string | null; dueAt?: number | null; remindAt?: number | null },
  now: number,
  previous?: { remindAt?: number } | null,
) {
  const title = String(args.title ?? "").trim();
  if (!title || title.length > TODO_TITLE_MAX) throw new Error("INVALID_TODO_TITLE");
  const note = String(args.note ?? "").trim();
  if (note.length > TODO_NOTE_MAX) throw new Error("INVALID_TODO_NOTE");
  const dueAt = cleanTime(args.dueAt);
  const remindAt = cleanTime(args.remindAt);
  if (remindAt !== undefined && remindAt <= now && remindAt !== previous?.remindAt) {
    throw new Error("TODO_REMIND_IN_PAST");
  }
  return { title, note: note || undefined, dueAt, remindAt };
}

/** Whether a (re)scheduled reminder job must be created for this remindAt. */
export function reminderNeedsJob(
  todo: { remindAt?: number; completedAt?: number; active?: boolean },
  now: number,
) {
  return todo.active !== false && !todo.completedAt && typeof todo.remindAt === "number" && todo.remindAt > now;
}

/** The scheduled job only fires for the exact reminder it was created for. */
export function reminderShouldFire(
  todo: { remindAt?: number; completedAt?: number; active?: boolean } | null | undefined,
  scheduledRemindAt: number,
) {
  if (!todo || todo.active === false || todo.completedAt) return false;
  return todo.remindAt === scheduledRemindAt;
}

/** Open first (earliest due, undated last), then the most recently completed. */
export function sortTodosForList<T extends PersonalTodoRow>(rows: T[], completedLimit = TODO_COMPLETED_LIMIT) {
  const active = rows.filter((row) => row.active !== false);
  const open = active
    .filter((row) => !row.completedAt)
    .sort((a, b) => {
      const aDue = a.dueAt ?? Number.POSITIVE_INFINITY;
      const bDue = b.dueAt ?? Number.POSITIVE_INFINITY;
      return aDue - bDue || b.createdAt - a.createdAt;
    });
  const completed = active
    .filter((row) => row.completedAt)
    .sort((a, b) => Number(b.completedAt) - Number(a.completedAt))
    .slice(0, completedLimit);
  return { open, completed };
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Epoch ms → `HH:mm dd/MM/yyyy` (Asia/Ho_Chi_Minh). */
export function formatTodoMoment(ms: number) {
  const date = new Date(Number(ms) + VN_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} ${pad(date.getUTCDate())}/${pad(
    date.getUTCMonth() + 1,
  )}/${date.getUTCFullYear()}`;
}

/** In-app bell item for a reminder that has fired and is still relevant. */
export function todoReminderNotificationItem(todo: PersonalTodoRow) {
  if (todo.active === false || todo.completedAt || !todo.remindAt || !todo.remindedAt) return null;
  if (todo.remindedAt < todo.remindAt) return null;
  return {
    kind: "todo" as const,
    key: `todo:${TODO_SOURCE_TYPE}:${String(todo._id)}:${todo.remindAt}`,
    sourceType: TODO_SOURCE_TYPE,
    sourceId: String(todo._id),
    title: todo.title,
    description: todo.dueAt ? `Hạn chót ${formatTodoMoment(todo.dueAt)}` : "Nhắc việc cá nhân",
    dueAt: todo.dueAt || todo.remindAt,
    milestoneHours: 0,
    milestoneLabel: "Nhắc việc",
    availableAt: todo.remindAt,
  };
}
