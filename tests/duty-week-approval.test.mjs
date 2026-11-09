import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  approvalPatchForDuty,
  assertWeekStart,
  cleanReturnNote,
  discardPatchForDuty,
  dutyHasPendingChange,
  dutyWeekStart,
  dutyWeeksInRange,
  isDutyWeekReviewer,
  legacySnapshotPatch,
  projectPublicDuty,
  summarizeDutyWeek,
  weeksAffectedByDuty,
} from '../convex/dutyApproval.ts';
import {
  formatWeekMoment,
  formatWeekRange,
  isDutyWeekNotification,
  shouldShowUnapprovedNotice,
} from '../src/duties/dutyWeekApproval.js';

const WEEK = '2026-10-12';
const NEXT_WEEK = '2026-10-19';
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

/** Apply a patch the way ctx.db.patch does (undefined removes the field). */
function patched(row, patch) {
  const next = { ...row, ...patch };
  for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
  return next;
}

function approve(row, week = WEEK) {
  const change = approvalPatchForDuty(row, week, NOW);
  return change ? patched(row, change.patch) : row;
}

test('tuần bắt đầu thứ Hai; Chủ nhật thuộc tuần trước', () => {
  assert.equal(dutyWeekStart('2026-10-12'), WEEK);
  assert.equal(dutyWeekStart('2026-10-17'), WEEK);
  assert.equal(dutyWeekStart('2026-10-18'), WEEK);
  assert.equal(dutyWeekStart('2026-10-19'), NEXT_WEEK);
  assert.equal(assertWeekStart(WEEK), WEEK);
  assert.throws(() => assertWeekStart('2026-10-13'), /INVALID_WEEK/);
  assert.deepEqual(dutyWeeksInRange('2026-10-01', '2026-10-31'), [
    '2026-09-28',
    '2026-10-05',
    '2026-10-12',
    '2026-10-19',
    '2026-10-26',
  ]);
});

test('công tác cũ (trước khi có duyệt) vẫn hiện cho giáo viên như hiện nay', () => {
  const legacy = duty({ scope: undefined, approvalTracked: undefined });
  assert.equal(projectPublicDuty(legacy)?.title, 'Họp tổ Toán');
  assert.equal(dutyHasPendingChange(legacy), false);
  assert.equal(summarizeDutyWeek(WEEK, [legacy], null).status, 'approved');
  assert.equal(projectPublicDuty({ ...legacy, active: false }), null);
});

test('văn thư tạo mới: giáo viên chưa thấy cho tới khi BGH duyệt', () => {
  const draft = duty({ approvalTracked: true });
  assert.equal(projectPublicDuty(draft), null);
  assert.equal(dutyHasPendingChange(draft), true);
  const week = summarizeDutyWeek(WEEK, [draft], null);
  assert.equal(week.status, 'draft');
  assert.equal(week.changeCount, 1);
  assert.equal(week.missingParticipants, 1);
  assert.equal(week.changes[0].kind, 'added');

  const approved = approve(draft);
  assert.equal(projectPublicDuty(approved)?.title, 'Họp tổ Toán');
  assert.equal(projectPublicDuty(approved)?.publishedAt, NOW);
  assert.equal(projectPublicDuty(approved)?.updatedAt, approved.createdAt);
  assert.equal(approved.publishedEndDate, '2026-10-13');
  assert.equal(dutyHasPendingChange(approved), false);
  assert.equal(summarizeDutyWeek(WEEK, [approved], { status: 'approved', approvedAt: NOW }).status, 'approved');
});

