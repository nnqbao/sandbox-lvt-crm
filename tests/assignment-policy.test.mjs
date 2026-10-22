import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canCreateAssignments,
  canCreatorMutateWork,
  canReviewWorkCompletion,
  shouldBypassWorkCompletionReview,
  canSeeArchivedWork,
  canSeeLiveWork,
  cleanDutyContent,
  cleanDutyLocationText,
  cleanDutyOtherParticipants,
  cleanDutyTitle,
  cleanWorkTitle,
  cleanCompletionNote,
  normalizeDutyClock,
  dutyListTitle,
  dutyLocationLabel,
  dutyPushRecipientIds,
  isDocumentArchived,
  isWorkItemArchived,
  isWorkNotificationAssignee,
  isWorkReleased,
  isWorkStatusCompleted,
  workAssignmentPushUserIds,
  workListTitle,
  workMenuBadgeCount,
} from '../convex/assignmentPolicy.ts';

test('chỉ admin/mod và tổ trưởng/tổ phó (2/3 sao) được tạo công tác', () => {
  assert.equal(canCreateAssignments('admin', 0), true);
  assert.equal(canCreateAssignments('moderator', 0), true);
  assert.equal(canCreateAssignments('user', 2), true);
  assert.equal(canCreateAssignments('user', 3), true);
  assert.equal(canCreateAssignments('user', 1), false);
  assert.equal(canCreateAssignments('user', 4), false);
  assert.equal(canCreateAssignments('user', 5), false);
});

test('giờ công tác chuẩn hóa HH:mm từ datetime-local', () => {
  assert.equal(normalizeDutyClock('08:08'), '08:08');
  assert.equal(normalizeDutyClock('8:08'), '08:08');
  assert.equal(normalizeDutyClock('08:08:00'), '08:08');
  assert.equal(normalizeDutyClock(' 17:00:30 '), '17:00');
});

test('tên công tác bắt buộc, list ưu tiên title rồi mới content', () => {
  assert.equal(cleanDutyTitle('  Họp chuyên môn  '), 'Họp chuyên môn');
  assert.throws(() => cleanDutyTitle(''), /INVALID_DUTY_TITLE/);
  assert.throws(() => cleanDutyTitle('x'.repeat(201)), /INVALID_DUTY_TITLE/);
  assert.equal(cleanDutyContent(' Báo cáo tuần '), 'Báo cáo tuần');
  assert.throws(() => cleanDutyContent(''), /INVALID_CONTENT/);
  assert.equal(dutyListTitle({ title: 'Đi thực tế', content: 'Nội dung cũ' }), 'Đi thực tế');
  assert.equal(dutyListTitle({ content: 'Nội dung cũ' }), 'Nội dung cũ');
  assert.equal(dutyListTitle({}), 'Công tác');
});

test('địa điểm công tác là text tự do đã trim', () => {
  assert.equal(cleanDutyLocationText('  Phòng họp A  '), 'Phòng họp A');
  assert.throws(() => cleanDutyLocationText('   '), /INVALID_LOCATION/);
  assert.equal(dutyLocationLabel({ locationText: 'UBND Q.3' }, ['Kho cũ']), 'UBND Q.3');
  assert.equal(dutyLocationLabel({ locationIds: ['x'] }, ['Hội trường']), 'Hội trường');
});

test('thành phần khác được trim, được để trống, tối đa 500 ký tự', () => {
  assert.equal(cleanDutyOtherParticipants('  Đoàn Sở GD  '), 'Đoàn Sở GD');
  assert.equal(cleanDutyOtherParticipants(''), '');
  assert.equal(cleanDutyOtherParticipants('   '), '');
  assert.equal(cleanDutyOtherParticipants(undefined), '');
  assert.equal(cleanDutyOtherParticipants('x'.repeat(500)), 'x'.repeat(500));
  assert.throws(() => cleanDutyOtherParticipants('x'.repeat(501)), /INVALID_OTHER_PARTICIPANTS/);
});

test('danh sách công việc ưu tiên tên công việc, không bắt buộc file', () => {
  assert.equal(cleanWorkTitle(' Họp chuyên môn '), 'Họp chuyên môn');
  assert.throws(() => cleanWorkTitle(''), /INVALID_WORK_TITLE/);
  assert.equal(workListTitle({ title: 'Sổ điểm', fileName: 'scan.pdf' }), 'Sổ điểm');
  assert.equal(workListTitle({ fileName: 'scan.pdf' }), 'scan.pdf');
});

