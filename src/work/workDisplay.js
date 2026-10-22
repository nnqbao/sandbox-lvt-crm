export const WORK_LIST_TAB_TODO = 'todo';
export const WORK_LIST_TAB_PENDING = 'pending';
export const WORK_LIST_TAB_OVERDUE = 'overdue';
export const WORK_LIST_TAB_COMPLETED = 'completed';
/** Keep in sync with WORK_COMPLETION_NOTE_MAX_LENGTH in convex/assignmentPolicy.ts */
export const WORK_COMPLETION_NOTE_MAX_LENGTH = 500;

export function workTabAllowsPersonalReminder(tab) {
  return tab === WORK_LIST_TAB_TODO || tab === WORK_LIST_TAB_OVERDUE;
}

export function workReminderSourceType(item) {
  return item?.type === 'department' ? 'department_work' : 'personal_task';
}

const COMPLETED_STATUSES = new Set(['completed', 'completed_late']);
/** `awaiting_approval` = document waiting for Ban giám hiệu (Việc tôi tạo of văn thư). */
const PENDING_REVIEW_STATUSES = new Set(['pending_completion', 'pending_approval', 'awaiting_approval']);

export function vietnamToday(now = Date.now()) {
  return new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** dd/mm/yyyy HH:mm in Vietnam time (approval decisions, submissions). */
export function formatWorkDateTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '';
  const shifted = new Date(value + 7 * 60 * 60 * 1000).toISOString();
  const [date, time] = shifted.split('T');
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year} ${time.slice(0, 5)}`;
}

/** Approver chip label: "Đã duyệt 22/10/2026 14:05", "Trả lại …", or "Chờ duyệt". */
export function workApproverDecisionLabel(approver) {
  const when = formatWorkDateTime(approver?.decidedAt);
  if (approver?.approved) return when ? `Đã duyệt ${when}` : 'Đã duyệt';
  if (approver?.rejected) return when ? `Trả lại ${when}` : 'Trả lại';
  return 'Chờ duyệt';
}

/**
 * A document that needs Ban giám hiệu approval and is not approved yet has not
 * been handed to anyone: its assignments read "Chờ duyệt (chưa giao)" instead
 * of the task progress (which would say "Đang thực hiện · Chưa hoàn thành").
 */
export function isWorkDocumentUnreleased(document) {
  return Boolean(document?.requiresApproval) && document?.status !== 'approved';
}

export function workAssignmentDisplayStatus(document, assignment) {
  if (isWorkDocumentUnreleased(document)) return 'unreleased';
  return assignment?.status || 'unassigned';
}

/** Role-neutral creator label: admin is "Quản trị viên", moderator "Văn thư". */
export function workCreatorRoleLabel(role) {
  if (role === 'admin') return 'Quản trị viên';
  if (role === 'moderator') return 'Văn thư';
  return '';
}

export function workCreatorLabel(document) {
  const name = document?.creatorName || '—';
  const role = workCreatorRoleLabel(document?.creatorRole);
  return `Người tạo: ${name}${role ? ` (${role})` : ''}`;
}

export function formatWorkDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return '—';
  return `${day}/${month}/${year}`;
}

export function emptyWorkAssignment(type) {
  return {
    type: type === 'individual' ? 'individual' : 'department',
    departmentId: '',
    userIds: [],
    content: '',
    deadline: '',
  };
}

export function assignmentsFromDocument(document) {
  return (document?.assignments || []).flatMap((assignment) => {
    if (assignment.type === 'individual') {
      const ids = assignment.userIds?.length ? assignment.userIds : [''];
      return ids.map((userId) => ({
        type: 'individual',
        departmentId: assignment.departmentId || '',
        userIds: userId ? [String(userId)] : [],
        content: assignment.content || '',
        deadline: assignment.deadline || '',
      }));
    }
    return [{
      type: 'department',
      departmentId: String(assignment.departmentId || ''),
      userIds: [],
      content: assignment.content || '',
      deadline: assignment.deadline || '',
    }];
  });
}

/**
 * Mirrors `isSelfOnlyWorkAssignment` (convex/workDocumentPolicy.ts): every
 * assignment row is individual and holds only the creator. A văn thư document
 * assigned only to its creator is released without Ban giám hiệu approval.
 */
export function isSelfOnlyWorkAssignment(assignments, creatorId) {
  const creator = String(creatorId || '').trim();
  const rows = assignments || [];
  if (!creator || !rows.length) return false;
  return rows.every((row) => {
    if (row?.type !== 'individual') return false;
    const userIds = (row.userIds || []).map((id) => String(id).trim()).filter(Boolean);
    return userIds.length > 0 && userIds.every((id) => id === creator);
  });
}

/** Client mirror of `workDocumentNeedsApproval`; the server re-decides on save. */
export function workFormRequiresApproval({ followsApprovalFlow, assignments, creatorId }) {
  return Boolean(followsApprovalFlow) && !isSelfOnlyWorkAssignment(assignments, creatorId);
}

/**
 * Client mirror of `workEditNeedsApproval` (convex/workDocumentPolicy.ts).
 * An admin edit of an approved/released document (`editRequiresReapproval`)
 * goes back to Ban giám hiệu unless the editing admin is the only assignee;
 * other edits follow the creator-based rule. The server re-decides on save.
 */
export function workEditFormRequiresApproval({ document, assignments, editorId }) {
  if (document?.editRequiresReapproval) return !isSelfOnlyWorkAssignment(assignments, editorId);
  return workFormRequiresApproval({
    followsApprovalFlow: document?.approvalFlow ?? document?.requiresApproval,
    assignments,
    creatorId: document?.createdBy,
  });
}

/** "Đã chỉnh sửa bởi {Họ tên} lúc HH:mm dd/MM/yyyy" (Vietnam time); empty when never edited. */
export function workLastEditedLabel(item) {
  const name = String(item?.lastEditedByName || '').trim();
  const at = Number(item?.lastEditedAt);
  if (!name || !Number.isFinite(at) || at <= 0) return '';
  const [date, time] = formatWorkDateTime(at).split(' ');
  return `Đã chỉnh sửa bởi ${name} lúc ${time} ${date}`;
}

/** Read-only note when an assignee already submitted (server: `hasSubmissions`). */
export const WORK_HAS_SUBMISSIONS_NOTE = 'Đã có người nộp kết quả — công việc chỉ xem.';

export const WORK_REAPPROVAL_WARNING = 'Công việc đã được duyệt. Sau khi lưu, công việc sẽ phải gửi Ban giám hiệu duyệt lại và tạm ẩn với người được giao.';

export function workAssignmentPayload(assignments) {
  return (assignments || []).map((item) => (
    item.type === 'individual'
      ? { type: 'individual', userIds: item.userIds, content: item.content, deadline: item.deadline }
      : { type: 'department', departmentId: item.departmentId, content: item.content, deadline: item.deadline }
  ));
}

export function workDeadlines(item) {
  if (Array.isArray(item?.assignments) && item.assignments.length) {
    return item.assignments.map((row) => row.deadline).filter(Boolean);
  }
  return item?.deadline ? [item.deadline] : [];
}

export function isWorkCompleted(item) {
  if (COMPLETED_STATUSES.has(item?.workStatus || item?.status)) return true;
  const assignmentStatuses = (item?.assignments || []).map((row) => row?.status).filter(Boolean);
  return assignmentStatuses.length > 0 && assignmentStatuses.every((status) => COMPLETED_STATUSES.has(status));
}

export function isWorkPendingReview(item) {
  if (PENDING_REVIEW_STATUSES.has(item?.workStatus || item?.status)) return true;
  return (item?.assignments || []).some((row) => PENDING_REVIEW_STATUSES.has(row?.status));
}

function allWorkDeadlinesPassed(item, today) {
  const deadlines = workDeadlines(item);
  if (!deadlines.length) return false;
  return deadlines.every((deadline) => deadline < today);
}

export function isWorkOverdue(item, today = vietnamToday()) {
  return !isWorkCompleted(item) && allWorkDeadlinesPassed(item, today);
}

export function isWorkPast(item, today = vietnamToday()) {
  return isWorkCompleted(item) || allWorkDeadlinesPassed(item, today);
}

export function workDeadlineKey(item) {
  const deadlines = workDeadlines(item);
  if (!deadlines.length) return '';
  return [...deadlines].sort()[0];
}

export function workListTabOf(item, today = vietnamToday()) {
  if (isWorkCompleted(item)) return WORK_LIST_TAB_COMPLETED;
  if (isWorkPendingReview(item)) return WORK_LIST_TAB_PENDING;
  if (isWorkOverdue(item, today)) return WORK_LIST_TAB_OVERDUE;
  return WORK_LIST_TAB_TODO;
}

export function filterWorksByTab(list, tab = WORK_LIST_TAB_TODO, today = vietnamToday()) {
  const items = Array.isArray(list) ? list : [];
  const compare = (a, b) => workDeadlineKey(a).localeCompare(workDeadlineKey(b));
  return items.filter((item) => workListTabOf(item, today) === tab).sort(compare);
}

export function workListTabCounts(list, today = vietnamToday()) {
  const counts = {
    [WORK_LIST_TAB_TODO]: 0,
    [WORK_LIST_TAB_PENDING]: 0,
    [WORK_LIST_TAB_OVERDUE]: 0,
    [WORK_LIST_TAB_COMPLETED]: 0,
  };
  for (const item of Array.isArray(list) ? list : []) {
    counts[workListTabOf(item, today)] += 1;
  }
  return counts;
}

export function formatWorkTabCount(count) {
  const n = Number(count) || 0;
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

export function emptyWorkSearch() {
  return {
    query: '',
    department: '',
    person: '',
    dateFrom: '',
    dateTo: '',
  };
}

/** Find the visible work card for a Trao đổi notification (sourceId = officeDocuments id). */
export function findWorkChatFocusItem(lists, documentId) {
  const id = String(documentId || '');
  if (!id) return null;
  const documents = Array.isArray(lists?.documents) ? lists.documents : [];
  const document = documents.find((row) => String(row._id) === id);
  if (document) {
    return {
      item: document,
      expandId: document._id,
      title: document.title || document.fileName || 'Công việc',
    };
  }
  const assigned = [
    ...(Array.isArray(lists?.myTasks) ? lists.myTasks : []),
    ...(Array.isArray(lists?.departmentWorks) ? lists.departmentWorks : []),
    ...(Array.isArray(lists?.personalTasks) ? lists.personalTasks : []),
  ];
  const row = assigned.find((item) => String(item.documentId) === id);
  if (!row) return null;
  return {
    item: row,
    expandId: row._id,
    title: row.documentTitle || row.document?.title || row.content || row.title || 'Công việc',
  };
}

function normalizeWorkSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesWorkSearch(haystack, needle) {
  if (!needle) return true;
  return normalizeWorkSearchText(haystack).includes(needle);
}

function workDepartmentSearchText(item) {
  const names = [item?.departmentName, item?.document?.departmentName];
  for (const assignment of item?.assignments || []) {
    names.push(assignment?.departmentName);
  }
  return names.filter(Boolean).join(' ');
}

function workPersonSearchText(item) {
  const names = [...(item?.userNames || [])];
  for (const assignment of item?.assignments || []) {
    names.push(...(assignment?.userNames || []));
    for (const member of assignment?.members || []) names.push(member?.name, member?.email);
  }
  for (const member of item?.members || []) names.push(member?.name, member?.email);
  for (const member of item?.pendingMembers || []) names.push(member?.name, member?.email);
  for (const task of item?.tasks || []) {
    for (const person of task?.assignees || []) names.push(person?.name, person?.email);
  }
  return names.filter(Boolean).join(' ');
}

function workQueryTitleText(item) {
  return [item?.title, item?.documentTitle, item?.document?.title, item?.fileName, workListTitle(item)]
    .filter(Boolean)
    .join(' ');
}

function workQueryContentText(item) {
  const parts = [item?.content, item?.documentContent, workContentSummary(item)];
  for (const assignment of item?.assignments || []) parts.push(assignment?.content);
  return parts.filter(Boolean).join(' ');
}

function workOverlapsDateRange(item, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const deadlines = workDeadlines(item);
  if (!deadlines.length) return false;
  return deadlines.some((deadline) => {
    if (dateFrom && deadline < dateFrom) return false;
    if (dateTo && deadline > dateTo) return false;
    return true;
  });
}

export function filterWorksBySearch(list, search = {}) {
  const items = Array.isArray(list) ? list : [];
  const query = normalizeWorkSearchText(search.query);
  const department = normalizeWorkSearchText(search.department);
  const person = normalizeWorkSearchText(search.person);
  const dateFrom = String(search.dateFrom || '').trim();
  const dateTo = String(search.dateTo || '').trim();
  if (!query && !department && !person && !dateFrom && !dateTo) return items;
  return items.filter((item) => {
    if (query && !includesWorkSearch(workQueryTitleText(item), query) && !includesWorkSearch(workQueryContentText(item), query)) {
      return false;
    }
    if (!includesWorkSearch(workDepartmentSearchText(item), department)) return false;
    if (!includesWorkSearch(workPersonSearchText(item), person)) return false;
    return workOverlapsDateRange(item, dateFrom, dateTo);
  });
}

export function assignmentRecipientLabel(assignment, catalogs = {}) {
  if (assignment?.type === 'individual') {
    const id = String(assignment.userIds?.[0] || '');
    const user = (catalogs.users || []).find((row) => String(row._id) === id);
    return user?.name || assignment.userNames?.[0] || 'Chưa chọn người';
  }
  const department = (catalogs.departments || []).find(
    (row) => String(row._id) === String(assignment?.departmentId || ''),
  );
  return department?.name || assignment?.departmentName || 'Chưa chọn phòng ban';
}

/** @param {{ title?: string, fileName?: string, assignments?: object[] }} [form] */
export function buildWorkCreatePreview(form = {}, catalogs = {}) {
  const title = form.title;
  const fileName = form.fileName;
  const assignments = form.assignments;
  return {
    title: String(title || '').trim() || 'Công việc',
    fileName: String(fileName || '').trim() || 'Không có tệp',
    rows: (assignments || []).map((assignment) => ({
      recipient: assignmentRecipientLabel(assignment, catalogs),
      content: String(assignment.content || '').trim() || '—',
      deadline: formatWorkDate(assignment.deadline),
    })),
  };
}

export function workListTitle(item) {
  return String(item?.title || item?.content || item?.fileName || '').trim() || 'Công việc';
}

export function workRecipientSummary(item) {
  if (item?.assignments?.length) {
    return item.assignments
      .map((assignment) => (
        assignment.type === 'individual'
          ? (assignment.userNames?.join(', ') || 'Cá nhân')
          : (assignment.departmentName || 'Phòng ban')
      ))
      .filter(Boolean)
      .join(', ') || '—';
  }
  if (item?.type === 'individual') return item.userNames?.join(', ') || 'Cá nhân';
  return item?.departmentName || '—';
}

export function workContentSummary(item) {
  if (item?.assignments?.length) {
    const contents = item.assignments.map((assignment) => assignment.content).filter(Boolean);
    if (contents.length === 1) return contents[0];
    if (contents.length > 1) return `${contents[0]} (+${contents.length - 1})`;
  }
  return item?.content || item?.documentContent || '—';
}
