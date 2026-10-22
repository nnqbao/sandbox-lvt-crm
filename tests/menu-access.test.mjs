import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertValidMenuAccessEntries,
  canonicalizeMenuAccessLevel,
  canOperateMenu,
  cleanPermissionGroupMenuAccess,
  defaultMenuAccess,
  effectiveMenuAccessLevel,
  isMenuVisible,
  isSupervisorAccess,
  isViewAllAccess,
  menuAccessEntriesEqual,
  migrateSupervisorMenuAccess,
  normalizeMenuAccess,
  SYSTEM_MENU_DEFS,
} from '../convex/menuAccess.ts';

test('normalizeMenuAccess map legacy edit thành view', () => {
  const normalized = Object.fromEntries(
    normalizeMenuAccess([
      { menu: 'duties', access: 'edit' },
      { menu: 'notifications', access: 'edit' },
    ]).map((entry) => [entry.menu, entry.access]),
  );
  assert.equal(normalized.duties, 'view');
  assert.equal(normalized.notifications, 'view');
  assert.equal(normalized.reports, 'hidden');
});

test('normalizeMenuAccess điền menu thiếu: Thông báo view, còn lại hidden', () => {
  const normalized = Object.fromEntries(
    normalizeMenuAccess([]).map((entry) => [entry.menu, entry.access]),
  );
  const defaults = Object.fromEntries(defaultMenuAccess().map((entry) => [entry.menu, entry.access]));
  assert.deepEqual(normalized, defaults);
  assert.equal(normalized.notifications, 'view');
  assert.equal(normalized.work, 'hidden');
  assert.equal(normalized.homeroom, 'hidden');
  assert.equal(normalized.attendance, 'hidden');
  assert.equal(normalized['staff-faults'], 'hidden');
});

test('canOperateMenu true cho view, view_all và legacy edit; false cho hidden và supervisor', () => {
  assert.equal(canOperateMenu('view'), true);
  assert.equal(canOperateMenu('view_all'), true);
  assert.equal(canOperateMenu('edit'), true);
  assert.equal(canOperateMenu('hidden'), false);
  assert.equal(canOperateMenu('supervisor'), false);
  assert.equal(canOperateMenu(undefined), false);
});

test('attendance=supervisor is canonical and remains supervisor', () => {
  const normalized = normalizeMenuAccess([{ menu: 'attendance', access: 'supervisor' }]);
  const attendance = normalized.find((entry) => entry.menu === 'attendance');
  assert.equal(attendance?.access, 'supervisor');
  assert.equal(isSupervisorAccess(attendance?.access), true);
  assert.equal(isMenuVisible(attendance?.access), true);
  assert.equal(isViewAllAccess(attendance?.access), false);
  assert.equal(effectiveMenuAccessLevel('attendance', 'supervisor'), 'supervisor');
});

test('supervisor on any menu other than attendance is rejected — including homeroom', () => {
  for (const menu of ['homeroom', 'duties', 'work', 'reports']) {
    assert.throws(() => assertValidMenuAccessEntries([{ menu, access: 'supervisor' }]), /INVALID_MENU_ACCESS/);
    assert.equal(effectiveMenuAccessLevel(menu, 'supervisor'), 'hidden');
  }
  assert.throws(
    () =>
      cleanPermissionGroupMenuAccess([
        { menu: 'reports', access: 'view' },
        { menu: 'notifications', access: 'view' },
        { menu: 'duties', access: 'supervisor' },
        { menu: 'work', access: 'hidden' },
        { menu: 'homeroom', access: 'view' },
        { menu: 'people-review', access: 'hidden' },
      ]),
    /INVALID_MENU_ACCESS/,
  );
  const normalized = normalizeMenuAccess([{ menu: 'homeroom', access: 'supervisor' }]);
  assert.equal(normalized.find((entry) => entry.menu === 'homeroom')?.access, 'hidden');
});

test('attendance accepts only hidden or supervisor', () => {
  for (const access of ['view', 'view_all', 'edit']) {
    assert.throws(() => assertValidMenuAccessEntries([{ menu: 'attendance', access }]), /INVALID_MENU_ACCESS/);
    assert.equal(effectiveMenuAccessLevel('attendance', access), 'hidden');
    assert.equal(normalizeMenuAccess([{ menu: 'attendance', access }]).find((e) => e.menu === 'attendance')?.access, 'hidden');
  }
  assert.doesNotThrow(() => assertValidMenuAccessEntries([{ menu: 'attendance', access: 'hidden' }]));
  assert.equal(effectiveMenuAccessLevel('attendance', undefined), 'hidden');
});

