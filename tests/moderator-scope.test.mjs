import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  filterUsersInModeratorScope,
  isUserInModeratorScope,
  isWorkDocumentInModeratorScope,
  MODERATOR_DEPARTMENT_SCOPE_ERROR,
  moderatorDepartmentScope,
  opsTargetInScope,
  workDocumentScopeAssignments,
} from '../convex/moderatorScope.ts';
import { canSeeArchivedWork, canSeeLiveWork } from '../convex/assignmentPolicy.ts';
import { canAccessWorkChat } from '../convex/workMessagePolicy.ts';
import { canSeeStaffFaultRecord } from '../convex/staffFaultsPolicy.ts';
import { messageFor } from '../src/lib/appErrorMessage.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const usersById = new Map([
  ['mod-a', { _id: 'mod-a', role: 'moderator', departmentId: 'dept-a', status: 'active' }],
  ['a1', { _id: 'a1', role: 'user', departmentId: 'dept-a', status: 'active' }],
  ['a2', { _id: 'a2', role: 'user', departmentId: 'dept-a', status: 'active' }],
  ['b1', { _id: 'b1', role: 'user', departmentId: 'dept-b', status: 'active' }],
  ['creator', { _id: 'creator', role: 'admin', status: 'active' }],
]);

test('moderatorDepartmentScope: only a moderator with a department is scoped', () => {
  assert.equal(moderatorDepartmentScope({ role: 'moderator', departmentId: 'dept-a' }), 'dept-a');
  assert.equal(moderatorDepartmentScope({ role: 'moderator' }), null);
  assert.equal(moderatorDepartmentScope({ role: 'moderator', departmentId: '  ' }), null);
  assert.equal(moderatorDepartmentScope({ role: 'admin', departmentId: 'dept-a' }), null);
  assert.equal(moderatorDepartmentScope({ role: 'user', departmentId: 'dept-a' }), null);
  assert.equal(moderatorDepartmentScope(null), null);
  assert.equal(MODERATOR_DEPARTMENT_SCOPE_ERROR, 'MODERATOR_DEPARTMENT_SCOPE');
});

test('user scope: in-department allowed, other department denied, unscoped unchanged', () => {
  assert.equal(isUserInModeratorScope('dept-a', { departmentId: 'dept-a' }), true);
  assert.equal(isUserInModeratorScope('dept-a', { departmentId: 'dept-b' }), false);
  assert.equal(isUserInModeratorScope('dept-a', {}), false);
  assert.equal(isUserInModeratorScope('dept-a', null), false);
  assert.equal(isUserInModeratorScope(null, { departmentId: 'dept-b' }), true);

  const scoped = { _id: 'mod-a', isOps: true, departmentScope: 'dept-a' };
  assert.equal(opsTargetInScope(scoped, usersById.get('a1')), true);
  assert.equal(opsTargetInScope(scoped, usersById.get('b1')), false);
  assert.equal(opsTargetInScope({ ...scoped, _id: 'b1' }, usersById.get('b1')), true, 'self always in scope');
  assert.equal(opsTargetInScope({ _id: 'mod-x', isOps: true, departmentScope: null }, usersById.get('b1')), true);
  assert.equal(opsTargetInScope({ _id: 'admin', isOps: true }, usersById.get('b1')), true);
  assert.equal(opsTargetInScope({ _id: 'u', isOps: false, departmentScope: null }, usersById.get('a1')), false);
});

test('Báo cáo: scoped moderator view_all narrows to department + self', () => {
  const users = [...usersById.values()];
  const scopedIds = filterUsersInModeratorScope('dept-a', users, 'mod-a').map((u) => u._id);
  assert.deepEqual(scopedIds.sort(), ['a1', 'a2', 'mod-a']);
  const selfOutside = filterUsersInModeratorScope('dept-a', users, 'creator').map((u) => u._id);
  assert.ok(selfOutside.includes('creator'));
  assert.ok(!selfOutside.includes('b1'));
  assert.equal(filterUsersInModeratorScope(null, users, 'creator').length, users.length);
});

