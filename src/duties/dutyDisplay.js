export function formatViDate(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

export function toDateTimeLocalValue(date, time) {
  if (!date) return '';
  return `${date}T${time || '08:00'}`;
}

export function fromDateTimeLocalValue(value) {
  const [date = '', clock = ''] = String(value || '').split('T');
  const timeMatch = clock.match(/^(\d{1,2}):(\d{2})/);
  return {
    date: date.slice(0, 10),
    time: timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : clock.slice(0, 5),
  };
}

export function formatDutyDateTimeLine(date, time, { allDay = false } = {}) {
  const dateText = formatViDate(date);
  if (dateText === '—') return '—';
  if (allDay) return dateText;
  return `${dateText} - ${time || '—'}`;
}

export function dutyDisplayTitle(duty) {
  return String(duty?.title || '').trim() || String(duty?.content || '').trim() || 'Công tác';
}

export function emptyDutyForm() {
  return {
    title: '',
    startDate: '',
    endDate: '',
    startTime: '08:00',
    endTime: '17:00',
    allDay: false,
    content: '',
    locationText: '',
    departmentIds: [],
    unitIds: [],
    participantUserIds: [],
    otherParticipants: '',
  };
}

export function dutyFormFromItem(item) {
  return {
    title: item.title || item.content || '',
    startDate: item.startDate,
    endDate: item.endDate,
    startTime: item.startTime,
    endTime: item.endTime,
    allDay: Boolean(item.allDay),
    content: item.content || '',
    locationText: item.locationText || (item.locationNames || []).join(', '),
    departmentIds: [...(item.departmentIds || [])],
    unitIds: [...(item.unitIds || [])],
    participantUserIds: [...(item.participantUserIds || [])],
    otherParticipants: item.otherParticipants || '',
  };
}

export function dutyPayloadFromForm(form, { includeDepartments = true } = {}) {
  return {
    title: form.title,
    startDate: form.startDate,
    endDate: form.allDay ? form.startDate : form.endDate,
    startTime: form.startTime,
    endTime: form.endTime,
    allDay: form.allDay,
    content: form.content,
    locationText: form.locationText,
    departmentIds: includeDepartments ? form.departmentIds : [],
    // Phòng ban, like Tổ chuyên môn, is a văn thư (admin/mod) pick.
    unitIds: includeDepartments ? form.unitIds || [] : [],
    participantUserIds: form.participantUserIds,
    otherParticipants: form.otherParticipants || '',
  };
}

export function dutyFormHasParticipants(form, options) {
  const payload = dutyPayloadFromForm(form, options);
  return (
    payload.departmentIds.length > 0 ||
    payload.unitIds.length > 0 ||
    payload.participantUserIds.length > 0 ||
    Boolean(String(payload.otherParticipants || '').trim())
  );
}

export function applyDutyFormField(prev, field, value) {
  const next = { ...prev, [field]: value };
  if (field === 'allDay' && value) {
    next.endDate = prev.startDate || prev.endDate;
  }
  if (field === 'startDate' && (prev.allDay || next.allDay)) {
    next.endDate = value;
  }
  return next;
}

export function applyDutyStartDateTime(prev, date, time) {
  return {
    ...prev,
    startDate: date,
    startTime: time || prev.startTime,
    endDate: prev.allDay ? date : prev.endDate,
  };
}

export function applyDutyEndDateTime(prev, date, time) {
  return {
    ...prev,
    endDate: date,
    endTime: time || prev.endTime,
  };
}

export const DUTY_LIST_TAB_UPCOMING = 'upcoming';
export const DUTY_LIST_TAB_PAST = 'past';

export function isDutyPast(item) {
  return Boolean(item?.timing?.isOverdue);
}

export function tabForDuty(item) {
  return isDutyPast(item) ? DUTY_LIST_TAB_PAST : DUTY_LIST_TAB_UPCOMING;
}

function dutyStartKey(item) {
  return `${item?.startDate || ''}T${item?.startTime || ''}`;
}

function dutyEndKey(item) {
  return `${item?.endDate || ''}T${item?.endTime || ''}`;
}

export function isDutyCreatedBy(item, userId) {
  return Boolean(userId) && String(item?.createdBy || '') === String(userId);
}

export function isDutyAssignedTo(item, userId) {
  if (item?.isMine === true) return true;
  const id = String(userId || '');
  if (!id) return false;
  if ((item?.participantUserIds || []).some((value) => String(value) === id)) return true;
  if ((item?.participants || []).some((person) => String(person._id) === id)) return true;
  return false;
}

export function splitDutyLists(list, userId, { includeManagedOthers = false, leftoverBucket = 'created' } = {}) {
  const items = Array.isArray(list) ? list : [];
  const mine = items.filter((item) => isDutyAssignedTo(item, userId));
  const created = items.filter((item) => isDutyCreatedBy(item, userId));
  if (!includeManagedOthers) {
    return { mine, created };
  }
  const leftovers = items.filter((item) => !isDutyAssignedTo(item, userId) && !isDutyCreatedBy(item, userId));
  if (leftoverBucket === 'mine') {
    return { mine: [...mine, ...leftovers], created };
  }
  return { mine, created: [...created, ...leftovers] };
}

export function filterDutiesByTab(list, tab = DUTY_LIST_TAB_UPCOMING) {
  const items = Array.isArray(list) ? list : [];
  if (tab === DUTY_LIST_TAB_PAST) {
    return items
      .filter((item) => isDutyPast(item))
      .sort((a, b) => dutyEndKey(a).localeCompare(dutyEndKey(b)) || dutyStartKey(a).localeCompare(dutyStartKey(b)));
  }
  return items
    .filter((item) => !isDutyPast(item))
    .sort((a, b) => dutyStartKey(a).localeCompare(dutyStartKey(b)));
}

export function emptyDutySearch() {
  return {
    query: '',
    department: '',
    person: '',
    location: '',
    dateFrom: '',
    dateTo: '',
  };
}

function normalizeDutySearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesDutySearch(haystack, needle) {
  if (!needle) return true;
  return normalizeDutySearchText(haystack).includes(needle);
}

function dutyPersonSearchText(item) {
  const names = [...(item?.participantNames || [])];
  for (const person of item?.participants || []) {
    names.push(person?.name, person?.email);
  }
  names.push(item?.otherParticipants);
  return names.filter(Boolean).join(' ');
}

function dutyLocationSearchText(item) {
  return [...(item?.locationNames || []), item?.locationText].filter(Boolean).join(' ');
}

function dutyOverlapsDateRange(item, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const start = String(item?.startDate || '');
  const end = String(item?.endDate || item?.startDate || '');
  if (!start) return false;
  if (dateFrom && end < dateFrom) return false;
  if (dateTo && start > dateTo) return false;
  return true;
}

export function countDutyAdvancedFilters(search = {}, { includeLocation = true } = {}) {
  const fields = includeLocation
    ? ['department', 'person', 'location', 'dateFrom', 'dateTo']
    : ['department', 'person', 'dateFrom', 'dateTo'];
  return fields.filter((field) => String(search?.[field] || '').trim()).length;
}

export function filterDutiesBySearch(list, search = {}) {
  const items = Array.isArray(list) ? list : [];
  const query = normalizeDutySearchText(search.query);
  const department = normalizeDutySearchText(search.department);
  const person = normalizeDutySearchText(search.person);
  const location = normalizeDutySearchText(search.location);
  const dateFrom = String(search.dateFrom || '').trim();
  const dateTo = String(search.dateTo || '').trim();
  if (!query && !department && !person && !location && !dateFrom && !dateTo) return items;
  return items.filter((item) => {
    if (query && !includesDutySearch(item?.title, query) && !includesDutySearch(item?.content, query)) {
      return false;
    }
    if (!includesDutySearch([...(item?.departmentNames || []), ...(item?.unitNames || [])].join(' '), department)) return false;
    if (!includesDutySearch(dutyPersonSearchText(item), person)) return false;
    if (!includesDutySearch(dutyLocationSearchText(item), location)) return false;
    return dutyOverlapsDateRange(item, dateFrom, dateTo);
  });
}

function labelsForIds(ids, rows, getLabel) {
  const wanted = new Set((ids || []).map((id) => String(id)));
  return (rows || [])
    .filter((row) => wanted.has(String(row._id)))
    .map((row) => getLabel(row))
    .filter(Boolean);
}

export function buildDutyCreatePreview(form, catalogs = {}) {
  const includeDepartments = catalogs.includeDepartments !== false;
  const payload = dutyPayloadFromForm(form, { includeDepartments });
  const departments = labelsForIds(payload.departmentIds, catalogs.departments, (row) => row.name || row.code);
  const units = labelsForIds(payload.unitIds, catalogs.units, (row) => row.name || row.code);
  const participants = labelsForIds(
    payload.participantUserIds,
    catalogs.users,
    (row) => row.name || row.email || '—',
  );
  return {
    title: dutyDisplayTitle(payload),
    content: String(payload.content || '').trim() || '—',
    timeStart: formatDutyDateTimeLine(payload.startDate, payload.startTime, { allDay: payload.allDay }),
    timeEnd: payload.allDay ? 'Cả ngày' : formatDutyDateTimeLine(payload.endDate, payload.endTime),
    location: String(payload.locationText || '').trim() || '—',
    showDepartments: includeDepartments,
    departments: departments.length ? departments.join(', ') : '—',
    units: units.length ? units.join(', ') : '—',
    participants: participants.length ? participants.join(', ') : '—',
    otherParticipants: String(payload.otherParticipants || '').trim() || '—',
  };
}