test('Điểm danh sits right after Lớp chủ nhiệm in the system menus', () => {
  const ids = SYSTEM_MENU_DEFS.map((item) => item.id);
  assert.equal(ids.indexOf('attendance'), ids.indexOf('homeroom') + 1);
  assert.equal(SYSTEM_MENU_DEFS.find((item) => item.id === 'attendance')?.label, 'Điểm danh');
});

test('migration moves homeroom Giám thị to attendance and is idempotent', () => {
  const legacy = [
    { menu: 'homeroom', access: 'supervisor' },
    { menu: 'duties', access: 'view' },
  ];
  const first = migrateSupervisorMenuAccess(legacy);
  assert.equal(first.movedSupervisor, true);
  const map = Object.fromEntries(first.menuAccess.map((e) => [e.menu, e.access]));
  assert.equal(map.homeroom, 'hidden');
  assert.equal(map.attendance, 'supervisor');
  assert.equal(map.duties, 'view');
  const second = migrateSupervisorMenuAccess(first.menuAccess);
  assert.equal(second.movedSupervisor, false);
  assert.deepEqual(second.menuAccess, first.menuAccess);

  const other = migrateSupervisorMenuAccess([{ menu: 'homeroom', access: 'view' }]);
  assert.equal(other.movedSupervisor, false);
  const otherMap = Object.fromEntries(other.menuAccess.map((e) => [e.menu, e.access]));
  assert.equal(otherMap.homeroom, 'view');
  assert.equal(otherMap.attendance, 'hidden');
});

test('migration re-run is a no-op even when stored objects reorder keys', () => {
  const first = migrateSupervisorMenuAccess([
    { menu: 'homeroom', access: 'supervisor' },
    { menu: 'duties', access: 'view' },
  ]);
  assert.equal(menuAccessEntriesEqual(first.menuAccess, [{ menu: 'homeroom', access: 'supervisor' }]), false);
  // Convex returns stored documents with keys sorted (access before menu).
  const stored = first.menuAccess.map((entry) => ({ access: entry.access, menu: entry.menu }));
  assert.notEqual(JSON.stringify(stored), JSON.stringify(first.menuAccess));
  const second = migrateSupervisorMenuAccess(stored);
  assert.equal(menuAccessEntriesEqual(second.menuAccess, stored), true);
  // Order-insensitive, but a different access or a missing menu is a change.
  assert.equal(menuAccessEntriesEqual([...stored].reverse(), stored), true);
  const changed = stored.map((entry) => (entry.menu === 'duties' ? { ...entry, access: 'view_all' } : entry));
  assert.equal(menuAccessEntriesEqual(changed, stored), false);
  assert.equal(menuAccessEntriesEqual(stored.slice(1), stored), false);
  assert.equal(menuAccessEntriesEqual(undefined, []), true);
});

test('legacy edit normalizes to view and is never promoted to supervisor', () => {
  assert.equal(canonicalizeMenuAccessLevel('edit'), 'view');
  const normalized = normalizeMenuAccess([
    { menu: 'homeroom', access: 'edit' },
    { menu: 'duties', access: 'edit' },
    { menu: 'work', access: 'view_all' },
  ]);
  assert.equal(normalized.find((entry) => entry.menu === 'homeroom')?.access, 'view');
  assert.equal(normalized.find((entry) => entry.menu === 'duties')?.access, 'view');
  assert.equal(normalized.find((entry) => entry.menu === 'work')?.access, 'view_all');
  assert.ok(normalized.every((entry) => entry.access !== 'supervisor'));
});

test('unknown access never grants visibility or view_all', () => {
  assert.equal(canonicalizeMenuAccessLevel('superuser'), 'hidden');
  assert.equal(isMenuVisible(canonicalizeMenuAccessLevel('')), false);
  assert.equal(isViewAllAccess(canonicalizeMenuAccessLevel('edit')), false);
});

test('supervisor is not view_all and does not broaden another menu', () => {
  const normalized = normalizeMenuAccess([
    { menu: 'attendance', access: 'supervisor' },
    { menu: 'reports', access: 'hidden' },
  ]);
  const reports = normalized.find((entry) => entry.menu === 'reports');
  const attendance = normalized.find((entry) => entry.menu === 'attendance');
  const homeroom = normalized.find((entry) => entry.menu === 'homeroom');
  assert.equal(isViewAllAccess(attendance?.access), false);
  assert.equal(canOperateMenu(attendance?.access), false);
  assert.equal(isMenuVisible(reports?.access), false);
  assert.equal(isMenuVisible(homeroom?.access), false);
  assert.equal(isSupervisorAccess(reports?.access), false);
});

