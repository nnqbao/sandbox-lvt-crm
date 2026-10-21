/** Pure helpers for the GVCN "Điểm danh" tab of a class (tested in tests/homeroom-attendance-day.test.mjs). */

const ABSENT_STATUSES = new Set(['absent_excused', 'absent_unexcused', 'absent_pending']);

export function isAbsentRow(row) {
  return row?.day?.rawObservation === 'absent' || ABSENT_STATUSES.has(row?.day?.effectiveStatus);
}

/** Absent students first (roster order kept), then everybody else. */
export function splitAttendanceRows(rows) {
  const absent = [];
  const others = [];
  for (const row of rows || []) (isAbsentRow(row) ? absent : others).push(row);
  return { absent, others };
}

/** Checkbox "Vắng không phép": checked = unexcused; unchecked = excused (legacy pending too). */
export function isUnexcused(day) {
  return day?.disposition === 'unexcused';
}

export function nextDispositionForToggle(checked) {
  return checked ? 'unexcused' : 'excused';
}

/** Neither a saved marker nor any day row: Giám thị has not marked this class yet. */
export function classNotMarked(data) {
  return Boolean(data) && !data.classSaved && !data.published;
}

export function notMarkedMessage(date, today, formatDate) {
  return date === today
    ? 'Giám thị chưa điểm danh lớp này hôm nay.'
    : `Giám thị chưa điểm danh lớp này ngày ${formatDate(date)}.`;
}