test('sửa lịch đã duyệt: giáo viên vẫn thấy bản cũ, tuần cần duyệt lại', () => {
  const approved = approve(duty({ approvalTracked: true }));
  const edited = { ...approved, startTime: '09:00', otherParticipants: 'Tổ Toán', updatedAt: NOW + 5 };
  assert.equal(projectPublicDuty(edited)?.startTime, '14:00');
  assert.equal(projectPublicDuty(edited)?.otherParticipants, '');
  const week = summarizeDutyWeek(WEEK, [edited], { status: 'approved', approvedAt: NOW });
  assert.equal(week.status, 'approved_changed');
  assert.equal(week.changes[0].kind, 'changed');

  const reapproved = approve(edited);
  assert.equal(projectPublicDuty(reapproved)?.startTime, '09:00');
  assert.equal(projectPublicDuty(reapproved)?.updatedAt, NOW + 5);
});

test('sửa công tác cũ lần đầu thì chụp lại bản đang hiện cho giáo viên', () => {
  const legacy = duty({ scope: undefined });
  const snapshot = legacySnapshotPatch(legacy, NOW);
  const edited = { ...legacy, ...snapshot, scope: 'school', startTime: '10:00' };
  assert.equal(edited.approvalTracked, true);
  assert.equal(projectPublicDuty(edited)?.startTime, '14:00');
  assert.equal(dutyHasPendingChange(edited), true);
  assert.deepEqual(legacySnapshotPatch({ ...legacy, scope: 'team' }, NOW), {});
});

test('xóa công tác đã duyệt: giáo viên vẫn thấy tới khi BGH duyệt việc xóa', () => {
  const approved = approve(duty({ approvalTracked: true }));
  const removed = { ...approved, active: false };
  assert.equal(projectPublicDuty(removed)?.title, 'Họp tổ Toán');
  const week = summarizeDutyWeek(WEEK, [removed], { status: 'approved', approvedAt: NOW });
  assert.equal(week.changes[0].kind, 'removed');
  const after = approve(removed);
  assert.equal(projectPublicDuty(after), null);
  assert.equal(after.publishedEndDate, undefined);
  assert.equal(summarizeDutyWeek(WEEK, [after], { status: 'approved', approvedAt: NOW }).changeCount, 0);
});

test('chuyển công tác sang tuần khác: tuần cũ duyệt thì gỡ, tuần mới duyệt thì hiện', () => {
  const approved = approve(duty({ approvalTracked: true }));
  const moved = { ...approved, startDate: '2026-10-20', endDate: '2026-10-20' };
  assert.deepEqual(weeksAffectedByDuty(approved, moved), [WEEK, NEXT_WEEK]);
  assert.equal(summarizeDutyWeek(WEEK, [moved], null).changes[0].kind, 'moved_out');
  assert.equal(summarizeDutyWeek(NEXT_WEEK, [moved], null).changes[0].kind, 'added');
  const oldWeekApproved = approve(moved, WEEK);
  assert.equal(projectPublicDuty(oldWeekApproved), null);
  const newWeekApproved = approve(oldWeekApproved, NEXT_WEEK);
  assert.equal(projectPublicDuty(newWeekApproved)?.startDate, '2026-10-20');
});

test('trạng thái tuần: chờ duyệt và bị trả lại', () => {
  const draft = duty({ approvalTracked: true });
  assert.equal(summarizeDutyWeek(WEEK, [draft], { status: 'submitted', submittedAt: NOW }).status, 'submitted');
  const returned = summarizeDutyWeek(WEEK, [draft], { status: 'returned', returnNote: 'Đổi giờ' });
  assert.equal(returned.status, 'returned');
  assert.equal(returned.returnNote, 'Đổi giờ');
  assert.equal(summarizeDutyWeek(WEEK, [], null).status, 'empty');
});

test('hủy thay đổi quay về bản đã duyệt; công tác chưa từng duyệt bị gỡ', () => {
  const approved = approve(duty({ approvalTracked: true }));
  const edited = { ...approved, startTime: '09:00' };
  const reverted = patched(edited, discardPatchForDuty(edited, WEEK, NOW, 'vanthu'));
  assert.equal(reverted.startTime, '14:00');
  assert.equal(dutyHasPendingChange(reverted), false);

  const fresh = duty({ _id: 'd2', approvalTracked: true });
  const dropped = patched(fresh, discardPatchForDuty(fresh, WEEK, NOW, 'vanthu'));
  assert.equal(dropped.active, false);
  assert.equal(discardPatchForDuty(reverted, WEEK, NOW, 'vanthu'), null);
});

