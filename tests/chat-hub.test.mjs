import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CHAT_GROUP_MEMBER_LIMIT,
  chatPreviewText,
  isLatestChatPreview,
  nextOwnerMember,
  normalizeMemberIds,
  parseThreadKey,
  recallUnreadDelta,
  threadKeyFor,
  validateGroupName,
} from '../convex/chatHubPolicy.ts';
import { chatDayLabel, formatChatListTime } from '../src/chat/chatTime.js';
import { parseThreadKey as parseClientThreadKey, threadKeyFor as clientThreadKey } from '../src/chat/threadKey.js';
import { chatPathname, isPrimaryMenuVisible, parseChatPath, pathnameForMenu, routeForPathname } from '../src/navigationRoutes.js';
import { menuForNotification } from '../src/notifications/useNotificationFocus.js';

const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const schemaSource = readFileSync(new URL('../convex/schema.ts', import.meta.url), 'utf8');
const workSource = readFileSync(new URL('../convex/workMessages.ts', import.meta.url), 'utf8');
const dutySource = readFileSync(new URL('../convex/dutyMessages.ts', import.meta.url), 'utf8');

test('thread keys stay aligned between server and web', () => {
  assert.equal(threadKeyFor('work', 'doc1'), 'work:doc1');
  assert.equal(clientThreadKey('group', 'g1'), 'group:g1');
  assert.deepEqual(parseThreadKey('duty:abc'), { kind: 'duty', entityId: 'abc' });
  assert.deepEqual(parseClientThreadKey('group:abc'), { kind: 'group', entityId: 'abc' });
  assert.equal(parseThreadKey('nope'), null);
  assert.equal(chatPreviewText('a'.repeat(130)).endsWith('…'), true);
});

test('group name and member rules', () => {
  assert.equal(validateGroupName('  Tổ   văn  ').name, 'Tổ văn');
  assert.equal(validateGroupName('   ').code, 'GROUP_NAME_REQUIRED');
  assert.equal(validateGroupName('x'.repeat(81)).code, 'GROUP_NAME_TOO_LONG');
  assert.deepEqual(normalizeMemberIds(['a', 'a', 'me', ''], 'me'), ['a']);
  assert.equal(CHAT_GROUP_MEMBER_LIMIT, 100);
  const next = nextOwnerMember([
    { userId: 'owner', joinedAt: 1 },
    { userId: 'late', joinedAt: 5 },
    { userId: 'early', joinedAt: 2 },
  ], 'owner');
  assert.equal(next.userId, 'early');
});

test('recall only drops an unread badge for a message the viewer has not read', () => {
  assert.equal(recallUnreadDelta({ unreadCount: 2, lastReadAt: 0, messageCreatedAt: 50 }), -1);
  assert.equal(recallUnreadDelta({ unreadCount: 0, lastReadAt: 0, messageCreatedAt: 50 }), 0);
  assert.equal(recallUnreadDelta({ unreadCount: 1, lastReadAt: 80, messageCreatedAt: 50 }), 0);
  assert.equal(isLatestChatPreview({
    lastMessageAt: 50,
    lastAuthorUserId: 'a',
    messageCreatedAt: 50,
    authorUserId: 'a',
  }), true);
});

test('list times use the Vietnam calendar', () => {
  const now = Date.parse('2026-09-29T08:00:00+07:00');
  const fiveMinutesAgo = now - 5 * 60 * 1000;
  const yesterday = Date.parse('2026-09-28T21:00:00+07:00');
  assert.equal(formatChatListTime(fiveMinutesAgo, now), '5 phút');
  assert.equal(formatChatListTime(now - 10 * 1000, now), 'Vừa xong');
  assert.equal(chatDayLabel(now - 60 * 1000, now), 'Hôm nay');
  assert.equal(chatDayLabel(yesterday, now), 'Hôm qua');
  assert.equal(formatChatListTime(yesterday, now), 'Hôm qua');
});

test('Trao đổi menu sits above Công tác and Công việc and is always available', () => {
  const routesSource = readFileSync(new URL('../src/navigationRoutes.js', import.meta.url), 'utf8');
  const block = routesSource.slice(routesSource.indexOf('const PRIMARY_MENUS'), routesSource.indexOf('const SUPREME_SETTINGS'));
  const chat = block.indexOf("['chat', 'Trao đổi']");
  const duties = block.indexOf("['duties', 'Lịch công tác']");
  const work = block.indexOf("['work', 'Công việc']");
  assert.ok(chat >= 0 && chat < duties && chat < work);
  assert.match(routesSource, /menuId === 'chat'/);
  assert.equal(isPrimaryMenuVisible('chat', { menuAccess: {} }), true);
  assert.equal(pathnameForMenu('chat'), '/trao-doi');
  assert.equal(menuForNotification({ kind: 'work', sourceType: 'work_chat' }), 'chat');
  assert.equal(menuForNotification({ kind: 'duty', sourceType: 'duty' }), 'duties');
});

test('chat routes open the hub thread without colliding with công tác paths', () => {
  assert.equal(chatPathname({ kind: 'work', entityId: 'doc 1' }), '/trao-doi/cong-viec/doc%201');
  assert.deepEqual(parseChatPath('/trao-doi/nhom/g1'), {
    kind: 'group',
    entityId: 'g1',
    chatPath: '/trao-doi/nhom/g1',
  });
  assert.equal(routeForPathname('/trao-doi/cong-tac/duty1').menu, 'chat');
  assert.equal(routeForPathname('/cong-tac').menu, 'duties');
  assert.equal(routeForPathname('/trao-doi/khac'), null);
});

test('hub list is indexed per user and existing chats publish inbox rows', () => {
  assert.match(schemaSource, /chatInbox: defineTable/);
  assert.match(schemaSource, /by_user_active_activity/);
  assert.match(schemaSource, /by_thread_key/);
  assert.match(schemaSource, /chatCounters: defineTable/);
  assert.match(schemaSource, /groupMessages: defineTable/);
  assert.match(schemaSource, /by_group_created/);
  assert.match(schemaSource, /v\.literal\("group_chat"\)/);
  assert.match(workSource, /publishChatMessage/);
  assert.match(workSource, /applyChatRecall/);
  assert.match(dutySource, /publishChatMessage/);
  assert.match(dutySource, /listDutyChatRecipientIds/);
});

test('chat hub dialogs define work color tokens so primary buttons are not blank white', () => {
  const css = readFileSync(new URL('../src/chat/chatHub.css', import.meta.url), 'utf8');
  assert.match(css, /\.chat-hub,\s*\.chat-dialog-backdrop\s*\{[^}]*--work-navy:\s*var\(--lvt-navy/);
  assert.match(css, /\.chat-dialog \.work-primary-button\s*\{[^}]*color:\s*#fff;[^}]*background:\s*var\(--lvt-navy/);
  assert.match(css, /\.chat-dialog \.work-primary-button:disabled\s*\{[^}]*color:\s*#fff;[^}]*background:\s*#[0-9a-f]{6}/);
});
