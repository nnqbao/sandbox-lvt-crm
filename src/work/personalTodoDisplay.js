/** "Việc của tôi" display helpers. Times are Vietnam wall-clock (UTC+7, no DST). */

export const TODO_TITLE_MAX = 200;
export const TODO_NOTE_MAX = 2000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

const pad = (value) => String(value).padStart(2, '0');

/** `<input type="datetime-local">` value (read as Vietnam time) → epoch ms, or null. */
export function todoLocalInputToMs(value) {
  const match = LOCAL_RE.exec(String(value || '').trim());
  if (!match) return null;
  const [, y, m, d, hh, mm] = match.map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - VN_OFFSET_MS;
}

/** Epoch ms → `YYYY-MM-DDTHH:mm` in Vietnam time for a datetime-local input. */
export function todoMsToLocalInput(ms) {
  if (!Number.isFinite(Number(ms)) || !ms) return '';
  const date = new Date(Number(ms) + VN_OFFSET_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** Epoch ms → `HH:mm dd/MM/yyyy` (Vietnam time). */
export function formatTodoMoment(ms) {
  if (!Number.isFinite(Number(ms)) || !ms) return '';
  const date = new Date(Number(ms) + VN_OFFSET_MS);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} ${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

export function emptyTodoForm() {
  return { title: '', note: '', due: '', remind: '' };
}

export function todoFormFromItem(todo) {
  return {
    title: String(todo?.title || ''),
    note: String(todo?.note || ''),
    due: todoMsToLocalInput(todo?.dueAt),
    remind: todoMsToLocalInput(todo?.remindAt),
  };
}

/**
 * Field errors (shown under each input) and the payload for personalTodos.create/update.
 * An unchanged reminder that already fired may stay (the server accepts it too).
 */
export function validateTodoForm(form, now = Date.now(), previousRemindAt = null) {
  /** @type {Record<string, string>} */
  const errors = {};
  const title = String(form?.title || '').trim();
  if (!title) errors.title = 'Vui lòng nhập tên việc.';
  else if (title.length > TODO_TITLE_MAX) errors.title = `Tên việc tối đa ${TODO_TITLE_MAX} ký tự.`;
  const note = String(form?.note || '').trim();
  if (note.length > TODO_NOTE_MAX) errors.note = `Ghi chú tối đa ${TODO_NOTE_MAX} ký tự.`;
  const dueAt = form?.due ? todoLocalInputToMs(form.due) : null;
  if (form?.due && dueAt === null) errors.due = 'Hạn chót không hợp lệ.';
  const remindAt = form?.remind ? todoLocalInputToMs(form.remind) : null;
  if (form?.remind && remindAt === null) errors.remind = 'Giờ nhắc không hợp lệ.';
  else if (remindAt !== null && remindAt <= now && remindAt !== previousRemindAt) {
    errors.remind = 'Giờ nhắc phải ở tương lai.';
  }
  return {
    errors,
    ok: Object.keys(errors).length === 0,
    payload: { title, note: note || null, dueAt, remindAt },
  };
}

export function isTodoOverdue(todo, now = Date.now()) {
  return Boolean(todo && !todo.completedAt && todo.dueAt && todo.dueAt < now);
}

export const TODO_NOTIFICATION_SOURCE_TYPE = 'todo_reminder';
