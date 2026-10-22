import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  approvalPatchForDuty,
  canReviewerEditDuty,
  dutyHasPendingChange,
  projectPublicDuty,
  reviewerEditPatchForDuty,
  summarizeDutyWeek,
} from '../convex/dutyApproval.ts';
import {
  buildDutyChangeDiff,
  canViewDutyChangeHistory,
  DUTY_ACTOR_KIND_LABELS,
  dutyLogReferencedIds,
  dutyWriterKind,
  formatDutyLogMoment,
  formatDutyLogTimestamp,
} from '../convex/dutyChangeLog.ts';

const WEEK = '2026-10-12';
const NOW = 1_760_000_000_000;

function duty(overrides = {}) {
  return {
    _id: 'd1',
    startDate: '2026-10-13',
    endDate: '2026-10-13',
    startTime: '14:00',
    endTime: '16:00',
    allDay: false,
    title: 'Họp tổ Toán',
    content: 'Họp tổ Toán',
    locationIds: [],
    locationText: 'Phòng họp 1',
    departmentIds: [],
    participantUserIds: [],
    otherParticipants: '',
    active: true,
    scope: 'school',
    createdBy: 'vanthu',
    createdAt: NOW - 1000,
    updatedAt: NOW - 1000,
    ...overrides,
  };
}

function patched(row, patch) {
  const next = { ...row, ...patch };
  for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
  return next;
}

function approve(row, week = WEEK) {
  const change = approvalPatchForDuty(row, week, NOW);
  return change ? patched(row, change.patch) : row;
}

function input(overrides = {}) {
  const { _id, active, scope, createdBy, createdAt, updatedAt, published, approvalTracked, ...fields } = duty();
  return { ...fields, ...overrides };
}

const BGH = { role: 'user', status: 'active' };

test('chỉ BGH (cấp ≥ 4, không phải admin/mod) được sửa trực tiếp công tác chung đang hoạt động', () => {
  assert.equal(canReviewerEditDuty(BGH, 4, duty()), true);
  assert.equal(canReviewerEditDuty(BGH, 5, duty()), true);
  assert.equal(canReviewerEditDuty(BGH, 3, duty()), false);
  assert.equal(canReviewerEditDuty({ role: 'admin', status: 'active' }, 5, duty()), false);
  assert.equal(canReviewerEditDuty({ role: 'moderator', status: 'active' }, 5, duty()), false);
  assert.equal(canReviewerEditDuty({ role: 'user', status: 'disabled' }, 5, duty()), false);
  assert.equal(canReviewerEditDuty(BGH, 4, duty({ scope: 'team' })), false);
  assert.equal(canReviewerEditDuty(BGH, 4, duty({ scope: undefined })), false);
  assert.equal(canReviewerEditDuty(BGH, 4, duty({ active: false })), false);
  assert.equal(canReviewerEditDuty(BGH, 4, null), false);
});

test('BGH sửa công tác đã duyệt: giáo viên thấy ngay, tuần không thành "đã duyệt có thay đổi"', () => {
  const approved = approve(duty({ approvalTracked: true }));
  const { publishes, patch } = reviewerEditPatchForDuty(approved, input({ locationText: 'Hội trường' }), NOW + 50);
  assert.equal(publishes, true);
  const edited = patched(approved, patch);
  assert.equal(edited.locationText, 'Hội trường');
  assert.equal(projectPublicDuty(edited)?.locationText, 'Hội trường');
  assert.equal(projectPublicDuty(edited)?.updatedAt, NOW + 50);
  assert.equal(dutyHasPendingChange(edited), false);
  assert.equal(summarizeDutyWeek(WEEK, [edited], { status: 'approved', approvedAt: NOW }).status, 'approved');
});

