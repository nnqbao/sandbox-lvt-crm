// Trao đổi (chat hub) + Thông báo. Fictional conversations only.
import { DEPARTMENTS, HOUR, T0, USERS, departmentById, userById } from './personas.js';

const MIN = 60 * 1000;
const initials = (name) => name.split(/\s+/).slice(-2).map((p) => p[0]).join('').toUpperCase();

/* ---------------------------------------------------------------- Thông báo */
function feed(_args, { persona, state }) {
  const items = [
    { key: 'n1', kind: 'duty', sourceType: 'duty', sourceId: 'd4', milestoneHours: 12, milestoneLabel: 'Còn 5 giờ', title: 'Họp Hội đồng sư phạm tháng 10', description: '14:00 · Hội trường', dueAt: Date.parse('2026-10-21T14:00:00+07:00'), read: false },
    { key: 'n2', kind: 'work', sourceType: 'work_assigned', sourceId: 'doc2', milestoneHours: 0, milestoneLabel: 'Mới phân công', title: 'Chuẩn bị đề kiểm tra giữa kỳ Toán 7', description: 'Văn thư Đỗ Thị G giao · hạn 28/10/2026', dueAt: Date.parse('2026-10-28T23:59:00+07:00'), read: false },
    { key: 'n3', kind: 'work', sourceType: 'completion_rejected', sourceId: 'wi3', milestoneHours: 0, milestoneLabel: 'Cần nộp lại', title: 'Báo cáo kết quả bồi dưỡng học sinh giỏi', description: 'Thiếu danh sách học sinh tham gia.', dueAt: Date.parse('2026-10-19T23:59:00+07:00'), read: false },
    { key: 'n4', kind: 'todo', sourceType: 'todo_reminder', sourceId: 'td1', milestoneHours: 0, milestoneLabel: 'Nhắc việc', title: 'Gọi phụ huynh Học sinh Mẫu 12', description: 'Hạn chót 16:00 hôm nay', dueAt: T0 + 7 * HOUR, read: true },
    { key: 'n5', kind: 'group', sourceType: 'group_chat', sourceId: 'grp_khoi7', milestoneHours: 0, milestoneLabel: 'Tin nhắn mới', title: 'GVCN khối 7', description: 'Trần Thị B: Mai 7g các lớp nộp danh sách…', dueAt: T0 - 20 * MIN, read: false },
    { key: 'n6', kind: 'duty', sourceType: 'duty', sourceId: 'd5', milestoneHours: 24, milestoneLabel: 'Còn 1 ngày', title: 'Tập huấn sử dụng CRM', description: '15:00 · Phòng máy tính', dueAt: Date.parse('2026-10-22T15:00:00+07:00'), read: true },
  ];
  // Video tb-thong-bao: state.notificationsRead = after “Đánh dấu tất cả là đã đọc”.
  if (state.notificationsRead) for (const row of items) row.read = true;
  const visible = persona.role === 'user' ? items : items.filter((row) => row.kind !== 'todo');
  return {
    items: visible,
    unreadCount: visible.filter((row) => !row.read).length,
    // Backend: canOperateMenu(notifications), i.e. also "view"; state.notificationsCanDelete shows the ×.
    canDelete: state.notificationsCanDelete ?? persona.role !== 'user',
    settings: { dutiesEnabled: true, workEnabled: true, milestonesHours: [24, 0], dutyMilestonesHours: [24, 12, 0], workMilestonesHours: [48, 24, 0] },
  };
}

/* ---------------------------------------------------------------- Trao đổi */
const CONVERSATIONS = [
  { kind: 'group', entityId: 'grp_khoi7', title: 'GVCN khối 7', lastBodyText: 'Trần Thị B: Mai 7g các lớp nộp danh sách tham gia Ngày hội đọc sách nhé.', lastMessageAt: T0 - 20 * MIN, unreadCount: 2 },
  { kind: 'work', entityId: 'doc1', title: 'Kế hoạch dạy học học kỳ I', lastBodyText: 'Lê Thị D: Tổ mình nộp trước thứ Sáu.', lastMessageAt: T0 - 2 * HOUR, unreadCount: 0 },
  { kind: 'duty', entityId: 'd4', title: 'Họp Hội đồng sư phạm tháng 10', lastBodyText: 'Đỗ Thị G: Đã đổi sang Hội trường.', lastMessageAt: T0 - 26 * HOUR, unreadCount: 0 },
  { kind: 'group', entityId: 'grp_toan', title: 'Tổ Toán – Tin', lastBodyText: 'Ngô Thị L: Em gửi đề cương ôn tập ạ.', lastMessageAt: T0 - 3 * 24 * HOUR, unreadCount: 0 },
].map((row) => ({ ...row, threadKey: `${row.kind}:${row.entityId}`, lastAuthorUserId: '', memberCount: null, viewerIsMember: true }));

function message(id, authorId, minutesAgo, text, personaId, extra = {}) {
  const author = userById(authorId);
  return {
    _id: id,
    authorUserId: authorId,
    authorName: author.name,
    authorInitials: initials(author.name),
    isSelf: authorId === personaId,
    canRecall: authorId === personaId,
    createdAt: T0 - minutesAgo * MIN,
    bodyHtml: `<p>${text}</p>`,
    bodyText: text,
    recalled: false,
    ...extra,
  };
}