test('công tác tổ trưởng giao không cần duyệt và không vào lịch chung', () => {
  const team = duty({ scope: 'team', approvalTracked: undefined });
  assert.equal(dutyHasPendingChange(team), false);
  assert.equal(projectPublicDuty(team)?.title, 'Họp tổ Toán');
  assert.equal(summarizeDutyWeek(WEEK, [team], null).status, 'empty');
  assert.deepEqual(weeksAffectedByDuty(team, team), []);
});

test('BGH là chức vụ cấp 4–5, không phải admin/mod', () => {
  assert.equal(isDutyWeekReviewer({ role: 'user', status: 'active' }, 5), true);
  assert.equal(isDutyWeekReviewer({ role: 'user', status: 'active' }, 4), true);
  assert.equal(isDutyWeekReviewer({ role: 'user', status: 'active' }, 3), false);
  assert.equal(isDutyWeekReviewer({ role: 'admin', status: 'active' }, 5), false);
  assert.equal(isDutyWeekReviewer({ role: 'moderator', status: 'active' }, 5), false);
  assert.equal(isDutyWeekReviewer({ role: 'user', status: 'disabled' }, 5), false);
});

test('lý do trả lại bắt buộc, tối đa 500 ký tự', () => {
  assert.equal(cleanReturnNote('  Đổi giờ  '), 'Đổi giờ');
  assert.throws(() => cleanReturnNote('   '), /DUTY_WEEK_RETURN_NOTE_REQUIRED/);
  assert.throws(() => cleanReturnNote('x'.repeat(501)), /DUTY_WEEK_RETURN_NOTE_TOO_LONG/);
});

test('giao diện: nhãn tuần, giờ Việt Nam, thông báo tuần chưa duyệt', () => {
  assert.equal(formatWeekRange(WEEK), '12/10 – 18/10');
  assert.equal(formatWeekMoment(Date.UTC(2026, 9, 10, 3, 20)), 'lúc 10:20, 10/10');
  assert.equal(isDutyWeekNotification({ sourceType: 'duty_week_review' }), true);
  assert.equal(isDutyWeekNotification({ sourceType: 'duty_assigned' }), false);
  assert.equal(shouldShowUnapprovedNotice({ viewer: 'public', mode: 'week', eventCount: 0 }), true);
  assert.equal(shouldShowUnapprovedNotice({ viewer: 'manager', mode: 'week', eventCount: 0 }), false);
});

test('mọi đường đọc của giáo viên đi qua bản đã duyệt', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const duties = read('../convex/duties.ts');
  assert.match(duties, /rawDuties\.map\(\(duty\) => projectPublicDuty\(duty\)\)/);
  assert.equal((duties.match(/projectPublicDuty\(await ctx\.db\.get\(args\.dutyId\)\)/g) || []).length, 2);
  assert.match(read('../convex/dutyMessages.ts'), /isAdmin \? raw : projectPublicDuty\(raw\)/);
  assert.match(read('../convex/chatAudience.ts'), /projectPublicDuty\(args\.duty\)/);
  assert.match(read('../convex/personalReminders.ts'), /projectPublicDuty\(await ctx\.db\.get/);
  assert.match(read('../convex/notifications.ts'), /loadPublicDutiesFromEndDate/);
  const weeks = read('../convex/dutyWeeks.ts');
  assert.match(weeks, /requireReviewer\(ctx\)[\s\S]*DUTY_WEEK_CHANGED/);
  assert.match(weeks, /DUTY_WEEK_MANAGER_REQUIRED/);
});
