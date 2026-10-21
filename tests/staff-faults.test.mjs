import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { SYSTEM_MENU_DEFS } from '../convex/menuAccess.ts';
import {
  canAddStaffFault,
  canSeeStaffFaultRecord,
  STAFF_FAULTS_MENU_ID,
} from '../convex/staffFaultsPolicy.ts';

test('Ghi nhận lỗi is a primary permission-group menu', () => {
  const menu = SYSTEM_MENU_DEFS.find((item) => item.id === STAFF_FAULTS_MENU_ID);
  assert.equal(menu?.label, 'Ghi nhận lỗi');
  assert.equal(SYSTEM_MENU_DEFS.length, 8);
});

test('nút thêm ghi nhận lỗi chỉ dành cho admin/mod và cấp 2–5★', () => {
  assert.equal(canAddStaffFault({ isOps: true, level: 0 }), true);
  assert.equal(canAddStaffFault({ isOps: false, level: 1 }), false);
  assert.equal(canAddStaffFault({ isOps: false, level: 2 }), true);
  assert.equal(canAddStaffFault({ isOps: false, level: 3 }), true);
  assert.equal(canAddStaffFault({ isOps: false, level: 4 }), true);
  assert.equal(canAddStaffFault({ isOps: false, level: 5 }), true);
});

test('Xem chỉ thấy lỗi của tôi và lỗi do tôi ghi nhận; Xem tối cao thấy người khác', () => {
  const me = 'user-1';
  const own = {
    isOps: false,
    access: 'view',
    actorUserId: me,
    targetUserId: me,
    recordedByUserId: 'boss',
  };
  const recorded = {
    isOps: false,
    access: 'view',
    actorUserId: me,
    targetUserId: 'other',
    recordedByUserId: me,
  };
  const someoneElse = {
    isOps: false,
    access: 'view',
    actorUserId: me,
    targetUserId: 'other',
    recordedByUserId: 'boss',
  };
  assert.equal(canSeeStaffFaultRecord(own), true);
  assert.equal(canSeeStaffFaultRecord(recorded), true);
  assert.equal(canSeeStaffFaultRecord(someoneElse), false);
  assert.equal(canSeeStaffFaultRecord({ ...someoneElse, access: 'view_all' }), true);
  assert.equal(canSeeStaffFaultRecord({ ...someoneElse, isOps: true, access: 'hidden' }), true);
});

test('Đánh giá nhân sự không còn nút tạo ghi nhận lỗi; menu mới có danh sách và thêm', () => {
  const peopleReview = readFileSync(new URL('../src/peopleReview/PeopleReviewView.jsx', import.meta.url), 'utf8');
  const staffFaults = readFileSync(new URL('../src/peopleReview/StaffFaultsView.jsx', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/peopleReview/peopleReview.css', import.meta.url), 'utf8');
  assert.doesNotMatch(peopleReview, /＋ Ghi nhận lỗi/);
  assert.doesNotMatch(peopleReview, /Ghi lỗi/);
  assert.match(peopleReview, /pr-section--faults/);
  assert.match(peopleReview, /pr-section--work/);
  assert.match(peopleReview, /pr-section--eval/);
  assert.match(peopleReview, />Kỳ đánh giá</);
  assert.match(staffFaults, /Thêm ghi nhận lỗi/);
  assert.match(staffFaults, /Lỗi của tôi/);
  assert.match(staffFaults, /Lỗi do tôi ghi nhận/);
  assert.doesNotMatch(staffFaults, /pr-hero/);
  assert.match(staffFaults, /work-primary-button/);
  assert.match(css, /--work-navy/);
  assert.match(staffFaults, /Tìm kiếm nâng cao/);
  assert.match(staffFaults, /Không có lỗi nào được ghi nhận/);
  assert.match(staffFaults, /duty-empty-smile/);
  assert.doesNotMatch(staffFaults, /DateRangeFilter/);
  assert.doesNotMatch(staffFaults, /pr-fault-toolbar/);
  assert.match(staffFaults, /Chọn nhân sự/);
  assert.match(shell, /staff-faults/);
  assert.match(shell, /StaffFaultsView/);
});
