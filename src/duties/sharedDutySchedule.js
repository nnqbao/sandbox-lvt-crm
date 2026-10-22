/** School-wide Lịch công tác layout matching the familiar Word weekly sheet. */

export const LCT_ISSUING_AUTHORITY = 'UBND PHƯỜNG BÌNH THẠNH';
export const LCT_SCHOOL_LINES = ['TRƯỜNG TRUNG HỌC CƠ SỞ', 'LÊ VĂN TÁM'];
export const LCT_NATIONAL_MOTTO_TITLE = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
export const LCT_NATIONAL_MOTTO_SUB = 'Độc lập – Tự do – Hạnh phúc';

const WEEKDAY_VI = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function toIsoDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function fromIsoDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfWeekMonday(date) {
  const day = date.getDay();
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), day === 0 ? -6 : 1 - day);
}

/** dd/MM (DESIGN.md §5: dates show as dd/mm/yyyy). */
export function formatVnDayMonth(isoDate) {
  const [, month, day] = String(isoDate || '').split('-');
  if (!month || !day) return '';
  return `${day}/${month}`;
}

/** dd/MM/yyyy. */
export function formatVnDate(isoDate) {
  const [year, month, day] = String(isoDate || '').split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
}

/** "07/09/2026" or "07/09/2026 → 09/09/2026" for a duty's date span. */
export function formatVnDateSpan(startIso, endIso) {
  if (!endIso || endIso === startIso) return formatVnDate(startIso);
  return `${formatVnDate(startIso)} → ${formatVnDate(endIso)}`;
}

export function formatDayCell(isoDate) {
  const date = fromIsoDate(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return `${WEEKDAY_VI[date.getDay()]} ${formatVnDayMonth(isoDate)}`;
}

/** Word sheet uses 7g00 / 16g45 instead of 07:00 / 16:45. */
export function formatDutyClock(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value || '').trim();
  return `${Number(match[1])}g${match[2]}`;
}

export function formatTimeCell(event) {
  if (!event) return '';
  if (event.startDate && event.endDate && event.startDate !== event.endDate) {
    return `Từ ${formatVnDayMonth(event.startDate)} – ${formatVnDayMonth(event.endDate)}`;
  }
  if (event.allDay) return 'Cả ngày';
  return formatDutyClock(event.startTime);
}

export function formatParticipantCell(event) {
  const parts = [];
  for (const name of [...(event?.departmentNames || []), ...(event?.participantNames || [])]) {
    const label = String(name || '').trim();
    if (label && !parts.includes(label)) parts.push(label);
  }
  const other = String(event?.otherParticipants || '').trim();
  if (other && !parts.includes(other)) parts.push(other);
  return parts.join(', ');
}

export function scheduleRange(mode, anchorIso) {
  const anchor = fromIsoDate(anchorIso);
  if (mode === 'month') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const startIso = toIsoDate(start);
    const endIso = toIsoDate(end);
    return {
      mode: 'month',
      startIso,
      endIso,
      title: `LỊCH CÔNG TÁC TỪ NGÀY ${formatVnDate(startIso)} ĐẾN ${formatVnDate(endIso)}`,
    };
  }
  const start = startOfWeekMonday(anchor);
  const end = addDays(start, 5);
  const startIso = toIsoDate(start);
  const endIso = toIsoDate(end);
  return {
    mode: 'week',
    startIso,
    endIso,
    title: `LỊCH CÔNG TÁC TỪ NGÀY ${formatVnDate(startIso)} ĐẾN ${formatVnDate(endIso)}`,
  };
}

export function datesInSchedule(range) {
  const days = [];
  for (
    let current = fromIsoDate(range.startIso);
    toIsoDate(current) <= range.endIso;
    current = addDays(current, 1)
  ) {
    if (current.getDay() === 0) continue;
    days.push(toIsoDate(current));
  }
  return days;
}

export function shiftScheduleAnchor(mode, anchorIso, direction) {
  const anchor = fromIsoDate(anchorIso);
  if (mode === 'month') {
    return toIsoDate(new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1));
  }
  return toIsoDate(addDays(startOfWeekMonday(anchor), direction * 7));
}

function eventSortKey(event) {
  const multiDay = event.startDate !== event.endDate;
  if (event.allDay || multiDay) return '0';
  return `1-${event.startTime || '99:99'}`;
}

function compareScheduleEvents(a, b) {
  const key = eventSortKey(a).localeCompare(eventSortKey(b));
  if (key) return key;
  return String(a.title || a.content || '').localeCompare(String(b.title || b.content || ''), 'vi');
}