test('BGH sửa khi văn thư còn thay đổi chưa duyệt: bản BGH lưu được công bố cho hàng đó', () => {
  const approved = approve(duty({ approvalTracked: true }));
  const vanThuDraft = { ...approved, startTime: '09:00', updatedAt: NOW + 5 };
  assert.equal(dutyHasPendingChange(vanThuDraft), true);
  const { publishes, patch } = reviewerEditPatchForDuty(vanThuDraft, input({ startTime: '09:00', title: 'Họp tổ Toán (đổi giờ)' }), NOW + 60);
  assert.equal(publishes, true);
  const edited = patched(vanThuDraft, patch);
  assert.equal(projectPublicDuty(edited)?.startTime, '09:00');
  assert.equal(projectPublicDuty(edited)?.title, 'Họp tổ Toán (đổi giờ)');
  assert.equal(dutyHasPendingChange(edited), false);
});

test('BGH sửa công tác chưa từng được duyệt: chỉ sửa bản làm việc, công bố cùng lần duyệt tuần', () => {
  const draft = duty({ approvalTracked: true });
  const { publishes, patch } = reviewerEditPatchForDuty(draft, input({ content: 'Nội dung mới' }), NOW + 70);
  assert.equal(publishes, false);
  const edited = patched(draft, patch);
  assert.equal(edited.content, 'Nội dung mới');
  assert.equal(edited.published, undefined);
  assert.equal(projectPublicDuty(edited), null);
  assert.equal(dutyHasPendingChange(edited), true);
});

test('BGH sửa hàng cũ (trước khi có duyệt): vẫn hiện ngay với bản mới', () => {
  const legacy = duty({ scope: 'school', approvalTracked: undefined });
  const { publishes, patch } = reviewerEditPatchForDuty(legacy, input({ locationText: 'Sân trường' }), NOW + 80);
  assert.equal(publishes, true);
  const edited = patched(legacy, patch);
  assert.equal(edited.approvalTracked, true);
  assert.equal(projectPublicDuty(edited)?.locationText, 'Sân trường');
  assert.equal(dutyHasPendingChange(edited), false);
});

test('BGH sửa trực tiếp không mở lại tuần đã nộp (mutation không gọi reopenSubmittedWeeks)', () => {
  const source = readFileSync(new URL('../convex/duties.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export const reviewerUpdate = mutation(');
  assert.ok(start > 0);
  const end = source.indexOf('export const changeHistory', start);
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /reopenSubmittedWeeks/);
  assert.match(body, /requireDutyReviewer/);
  assert.match(body, /loadReviewerEditableDuty/);
  assert.match(body, /isOps: true/);
  assert.match(body, /writeDutyChangeLog/);
  assert.match(body, /actorKind: "reviewer"/);
  // A pending submission keeps its pin, so approval does not fail with DUTY_WEEK_CHANGED.
  const submitted = { status: 'submitted', submittedAt: NOW, updatedAt: NOW };
  const approved = approve(duty({ approvalTracked: true }));
  const edited = patched(approved, reviewerEditPatchForDuty(approved, input({ title: 'Mới' }), NOW + 5).patch);
  assert.equal(summarizeDutyWeek(WEEK, [edited], submitted).status, 'submitted');
  assert.equal(submitted.submittedAt, NOW);
});

const NAMES = {
  departments: new Map([['dep1', 'Tổ Toán'], ['dep2', 'Tổ Văn']]),
  users: new Map([['u1', 'Nguyễn Văn A'], ['u2', 'Trần Thị B']]),
};