test('Công việc: a document is in scope only when every assignment is in the department', () => {
  const deptA = { type: 'department', departmentId: 'dept-a' };
  const deptB = { type: 'department', departmentId: 'dept-b' };
  const indivA = { type: 'individual', userIds: ['a1', 'a2'] };
  const indivMixed = { type: 'individual', userIds: ['a1', 'b1'] };
  assert.equal(isWorkDocumentInModeratorScope('dept-a', [deptA], usersById), true);
  assert.equal(isWorkDocumentInModeratorScope('dept-a', [deptA, indivA], usersById), true);
  assert.equal(isWorkDocumentInModeratorScope('dept-a', [deptA, deptB], usersById), false);
  assert.equal(isWorkDocumentInModeratorScope('dept-a', [indivMixed], usersById), false);
  assert.equal(isWorkDocumentInModeratorScope('dept-a', [{ type: 'individual', userIds: ['ghost'] }], usersById), false);
  assert.equal(isWorkDocumentInModeratorScope('dept-a', [], usersById), false);
  // Work items use assignmentType/assigneeUserIds.
  assert.equal(
    isWorkDocumentInModeratorScope('dept-a', [{ assignmentType: 'individual', assigneeUserIds: ['a1'] }], usersById),
    true,
  );
  // Unscoped (admin / moderator without department) sees everything.
  assert.equal(isWorkDocumentInModeratorScope(null, [deptB, indivMixed], usersById), true);
  // Legacy documents without `assignments` fall back to departmentId.
  assert.deepEqual(workDocumentScopeAssignments({ departmentId: 'dept-a' }), [
    { type: 'department', departmentId: 'dept-a' },
  ]);
  assert.equal(
    isWorkDocumentInModeratorScope('dept-a', workDocumentScopeAssignments({ departmentId: 'dept-b' }), usersById),
    false,
  );
});

test('Công việc: school visibility narrows for out-of-scope documents only', () => {
  const base = {
    actorUserId: 'mod-a',
    actorRole: 'moderator',
    actorLevel: 0,
    createdBy: 'creator',
    isAssignee: false,
    visibilityMode: 'school',
  };
  assert.equal(canSeeLiveWork({ ...base, inModeratorScope: true }), true);
  assert.equal(canSeeLiveWork({ ...base, inModeratorScope: false }), false);
  // Unchanged default for callers that do not pass scope (admin / unscoped moderator).
  assert.equal(canSeeLiveWork(base), true);
  assert.equal(canSeeLiveWork({ ...base, actorRole: 'admin' }), true);
  // Creator and assignee keep their ordinary access even out of scope.
  assert.equal(canSeeLiveWork({ ...base, createdBy: 'mod-a', inModeratorScope: false }), true);
  assert.equal(canSeeLiveWork({ ...base, isAssignee: true, inModeratorScope: false }), true);
  // Level 4/5 users are unaffected by the moderator flag.
  assert.equal(
    canSeeLiveWork({ ...base, actorRole: 'user', actorLevel: 4, inModeratorScope: false }),
    true,
  );
  assert.equal(canSeeArchivedWork('moderator'), true);
  assert.equal(canSeeArchivedWork('moderator', false), false);
  assert.equal(canSeeArchivedWork('admin', true), true);
});

test('Công việc: work chat follows the same moderator scope', () => {
  const docB = {
    active: true,
    createdBy: 'creator',
    status: 'approved',
    assignments: [{ type: 'department', departmentId: 'dept-b' }],
  };
  const docA = { ...docB, assignments: [{ type: 'department', departmentId: 'dept-a' }] };
  const args = {
    actorUserId: 'mod-a',
    actorRole: 'moderator',
    actorLevel: 5,
    actorDepartmentId: 'dept-a',
    visibilityMode: 'school',
    workItems: [{ active: true, assignmentType: 'department', departmentId: 'dept-b' }],
    usersById,
  };
  assert.equal(canAccessWorkChat({ ...args, document: docB, departmentScope: 'dept-a' }), false);
  assert.equal(canAccessWorkChat({ ...args, document: docB }), true, 'unscoped moderator unchanged');
  assert.equal(
    canAccessWorkChat({
      ...args,
      document: docA,
      workItems: [{ active: true, assignmentType: 'department', departmentId: 'dept-a' }],
      departmentScope: 'dept-a',
    }),
    true,
  );
});

