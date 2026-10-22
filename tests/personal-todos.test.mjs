import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canAccessTodo,
  cleanTodoInput,
  reminderNeedsJob,
  reminderShouldFire,
  sortTodosForList,
  TODO_NOTE_MAX,
  TODO_TITLE_MAX,
  todoReminderNotificationItem,
} from '../convex/personalTodoPolicy.ts';
import {
  formatTodoMoment,
  isTodoOverdue,
  todoLocalInputToMs,
  todoMsToLocalInput,
  validateTodoForm,
} from '../src/work/personalTodoDisplay.js';

const NOW = Date.UTC(2026, 9, 21, 3, 0); // 10:00 21/10/2026 Vietnam time
const HOUR = 60 * 60 * 1000;

function todo(overrides = {}) {
  return {
    _id: 't1',
    userId: 'owner',
    title: 'Chuẩn bị giáo án',
    active: true,
    createdAt: NOW - HOUR,
    updatedAt: NOW - HOUR,
    ...overrides,
  };
}

test('việc của tôi: chỉ chủ sở hữu đọc/ghi, kể cả admin/mod cũng không', () => {
  assert.equal(canAccessTodo(todo(), 'owner'), true);
  assert.equal(canAccessTodo(todo(), 'admin-user'), false);
  assert.equal(canAccessTodo(todo(), ''), false);
  assert.equal(canAccessTodo(todo({ active: false }), 'owner'), false);
  assert.equal(canAccessTodo(null, 'owner'), false);
});

test('việc của tôi: kiểm tra tên, ghi chú, thời gian', () => {
  assert.deepEqual(cleanTodoInput({ title: '  Gọi phụ huynh  ', note: '  ' }, NOW), {
    title: 'Gọi phụ huynh',
    note: undefined,
    dueAt: undefined,
    remindAt: undefined,
  });
  assert.throws(() => cleanTodoInput({ title: '   ' }, NOW), /INVALID_TODO_TITLE/);
  assert.throws(() => cleanTodoInput({ title: 'x'.repeat(TODO_TITLE_MAX + 1) }, NOW), /INVALID_TODO_TITLE/);
  assert.equal(cleanTodoInput({ title: 'x'.repeat(TODO_TITLE_MAX) }, NOW).title.length, TODO_TITLE_MAX);
  assert.throws(() => cleanTodoInput({ title: 'a', note: 'n'.repeat(TODO_NOTE_MAX + 1) }, NOW), /INVALID_TODO_NOTE/);
  assert.throws(() => cleanTodoInput({ title: 'a', dueAt: Number.NaN }, NOW), /INVALID_TODO_TIME/);
  assert.throws(() => cleanTodoInput({ title: 'a', dueAt: -5 }, NOW), /INVALID_TODO_TIME/);
  // A due date in the past is allowed (overdue); only reminders must be ahead.
  assert.equal(cleanTodoInput({ title: 'a', dueAt: NOW - HOUR }, NOW).dueAt, NOW - HOUR);
  assert.equal(cleanTodoInput({ title: 'a', dueAt: null, remindAt: null }, NOW).remindAt, undefined);
});

test('việc của tôi: giờ nhắc phải ở tương lai (trừ nhắc cũ giữ nguyên khi sửa)', () => {
  assert.equal(cleanTodoInput({ title: 'a', remindAt: NOW + HOUR }, NOW).remindAt, NOW + HOUR);
  assert.throws(() => cleanTodoInput({ title: 'a', remindAt: NOW }, NOW), /TODO_REMIND_IN_PAST/);
  assert.throws(() => cleanTodoInput({ title: 'a', remindAt: NOW - HOUR }, NOW), /TODO_REMIND_IN_PAST/);
  assert.equal(cleanTodoInput({ title: 'b', remindAt: NOW - HOUR }, NOW, { remindAt: NOW - HOUR }).remindAt, NOW - HOUR);
  assert.throws(() => cleanTodoInput({ title: 'b', remindAt: NOW - 2 * HOUR }, NOW, { remindAt: NOW - HOUR }), /TODO_REMIND_IN_PAST/);
});

test('việc của tôi: job nhắc chỉ chạy cho đúng lần nhắc của việc còn mở', () => {
  assert.equal(reminderNeedsJob({ remindAt: NOW + HOUR }, NOW), true);
  assert.equal(reminderNeedsJob({ remindAt: NOW - HOUR }, NOW), false);
  assert.equal(reminderNeedsJob({ remindAt: NOW + HOUR, completedAt: NOW }, NOW), false);
  assert.equal(reminderNeedsJob({ remindAt: NOW + HOUR, active: false }, NOW), false);
  assert.equal(reminderNeedsJob({}, NOW), false);
  const at = NOW + HOUR;
  assert.equal(reminderShouldFire(todo({ remindAt: at }), at), true);
  assert.equal(reminderShouldFire(todo({ remindAt: at + 1 }), at), false);
  assert.equal(reminderShouldFire(todo({ remindAt: at, completedAt: NOW }), at), false);
  assert.equal(reminderShouldFire(todo({ remindAt: at, active: false }), at), false);
  assert.equal(reminderShouldFire(null, at), false);
});