test('lịch sử: diff theo trường, tên người/phòng ban, ngày dd/MM/yyyy HH:mm', () => {
  const before = input({ departmentIds: ['dep1'], participantUserIds: ['u1'] });
  const after = input({
    locationText: 'Hội trường',
    startDate: '2026-10-14',
    endDate: '2026-10-14',
    startTime: '07:30',
    departmentIds: ['dep2', 'dep1'],
    participantUserIds: ['u2'],
  });
  const diff = buildDutyChangeDiff(before, after, NAMES);
  assert.deepEqual(diff, [
    { field: 'Bắt đầu', before: '13/10/2026 14:00', after: '14/10/2026 07:30' },
    { field: 'Kết thúc', before: '13/10/2026 16:00', after: '14/10/2026 16:00' },
    { field: 'Địa điểm', before: 'Phòng họp 1', after: 'Hội trường' },
    { field: 'Phòng ban tham gia', before: 'Tổ Toán', after: 'Tổ Toán, Tổ Văn' },
    { field: 'Cá nhân tham gia', before: 'Nguyễn Văn A', after: 'Trần Thị B' },
  ]);
  assert.deepEqual(buildDutyChangeDiff(before, before, NAMES), []);
  const created = buildDutyChangeDiff(null, before, NAMES);
  assert.equal(created.find((c) => c.field === 'Tên công tác')?.after, 'Họp tổ Toán');
  assert.ok(created.every((c) => c.before === ''));
  assert.ok(!created.some((c) => c.field === 'Thành phần khác'));
  const removed = buildDutyChangeDiff(before, null, NAMES);
  assert.ok(removed.length > 0 && removed.every((c) => c.after === ''));
  const unknown = buildDutyChangeDiff(null, input({ participantUserIds: ['ghost'] }), NAMES);
  assert.equal(unknown.find((c) => c.field === 'Cá nhân tham gia')?.after, '(không rõ)');
  assert.deepEqual(dutyLogReferencedIds(before, after), { departmentIds: ['dep1', 'dep2'], userIds: ['u1', 'u2'] });
});

test('lịch sử: cả ngày, giờ Việt Nam và nhãn vai trò', () => {
  assert.equal(formatDutyLogMoment('2026-10-13', '00:00', true), '13/10/2026 (cả ngày)');
  const allDay = buildDutyChangeDiff(input(), input({ allDay: true }), NAMES);
  assert.deepEqual(allDay.map((c) => c.field), ['Bắt đầu', 'Kết thúc']);
  // 2026-10-13T00:30:00Z = 07:30 in Vietnam.
  assert.equal(formatDutyLogTimestamp(Date.UTC(2026, 9, 13, 0, 30)), '07:30 13/10/2026');
  assert.equal(formatDutyLogTimestamp(Date.UTC(2026, 9, 12, 18, 5)), '01:05 13/10/2026');
  assert.equal(DUTY_ACTOR_KIND_LABELS.manager, 'Văn thư');
  assert.equal(DUTY_ACTOR_KIND_LABELS.reviewer, 'Ban giám hiệu');
  assert.equal(DUTY_ACTOR_KIND_LABELS.team_lead, 'Tổ trưởng');
  assert.equal(dutyWriterKind(true), 'manager');
  assert.equal(dutyWriterKind(false), 'team_lead');
});

