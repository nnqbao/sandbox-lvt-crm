import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canAssignWorkDepartment,
  canAssignWorkToUser,
  canCreateAssignments,
  canCreateWorkDocuments,
  canSeeLiveWork,
  isWorkReleased,
} from '../convex/assignmentPolicy.ts';
import {
  applyWorkApproval,
  applyWorkRejection,
  canApproveWorkDocument,
  canMutateWorkDocument,
  canRejectWorkDocument,
  cleanWorkReturnReason,
  isEligibleWorkApprover,
  isWorkApprovalLocked,
  workApprovalDecidedAt,
  workApprovalRequestText,
  workApprovalResubmittedBy,
  workApprovalSubmission,
  workCreatorApprovalNotice,
  workDocumentFollowsApprovalFlow,
  workDocumentNeedsApproval,
  workDocumentRequiresApproval,
  isSelfOnlyWorkAssignment,
  workReturnReason,
  WORK_APPROVED_NOTICE_MS,
  workAssignmentsUnchanged,
  workDocumentEditPolicy,
  workEditNeedsApproval,
  workHasSubmissions,
} from '../convex/workDocumentPolicy.ts';
import { canAccessWorkChat } from '../convex/workMessagePolicy.ts';
import { messageFor } from '../src/lib/appErrorMessage.js';
import { workListTabOf, WORK_LIST_TAB_PENDING, WORK_LIST_TAB_TODO } from '../src/work/workDisplay.js';

const DAY = 24 * 60 * 60 * 1000;

test('chỉ văn thư (admin/mod) tạo thì cần Ban giám hiệu duyệt; người khác giao ngay', () => {
  assert.equal(workDocumentRequiresApproval({ creatorRole: 'admin' }), true);
  assert.equal(workDocumentRequiresApproval({ creatorRole: 'moderator' }), true);
  assert.equal(workDocumentRequiresApproval({ creatorRole: 'user' }), false);
  // Stored decision wins over the creator's later role change.
  assert.equal(workDocumentRequiresApproval({ requiresApproval: false, creatorRole: 'moderator' }), false);
  assert.equal(workDocumentRequiresApproval({ requiresApproval: true, creatorRole: 'user' }), true);
});