/**
 * Create and Excel import set `createdAt` and `updatedAt` to the same `Date.now()`
 * (`insertCreatedDuty`). The content update mutation is what moves `updatedAt`
 * later on an active duty. Attendance and chat write other tables, so they do
 * not count. Treat a gap within this tolerance as unchanged.
 */
export const DUTY_EDITED_TOLERANCE_MS = 1000;

export function isEditedDuty(event) {
  const createdAt = Number(event?.createdAt);
  const updatedAt = Number(event?.updatedAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return false;
  return updatedAt - createdAt > DUTY_EDITED_TOLERANCE_MS;
}

export function displayDateForEvent(event, days) {
  if (!event?.startDate || !event?.endDate || !days.length) return null;
  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];
  if (event.endDate < rangeStart || event.startDate > rangeEnd) return null;
  const preferred = event.startDate < rangeStart ? rangeStart : event.startDate;
  return days.find((day) => day >= preferred) || null;
}

export function buildSharedScheduleRows(mode, anchorIso, events) {
  const range = scheduleRange(mode, anchorIso);
  const days = datesInSchedule(range);
  const byDay = new Map(days.map((day) => [day, []]));
  for (const event of events || []) {
    const day = displayDateForEvent(event, days);
    if (!day) continue;
    byDay.get(day).push(event);
  }

  const rows = [];
  for (const day of days) {
    const list = (byDay.get(day) || []).slice().sort(compareScheduleEvents);
    if (!list.length) {
      rows.push({
        dayIso: day,
        dayLabel: formatDayCell(day),
        time: '',
        content: '',
        location: '',
        participants: '',
        showDay: true,
        rowSpan: 1,
        eventId: null,
        canManage: false,
        canReviewerEdit: false,
        canChat: false,
        edited: false,
        approvalChange: null,
      });
      continue;
    }
    list.forEach((event, index) => {
      rows.push({
        dayIso: day,
        dayLabel: formatDayCell(day),
        time: formatTimeCell(event),
        content: String(event.title || event.content || '').trim(),
        location: String(event.location || event.locationText || (event.locationNames || []).join(', ') || '').trim(),
        participants: formatParticipantCell(event),
        showDay: index === 0,
        rowSpan: index === 0 ? list.length : 0,
        eventId: event._id || null,
        canManage: Boolean(event.canManage),
        canReviewerEdit: Boolean(event.canReviewerEdit),
        canChat: event.canChat !== false,
        edited: isEditedDuty(event),
        approvalChange: event.approvalChange || null,
      });
    });
  }

  return { range, rows };
}

/** Manager/creator edit unless only the BGH direct-edit right applies. */
export function dutyEditModeFor(duty) {
  if (duty?.canManage) return 'manager';
  if (duty?.canReviewerEdit) return 'reviewer';
  return null;
}

/**
 * Delete from the sheet editor: only the manager editor (văn thư / admin / the
 * creator, mirrored from `canMutateDuty` on the server). The BGH reviewer edit
 * never deletes. `duties.remove` re-checks authorization server-side.
 */
export function canDeleteDutyFromEditor(duty, mode) {
  return mode === 'manager' && duty?.canManage === true && duty?.active !== false;
}

/** Văn thư/creator edit, or BGH direct edit of a school row. */
export function canOpenDutyContentEditor(row) {
  return Boolean(row?.eventId) && (row?.canManage === true || row?.canReviewerEdit === true);
}

export const SHARED_SCHEDULE_DRAFT_MARK = 'BẢN NHÁP – CHƯA DUYỆT';

/**
 * True when the sheet shows the managers' working copy and something in it is
 * not approved yet (văn thư / admin / BGH). Teachers ("public") only ever get
 * the approved copy, so their sheet and PDF are never marked.
 */
export function sharedScheduleIsDraft(data) {
  if (!data || !data.viewer || data.viewer === 'public') return false;
  const pendingWeek = (data.weeks || []).some((week) => week.status && week.status !== 'approved' && week.status !== 'empty');
  return pendingWeek || (data.events || []).some((event) => Boolean(event.approvalChange));
}

/** Payload for the official sheet / PDF (browser and server share it). */
export function buildSharedSchedulePayload(mode, anchorIso, data) {
  return { ...buildSharedScheduleRows(mode, anchorIso, data?.events || []), draft: sharedScheduleIsDraft(data) };
}

export function sharedScheduleFilename(range) {
  // File name keeps the Word template's short form: "LCT tu 07.9-12.9.pdf".
  const short = (iso) => {
    const [, month, day] = String(iso || '').split('-');
    return month && day ? `${day}.${Number(month)}` : '';
  };
  const start = short(range.startIso);
  const end = short(range.endIso);
  return `LCT tu ${start}-${end}.pdf`;
}