test('việc của tôi: chuông chỉ hiện nhắc đã đến giờ của việc còn mở', () => {
  assert.equal(todoReminderNotificationItem(todo({ remindAt: NOW })), null);
  const item = todoReminderNotificationItem(todo({ remindAt: NOW, remindedAt: NOW + 10, dueAt: NOW + 2 * HOUR }));
  assert.equal(item.kind, 'todo');
  assert.equal(item.sourceType, 'todo_reminder');
  assert.equal(item.key, `todo:todo_reminder:t1:${NOW}`);
  assert.equal(item.availableAt, NOW);
  assert.equal(item.description, 'Hạn chót 12:00 21/10/2026');
  assert.equal(todoReminderNotificationItem(todo({ remindAt: NOW + HOUR, remindedAt: NOW })), null);
  assert.equal(todoReminderNotificationItem(todo({ remindAt: NOW, remindedAt: NOW, completedAt: NOW })), null);
  assert.equal(todoReminderNotificationItem(todo({ remindAt: NOW, remindedAt: NOW, active: false })), null);
});

test('việc của tôi: danh sách mở theo hạn, việc xong gần nhất sau', () => {
  const rows = [
    todo({ _id: 'a', dueAt: NOW + 3 * HOUR }),
    todo({ _id: 'b' }),
    todo({ _id: 'c', dueAt: NOW + HOUR }),
    todo({ _id: 'd', completedAt: NOW - 2 * HOUR }),
    todo({ _id: 'e', completedAt: NOW - HOUR }),
    todo({ _id: 'f', active: false }),
  ];
  const { open, completed } = sortTodosForList(rows, 1);
  assert.deepEqual(open.map((row) => row._id), ['c', 'a', 'b']);
  assert.deepEqual(completed.map((row) => row._id), ['e']);
});

test('việc của tôi: biểu mẫu web theo giờ Việt Nam và báo lỗi tại ô', () => {
  const ms = todoLocalInputToMs('2026-10-21T10:00');
  assert.equal(ms, NOW);
  assert.equal(todoMsToLocalInput(NOW), '2026-10-21T10:00');
  assert.equal(formatTodoMoment(NOW), '10:00 21/10/2026');
  assert.equal(todoLocalInputToMs('bad'), null);
  const bad = validateTodoForm({ title: '', note: '', due: '', remind: '2026-10-21T09:00' }, NOW);
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.title, 'Vui lòng nhập tên việc.');
  assert.equal(bad.errors.remind, 'Giờ nhắc phải ở tương lai.');
  const good = validateTodoForm({ title: ' Họp ', note: '', due: '2026-10-22T08:00', remind: '2026-10-21T11:00' }, NOW);
  assert.equal(good.ok, true);
  assert.deepEqual(good.payload, { title: 'Họp', note: null, dueAt: NOW + 22 * HOUR, remindAt: NOW + HOUR });
  assert.equal(validateTodoForm({ title: 'a', remind: '2026-10-21T09:00' }, NOW, NOW - HOUR).ok, true);
  assert.equal(isTodoOverdue({ dueAt: NOW - 1 }, NOW), true);
  assert.equal(isTodoOverdue({ dueAt: NOW - 1, completedAt: NOW }, NOW), false);
});

test('việc của tôi: backend chỉ dùng người dùng hiện tại, không phụ thuộc menu Công việc', () => {
  const source = readFileSync(new URL('../convex/personalTodos.ts', import.meta.url), 'utf8');
  assert.match(source, /currentUserOrThrow/);
  assert.match(source, /USER_NOT_ACTIVE/);
  assert.match(source, /PASSWORD_CHANGE_REQUIRED/);
  assert.match(source, /canAccessTodo/);
  assert.doesNotMatch(source, /resolveUserMenuAccess|isOperationalManagerRole|workDocuments|officeDocuments/);
  assert.match(source, /scheduler\.runAt/);
  assert.match(source, /scheduler\.cancel/);
  assert.match(source, /internal\.pushActions\.sendToUsers/);
  const schema = readFileSync(new URL('../convex/schema.ts', import.meta.url), 'utf8');
  assert.match(schema, /personalTodos: defineTable/);
  assert.match(schema, /by_user_active_due/);
  const routes = readFileSync(new URL('../src/navigationRoutes.js', import.meta.url), 'utf8');
  assert.match(routes, /menuId === 'chat' \|\| menuId === 'work'/);
  const hub = readFileSync(new URL('../src/work/WorkHub.jsx', import.meta.url), 'utf8');
  assert.match(hub, /Việc của tôi/);
  assert.match(hub, /workHidden \? null/);
});

test('Việc của tôi: ô Hạn chót và Nhắc lúc thẳng hàng (trường xếp từ trên xuống)', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/work/personalTodos.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('.todo-field {'), css.indexOf('}', css.indexOf('.todo-field {')));
  assert.match(block, /align-content: start;/);
});