test('văn thư tự giao cho chính mình: không cần duyệt; có thêm người khác/phòng ban thì phải duyệt', async () => {
  const self = (id = 'vt') => ({ type: 'individual', userIds: [id], content: 'x', deadline: '2026-10-30' });
  const flow = workDocumentFollowsApprovalFlow({ creatorRole: 'moderator' });
  assert.equal(flow, true);
  assert.equal(workDocumentFollowsApprovalFlow({ creatorRole: 'admin' }), true);
  assert.equal(workDocumentFollowsApprovalFlow({ creatorRole: 'user' }), false);
  // A stored `false` on an ops document (self-only when saved) stays in the văn thư flow for later edits.
  assert.equal(workDocumentFollowsApprovalFlow({ requiresApproval: false, creatorRole: 'admin' }), true);
  assert.equal(workDocumentFollowsApprovalFlow({ requiresApproval: true, creatorRole: 'user' }), true);

  // Self-only → released immediately, no approvers.
  assert.equal(isSelfOnlyWorkAssignment([self()], 'vt'), true);
  assert.equal(workDocumentNeedsApproval({ followsApprovalFlow: flow, assignments: [self()], creatorId: 'vt' }), false);
  const released = workApprovalSubmission(false, []);
  assert.equal(released.status, 'approved');
  assert.deepEqual(released.approverUserIds, []);
  // Self + someone else, self + department, or nobody selected → normal BGH approval.
  for (const assignments of [
    [self(), self('gv')],
    [{ type: 'individual', userIds: ['vt', 'gv'], content: 'x', deadline: '2026-10-30' }],
    [self(), { type: 'department', departmentId: 'bgh', content: 'x', deadline: '2026-10-30' }],
    [{ type: 'department', departmentId: 'vp', content: 'x', deadline: '2026-10-30' }],
    [{ type: 'individual', userIds: [], content: 'x', deadline: '2026-10-30' }],
    [self('gv')],
    [],
  ]) {
    assert.equal(
      workDocumentNeedsApproval({ followsApprovalFlow: flow, assignments, creatorId: 'vt' }),
      true,
      JSON.stringify(assignments),
    );
  }
  // Untyped input rows are department assignments (server default), never self-only.
  assert.equal(isSelfOnlyWorkAssignment([{ userIds: ['vt'] }], 'vt'), false);
  // Non-ops creators never need approval.
  assert.equal(workDocumentNeedsApproval({ followsApprovalFlow: false, assignments: [self('gv')], creatorId: 'tt' }), false);

  // Client mirror agrees with the server policy.
  const { workFormRequiresApproval, isSelfOnlyWorkAssignment: clientSelfOnly } = await import('../src/work/workDisplay.js');
  assert.equal(clientSelfOnly([self()], 'vt'), true);
  assert.equal(workFormRequiresApproval({ followsApprovalFlow: true, assignments: [self()], creatorId: 'vt' }), false);
  assert.equal(workFormRequiresApproval({ followsApprovalFlow: true, assignments: [self(), self('gv')], creatorId: 'vt' }), true);
  assert.equal(workFormRequiresApproval({ followsApprovalFlow: false, assignments: [self('gv')], creatorId: 'vt' }), false);

  // Create and update decide approval from the submitted assignments and the document creator.
  const source = await readFile(new URL('../convex/work.ts', import.meta.url), 'utf8');
  const create = source.slice(source.indexOf('export const createDocument'), source.indexOf('export const updateDocument'));
  assert.match(create, /workDocumentNeedsApproval\(\{[\s\S]*assignments: args\.assignments,[\s\S]*creatorId: actor\.user\._id/);
  const update = source.slice(source.indexOf('export const updateDocument'), source.indexOf('export const updateDocument') + 6000);
  assert.match(update, /workEditNeedsApproval\(\{[\s\S]*assignments: args\.assignments,[\s\S]*creatorId: document\.createdBy,[\s\S]*editorId: actor\.user\._id/);
});

test('ai được tạo công việc: admin/mod và mọi user cấp 2 sao trở lên; cấp 1 thì không', () => {
  assert.equal(canCreateWorkDocuments('admin', 0), true);
  assert.equal(canCreateWorkDocuments('moderator', 0), true);
  assert.equal(canCreateWorkDocuments('user', 0), false);
  assert.equal(canCreateWorkDocuments('user', 1), false);
  assert.equal(canCreateWorkDocuments('user', 2), true);
  assert.equal(canCreateWorkDocuments('user', 3), true);
  assert.equal(canCreateWorkDocuments('user', 4), true);
  assert.equal(canCreateWorkDocuments('user', 5), true);
  // Công tác creation is unchanged: Ban giám hiệu still cannot create duties.
  assert.equal(canCreateAssignments('user', 4), false);
  assert.equal(canCreateAssignments('user', 5), false);
});

test('giao việc cho ai: tổ trưởng cùng phòng cấp thấp hơn; BGH mọi phòng cấp thấp hơn', () => {
  const lead = { _id: 'lead', role: 'user', level: 3, departmentId: 'math' };
  const deputy = { _id: 'deputy', role: 'user', level: 2, departmentId: 'math' };
  const bgh = { _id: 'vp', role: 'user', level: 4, departmentId: 'board' };
  const principal = { _id: 'p', role: 'user', level: 5, departmentId: 'board' };
  const teacherMath = { _id: 't1', level: 1, departmentId: 'math' };
  const teacherLit = { _id: 't2', level: 1, departmentId: 'lit' };
  const leadLit = { _id: 'l2', level: 3, departmentId: 'lit' };

  // Same-department superior.
  assert.equal(canAssignWorkToUser(lead, teacherMath), true);
  assert.equal(canAssignWorkToUser(lead, { ...deputy, level: 2 }), true);
  assert.equal(canAssignWorkToUser(deputy, teacherMath), true);
  assert.equal(canAssignWorkToUser(lead, teacherLit), false, 'other department');
  assert.equal(canAssignWorkToUser(deputy, { _id: 'peer', level: 2, departmentId: 'math' }), false, 'peer');
  assert.equal(canAssignWorkToUser(deputy, { _id: 'boss', level: 3, departmentId: 'math' }), false, 'higher');
  assert.equal(canAssignWorkToUser(lead, { ...lead, level: 3 }), false, 'self');
  assert.equal(canAssignWorkToUser(lead, { _id: 'np', level: 0, departmentId: 'math' }), false, 'no position');
  assert.equal(
    canAssignWorkToUser({ ...lead, departmentId: '' }, { _id: 'x', level: 1, departmentId: '' }),
    false,
    'no department',
  );

  // Ban giám hiệu: any department, strictly lower level.
  assert.equal(canAssignWorkToUser(bgh, teacherMath), true);
  assert.equal(canAssignWorkToUser(bgh, teacherLit), true);
  assert.equal(canAssignWorkToUser(bgh, leadLit), true);
  assert.equal(canAssignWorkToUser(bgh, { _id: 'vp2', level: 4, departmentId: 'board' }), false, 'peer BGH');
  assert.equal(canAssignWorkToUser(bgh, { _id: 'p', level: 5, departmentId: 'board' }), false, 'principal');
  assert.equal(canAssignWorkToUser(principal, { _id: 'vp', level: 4, departmentId: 'board' }), true);

  // Level 1 cannot assign anybody.
  assert.equal(canAssignWorkToUser({ _id: 't1', role: 'user', level: 1, departmentId: 'math' }, { _id: 'z', level: 1, departmentId: 'math' }), false);

  // Ops are checked by moderator scope instead.
  assert.equal(canAssignWorkToUser({ _id: 'mod', role: 'moderator', level: 0 }, teacherLit), true);
});

test('giao cả phòng ban: chỉ admin/mod và Ban giám hiệu', () => {
  assert.equal(canAssignWorkDepartment('admin', 0), true);
  assert.equal(canAssignWorkDepartment('moderator', 0), true);
  assert.equal(canAssignWorkDepartment('user', 4), true);
  assert.equal(canAssignWorkDepartment('user', 5), true);
  assert.equal(canAssignWorkDepartment('user', 3), false);
  assert.equal(canAssignWorkDepartment('user', 2), false);
  assert.equal(canAssignWorkDepartment('user', 1), false);
});

test('người duyệt: user đang hoạt động cấp 4+, không phải admin/mod', () => {
  assert.equal(isEligibleWorkApprover({ status: 'active', role: 'user', level: 4 }), true);
  assert.equal(isEligibleWorkApprover({ status: 'active', role: 'user', level: 5 }), true);
  assert.equal(isEligibleWorkApprover({ status: 'active', role: 'user', level: 3 }), false);
  assert.equal(isEligibleWorkApprover({ status: 'active', role: 'moderator', level: 5 }), false);
  assert.equal(isEligibleWorkApprover({ status: 'active', role: 'admin', level: 5 }), false);
  assert.equal(isEligibleWorkApprover({ status: 'disabled', role: 'user', level: 5 }), false);
});

test('gửi duyệt: văn thư bắt buộc chọn ít nhất 1 người duyệt; người khác giao ngay', () => {
  assert.throws(() => workApprovalSubmission(true, []), /WORK_APPROVER_REQUIRED/);
  assert.throws(() => workApprovalSubmission(true, ['', '']), /WORK_APPROVER_REQUIRED/);
  const pending = workApprovalSubmission(true, ['vp', 'p', 'vp']);
  assert.equal(pending.status, 'pending');
  assert.deepEqual(pending.approverUserIds, ['vp', 'p']);
  assert.deepEqual(pending.approvedByUserIds, []);
  assert.deepEqual(pending.rejectedByUserIds, []);
  assert.deepEqual(pending.approvalDecisions, []);
  const released = workApprovalSubmission(false, ['vp']);
  assert.equal(released.status, 'approved');
  assert.deepEqual(released.approverUserIds, []);
  assert.equal(isWorkReleased({ active: true, status: pending.status }), false);
  assert.equal(isWorkReleased({ active: true, status: released.status }), true);
});

test('duyệt: chỉ chuyển approved khi đủ mọi người duyệt; lần duyệt đầu khóa sửa/xóa vĩnh viễn', () => {
  const doc = { active: true, ...workApprovalSubmission(true, ['vp', 'p']) };
  assert.equal(canApproveWorkDocument(doc, 'vp'), true);
  assert.equal(canApproveWorkDocument(doc, 'outsider'), false);
  assert.equal(canMutateWorkDocument(doc), true);

  const first = { ...doc, ...applyWorkApproval(doc, 'vp', 1000) };
  assert.equal(first.status, 'pending', 'still waiting for the principal');
  assert.equal(isWorkReleased(first), false);
  assert.equal(isWorkApprovalLocked(first), true);
  assert.equal(canMutateWorkDocument(first), false, 'locked although aggregate status is pending');
  assert.equal(canRejectWorkDocument(first), false, 'no reject after a partial approval');
  assert.equal(canApproveWorkDocument(first, 'vp'), false, 'already approved');
  assert.equal(canApproveWorkDocument(first, 'p'), true);

  const second = { ...first, ...applyWorkApproval(first, 'p', 2000) };
  assert.equal(second.status, 'approved');
  assert.equal(isWorkReleased(second), true);
  assert.equal(canMutateWorkDocument(second), false);
  assert.equal(workApprovalDecidedAt(second), 2000);
  // Deadline passing later does not unlock it.
  assert.equal(canMutateWorkDocument({ ...second, deadline: '2000-01-01' }), false);
});

test('trả lại: chỉ khi chưa ai duyệt, bắt buộc lý do; bị trả lại thì người tạo sửa và gửi lại', () => {
  const doc = { active: true, ...workApprovalSubmission(true, ['vp', 'p']) };
  assert.equal(canRejectWorkDocument(doc), true);
  assert.throws(() => cleanWorkReturnReason('   '), /WORK_RETURN_REASON_INVALID/);
  assert.throws(() => cleanWorkReturnReason('x'.repeat(501)), /WORK_RETURN_REASON_INVALID/);
  const reason = cleanWorkReturnReason('  Thiếu hạn chót  ');
  assert.equal(reason, 'Thiếu hạn chót');

  const returned = { ...doc, ...applyWorkRejection(doc, 'p', reason, 3000) };
  assert.equal(returned.status, 'rejected');
  assert.equal(isWorkReleased(returned), false);
  assert.equal(canRejectWorkDocument(returned), false);
  assert.equal(canApproveWorkDocument(returned, 'vp'), false, 'no approve after return');
  assert.equal(canMutateWorkDocument(returned), true, 'creator may edit a returned document');
  assert.equal(workReturnReason(returned), 'Thiếu hạn chót');
  assert.equal(workApprovalDecidedAt(returned), 3000);

  // Editing resets every decision and resubmits.
  const resubmitted = { ...returned, ...workApprovalSubmission(true, ['vp', 'p']) };
  assert.equal(resubmitted.status, 'pending');
  assert.deepEqual(resubmitted.rejectedByUserIds, []);
  assert.deepEqual(resubmitted.approvalDecisions, []);
  assert.equal(canApproveWorkDocument(resubmitted, 'p'), true);
});

test('chờ duyệt: chỉ người tạo, người duyệt và admin/mod trong phạm vi thấy; người nhận chưa thấy', () => {
  const base = {
    actorUserId: 'teacher',
    actorRole: 'user',
    actorLevel: 1,
    createdBy: 'mod-1',
    isAssignee: true,
    visibilityMode: 'school',
    released: false,
  };
  assert.equal(canSeeLiveWork(base), false, 'assignee waits for release');
  assert.equal(canSeeLiveWork({ ...base, released: true }), true);
  assert.equal(canSeeLiveWork({ ...base, actorUserId: 'mod-1', actorRole: 'moderator' }), true, 'creator');
  assert.equal(
    canSeeLiveWork({ ...base, actorUserId: 'vp', actorLevel: 4, isAssignee: false, isApprover: true }),
    true,
    'approver',
  );
  assert.equal(
    canSeeLiveWork({ ...base, actorUserId: 'other-bgh', actorLevel: 5, isAssignee: false }),
    false,
    'non-designated BGH',
  );
  assert.equal(canSeeLiveWork({ ...base, actorUserId: 'admin', actorRole: 'admin', isAssignee: false }), true);
  assert.equal(
    canSeeLiveWork({ ...base, actorUserId: 'mod-2', actorRole: 'moderator', isAssignee: false, inModeratorScope: false }),
    false,
    'out-of-scope moderator',
  );
  assert.equal(
    canSeeLiveWork({ ...base, actorUserId: 'admin', actorRole: 'admin', isAssignee: false, visibilityMode: 'creator' }),
    false,
    'creator-only visibility mode',
  );
});

test('trao đổi công việc chờ duyệt không mở cho người nhận', () => {
  const document = { active: true, createdBy: 'mod-1', status: 'pending', approverUserIds: ['vp'] };
  const workItems = [{ active: true, assignmentType: 'individual', assigneeUserIds: ['teacher'] }];
  const usersById = new Map([
    ['mod-1', { status: 'active', departmentId: 'office' }],
    ['teacher', { status: 'active', departmentId: 'math' }],
  ]);
  const args = {
    actorRole: 'user',
    actorDepartmentId: 'math',
    visibilityMode: 'school',
    document,
    workItems,
    usersById,
  };
  assert.equal(canAccessWorkChat({ ...args, actorUserId: 'teacher', actorLevel: 1 }), false);
  assert.equal(canAccessWorkChat({ ...args, actorUserId: 'vp', actorLevel: 4 }), true);
  assert.equal(
    canAccessWorkChat({ ...args, document: { ...document, status: 'approved' }, actorUserId: 'teacher', actorLevel: 1 }),
    true,
  );
});

test('thông báo cho người tạo: đã duyệt (7 ngày) và bị trả lại (đến khi gửi lại)', () => {
  const now = 100 * DAY;
  const doc = { active: true, createdBy: 'mod-1', ...workApprovalSubmission(true, ['vp']) };
  assert.equal(workCreatorApprovalNotice(doc, 'mod-1', now), null, 'pending has no outcome yet');
  const approved = { ...doc, ...applyWorkApproval(doc, 'vp', now - DAY) };
  assert.deepEqual(workCreatorApprovalNotice(approved, 'mod-1', now), { decision: 'approved', at: now - DAY, reason: '' });
  assert.equal(workCreatorApprovalNotice(approved, 'vp', now), null, 'only the creator');
  assert.equal(workCreatorApprovalNotice(approved, 'mod-1', now + WORK_APPROVED_NOTICE_MS), null, 'expires');
  const returned = { ...doc, ...applyWorkRejection(doc, 'vp', 'Sai người nhận', now - 30 * DAY) };
  assert.deepEqual(workCreatorApprovalNotice(returned, 'mod-1', now), {
    decision: 'rejected',
    at: now - 30 * DAY,
    reason: 'Sai người nhận',
  });
  // Documents released without approval never notify.
  const direct = { active: true, createdBy: 'lead', ...workApprovalSubmission(false, []) };
  assert.equal(workCreatorApprovalNotice(direct, 'lead', now), null);
});

test('danh sách việc tôi tạo: chờ duyệt vào tab Đang chờ duyệt, bị trả lại vào Việc cần làm', () => {
  const today = '2026-10-22';
  assert.equal(
    workListTabOf({ workStatus: 'awaiting_approval', assignments: [{ deadline: '2026-10-30' }] }, today),
    WORK_LIST_TAB_PENDING,
  );
  assert.equal(
    workListTabOf({ workStatus: 'approval_returned', assignments: [{ deadline: '2026-10-30' }] }, today),
    WORK_LIST_TAB_TODO,
  );
});

test('mã lỗi duyệt công việc có thông báo tiếng Việt', () => {
  for (const code of [
    'WORK_APPROVER_REQUIRED',
    'INVALID_WORK_APPROVER',
    'WORK_APPROVER_FORBIDDEN',
    'WORK_DOCUMENT_ALREADY_DECIDED',
    'WORK_RETURN_REASON_INVALID',
    'WORK_ASSIGNEE_NOT_SUBORDINATE',
    'WORK_ASSIGNEE_BGH_FORBIDDEN',
    'WORK_ASSIGNEE_OPS_FORBIDDEN',
    'WORK_DEPARTMENT_FORBIDDEN',
    'WORK_DOCUMENT_IMMUTABLE',
    'WORK_HAS_SUBMISSIONS',
    'ADMIN_USE_MANAGEMENT',
  ]) {
    const message = messageFor(new Error(code));
    assert.doesNotMatch(message, /Không thể hoàn tất thao tác/, code);
  }
});

test('máy chủ không còn tự động phát hành công việc chờ duyệt', async () => {
  const source = await readFile(new URL('../convex/work.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /releasePendingWorkDocuments/);
  assert.doesNotMatch(source, /WORK_APPROVAL_DISABLED/);
  assert.match(source, /isWorkApprovalLocked\(document\)\) throw new Error\("WORK_DOCUMENT_IMMUTABLE"\)/);
});

test('nhãn người tạo trung lập vai trò: không còn "Văn thư <tên>" cho admin, không lặp "VĂN THƯ VĂN THƯ"', async () => {
  const { workCreatorLabel, workCreatorRoleLabel } = await import('../src/work/workDisplay.js');
  assert.equal(workCreatorLabel({ creatorName: 'Nguyễn Tuấn', creatorRole: 'admin' }), 'Người tạo: Nguyễn Tuấn (Quản trị viên)');
  assert.equal(workCreatorLabel({ creatorName: 'Văn thư', creatorRole: 'moderator' }), 'Người tạo: Văn thư (Văn thư)');
  assert.equal(workCreatorLabel({ creatorName: 'Lê Thị C', creatorRole: 'user' }), 'Người tạo: Lê Thị C');
  assert.equal(workCreatorLabel({}), 'Người tạo: —');
  assert.equal(workCreatorRoleLabel('moderator'), 'Văn thư');
  const parts = readFileSync(new URL('../src/work/WorkApprovalParts.jsx', import.meta.url), 'utf8');
  const views = readFileSync(new URL('../src/work/WorkViews.jsx', import.meta.url), 'utf8');
  for (const source of [parts, views]) {
    assert.doesNotMatch(source, /Văn thư \{document\.creatorName/);
    assert.match(source, /workCreatorLabel\(document\)/);
  }
  assert.match(parts, /Công việc do Văn thư\/Quản trị tạo cần Ban giám hiệu duyệt trước khi giao\./);
  const work = readFileSync(new URL('../convex/work.ts', import.meta.url), 'utf8');
  assert.match(work, /creatorRole: creator\?\.role === "admin" \|\| creator\?\.role === "moderator" \? creator\.role : "user"/);
});

test('công việc chờ BGH duyệt: phân công hiện "Chờ duyệt (chưa giao)", không hiện tiến độ', async () => {
  const { isWorkDocumentUnreleased, workAssignmentDisplayStatus } = await import('../src/work/workDisplay.js');
  const assignment = { status: 'in_progress' };
  for (const status of ['pending', 'rejected']) {
    assert.equal(isWorkDocumentUnreleased({ requiresApproval: true, status }), true, status);
    assert.equal(workAssignmentDisplayStatus({ requiresApproval: true, status }, assignment), 'unreleased');
  }
  assert.equal(workAssignmentDisplayStatus({ requiresApproval: true, status: 'approved' }, assignment), 'in_progress');
  // Documents that never needed approval are handed out at once.
  assert.equal(workAssignmentDisplayStatus({ requiresApproval: false, status: 'pending' }, assignment), 'in_progress');
  assert.equal(workAssignmentDisplayStatus({ requiresApproval: false, status: 'approved' }, {}), 'unassigned');
  const views = readFileSync(new URL('../src/work/WorkViews.jsx', import.meta.url), 'utf8');
  assert.match(views, /unreleased: 'Chờ duyệt \(chưa giao\)'/);
  assert.match(views, /workAssignmentDisplayStatus\(document, assignment\)/);
});

// ---------------------------------------------------------------- admin edit / re-approval / submissions

const editDoc = (overrides = {}) => ({ active: true, ...workApprovalSubmission(true, ['ht', 'pht']), ...overrides });
const approvedByBgh = () => {
  const doc = editDoc();
  const first = { ...doc, ...applyWorkApproval(doc, 'ht', 1000) };
  return { ...first, ...applyWorkApproval(first, 'pht', 2000) };
};
const releasedImmediately = () => ({ active: true, createdBy: 'bgh', ...workApprovalSubmission(false, []) });
const policy = (document, actorRole, extra = {}) => workDocumentEditPolicy({
  document, actorRole, canManage: true, hasSubmissions: false, ...extra,
});

test('admin sửa mọi công việc: đã duyệt / giao ngay → phải gửi BGH duyệt lại; xóa vẫn khóa', () => {
  const approved = approvedByBgh();
  assert.equal(approved.status, 'approved');
  const admin = policy(approved, 'admin');
  assert.equal(admin.canEdit, true);
  assert.equal(admin.editRequiresReapproval, true);
  assert.equal(admin.canDelete, false, 'delete stays locked for admin too');
  assert.equal(admin.deleteError, 'WORK_DOCUMENT_IMMUTABLE');

  // Partially approved (still pending) is locked for everyone else, editable by admin.
  const partial = { ...editDoc(), ...applyWorkApproval(editDoc(), 'ht', 1000) };
  assert.equal(policy(partial, 'admin').canEdit, true);
  assert.equal(policy(partial, 'admin').editRequiresReapproval, true);
  assert.equal(policy(partial, 'admin').canDelete, false);

  // Released immediately (created by BGH/a superior) → admin edit also goes through approval.
  const direct = releasedImmediately();
  assert.equal(policy(direct, 'admin').canEdit, true);
  assert.equal(policy(direct, 'admin').editRequiresReapproval, true);
  assert.equal(policy(direct, 'admin').canDelete, true, 'not approval-locked: delete unchanged');

  // Pending / returned without approvals: ordinary edit (decisions reset, no special path).
  assert.equal(policy(editDoc(), 'admin').editRequiresReapproval, false);
  const returned = { ...editDoc(), ...applyWorkRejection(editDoc(), 'ht', 'Sai hạn', 3000) };
  assert.equal(policy(returned, 'admin').editRequiresReapproval, false);
  assert.equal(policy(returned, 'admin').canEdit, true);

  // Admin power is not tied to creator/department: the caller passes canManage for admins always.
  assert.equal(policy({ ...approved, createdBy: 'tt-toan' }, 'admin').canEdit, true);
  // Inactive documents are never editable.
  assert.equal(policy({ ...approved, active: false }, 'admin').canEdit, false);
});

test('văn thư (moderator) và người khác: lần duyệt đầu vẫn khóa sửa/xóa vĩnh viễn', () => {
  const approved = approvedByBgh();
  for (const role of ['moderator', 'user']) {
    const result = policy(approved, role);
    assert.equal(result.canEdit, false, role);
    assert.equal(result.canDelete, false, role);
    assert.equal(result.editError, 'WORK_DOCUMENT_IMMUTABLE', role);
    assert.equal(result.editRequiresReapproval, false, role);
  }
  // Released immediately and nothing submitted: creator/moderator keep today's rule (editable, no re-approval).
  assert.equal(policy(releasedImmediately(), 'moderator').canEdit, true);
  assert.equal(policy(releasedImmediately(), 'moderator').editRequiresReapproval, false);
  assert.equal(policy(releasedImmediately(), 'user').canEdit, true);
  assert.equal(policy(releasedImmediately(), 'user', { canManage: false }).canEdit, false);
  assert.equal(policy(releasedImmediately(), 'user', { canManage: false }).editError, 'WORK_UPDATE_FORBIDDEN');
});

test('admin sửa việc đã duyệt: chờ duyệt lại, bắt buộc người duyệt, ẩn với người nhận; tự giao cho mình thì giao ngay', () => {
  const approved = approvedByBgh();
  const others = [{ type: 'individual', userIds: ['gv'], content: 'x', deadline: '2026-10-30' }];
  const selfOnly = [{ type: 'individual', userIds: ['admin'], content: 'x', deadline: '2026-10-30' }];
  const args = (assignments) => ({
    editRequiresReapproval: policy(approved, 'admin').editRequiresReapproval,
    followsApprovalFlow: false,
    assignments,
    creatorId: 'bgh',
    editorId: 'admin',
  });
  assert.equal(workEditNeedsApproval(args(others)), true);
  assert.throws(() => workApprovalSubmission(true, []), /WORK_APPROVER_REQUIRED/);
  const resubmitted = { ...approved, ...workApprovalSubmission(true, ['ht']) };
  assert.equal(resubmitted.status, 'pending');
  assert.deepEqual(resubmitted.approvedByUserIds, []);
  assert.deepEqual(resubmitted.approvalDecisions, []);
  assert.equal(isWorkReleased(resubmitted), false, 'hidden from assignees until approved again');
  assert.equal(isWorkApprovalLocked(resubmitted), false);
  assert.equal(canSeeLiveWork({
    actorUserId: 'gv', actorRole: 'user', actorLevel: 1, createdBy: 'bgh', isAssignee: true,
    visibilityMode: 'school', released: isWorkReleased(resubmitted),
  }), false);
  assert.equal(canApproveWorkDocument(resubmitted, 'ht'), true);
  const releasedAgain = { ...resubmitted, ...applyWorkApproval(resubmitted, 'ht', 5000) };
  assert.equal(isWorkReleased(releasedAgain), true);

  // Self-only for the editing admin → released without approval.
  assert.equal(workEditNeedsApproval(args(selfOnly)), false);
  // Self-only for someone else (e.g. the creator) still needs approval on the admin path.
  assert.equal(workEditNeedsApproval({ ...args(selfOnly), editorId: 'other-admin' }), true);
  // Non-admin edits keep the creator-based rule.
  assert.equal(workEditNeedsApproval({ ...args(others), editRequiresReapproval: false, followsApprovalFlow: false }), false);
  assert.equal(workEditNeedsApproval({ ...args(selfOnly), editRequiresReapproval: false, followsApprovalFlow: true, creatorId: 'admin' }), false);

  // Server wiring: the edit gate and approval decision use the shared policy.
  const source = readFileSync(new URL('../convex/work.ts', import.meta.url), 'utf8');
  const update = source.slice(source.indexOf('export const updateDocument'), source.indexOf('export const deleteDocument'));
  assert.match(update, /workDocumentEditPolicy\(\{[\s\S]*actorRole: actor\.user\.role/);
  assert.match(update, /if \(editPolicy\.editError\) throw new Error\(editPolicy\.editError\)/);
  assert.match(update, /editRequiresReapproval: editPolicy\.editRequiresReapproval/);
  assert.match(update, /allowOpsAnyDepartment: actor\.user\.role === "admin"/);
  assert.match(update, /resubmitted: true/);
  const create = source.slice(source.indexOf('export const createDocument'), source.indexOf('export const updateDocument'));
  assert.doesNotMatch(create, /allowOpsAnyDepartment/, 'create keeps the same-department rule');
});

test('đã có người nộp: công việc chỉ xem với mọi người (kể cả việc giao ngay, kể cả admin)', () => {
  const pending = [{ completions: [{ status: 'pending_approval' }] }];
  const completed = [{ completions: [{ status: 'approved' }] }];
  const legacyCompleted = [{ completedUserIds: ['gv'] }];
  const returnedOnly = [{ completions: [{ status: 'rejected' }] }];
  assert.equal(workHasSubmissions(pending), true);
  assert.equal(workHasSubmissions(completed), true);
  assert.equal(workHasSubmissions(legacyCompleted), true);
  assert.equal(workHasSubmissions(returnedOnly), false, 'a returned completion does not lock');
  assert.equal(workHasSubmissions([]), false);
  // Personal task rows count too.
  assert.equal(workHasSubmissions([{ completions: [] }, { completions: [{ status: 'pending_approval' }], workItemId: 'wi' }]), true);

  for (const document of [releasedImmediately(), approvedByBgh(), editDoc()]) {
    for (const role of ['admin', 'moderator', 'user']) {
      const result = policy(document, role, { hasSubmissions: true });
      assert.equal(result.canEdit, false, `${role} edit`);
      assert.equal(result.canDelete, false, `${role} delete`);
      assert.equal(result.editError, 'WORK_HAS_SUBMISSIONS');
      assert.equal(result.deleteError, 'WORK_HAS_SUBMISSIONS');
      assert.equal(result.editRequiresReapproval, false);
    }
  }
  // Server: update and delete both enforce it; reviews of submissions are not edit-gated.
  const source = readFileSync(new URL('../convex/work.ts', import.meta.url), 'utf8');
  const update = source.slice(source.indexOf('export const updateDocument'), source.indexOf('export const deleteDocument'));
  const remove = source.slice(source.indexOf('export const deleteDocument'), source.indexOf('export const finalizeDriveMigration'));
  assert.match(update, /hasSubmissions: workHasSubmissions\(activeSubmissionRows\(relatedBefore\)\)/);
  assert.match(remove, /hasSubmissions: workHasSubmissions\(activeSubmissionRows\(related\)\)/);
  assert.match(remove, /if \(deletePolicy\.deleteError\) throw new Error\(deletePolicy\.deleteError\)/);
  for (const name of ['reviewWorkCompletion', 'reviewPersonalCompletion']) {
    const start = source.indexOf(`export const ${name}`);
    const body = source.slice(start, source.indexOf('export const', start + 10));
    assert.doesNotMatch(body, /workDocumentEditPolicy|WORK_HAS_SUBMISSIONS|isWorkApprovalLocked/, name);
    assert.match(body, /isWorkReleased\(/, `${name} still requires a released document`);
  }
  assert.match(messageFor(new Error('WORK_HAS_SUBMISSIONS')), /Đã có người nộp kết quả nên không thể sửa công việc này\./);
});

test('sửa giữ nguyên phân công thì giữ công việc con; đổi phân công thì thay mới', () => {
  const items = [
    { assignmentType: 'department', departmentId: 'toan', assigneeUserIds: [], content: 'A', deadline: '2026-10-30' },
    { assignmentType: 'individual', departmentId: 'van', assigneeUserIds: ['b', 'a'], content: 'B', deadline: '2026-10-31' },
  ];
  const same = [
    { type: 'individual', departmentId: 'other', userIds: ['a', 'b'], content: 'B', deadline: '2026-10-31' },
    { type: 'department', departmentId: 'toan', userIds: [], content: 'A', deadline: '2026-10-30' },
  ];
  assert.equal(workAssignmentsUnchanged(items, same), true);
  assert.equal(workAssignmentsUnchanged(items, [same[0]]), false);
  assert.equal(workAssignmentsUnchanged(items, [same[0], { ...same[1], deadline: '2026-11-01' }]), false);
  assert.equal(workAssignmentsUnchanged(items, [same[0], { ...same[1], content: 'A2' }]), false);
  assert.equal(workAssignmentsUnchanged(items, [{ ...same[0], userIds: ['a'] }, same[1]]), false);
  assert.equal(workAssignmentsUnchanged([], []), false);
  const source = readFileSync(new URL('../convex/work.ts', import.meta.url), 'utf8');
  const update = source.slice(source.indexOf('export const updateDocument'), source.indexOf('export const deleteDocument'));
  assert.match(update, /const deactivated = keepWorkItems\s*\? \{ workItemCount: 0, personalTaskCount: 0 \}/);
});

test('ghi "Đã chỉnh sửa bởi": chỉ khi sửa (không khi tạo/duyệt/trả lại), tên lấy từ máy chủ', async () => {
  const source = readFileSync(new URL('../convex/work.ts', import.meta.url), 'utf8');
  const section = (name, next) => source.slice(source.indexOf(`export const ${name}`), source.indexOf(`export const ${next}`));
  assert.match(section('updateDocument', 'deleteDocument'), /lastEditedBy: String\(actor\.user\._id\),\s*lastEditedAt: now,/);
  for (const [name, next] of [['createDocument', 'updateDocument'], ['approveDocument', 'rejectDocument'], ['rejectDocument', 'createPersonalTask'], ['deleteDocument', 'finalizeDriveMigration']]) {
    assert.doesNotMatch(section(name, next), /lastEdited/, name);
  }
  // Payload resolves the name server-side and never falls back to an email.
  const view = source.slice(source.indexOf('function lastEditedView'), source.indexOf('type DocumentViewer'));
  assert.doesNotMatch(view, /email/);
  for (const flag of ['canEdit', 'canDelete', 'editRequiresReapproval', 'hasSubmissions']) {
    assert.match(source.slice(source.indexOf('function documentEditFlags'), source.indexOf('async function documentView')), new RegExp(`${flag}`));
  }
  const schema = readFileSync(new URL('../convex/schema.ts', import.meta.url), 'utf8');
  assert.match(schema, /lastEditedBy: v\.optional\(v\.string\(\)\),\s*lastEditedAt: v\.optional\(v\.number\(\)\),/);

  const { workLastEditedLabel, workEditFormRequiresApproval, WORK_HAS_SUBMISSIONS_NOTE } = await import('../src/work/workDisplay.js');
  // 2026-10-22 07:05 UTC = 14:05 Vietnam time.
  assert.equal(
    workLastEditedLabel({ lastEditedByName: 'Nguyễn Văn A', lastEditedAt: Date.UTC(2026, 9, 22, 7, 5) }),
    'Đã chỉnh sửa bởi Nguyễn Văn A lúc 14:05 22/10/2026',
  );
  assert.equal(workLastEditedLabel({ lastEditedByName: null, lastEditedAt: null }), '');
  assert.equal(workLastEditedLabel({}), '');
  assert.equal(WORK_HAS_SUBMISSIONS_NOTE, 'Đã có người nộp kết quả — công việc chỉ xem.');
  // Client mirror of the edit approval decision.
  const others = [{ type: 'individual', userIds: ['gv'] }];
  const self = [{ type: 'individual', userIds: ['admin'] }];
  const reapproval = { editRequiresReapproval: true, approvalFlow: false, createdBy: 'bgh' };
  assert.equal(workEditFormRequiresApproval({ document: reapproval, assignments: others, editorId: 'admin' }), true);
  assert.equal(workEditFormRequiresApproval({ document: reapproval, assignments: self, editorId: 'admin' }), false);
  assert.equal(workEditFormRequiresApproval({ document: { approvalFlow: false, createdBy: 'bgh' }, assignments: others, editorId: 'admin' }), false);
  assert.equal(workEditFormRequiresApproval({ document: { approvalFlow: true, createdBy: 'vt' }, assignments: others, editorId: 'admin' }), true);

  const views = readFileSync(new URL('../src/work/WorkViews.jsx', import.meta.url), 'utf8');
  assert.match(views, /WORK_REAPPROVAL_WARNING/);
  assert.match(views, /'Lưu và gửi duyệt lại'/);
  assert.match(views, /document\.hasSubmissions\s*\? WORK_HAS_SUBMISSIONS_NOTE/);
  const summary = readFileSync(new URL('../src/work/WorkListSummary.jsx', import.meta.url), 'utf8');
  assert.match(summary, /workLastEditedLabel\(item\)/);
});

test('approval request credits the editor when someone other than the creator resubmitted', () => {
  const base = { createdBy: 'clerk', submittedAt: 1000 };
  assert.equal(workApprovalResubmittedBy(base), null);
  assert.equal(workApprovalResubmittedBy({ ...base, lastEditedBy: 'clerk', lastEditedAt: 1000 }), null);
  assert.equal(workApprovalResubmittedBy({ ...base, lastEditedBy: 'admin', lastEditedAt: 1000 }), 'admin');
  // A later submission than the recorded edit is not the editor's round.
  assert.equal(workApprovalResubmittedBy({ ...base, lastEditedBy: 'admin', lastEditedAt: 900 }), null);

  assert.deepEqual(workApprovalRequestText({ title: 'Kế hoạch tháng 11' }), {
    description: 'Văn thư đã gửi công việc này, cần bạn duyệt trước khi giao.',
    pushBody: 'Kế hoạch tháng 11',
  });
  assert.deepEqual(workApprovalRequestText({ title: 'Kế hoạch tháng 11', editorName: 'Nguyễn An' }), {
    description: 'Nguyễn An đã sửa và gửi lại công việc này để duyệt.',
    pushBody: 'Nguyễn An đã sửa và gửi lại công việc này để duyệt: Kế hoạch tháng 11',
  });
});

test('approval bell and push build the editor wording server-side', () => {
  const notifications = readFileSync(new URL('../convex/notifications.ts', import.meta.url), 'utf8');
  assert.match(notifications, /workApprovalResubmittedBy\(document\)/);
  assert.match(notifications, /workApprovalRequestText\(/);
  const work = readFileSync(new URL('../convex/work.ts', import.meta.url), 'utf8');
  assert.match(work, /workApprovalRequestText\(\{ title: args\.title, editorName: args\.editorName \}\)/);
});

test('BGH approve dialog explains admin re-approval edits instead of a hard lock', () => {
  const parts = readFileSync(new URL('../src/work/WorkApprovalParts.jsx', import.meta.url), 'utf8');
  assert.match(parts, /Sau khi bạn duyệt, công việc được giao cho người nhận\. Chỉ Quản trị viên có thể sửa lại \(và phải gửi duyệt lại\); không ai xóa được\./);
  assert.doesNotMatch(parts, /không thể sửa hoặc xóa nữa/);
});

test('work editor validates before the save confirmation and shows the approver error once', () => {
  const views = readFileSync(new URL('../src/work/WorkViews.jsx', import.meta.url), 'utf8');
  const submit = views.slice(views.indexOf('  const submit = (event) => {'), views.indexOf("setPreviewOpen(true);\n  };"));
  assert.ok(submit.indexOf('validateWorkForm()') > -1);
  assert.ok(submit.indexOf('validateWorkForm()') < submit.indexOf("setEditConfirm('save')"));
  const validate = views.slice(views.indexOf('const validateWorkForm = () => {'), views.indexOf('const persistWork = async'));
  assert.match(validate, /setApproverError\('Vui lòng chọn ít nhất một người duyệt\.'\)/);
  assert.doesNotMatch(views, /Vui lòng chọn người duyệt thuộc Ban giám hiệu/);
});

test('completion evidence form uses its own Vietnamese document-type validation', () => {
  const views = readFileSync(new URL('../src/work/WorkViews.jsx', import.meta.url), 'utf8');
  const modal = views.slice(views.indexOf('function CompletionSubmitModal('), views.indexOf('function CompletionReviewModal('));
  assert.match(modal, /<form className="work-modal" onSubmit=\{submit\} noValidate>/);
  assert.match(modal, /setDocumentTypeError\('Vui lòng chọn loại văn bản\.'\)/);
  assert.match(modal, /error=\{documentTypeError\}/);
});
