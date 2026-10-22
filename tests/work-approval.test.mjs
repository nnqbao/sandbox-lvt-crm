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
  workApprovalSubmission,
  workCreatorApprovalNotice,
  workDocumentRequiresApproval,
  workReturnReason,
  WORK_APPROVED_NOTICE_MS,
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
    'WORK_DEPARTMENT_FORBIDDEN',
    'WORK_DOCUMENT_IMMUTABLE',
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