test('create and update shared helper reject a crafted non-attendance supervisor payload', () => {
  const crafted = [
    { menu: 'reports', access: 'supervisor' },
    { menu: 'homeroom', access: 'view' },
  ];
  assert.throws(() => cleanPermissionGroupMenuAccess(crafted), /INVALID_MENU_ACCESS/);
  assert.throws(() => cleanPermissionGroupMenuAccess([{ menu: 'homeroom', access: 'supervisor' }]), /INVALID_MENU_ACCESS/);
  assert.doesNotThrow(() =>
    cleanPermissionGroupMenuAccess([{ menu: 'attendance', access: 'supervisor' }]),
  );
});

test('permission matrix source shows Giám thị after Xem tối cao and only for attendance', () => {
  const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const headStart = source.indexOf('perm-matrix-head');
  assert.ok(headStart > 0);
  const headBlock = source.slice(headStart, headStart + 500);
  const hiddenAt = headBlock.indexOf('Ẩn');
  const viewAt = headBlock.indexOf('Xem</span>');
  const viewAllAt = headBlock.indexOf('Xem tối cao');
  const supervisorAt = headBlock.indexOf('Giám thị');
  const editAt = headBlock.indexOf('Sửa');
  assert.ok(hiddenAt >= 0 && viewAt > hiddenAt && viewAllAt > viewAt && supervisorAt > viewAllAt);
  assert.equal(editAt, -1, 'Sửa must not remain a visible matrix column');

  assert.match(source, /isMatrixLevelAvailable/);
  assert.match(source, /radio-cell-unavailable|—/);
  assert.match(source, /Giám thị chỉ dành cho menu Điểm danh/);
});

test('operatorSetMenuAccess (CLI): kiểm tra như create/update, không đổi thì không ghi', async () => {
  const { readFileSync } = await import('node:fs');
  const { planOperatorMenuAccessChange, normalizeMenuAccess, INVALID_MENU_ACCESS } = await import('../convex/menuAccess.ts');
  const gth = normalizeMenuAccess([{ menu: 'attendance', access: 'supervisor' }, { menu: 'notifications', access: 'hidden' }]);
  const opened = planOperatorMenuAccessChange(gth, 'notifications', 'view');
  assert.equal(opened.changed, true);
  assert.equal(opened.before, 'hidden');
  assert.equal(opened.menuAccess.find((row) => row.menu === 'notifications').access, 'view');
  // Every other menu is untouched (Giám thị stays on Điểm danh).
  assert.equal(opened.menuAccess.find((row) => row.menu === 'attendance').access, 'supervisor');
  assert.equal(opened.menuAccess.length, gth.length);
  // Idempotent: applying it again changes nothing (no patch, no audit).
  assert.equal(planOperatorMenuAccessChange(opened.menuAccess, 'notifications', 'view').changed, false);
  // supervisor only on attendance; unknown menus/levels and legacy edit are rejected.
  assert.throws(() => planOperatorMenuAccessChange(gth, 'homeroom', 'supervisor'), new RegExp(INVALID_MENU_ACCESS));
  assert.throws(() => planOperatorMenuAccessChange(gth, 'attendance', 'view'), new RegExp(INVALID_MENU_ACCESS));
  assert.throws(() => planOperatorMenuAccessChange(gth, 'nope', 'view'), /INVALID_MENU/);
  assert.throws(() => planOperatorMenuAccessChange(gth, 'notifications', 'edit'), new RegExp(INVALID_MENU_ACCESS));
  assert.throws(() => planOperatorMenuAccessChange(gth, 'notifications', 'admin'), new RegExp(INVALID_MENU_ACCESS));

  const source = readFileSync(new URL('../convex/permissionGroups.ts', import.meta.url), 'utf8');
  assert.match(source, /export const operatorSetMenuAccess = internalMutation\(\{\n  args: \{ code: v\.string\(\), menu: v\.string\(\), access: v\.string\(\) \}/);
  const block = source.slice(source.indexOf('export const operatorSetMenuAccess'), source.indexOf('export const list'));
  assert.match(block, /if \(!plan\.changed\) return/);
  assert.match(block, /actorUserId: "operator:cli"/);
  assert.doesNotMatch(source, /export const operatorSetMenuAccess = mutation/);
});