test('chỉ công việc đã duyệt (approved) mới được giao; chờ duyệt / bị trả lại thì chưa', () => {
  assert.equal(isWorkReleased({ active: true, status: 'pending' }), false);
  assert.equal(isWorkReleased({ active: true, status: 'approved' }), true);
  assert.equal(isWorkReleased({ active: true, status: 'rejected' }), false);
  assert.equal(isWorkReleased({ active: false, status: 'approved' }), false);
});

test('lưu trữ khi người tạo hoặc toàn bộ người nhận cá nhân inactive', () => {
  const users = new Map([
    ['creator', { status: 'disabled' }],
    ['a', { status: 'active' }],
  ]);
  assert.equal(isDocumentArchived({ createdBy: 'creator' }, users), true);
  const activeCreator = new Map([
    ['creator', { status: 'active' }],
    ['a', { status: 'disabled' }],
    ['b', { status: 'disabled' }],
  ]);
  assert.equal(
    isWorkItemArchived(
      { createdBy: 'creator' },
      { assignmentType: 'individual', assigneeUserIds: ['a', 'b'] },
      activeCreator,
    ),
    true,
  );
  assert.equal(
    isWorkItemArchived(
      { createdBy: 'creator' },
      { assignmentType: 'individual', assigneeUserIds: ['a'] },
      new Map([['creator', { status: 'active' }], ['a', { status: 'active' }]]),
    ),
    false,
  );
});

test('người được giao luôn thấy việc của mình; chế độ creator ẩn việc người khác tạo', () => {
  const assignee = {
    actorUserId: 'u1',
    actorRole: 'user',
    actorLevel: 1,
    createdBy: 'lead',
    isAssignee: true,
    visibilityMode: 'creator',
  };
  assert.equal(canSeeLiveWork(assignee), true);
  assert.equal(canSeeLiveWork({ ...assignee, isAssignee: false, actorUserId: 'peer', actorLevel: 3 }), false);
  assert.equal(
    canSeeLiveWork({
      actorUserId: 'hp',
      actorRole: 'user',
      actorLevel: 5,
      createdBy: 'lead',
      isAssignee: false,
      visibilityMode: 'school',
    }),
    true,
  );
  assert.equal(
    canSeeLiveWork({
      actorUserId: 'hp',
      actorRole: 'user',
      actorLevel: 5,
      createdBy: 'lead',
      isAssignee: false,
      visibilityMode: 'creator',
    }),
    false,
  );
  assert.equal(canSeeArchivedWork('admin'), true);
  assert.equal(canSeeArchivedWork('user'), false);
});

test('badge menu Công việc = chờ duyệt + việc chưa xong của tôi + việc chưa xong tôi tạo', () => {
  assert.equal(
    workMenuBadgeCount({
      pendingApprovalCount: 3,
      incompleteMineCount: 1,
      incompleteCreatedCount: 10,
    }),
    14,
  );
  assert.equal(isWorkStatusCompleted('completed'), true);
  assert.equal(isWorkStatusCompleted('completed_late'), true);
  assert.equal(isWorkStatusCompleted('pending_completion'), false);
  assert.equal(isWorkStatusCompleted('overdue'), false);
  assert.equal(isWorkStatusCompleted('in_progress'), false);
});

test('nội dung nộp hoàn thành là tùy chọn và tối đa 500 ký tự', () => {
  assert.equal(cleanCompletionNote(''), undefined);
  assert.equal(cleanCompletionNote('   '), undefined);
  assert.equal(cleanCompletionNote('  Đã gửi báo cáo  '), 'Đã gửi báo cáo');
  assert.throws(() => cleanCompletionNote('x'.repeat(501)), /INVALID_COMPLETION_NOTE/);
});

test('người tạo mới được duyệt hoàn thành; khóa sửa khi đã có nộp', () => {
  assert.equal(canReviewWorkCompletion({ actorUserId: 'lead', createdBy: 'lead' }), true);
  assert.equal(canReviewWorkCompletion({ actorUserId: 'admin', createdBy: 'lead' }), false);
  assert.equal(shouldBypassWorkCompletionReview(true, 100), true);
  assert.equal(shouldBypassWorkCompletionReview(true, 0), true);
  assert.equal(shouldBypassWorkCompletionReview(true, undefined), false);
  assert.equal(shouldBypassWorkCompletionReview(false, 100), false);
  assert.equal(canCreatorMutateWork([{ completions: [] }]), true);
  assert.equal(
    canCreatorMutateWork([{ completions: [{ status: 'pending_approval' }] }]),
    false,
  );
  assert.equal(
    canCreatorMutateWork([{ completions: [{ status: 'rejected' }] }]),
    true,
  );
});

