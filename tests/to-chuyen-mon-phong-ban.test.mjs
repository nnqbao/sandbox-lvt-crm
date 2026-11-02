import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { planWorkItems } from '../convex/workAssignmentPlan.ts';
import { isDutyParticipant, dutyPushRecipientIds, workAssignmentPushUserIds } from '../convex/assignmentPolicy.ts';
import { isWorkDocumentInModeratorScope } from '../convex/moderatorScope.ts';
import { sameDutyFields, pickPublishedFields, summarizeDutyWeek } from '../convex/dutyApproval.ts';
import { evaluateDutyRefs, cleanDutyInput } from '../convex/dutyWritePolicy.ts';
import { buildDutyChangeDiff } from '../convex/dutyChangeLog.ts';
import { workDuplicateRecipientIds, assignmentsFromDocument, workAssignmentPayload } from '../src/work/workDisplay.js';
import { formatParticipantCell } from '../src/duties/sharedDutySchedule.js';
import { dutyPayloadFromForm } from '../src/duties/dutyDisplay.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Tổ Toán: a, b, c (c also in Phòng ban Hành chính). Hành chính: c, d.
const users = [
  { _id: 'a', departmentId: 'toan', role: 'user' },
  { _id: 'b', departmentId: 'toan', role: 'user' },
  { _id: 'c', departmentId: 'toan', role: 'user' },
  { _id: 'd', departmentId: 'van', role: 'user' },
];
const planOptions = {
  departmentRosterIds: (departmentId) => users.filter((u) => u.departmentId === departmentId).map((u) => u._id),
  departmentOfUser: (id) => users.find((u) => u._id === id)?.departmentId || '',
};
const row = (type, extra) => ({ type, departmentId: '', userIds: [], content: 'Nộp kế hoạch', deadline: '2026-11-10', ...extra });

test('Phòng ban → một việc riêng của phòng ban (individual-type, gắn unitId)', () => {
  const items = planWorkItems([row('unit', { unitId: 'hc', userIds: ['c', 'd'] })], planOptions);
  assert.deepEqual(items, [{
    assignmentType: 'individual', departmentId: '', unitId: 'hc', assigneeUserIds: ['c', 'd'],
    content: 'Nộp kế hoạch', deadline: '2026-11-10',
  }]);
});

test('trùng Tổ + Phòng ban: chỉ người trùng thành việc cá nhân, không thuộc tổ/phòng ban', () => {
  const items = planWorkItems([
    row('department', { departmentId: 'toan' }),
    row('unit', { unitId: 'hc', userIds: ['c', 'd'] }),
  ], planOptions);
  // Tổ item stays (live roster drops c because c holds an individual item).
  assert.equal(items[0].assignmentType, 'department');
  assert.equal(items[0].departmentId, 'toan');
  // Phòng ban keeps only d.
  assert.deepEqual(items[1].assigneeUserIds, ['d']);
  assert.equal(items[1].unitId, 'hc');
  // c gets a plain individual item (no unitId), filed under c's Tổ column.
  assert.deepEqual(items[2], {
    assignmentType: 'individual', departmentId: 'toan', assigneeUserIds: ['c'],
    content: 'Nộp kế hoạch', deadline: '2026-11-10',
  });
  assert.equal(items.length, 3);
});

test('trùng Phòng ban + Cá nhân cùng nội dung: không nhận hai lần', () => {
  const items = planWorkItems([
    row('unit', { unitId: 'hc', userIds: ['c', 'd'] }),
    row('individual', { departmentId: 'toan', userIds: ['c'] }),
  ], planOptions);
  assert.deepEqual(items.map((i) => [i.unitId || '', i.assigneeUserIds]), [['hc', ['d']], ['', ['c']]]);
});

test('trùng Phòng ban + Cá nhân khác nội dung: giữ cả hai yêu cầu cho người đó', () => {
  const items = planWorkItems([
    row('unit', { unitId: 'hc', userIds: ['c', 'd'] }),
    row('individual', { departmentId: 'toan', userIds: ['c'], content: 'Việc riêng' }),
  ], planOptions);
  const forC = items.filter((i) => i.assigneeUserIds.includes('c'));
  assert.deepEqual(forC.map((i) => [i.content, i.unitId || '']).sort(), [['Nộp kế hoạch', ''], ['Việc riêng', '']]);
});