// Video td-trao-doi: a group the teacher has just created (chatHub:createGroup returns it).
const NEW_GROUP = { id: 'grp_dugio', name: 'Dự giờ khối 7', ownerId: 'u_teacher', memberIds: ['u_teacher', 'u_leader', 'u_t5'] };
const SENT_TEXT = 'Lớp 7/2 có 8 em tham gia ạ.';

function groupMessages(args, { persona, state }) {
  const me = persona._id;
  if (args.groupId === NEW_GROUP.id) return { groupTitle: NEW_GROUP.name, hasMore: false, messages: [] };
  // Video td-trao-doi: state.chatSent shows the message just sent; state.chatRecalled shows it recalled.
  const sent = state.chatSent || state.chatRecalled
    ? [message('m6', me, 0.2, SENT_TEXT, me, state.chatRecalled ? { recalled: true, canRecall: false, bodyHtml: '', bodyText: '' } : {})]
    : [];
  return {
    groupTitle: 'GVCN khối 7',
    hasMore: false,
    messages: [
      message('m1', 'u_bgh', 22 * 60, 'Các thầy cô GVCN khối 7 lưu ý: thứ Bảy tổ chức Ngày hội đọc sách tại Thư viện.', me),
      message('m2', 'u_t7', 21 * 60, 'Dạ, lớp 7/1 đã đăng ký 10 em ạ.', me),
      message('m3', 'u_teacher', 50, 'Lớp 7/2 em gửi danh sách trong hôm nay nhé.', me),
      message('m4', 'u_gvcn', 20, 'Mai <b>7g</b> các lớp nộp danh sách tham gia Ngày hội đọc sách nhé.', me),
      message('m5', 'u_teacher', 5, 'Đã nhận ạ.', me),
      ...sent,
    ],
  };
}

function groupState(args, { persona }) {
  const fresh = args.groupId === NEW_GROUP.id;
  const memberIds = fresh ? NEW_GROUP.memberIds : ['u_gvcn', 'u_teacher', 'u_t7', 'u_bgh', 'u_leader'];
  const ownerId = fresh ? NEW_GROUP.ownerId : 'u_gvcn';
  return {
    groupId: args.groupId,
    name: fresh ? NEW_GROUP.name : 'GVCN khối 7',
    memberCount: memberIds.length,
    ownerUserId: ownerId,
    viewerIsMember: memberIds.includes(persona._id),
    viewerIsOwner: persona._id === ownerId,
    canManage: persona._id === ownerId,
    canDissolve: persona._id === ownerId || persona.role === 'admin',
    canLeave: memberIds.includes(persona._id),
    canSend: memberIds.includes(persona._id),
    members: memberIds.map((id) => ({ userId: id, name: userById(id).name, role: id === ownerId ? 'owner' : 'member', isSelf: id === persona._id })),
  };
}

export const queries = {
  'notifications:feed': feed,
  'chatHub:list': (_args, { persona, state }) => {
    // Video td-trao-doi (state-driven, default unchanged): new group on top, sent message preview, group left.
    let conversations = CONVERSATIONS;
    if (state.chatSent) {
      conversations = conversations.map((row) => (row.entityId === 'grp_khoi7' ? { ...row, lastBodyText: SENT_TEXT, lastAuthorUserId: persona._id, lastMessageAt: T0, unreadCount: 0 } : row));
    }
    if (state.newGroup) {
      conversations = [{ kind: 'group', entityId: NEW_GROUP.id, threadKey: `group:${NEW_GROUP.id}`, title: NEW_GROUP.name, lastBodyText: 'Nhóm vừa được tạo', lastMessageAt: T0, unreadCount: 0, lastAuthorUserId: '', memberCount: NEW_GROUP.memberIds.length, viewerIsMember: true }, ...conversations];
    }
    if (state.leftGroup) conversations = conversations.filter((row) => row.entityId !== 'grp_khoi7');
    return { backfillPending: false, currentUserId: persona._id, conversations };
  },
  'chatHub:groupState': groupState,
  // Backend leaves the viewer out of the directory; state.chatDirectoryNoSelf does too (video td-trao-doi).
  'chatHub:directory': (_args, { persona, state }) => ({
    people: USERS.filter((u) => u.status === 'active' && !(state.chatDirectoryNoSelf && u._id === persona._id)).map((u) => ({ userId: u._id, name: u.name, email: u.email, departmentName: departmentById(u.departmentId)?.name || '' })),
  }),
  'groupMessages:list': groupMessages,
  'workMessages:list': (_args, { persona }) => ({
    documentTitle: 'Kế hoạch dạy học học kỳ I',
    hasMore: false,
    messages: [
      message('w1', 'u_clerk', 300, 'Các tổ nộp kế hoạch theo mẫu đính kèm nhé.', persona._id),
      message('w2', 'u_leader', 120, 'Tổ mình nộp trước thứ Sáu.', persona._id),
    ],
  }),
  'dutyMessages:list': (_args, { persona }) => ({
    dutyTitle: 'Họp Hội đồng sư phạm tháng 10',
    hasMore: false,
    messages: [message('dm1', 'u_clerk', 26 * 60, 'Đã đổi sang Hội trường.', persona._id)],
  }),
};

export const mutations = {
  'chatHub:createGroup': () => ({ groupId: NEW_GROUP.id }),
};

export { DEPARTMENTS };