test('thông báo công việc mới: admin nhận khi được giao cá nhân, không nhận việc phòng ban', () => {
  const admin = { _id: 'admin-1', role: 'admin', departmentId: 'dept-a' };
  const teacher = { _id: 'user-1', role: 'user', departmentId: 'dept-a' };
  const individual = { assignmentType: 'individual', assigneeUserIds: ['admin-1'], departmentId: 'dept-a' };
  const department = { assignmentType: 'department', assigneeUserIds: [], departmentId: 'dept-a' };
  assert.equal(isWorkNotificationAssignee({ user: admin, item: individual }), true);
  assert.equal(isWorkNotificationAssignee({ user: teacher, item: individual }), false);
  assert.equal(isWorkNotificationAssignee({ user: admin, item: department }), false);
  assert.equal(isWorkNotificationAssignee({ user: teacher, item: department }), true);
});

test('người tạo vẫn nhận thông báo khi tự giao việc cho mình', () => {
  const creator = { _id: 'lead-1', role: 'user', departmentId: 'dept-a' };
  const other = { _id: 'user-1', role: 'user', departmentId: 'dept-a' };
  const admin = { _id: 'admin-1', role: 'admin', departmentId: 'dept-a' };
  const selfAssigned = workAssignmentPushUserIds({
    assignments: [{ type: 'individual', userIds: ['lead-1'] }],
    users: [creator, other, admin],
  });
  assert.equal(selfAssigned.includes('lead-1'), true);
  assert.equal(selfAssigned.includes('user-1'), false);

  const assignedToOther = workAssignmentPushUserIds({
    assignments: [{ type: 'individual', userIds: ['user-1'] }],
    users: [creator, other, admin],
  });
  assert.equal(assignedToOther.includes('lead-1'), false);
  assert.equal(assignedToOther.includes('user-1'), true);

  const department = workAssignmentPushUserIds({
    assignments: [{ type: 'department', departmentId: 'dept-a' }],
    users: [creator, other, admin],
  });
  assert.equal(department.includes('lead-1'), true);
  assert.equal(department.includes('user-1'), true);
  assert.equal(department.includes('admin-1'), false);
});

test('người tham gia công tác nhận push, kể cả khi tự thêm mình', () => {
  const creator = { _id: 'lead-1', departmentId: 'dept-a' };
  const sameDept = { _id: 'user-2', departmentId: 'dept-a' };
  const otherDept = { _id: 'user-1', departmentId: 'dept-b' };
  const ids = dutyPushRecipientIds({
    departmentIds: ['dept-a'],
    participantUserIds: ['lead-1'],
    users: [creator, sameDept, otherDept],
  });
  assert.equal(ids.includes('lead-1'), true);
  assert.equal(ids.includes('user-2'), true);
  assert.equal(ids.includes('user-1'), false);
});