test('hai Phòng ban cùng nội dung: người thuộc cả hai chỉ nhận một việc cá nhân', () => {
  const items = planWorkItems([
    row('unit', { unitId: 'hc', userIds: ['c', 'd'] }),
    row('unit', { unitId: 'cd', userIds: ['c', 'a'] }),
  ], planOptions);
  assert.deepEqual(items.map((i) => [i.unitId || '', i.assigneeUserIds]), [['hc', ['d']], ['cd', ['a']], ['', ['c']]]);
});

test('Tổ + Cá nhân (luật cũ) không đổi: chỉ dòng cá nhân, tổ tự loại người đó', () => {
  const items = planWorkItems([
    row('department', { departmentId: 'toan' }),
    row('individual', { departmentId: 'toan', userIds: ['a'] }),
  ], planOptions);
  assert.equal(items.length, 2);
});

test('server: Phòng ban chỉ Văn thư, phải còn thành viên, không trùng phòng ban', () => {
  const work = read('convex/work.ts');
  assert.match(work, /if \(assignment\.type === "unit"\) throw new Error\("WORK_UNIT_FORBIDDEN"\)/);
  assert.match(work, /if \(!userIds\.length\) throw new Error\("WORK_UNIT_EMPTY"\)/);
  assert.match(work, /throw new Error\("WORK_UNIT_DUPLICATE"\)/);
  // Edits compare the planned items, and new items come from the plan.
  assert.match(work, /workAssignmentsUnchanged\(\s*related\.workItems\.filter\(\(item: any\) => item\.active\),\s*plannedItems,/);
  assert.match(work, /insertDocumentWorkItems\(ctx, args\.documentId, plannedItems/);
});

test('phạm vi moderator và push: Phòng ban dùng danh sách thành viên đã lưu', () => {
  const byId = new Map(users.map((u) => [u._id, u]));
  assert.equal(isWorkDocumentInModeratorScope('toan', [{ type: 'unit', userIds: ['a', 'b'] }], byId), true);
  assert.equal(isWorkDocumentInModeratorScope('toan', [{ type: 'unit', userIds: ['a', 'd'] }], byId), false);
  assert.deepEqual(
    workAssignmentPushUserIds({ assignments: [{ type: 'unit', userIds: ['c', 'd'] }], users }).sort(),
    ['c', 'd'],
  );
});

test('Công tác: thành viên Phòng ban là người tham gia; đổi thành viên không cần duyệt lại', () => {
  const duty = { departmentIds: [], unitIds: ['hc'], unitUserIds: ['c', 'd'], participantUserIds: [] };
  assert.equal(isDutyParticipant({ _id: 'd' }, duty), true);
  assert.equal(isDutyParticipant({ _id: 'a', departmentId: 'toan' }, duty), false);
  assert.deepEqual(dutyPushRecipientIds({ ...duty, users }).sort(), ['c', 'd']);

  const base = {
    startDate: '2026-11-10', endDate: '2026-11-10', startTime: '07:00', endTime: '09:00', allDay: false,
    title: 'Họp', content: 'Họp', locationIds: [], locationText: '', departmentIds: [], participantUserIds: [],
  };
  assert.equal(sameDutyFields({ ...base, unitIds: ['hc'], unitUserIds: ['c'] }, { ...base, unitIds: ['hc'], unitUserIds: ['c', 'd'] }), true);
  assert.equal(sameDutyFields({ ...base, unitIds: ['hc'] }, { ...base, unitIds: [] }), false);
  // The approved copy carries the unit and its members.
  assert.deepEqual(pickPublishedFields({ ...base, unitIds: ['hc'], unitUserIds: ['c'] }).unitUserIds, ['c']);
  // A duty whose only Thành phần is a Phòng ban is not "missing participants".
  const summary = summarizeDutyWeek('2026-11-09', [{ ...base, _id: 'x', unitIds: ['hc'], active: true, scope: 'school', approvalTracked: true, createdAt: 1, updatedAt: 1 }], null);
  assert.equal(summary.missingParticipants, 0);
});

test('Công tác: chỉ Văn thư chọn Phòng ban; phòng ban phải còn hoạt động', () => {
  const input = cleanDutyInput({
    startDate: '2026-11-10', endDate: '2026-11-10', startTime: '07:00', endTime: '09:00', allDay: false,
    title: 'Họp', content: 'Họp', locationText: 'Hội trường', departmentIds: [], unitIds: ['hc', 'hc'], participantUserIds: [],
  });
  assert.deepEqual(input.unitIds, ['hc']);
  const ops = { user: { _id: 'vt' }, isOps: true, positions: [] };
  const lead = { user: { _id: 'tt', departmentId: 'toan' }, isOps: false, positions: [] };
  const catalogs = { departments: [], units: [{ _id: 'hc', active: true }], users };
  assert.equal(evaluateDutyRefs(input, ops, catalogs), null);
  assert.equal(evaluateDutyRefs(input, lead, catalogs), 'DUTY_UNIT_FORBIDDEN');
  assert.equal(evaluateDutyRefs(input, ops, { ...catalogs, units: [{ _id: 'hc', active: false }] }), 'INVALID_UNIT');
  // Team leads never send units from the web form.
  assert.deepEqual(dutyPayloadFromForm({ ...input, unitIds: ['hc'] }, { includeDepartments: false }).unitIds, []);
});

test('Công tác: lịch chung hiện tên Tổ và Phòng ban gọn trong cột Thành phần', () => {
  assert.equal(
    formatParticipantCell({ departmentNames: ['Tổ Toán'], unitNames: ['Phòng Hành chính'], participantNames: ['Cô A'] }),
    'Tổ Toán, Phòng Hành chính, Cô A',
  );
  const diff = buildDutyChangeDiff(null, {
    startDate: '2026-11-10', endDate: '2026-11-10', startTime: '07:00', endTime: '09:00',
    departmentIds: ['toan'], unitIds: ['hc'], participantUserIds: [],
  }, { departments: new Map([['toan', 'Tổ Toán']]), units: new Map([['hc', 'Phòng Hành chính']]), users: new Map() });
  assert.deepEqual(
    diff.filter((c) => c.field.endsWith('tham gia')).map((c) => [c.field, c.after]),
    [['Tổ chuyên môn tham gia', 'Tổ Toán'], ['Phòng ban tham gia', 'Phòng Hành chính']],
  );
});

test('web Công việc: nút Tổ chuyên môn / Phòng ban / Cá nhân, báo người trùng, sửa dùng dòng đã lưu', () => {
  const rows = read('src/work/WorkAssignmentRows.jsx');
  assert.match(rows, /＋ Tổ chuyên môn/);
  assert.match(rows, /＋ Phòng ban/);
  assert.match(rows, /＋ Cá nhân/);
  const dup = workDuplicateRecipientIds(
    [{ type: 'department', departmentId: 'toan' }, { type: 'unit', unitId: 'hc' }],
    { users, units: [{ _id: 'hc', memberUserIds: ['c', 'd'] }] },
  );
  assert.deepEqual(dup, ['c']);
  const form = assignmentsFromDocument({
    formAssignments: [{ type: 'unit', unitId: 'hc', userIds: ['c', 'd'], content: 'X', deadline: '2026-11-10' }],
    assignments: [{ type: 'individual', userIds: ['c'], content: 'X', deadline: '2026-11-10' }],
  });
  assert.deepEqual(form.map((r) => [r.type, r.unitId]), [['unit', 'hc']]);
  assert.deepEqual(workAssignmentPayload(form), [{ type: 'unit', unitId: 'hc', content: 'X', deadline: '2026-11-10' }]);
});

test('thiết lập: menu Tổ chuyên môn rồi Phòng ban; Phòng ban nhiều-nhiều, chỉ admin', () => {
  const routes = read('src/navigationRoutes.js');
  assert.match(routes, /\['departments', 'Thiết lập tổ chuyên môn'\],\n\s*\['units', 'Thiết lập phòng ban'\],/);
  const schema = read('convex/schema.ts');
  assert.match(schema, /unitMembers: defineTable\(/);
  const units = read('convex/units.ts');
  for (const name of ['list', 'create', 'update', 'remove', 'addMember', 'removeMember']) {
    const start = units.indexOf(`export const ${name} =`);
    assert.ok(start >= 0, name);
    assert.match(units.slice(start, start + 400), /adminPermissionOrThrow\(ctx, "units:write"\)/, name);
  }
  // Membership changes keep open duties in sync.
  assert.equal((units.match(/syncDutiesForUnit\(ctx/g) || []).length, 2);
});
