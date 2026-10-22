import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCOUNT_MENU_IDS,
  MENU_PATHS,
  PRIMARY_MENUS,
  SUPREME_SETTINGS,
  isAccountMenu,
  isPrimaryMenuVisible,
  isSidebarPrimaryMenu,
  pathnameForMenu,
  pathnameForReportSection,
  routeForPathname,
  titleForAccountMenu,
} from '../src/navigationRoutes.js';
import {
  ACCOUNT_DELETION_CANONICAL_PATH,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_ORGANIZATION_VI,
  PRIVACY_POLICY_CANONICAL_PATH,
  isPublicAccountDeletionPath,
  isPublicPrivacyPath,
} from '../src/privacy/privacyPolicy.js';

test('mỗi menu CRM có một đường dẫn con duy nhất', () => {
  const paths = Object.values(MENU_PATHS);
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(pathnameForMenu('users'), '/thiet-lap-nguoi-dung');
  assert.equal(pathnameForMenu('roles'), '/thiet-lap-nhom-quyen');
  assert.equal(pathnameForMenu('positions'), '/thiet-lap-chuc-vu');
  assert.equal(pathnameForMenu('document-types'), '/thiet-lap-loai-van-ban');
  assert.equal(pathnameForMenu('school-years'), '/thiet-lap-nam-hoc');
  assert.deepEqual(routeForPathname('/thiet-lap-nam-hoc'), { menu: 'school-years', reportSection: undefined });
});

test('đường dẫn con mở đúng menu và chuẩn hóa dấu gạch cuối', () => {
  assert.deepEqual(routeForPathname('/thiet-lap-nguoi-dung'), { menu: 'users', reportSection: undefined });
  assert.deepEqual(routeForPathname('/thiet-lap-nguoi-dung/'), { menu: 'users', reportSection: undefined });
  assert.deepEqual(routeForPathname('/cong-viec?from=notification'), { menu: 'work', reportSection: undefined });
  assert.equal(routeForPathname('/khong-ton-tai'), null);
  assert.equal(routeForPathname('/'), null);
});

test('đường dẫn menu đã ẩn được chuyển về menu đang dùng', () => {
  assert.deepEqual(routeForPathname('/quan-ly-cong-tac'), { menu: 'duties', reportSection: undefined });
  assert.deepEqual(routeForPathname('/quan-ly-cong-viec'), { menu: 'work', reportSection: undefined });
  assert.deepEqual(routeForPathname('/thiet-lap-dia-diem'), { menu: 'departments', reportSection: undefined });
});

test('Thiết lập địa điểm đã gỡ: không còn menu/đường dẫn riêng', () => {
  assert.equal('locations' in MENU_PATHS, false);
  assert.equal(pathnameForMenu('locations'), '/');
  assert.equal(SUPREME_SETTINGS.some(([id]) => id === 'locations'), false);
});

test('Bán trú là menu trên sidebar, link cũ vẫn mở đúng chỗ', () => {
  assert.equal(pathnameForMenu('boarding'), '/ban-tru');
  assert.deepEqual(routeForPathname('/ban-tru'), { menu: 'boarding', reportSection: undefined });
  assert.deepEqual(routeForPathname('/quan-ly-ban-tru'), { menu: 'boarding', reportSection: undefined });
  assert.deepEqual(routeForPathname('/bao-cao/ban-tru'), { menu: 'reports', reportSection: 'boarding' });
  assert.equal(pathnameForReportSection('boarding'), '/bao-cao/ban-tru');
  assert.equal(isSidebarPrimaryMenu('boarding'), true);
  assert.ok(PRIMARY_MENUS.some(([id, label]) => id === 'boarding' && label === 'Bán trú'));
});

test('Bán trú hiện theo quyền Báo cáo (giống convex/boarding.ts), admin/mod luôn thấy', () => {
  assert.equal(isPrimaryMenuVisible('boarding', { canManageOperations: true, menuAccess: {} }), true);
  assert.equal(isPrimaryMenuVisible('boarding', { menuAccess: { reports: 'view' } }), true);
  assert.equal(isPrimaryMenuVisible('boarding', { menuAccess: { reports: 'view_all' } }), true);
  assert.equal(isPrimaryMenuVisible('boarding', { menuAccess: { reports: 'hidden' } }), false);
  assert.equal(isPrimaryMenuVisible('boarding', { menuAccess: {} }), false);
  assert.equal(isPrimaryMenuVisible('boarding', { menuAccess: null }), false);
  // Other menus keep their own level; chat and work are always open.
  assert.equal(isPrimaryMenuVisible('reports', { menuAccess: { reports: 'hidden' } }), false);
  assert.equal(isPrimaryMenuVisible('attendance', { menuAccess: { attendance: 'supervisor' } }), true);
  assert.equal(isPrimaryMenuVisible('homeroom', { menuAccess: { homeroom: 'hidden', attendance: 'supervisor' } }), false);
  assert.equal(isPrimaryMenuVisible('chat', { menuAccess: {} }), true);
  assert.equal(isPrimaryMenuVisible('work', { menuAccess: { work: 'hidden' } }), true);
});