test('Văn thư/admin không giao công việc cá nhân cho Ban giám hiệu (cấp ≥ 4); lịch công tác không đổi', async () => {
  const { readFileSync } = await import('node:fs');
  const {
    opsCanAssignWorkToUser,
    opsWorkAssigneeError,
    WORK_ASSIGNEE_BGH_FORBIDDEN,
    WORK_ASSIGNEE_OPS_FORBIDDEN,
  } = await import('../convex/assignmentPolicy.ts');
  assert.equal(WORK_ASSIGNEE_BGH_FORBIDDEN, 'WORK_ASSIGNEE_BGH_FORBIDDEN');
  assert.equal(WORK_ASSIGNEE_OPS_FORBIDDEN, 'WORK_ASSIGNEE_OPS_FORBIDDEN');
  const vanThu = { _id: 'vt', departmentId: 'vp' };
  for (const level of [0, 1, 2, 3]) {
    assert.equal(opsCanAssignWorkToUser(vanThu, { _id: `u${level}`, role: 'user', level, departmentId: 'vp' }), true, `level ${level}`);
  }
  for (const level of [4, 5]) {
    const target = { _id: `bgh${level}`, role: 'user', level, departmentId: 'vp' };
    assert.equal(opsCanAssignWorkToUser(vanThu, target), false, `level ${level}`);
    assert.equal(opsWorkAssigneeError(vanThu, target), WORK_ASSIGNEE_BGH_FORBIDDEN);
  }

  const work = readFileSync(new URL('../convex/work.ts', import.meta.url), 'utf8');
  const assert_ = work.slice(work.indexOf('async function assertWorkAssignmentsForActor'), work.indexOf('async function requireWorkAccess'));
  assert.match(assert_, /if \(actor\.isOps\) \{[\s\S]*assignment\.type !== "individual"\) continue;[\s\S]*opsWorkAssigneeError\([\s\S]*if \(error\) throw new Error\(error\)/);
  // Moderator department scope still applies before the BGH/ops rule.
  assert.match(assert_, /MODERATOR_DEPARTMENT_SCOPE_ERROR/);
  const options = work.slice(work.indexOf('export const formOptions'), work.indexOf('export const formOptions') + 4000);
  assert.match(options, /isUserInModeratorScope\(actor\.departmentScope, user\)\s*&& opsCanAssignWorkToUser\(/);
  // Approvers remain Ban giám hiệu.
  assert.match(options, /isEligibleWorkApprover/);
  const duties = readFileSync(new URL('../convex/duties.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(duties, /opsCanAssignWorkToUser|WORK_ASSIGNEE_BGH_FORBIDDEN|WORK_ASSIGNEE_OPS_FORBIDDEN/);
  const messages = readFileSync(new URL('../src/lib/appErrorMessage.js', import.meta.url), 'utf8');
  assert.match(messages, /WORK_ASSIGNEE_BGH_FORBIDDEN: 'Văn thư không thể giao công việc cho Ban giám hiệu\.'/);
  assert.match(messages, /WORK_ASSIGNEE_OPS_FORBIDDEN: 'Chỉ giao việc cho tài khoản quản trị cùng phòng ban\.'/);
});

test('Văn thư tự giao cho mình; tài khoản quản trị khác chỉ khi cùng phòng ban (có phòng ban)', async () => {
  const { opsWorkAssigneeError, WORK_ASSIGNEE_OPS_FORBIDDEN, WORK_ASSIGNEE_BGH_FORBIDDEN } = await import('../convex/assignmentPolicy.ts');
  const mod = { _id: 'mod', departmentId: 'vp' };
  // Self: always allowed, even for an ops account without department or with a 4+ position.
  assert.equal(opsWorkAssigneeError(mod, { _id: 'mod', role: 'moderator', level: 0, departmentId: 'vp' }), null);
  assert.equal(opsWorkAssigneeError({ _id: 'adm' }, { _id: 'adm', role: 'admin', level: 5 }), null);
  // Other admin/mod in the same department: allowed.
  assert.equal(opsWorkAssigneeError(mod, { _id: 'mod2', role: 'moderator', level: 0, departmentId: 'vp' }), null);
  assert.equal(opsWorkAssigneeError(mod, { _id: 'adm', role: 'admin', level: 5, departmentId: 'vp' }), null);
  // Different department, or either side without a department: forbidden.
  assert.equal(opsWorkAssigneeError(mod, { _id: 'mod3', role: 'moderator', level: 0, departmentId: 'toan' }), WORK_ASSIGNEE_OPS_FORBIDDEN);
  assert.equal(opsWorkAssigneeError(mod, { _id: 'mod4', role: 'moderator', level: 0, departmentId: '' }), WORK_ASSIGNEE_OPS_FORBIDDEN);
  assert.equal(opsWorkAssigneeError({ _id: 'adm', departmentId: '' }, { _id: 'mod5', role: 'moderator', level: 0, departmentId: '' }), WORK_ASSIGNEE_OPS_FORBIDDEN);
  assert.equal(opsWorkAssigneeError({ _id: 'adm' }, { _id: 'mod', role: 'moderator', level: 0, departmentId: 'vp' }), WORK_ASSIGNEE_OPS_FORBIDDEN);
  // BGH individual still forbidden; lower-level members of the BGH department stay allowed.
  assert.equal(opsWorkAssigneeError(mod, { _id: 'ht', role: 'user', level: 5, departmentId: 'bgh' }), WORK_ASSIGNEE_BGH_FORBIDDEN);
  assert.equal(opsWorkAssigneeError(mod, { _id: 'hp', role: 'user', level: 4, departmentId: 'vp' }), WORK_ASSIGNEE_BGH_FORBIDDEN);
  assert.equal(opsWorkAssigneeError(mod, { _id: 'cu', role: 'user', level: 3, departmentId: 'bgh' }), null);
});
