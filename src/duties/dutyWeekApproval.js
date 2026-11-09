/** Display helpers for the weekly BGH approval of Lịch công tác chung. */

export const DUTY_WEEK_RETURN_NOTE_MAX = 500;

const PILLS = {
  empty: 'Chưa có lịch',
  draft: 'Nháp',
  submitted: 'Chờ duyệt',
  returned: 'Bị trả lại',
  approved: 'Đã duyệt',
  approved_changed: 'Đã duyệt · có thay đổi chờ duyệt',
};

export function dutyWeekPill(status) {
  return PILLS[status] || PILLS.empty;
}

const CHANGE_LABELS = {
  added: 'Thêm',
  changed: 'Sửa',
  removed: 'Xóa',
  moved_out: 'Chuyển tuần',
};

export function dutyWeekChangeLabel(kind) {
  return CHANGE_LABELS[kind] || 'Sửa';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** "12/10 – 18/10" for the Monday–Sunday sheet. */
export function formatWeekRange(weekStart) {
  const [year, month, day] = String(weekStart || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  const sunday = new Date(Date.UTC(year, month - 1, day + 6));
  return `${pad2(day)}/${pad2(month)} – ${pad2(sunday.getUTCDate())}/${pad2(sunday.getUTCMonth() + 1)}`;
}

/** "lúc 10:20, 10/10" in Vietnam time. */
export function formatWeekMoment(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '';
  const local = new Date(value + 7 * 60 * 60 * 1000);
  return `lúc ${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}, ${pad2(local.getUTCDate())}/${pad2(local.getUTCMonth() + 1)}`;
}

export const DUTY_WEEK_NOTIFICATION_TYPES = ['duty_week_review', 'duty_week_returned', 'duty_week_approved'];

export function isDutyWeekNotification(item) {
  return DUTY_WEEK_NOTIFICATION_TYPES.includes(item?.sourceType);
}

/** Teachers see an empty week as "not approved yet" rather than a blank sheet. */
export function shouldShowUnapprovedNotice({ viewer, mode, eventCount }) {
  return viewer === 'public' && mode === 'week' && eventCount === 0;
}