test('các tab báo cáo đang dùng có đường dẫn riêng', () => {
  assert.equal(pathnameForReportSection('work'), '/bao-cao/cong-viec');
  assert.deepEqual(routeForPathname('/bao-cao/cong-viec'), { menu: 'reports', reportSection: 'work' });
  assert.equal(pathnameForMenu('reports'), '/bao-cao/cong-viec');
});

test('Báo cáo Công tác cũ chuyển vào Lịch công tác chung', () => {
  assert.deepEqual(routeForPathname('/bao-cao/cong-tac'), {
    menu: 'duties',
    reportSection: undefined,
    dutyPath: '/cong-tac/chung',
  });
  assert.deepEqual(routeForPathname('/cong-tac/chung'), {
    menu: 'duties',
    reportSection: undefined,
    dutyPath: '/cong-tac/chung',
  });
  assert.deepEqual(routeForPathname('/cong-tac/tao'), {
    menu: 'duties',
    reportSection: undefined,
    dutyPath: '/cong-tac/tao',
  });
});

test('trang chính sách bảo mật là đường dẫn công khai, không phải menu CRM', () => {
  assert.equal(isPublicPrivacyPath('/privacy'), true);
  assert.equal(isPublicPrivacyPath('/chinh-sach-bao-mat/'), true);
  assert.equal(isPublicPrivacyPath('/cong-tac'), false);
  assert.equal(routeForPathname(PRIVACY_POLICY_CANONICAL_PATH), null);
  assert.equal(PRIVACY_CONTACT_EMAIL, 'nnqbao@gmail.com');
  assert.equal(PRIVACY_ORGANIZATION_VI, 'THCS Lê Văn Tám');
});

test('trang xóa tài khoản là đường dẫn công khai cho Play Console', () => {
  assert.equal(isPublicAccountDeletionPath('/xoa-tai-khoan'), true);
  assert.equal(isPublicAccountDeletionPath('/account-deletion/'), true);
  assert.equal(isPublicPrivacyPath(ACCOUNT_DELETION_CANONICAL_PATH), false);
  assert.equal(routeForPathname(ACCOUNT_DELETION_CANONICAL_PATH), null);
});

test('Thông báo vẫn có đường dẫn nhưng không nằm trên sidebar', () => {
  assert.equal(pathnameForMenu('notifications'), '/thong-bao');
  assert.deepEqual(routeForPathname('/thong-bao'), { menu: 'notifications', reportSection: undefined });
  assert.equal(isSidebarPrimaryMenu('notifications'), false);
  assert.equal(isSidebarPrimaryMenu('work'), true);
  assert.equal(isSidebarPrimaryMenu('reports'), true);
});

test('Trao đổi vẫn có đường dẫn nhưng không nằm trên sidebar (header)', () => {
  assert.equal(pathnameForMenu('chat'), '/trao-doi');
  assert.deepEqual(routeForPathname('/trao-doi'), {
    menu: 'chat',
    reportSection: undefined,
    chatPath: '/trao-doi',
    chatKind: '',
    chatEntityId: '',
  });
  assert.equal(isSidebarPrimaryMenu('chat'), false);
});

test('Ghi nhận lỗi có đường dẫn riêng trên sidebar', () => {
  assert.equal(pathnameForMenu('staff-faults'), '/ghi-nhan-loi');
  assert.deepEqual(routeForPathname('/ghi-nhan-loi'), { menu: 'staff-faults', reportSection: undefined });
  assert.equal(isSidebarPrimaryMenu('staff-faults'), true);
});

test('hồ sơ / mật khẩu / thiết bị là 3 trang tài khoản, không nằm trên sidebar', () => {
  assert.equal(pathnameForMenu('profile'), '/thong-tin-ca-nhan');
  assert.equal(pathnameForMenu('change-password'), '/doi-mat-khau');
  assert.equal(pathnameForMenu('devices'), '/quan-ly-thiet-bi-dang-nhap');
  assert.deepEqual(routeForPathname('/thong-tin-ca-nhan'), { menu: 'profile', reportSection: undefined });
  assert.deepEqual(routeForPathname('/doi-mat-khau'), { menu: 'change-password', reportSection: undefined });
  assert.deepEqual(routeForPathname('/quan-ly-thiet-bi-dang-nhap'), { menu: 'devices', reportSection: undefined });
  assert.deepEqual(routeForPathname('/ho-so-noi-bo'), { menu: 'profile', reportSection: undefined });
  assert.equal(titleForAccountMenu('profile'), 'Hồ sơ nội bộ');
  assert.equal(titleForAccountMenu('change-password'), 'Đổi mật khẩu');
  assert.equal(titleForAccountMenu('devices'), 'Quản lý thiết bị đăng nhập');
  assert.deepEqual([...ACCOUNT_MENU_IDS], ['profile', 'change-password', 'devices']);
  for (const menuId of ACCOUNT_MENU_IDS) {
    assert.equal(isAccountMenu(menuId), true);
    assert.equal(isSidebarPrimaryMenu(menuId), false);
  }
});
