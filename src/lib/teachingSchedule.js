/**
 * Client mirror of the timetable helpers in convex/teachingPolicy.ts
 * (tests/teaching-policy.test.mjs keeps both in sync).
 */

export const TIMETABLE_WEEKDAYS = [1, 2, 3, 4, 5];
export const TIMETABLE_SESSIONS = ['morning', 'afternoon'];
export const TIMETABLE_PERIODS = [1, 2, 3, 4, 5];

export const WEEKDAY_LABELS = { 1: 'Thứ 2', 2: 'Thứ 3', 3: 'Thứ 4', 4: 'Thứ 5', 5: 'Thứ 6', 6: 'Thứ 7', 7: 'Chủ nhật' };
export const SESSION_LABELS = { morning: 'Sáng', afternoon: 'Chiều' };

export const PERIOD_START_TIMES = {
  morning: ['07:00', '07:50', '08:50', '09:40', '10:30'],
  afternoon: ['13:30', '14:20', '15:20', '16:10', '17:00'],
};

export function cellKey(cell) {
  return `${cell.weekday}-${cell.session}-${cell.period}`;
}

export function periodLabel(lesson) {
  return `Tiết ${lesson.period} ${SESSION_LABELS[lesson.session]?.toLowerCase() || ''}`.trim();
}

export function addDaysYmd(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function isoWeekday(date) {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function slotCoversDate(slot, date) {
  return slot.effectiveFrom <= date && (!slot.effectiveTo || date <= slot.effectiveTo);
}

export function isTimetableDay(date, year, holidays) {
  if (date < year.startDate || date > year.endDate) return false;
  if (isoWeekday(date) > 5) return false;
  return !holidays.has(date);
}

export function lessonStartTime(lesson) {
  const times = PERIOD_START_TIMES[lesson.session] || PERIOD_START_TIMES.morning;
  return times[lesson.period - 1] || '00:00';
}

export function compareLessons(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const time = lessonStartTime(a).localeCompare(lessonStartTime(b));
  return time || a.period - b.period;
}

export function expandLessons(slots, { from, to, year, holidays }) {
  const lessons = [];
  const start = from < year.startDate ? year.startDate : from;
  const end = to > year.endDate ? year.endDate : to;
  for (let date = start; date <= end; date = addDaysYmd(date, 1)) {
    if (!isTimetableDay(date, year, holidays)) continue;
    const weekday = isoWeekday(date);
    for (const slot of slots) {
      if (slot.weekday !== weekday || !slotCoversDate(slot, date)) continue;
      lessons.push({
        date,
        weekday,
        session: slot.session,
        period: slot.period,
        classId: slot.classId,
        teacherId: slot.teacherId,
        subjectId: slot.subjectId,
      });
    }
  }
  return lessons.sort(compareLessons);
}

/** Monday of the week containing `date`. */
export function weekStart(date) {
  return addDaysYmd(date, 1 - isoWeekday(date));
}

export function monthStart(date) {
  return `${date.slice(0, 7)}-01`;
}

export function monthEnd(date) {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function addMonthsYmd(date, months) {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10);
}

/** Calendar quarter (Q1 = tháng 1–3) containing `date`. */
export function quarterRange(date) {
  const [y, m] = date.split('-').map(Number);
  const first = Math.floor((m - 1) / 3) * 3 + 1;
  const from = `${y}-${String(first).padStart(2, '0')}-01`;
  return { from, to: monthEnd(addMonthsYmd(from, 2)), quarter: Math.floor((m - 1) / 3) + 1, year: y };
}

/**
 * Next lesson per class from `now` (Vietnam date + HH:mm): a lesson already started today
 * counts as "đang/vừa dạy" until the next period starts, so it stays first in the list.
 */
export function nextLessonByClass(lessons, { date, time }) {
  const next = new Map();
  for (const lesson of lessons) {
    if (lesson.date < date) continue;
    if (lesson.date === date && lessonEndTime(lesson) < time) continue;
    if (!next.has(lesson.classId)) next.set(lesson.classId, lesson);
  }
  return next;
}

/** 45-minute periods. */
export function lessonEndTime(lesson) {
  const [h, m] = lessonStartTime(lesson).split(':').map(Number);
  const total = h * 60 + m + 45;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function vietnamNowParts(now = Date.now()) {
  const shifted = new Date(now + 7 * 60 * 60 * 1000).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

export function semesterForDate(date, year) {
  return year?.semester2StartDate && date >= year.semester2StartDate ? 2 : 1;
}

export function formatScore(value) {
  if (value == null) return '—';
  return Number(value).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}
