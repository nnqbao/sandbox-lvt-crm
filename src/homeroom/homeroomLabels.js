/** Nhãn tiếng Việt + tiện ích ngày cho menu Lớp chủ nhiệm. Không bao giờ hiển thị mã nội bộ cho người dùng. */

export const STATUS_LABELS = {
  present: 'Có mặt',
  late: 'Đi trễ',
  absent_excused: 'Vắng có phép',
  absent_unexcused: 'Vắng không phép',
  absent_pending: 'Vắng chờ xử lý',
  no_data: 'Chưa có dữ liệu',
  exempt: 'Miễn điểm danh',
};

export const STATUS_SHORT = {
  present: 'Có mặt',
  late: 'Trễ',
  absent_excused: 'Có phép',
  absent_unexcused: 'Không phép',
  absent_pending: 'Chờ xử lý',
  no_data: 'Chưa có',
  exempt: 'Miễn',
};

export const STATUS_ORDER = ['present', 'late', 'absent_pending', 'absent_excused', 'absent_unexcused', 'no_data'];

export const RAW_LABELS = {
  present: 'Có mặt',
  late: 'Đi trễ',
  absent: 'Vắng',
  unknown: 'Không rõ',
};

export function statusLabel(status) {
  return STATUS_LABELS[status || 'no_data'] || 'Không rõ';
}

export function rawLabel(raw) {
  return RAW_LABELS[raw] || '—';
}

export const GUARDIAN_RELATIONSHIPS = [
  ['father', 'Cha'],
  ['mother', 'Mẹ'],
  ['guardian', 'Người giám hộ'],
  ['grandparent', 'Ông / Bà'],
  ['sibling', 'Anh / Chị'],
  ['other', 'Khác'],
];

export function relationshipLabel(value) {
  return GUARDIAN_RELATIONSHIPS.find(([key]) => key === value)?.[1] || 'Khác';
}

export const IMPORT_COLUMN_LABELS = {
  classCode: 'Lớp học',
  studentName: 'Tên học sinh',
  dateOfBirth: 'Ngày sinh',
  sourceStatus: 'Trạng thái điểm danh',
  observedAt: 'Thời gian điểm danh',
};

export function importColumnLabel(field) {
  return IMPORT_COLUMN_LABELS[field] || 'Dòng dữ liệu';
}

export const SCHOOL_DAY_LABELS = {
  holiday: 'Ngày nghỉ',
  extra_teaching: 'Ngày học bù',
  working: 'Ngày học',
  default_school_day: 'Ngày học',
  default_weekend: 'Cuối tuần',
};

export function schoolDayLabel(schoolDay) {
  if (!schoolDay) return '';
  if (schoolDay.outsideYear) return 'Ngoài năm học';
  return SCHOOL_DAY_LABELS[schoolDay.kind] || (schoolDay.isSchoolDay ? 'Ngày học' : 'Ngày nghỉ');
}

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const WEEKDAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function isYmd(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function weekdayIndex(ymd) {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

export function weekdayLabel(ymd, short = false) {
  if (!isYmd(ymd)) return '';
  return (short ? WEEKDAYS_SHORT : WEEKDAYS)[weekdayIndex(ymd)];
}

export function formatDate(ymd) {
  if (!isYmd(ymd)) return ymd || '—';
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateLong(ymd) {
  if (!isYmd(ymd)) return ymd || '—';
  return `${weekdayLabel(ymd)}, ${formatDate(ymd)}`;
}

export function addDays(ymd, days) {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function startOfWeek(ymd) {
  const weekday = weekdayIndex(ymd);
  return addDays(ymd, weekday === 0 ? -6 : 1 - weekday);
}

export function startOfMonth(ymd) {
  return `${ymd.slice(0, 7)}-01`;
}

export function endOfMonth(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function monthLabel(ymd) {
  const [y, m] = ymd.split('-');
  return `Tháng ${Number(m)}/${y}`;
}

export function percent(value, digits = 1) {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits).replace('.', ',')}%`;
}

export function formatTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
}

export function formatDateTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

/** Bỏ dấu + lowercase để tìm kiếm tên tiếng Việt. */
export function foldSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

export function studentInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[parts.length - 2][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

export const GENDER_OPTIONS = [
  ['male', 'Nam'],
  ['female', 'Nữ'],
  ['other', 'Khác'],
];

export function genderLabel(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'nam') return 'Nam';
  if (key === 'nu' || key === 'nữ') return 'Nữ';
  return GENDER_OPTIONS.find(([option]) => option === key)?.[1] || '—';
}