test('Ghi nhận lỗi: scoped moderator sees own + in-department faults only', () => {
  const base = {
    isOps: true,
    access: 'view_all',
    actorUserId: 'mod-a',
    recordedByUserId: 'someone',
  };
  assert.equal(
    canSeeStaffFaultRecord({ ...base, targetUserId: 'a1', departmentScope: 'dept-a', targetDepartmentId: 'dept-a' }),
    true,
  );
  assert.equal(
    canSeeStaffFaultRecord({ ...base, targetUserId: 'b1', departmentScope: 'dept-a', targetDepartmentId: 'dept-b' }),
    false,
  );
  assert.equal(
    canSeeStaffFaultRecord({ ...base, targetUserId: 'b1', recordedByUserId: 'mod-a', departmentScope: 'dept-a', targetDepartmentId: 'dept-b' }),
    true,
    'faults the moderator recorded stay visible',
  );
  assert.equal(
    canSeeStaffFaultRecord({ ...base, targetUserId: 'mod-a', departmentScope: 'dept-a', targetDepartmentId: 'dept-a' }),
    true,
  );
  // Unscoped moderator / admin unchanged.
  assert.equal(canSeeStaffFaultRecord({ ...base, targetUserId: 'b1', targetDepartmentId: 'dept-b' }), true);
  // Ordinary users are unaffected.
  assert.equal(
    canSeeStaffFaultRecord({ isOps: false, access: 'view_all', actorUserId: 'u', targetUserId: 'b1', recordedByUserId: 'x' }),
    true,
  );
  assert.equal(
    canSeeStaffFaultRecord({ isOps: false, access: 'view', actorUserId: 'u', targetUserId: 'b1', recordedByUserId: 'x' }),
    false,
  );
});

test('server modules enforce the moderator scope (not just the UI)', () => {
  const work = read('convex/work.ts');
  assert.match(work, /if \(actor\.isOps && actor\.departmentScope\) \{[\s\S]*?MODERATOR_DEPARTMENT_SCOPE_ERROR/);
  assert.match(work, /const managesAsOps = actor\.isOps\s*&& await documentInActorScope/);
  assert.match(work, /access\.isAdmin && await documentInActorScope\(ctx, access\.departmentScope, document\)/);
  assert.match(work, /departmentScope: actor\.departmentScope,\n\s*\}\),/);

  const reports = read('convex/reports.ts');
  assert.match(reports, /filterUsersInModeratorScope\(actorScope, activeUsers/);
  assert.match(reports, /isWorkDocumentInModeratorScope\(actorScope, assignments, usersById\)/);

  const peopleReview = read('convex/peopleReview.ts');
  assert.match(peopleReview, /if \(!opsReaches\(actor, target\)\) return false;/);
  assert.match(peopleReview, /if \(actor\.isOps\) return opsReaches\(actor, target\);/);
  assert.match(peopleReview, /return opsReaches\(actor, target\) \|\| actor\.level === 4/);
  assert.match(peopleReview, /departmentScope: moderatorDepartmentScope\(user\)/);
  assert.match(peopleReview, /\.filter\(\(user: any\) => !access\.isOps \|\| opsReaches\(access, user\)\)/);

  // School-wide modules intentionally keep moderator = admin power.
  assert.doesNotMatch(read('convex/duties.ts'), /moderatorScope/);
  assert.doesNotMatch(read('convex/homeroomPolicy.ts'), /moderatorScope/);
  assert.doesNotMatch(read('convex/boarding.ts'), /moderatorScope/);
});

test('MODERATOR_DEPARTMENT_SCOPE has a Vietnamese message and the user form explains the rule', () => {
  assert.equal(
    messageFor({ message: 'Uncaught Error: MODERATOR_DEPARTMENT_SCOPE' }),
    'Moderator chỉ được thao tác trong phòng ban được gán.',
  );
  assert.match(
    read('src/main.jsx'),
    /form\.role === 'moderator'[\s\S]*?Moderator chỉ thao tác trong phòng ban này ở Công việc, Báo cáo, Đánh giá nhân sự và Ghi nhận lỗi\. Để trống = toàn trường\./,
  );
});