test('xem lịch sử: admin/mod, BGH, người tạo; người khác bị chặn', () => {
  assert.equal(canViewDutyChangeHistory({ isOps: true, isReviewer: false, isCreator: false }), true);
  assert.equal(canViewDutyChangeHistory({ isOps: false, isReviewer: true, isCreator: false }), true);
  assert.equal(canViewDutyChangeHistory({ isOps: false, isReviewer: false, isCreator: true }), true);
  assert.equal(canViewDutyChangeHistory({ isOps: false, isReviewer: false, isCreator: false }), false);
  const source = readFileSync(new URL('../convex/duties.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export const changeHistory = query(');
  const body = source.slice(start, start + 1500);
  assert.match(body, /throw new Error\("FORBIDDEN"\)/);
  assert.match(body, /order\("desc"\)/);
});

test('mọi đường ghi công tác đều ghi lịch sử chỉnh sửa', () => {
  const duties = readFileSync(new URL('../convex/duties.ts', import.meta.url), 'utf8');
  for (const action of ['action: logAction', 'action: "update"', 'action: "remove"', 'action: "reviewer_edit"']) {
    assert.ok(duties.includes(action), action);
  }
  const importer = readFileSync(new URL('../convex/dutyImport.ts', import.meta.url), 'utf8');
  assert.match(importer, /insertCreatedDuty\(ctx, actor, input, "import"\)/);
});

test('web: BGH mở biểu mẫu sửa trực tiếp, xóa vẫn chỉ dành cho người quản lý', async () => {
  const { canOpenDutyContentEditor, dutyEditModeFor } = await import('../src/duties/sharedDutySchedule.js');
  const { dutyHistoryChangeLine, dutyHistoryHeading } = await import('../src/duties/dutyHistoryFormat.js');
  assert.equal(dutyEditModeFor({ canManage: true, canReviewerEdit: true }), 'manager');
  assert.equal(dutyEditModeFor({ canReviewerEdit: true }), 'reviewer');
  assert.equal(dutyEditModeFor({}), null);
  assert.equal(canOpenDutyContentEditor({ eventId: 'x', canReviewerEdit: true }), true);
  assert.equal(
    dutyHistoryHeading({ actorName: 'Lê Thị C', actorRoleLabel: 'Ban giám hiệu', atLabel: '07:30 13/10/2026' }),
    'Lê Thị C (Ban giám hiệu) · 07:30 13/10/2026',
  );
  assert.equal(dutyHistoryChangeLine({ field: 'Địa điểm', before: 'A', after: 'B' }), 'Địa điểm: A → B');
  assert.equal(dutyHistoryChangeLine({ field: 'Thành phần khác', before: '', after: 'Khách' }), 'Thành phần khác: (trống) → Khách');
  const modal = readFileSync(new URL('../src/duties/DutyEditModal.jsx', import.meta.url), 'utf8');
  assert.match(modal, /anyApi\.duties\.reviewerUpdate/);
  assert.match(modal, /anyApi\.duties\.reviewerEditContext/);
  assert.match(modal, /Thay đổi sẽ áp dụng ngay, không cần duyệt lại và được ghi lịch sử\./);
  const reports = readFileSync(new URL('../src/reports/DutyReportsView.jsx', import.meta.url), 'utf8');
  assert.match(reports, /event\.canManage && onDelete/);
});

test('bảng lịch chung: văn thư/người tạo xóa được trong biểu mẫu sửa; BGH sửa trực tiếp không có nút Xóa', async () => {
  const { canDeleteDutyFromEditor, dutyEditModeFor } = await import('../src/duties/sharedDutySchedule.js');
  // Công tác chỉ có "Thành phần khác" (không phòng ban/cá nhân) vẫn xóa được.
  const otherOnly = { _id: 'd9', canManage: true, departmentIds: [], participantUserIds: [], otherParticipants: 'Khách mời' };
  assert.equal(canDeleteDutyFromEditor(otherOnly, dutyEditModeFor(otherOnly)), true);
  const bghOnly = { _id: 'd9', canManage: false, canReviewerEdit: true };
  assert.equal(dutyEditModeFor(bghOnly), 'reviewer');
  assert.equal(canDeleteDutyFromEditor(bghOnly, 'reviewer'), false);
  // Even a manager flag never enables delete inside the reviewer editor.
  assert.equal(canDeleteDutyFromEditor({ canManage: true }, 'reviewer'), false);
  assert.equal(canDeleteDutyFromEditor({ canManage: false }, 'manager'), false);
  assert.equal(canDeleteDutyFromEditor(null, 'manager'), false);

  const modal = readFileSync(new URL('../src/duties/DutyEditModal.jsx', import.meta.url), 'utf8');
  assert.match(modal, /anyApi\.duties\.remove/);
  assert.match(modal, /canDeleteDutyFromEditor\(duty, mode\)/);
  assert.match(modal, /tone="danger"/);
  // Server stays the source of truth: remove re-checks văn thư/admin or creator.
  const duties = readFileSync(new URL('../convex/duties.ts', import.meta.url), 'utf8');
  const removeBody = duties.slice(duties.indexOf('export const remove = mutation'), duties.indexOf('async function requireDutyReviewer'));
  assert.match(removeBody, /requireDutyWrite\(ctx\)/);
  assert.match(removeBody, /canMutateDuty\(actor, current\)/);
});
