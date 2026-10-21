// Công việc (admin/mod giao việc) + Việc của tôi + Báo cáo công việc. Fictional data only.
import { DAY, DEPARTMENTS, HOUR, POSITIONS, T0, USERS, departmentById, positionById, userById } from './personas.js';

const level = (user) => positionById(user.positionId)?.level || 0;
const isOps = (user) => user.role === 'admin' || user.role === 'moderator';

const DOC_TYPES = [
  { _id: 'dt_kh', name: 'Kế hoạch', code: 'KH', active: true },
  { _id: 'dt_bb', name: 'Biên bản', code: 'BB', active: true },
  { _id: 'dt_bc', name: 'Báo cáo', code: 'BC', active: true },
];

const person = (id, status) => {
  const u = userById(id);
  return { _id: u._id, name: u.name, email: u.email, status, departmentName: departmentById(u.departmentId)?.name || '', positionName: positionById(u.positionId)?.name || '' };
};

/** Work items assigned to the signed-in teacher (Nguyễn Văn A). */
function myTasks() {
  return [
    {
      _id: 'wi1', type: 'department', content: 'Nộp kế hoạch dạy học môn Toán học kỳ I', deadline: '2026-10-25',
      departmentId: 'dep_toan', departmentName: 'Tổ Toán – Tin', status: 'pending_task', collectiveStatus: 'in_progress',
      documentId: 'doc1', documentTitle: 'Kế hoạch dạy học học kỳ I', documentContent: '', fileName: 'ke-hoach-day-hoc-hk1.docx',
      fileUrl: null, privateFile: true, completion: null, qualityPercent: null, rejectionReason: '',
      members: [person('u_teacher', 'pending_task'), person('u_leader', 'pending_completion'), person('u_t5', 'completed')],
      pendingMembers: [person('u_teacher', 'pending_task'), person('u_leader', 'pending_completion')],
    },
    {
      _id: 'wi2', type: 'individual', content: 'Chuẩn bị đề kiểm tra giữa kỳ Toán 7', deadline: '2026-10-28',
      departmentName: 'Cá nhân', status: 'pending_task', collectiveStatus: 'in_progress', userNames: ['Nguyễn Văn A'],
      documentId: 'doc2', documentTitle: 'Đề kiểm tra giữa kỳ I', documentContent: '', fileName: '',
      fileUrl: null, privateFile: false, completion: null, qualityPercent: null, rejectionReason: '', members: [], pendingMembers: [],
    },
    {
      _id: 'wi3', type: 'individual', content: 'Báo cáo kết quả bồi dưỡng học sinh giỏi', deadline: '2026-10-19',
      departmentName: 'Cá nhân', status: 'rejected_completion', collectiveStatus: 'in_progress', userNames: ['Nguyễn Văn A'],
      documentId: 'doc3', documentTitle: 'Báo cáo bồi dưỡng HSG', documentContent: '', fileName: 'mau-bao-cao-hsg.xlsx',
      fileUrl: null, privateFile: true,
      completion: { status: 'rejected', note: 'Gửi báo cáo tháng 9', rejectionReason: 'Thiếu danh sách học sinh tham gia. Bổ sung rồi nộp lại giúp tổ.' },
      qualityPercent: null, rejectionReason: 'Thiếu danh sách học sinh tham gia. Bổ sung rồi nộp lại giúp tổ.', members: [], pendingMembers: [],
    },
    {
      _id: 'wi4', type: 'department', content: 'Cập nhật sổ điểm điện tử tháng 9', deadline: '2026-10-10',
      departmentId: 'dep_toan', departmentName: 'Tổ Toán – Tin', status: 'pending_completion', collectiveStatus: 'in_progress',
      documentId: 'doc4', documentTitle: 'Sổ điểm tháng 9', documentContent: '', fileName: '', fileUrl: null, privateFile: false,
      completion: { status: 'pending_approval', note: 'Đã cập nhật đủ 4 lớp' }, qualityPercent: null, rejectionReason: '', members: [], pendingMembers: [],
    },
    {
      _id: 'wi5', type: 'individual', content: 'Nộp giáo án chủ đề Phân số', deadline: '2026-10-05',
      departmentName: 'Cá nhân', status: 'completed', collectiveStatus: 'completed', userNames: ['Nguyễn Văn A'],
      documentId: 'doc5', documentTitle: 'Giáo án chủ đề', documentContent: '', fileName: '', fileUrl: null, privateFile: false,
      completion: { status: 'approved', note: '' }, qualityPercent: 95, rejectionReason: '', members: [], pendingMembers: [],
    },
  ];
}

const PENDING_REVIEWS = [
  { kind: 'work_item', workItemId: 'wi1', taskId: null, userId: 'u_leader', userName: 'Lê Thị D', content: 'Nộp kế hoạch dạy học môn Toán học kỳ I', deadline: '2026-10-25', submittedAt: T0 - 3 * HOUR, submittedLate: false, note: 'Gửi kế hoạch đã họp tổ thống nhất.', type: 'department', departmentName: 'Tổ Toán – Tin' },
  { kind: 'work_item', workItemId: 'wi6', taskId: null, userId: 'u_t7', userName: 'Lý Thị N', content: 'Tổng hợp danh sách học sinh tham gia CLB tiếng Anh', deadline: '2026-10-18', submittedAt: T0 - 26 * HOUR, submittedLate: true, note: '', type: 'department', departmentName: 'Tổ Tiếng Anh' },
];

function adminDocuments() {
  return [
    {
      _id: 'doc1', title: 'Kế hoạch dạy học học kỳ I', fileName: 'ke-hoach-day-hoc-hk1.docx', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileSize: 48230,
      fileUrl: null, privateFile: true, documentTypeName: 'Kế hoạch', content: 'Nộp kế hoạch dạy học môn học kỳ I', deadline: '2026-10-25', status: 'approved', workStatus: 'in_progress',
      departmentId: 'dep_toan', departmentName: 'Tổ Toán – Tin', assignmentCount: 2, approvalCount: 0, approvalTotal: 0, createdAt: T0 - 4 * DAY, createdBy: 'u_clerk',
      archived: false, canEdit: false, canDelete: false, taskCount: 6,
      assignments: [
        { _id: 'wi1', type: 'department', departmentId: 'dep_toan', departmentName: 'Tổ Toán – Tin', content: 'Nộp kế hoạch dạy học môn Toán học kỳ I', deadline: '2026-10-25', status: 'in_progress', taskCount: 3, taskCompletedCount: 1,
          members: [{ ...person('u_teacher', 'pending_task'), qualityPercent: null, rejectionReason: '' }, { ...person('u_leader', 'pending_completion'), qualityPercent: null, rejectionReason: '' }, { ...person('u_t5', 'completed'), qualityPercent: 90, rejectionReason: '' }] },
        { _id: 'wi7', type: 'department', departmentId: 'dep_van', departmentName: 'Tổ Ngữ văn', content: 'Nộp kế hoạch dạy học môn Ngữ văn học kỳ I', deadline: '2026-10-25', status: 'in_progress', taskCount: 3, taskCompletedCount: 0,
          members: [{ ...person('u_gvcn', 'pending_task'), qualityPercent: null, rejectionReason: '' }, { ...person('u_t6', 'pending_task'), qualityPercent: null, rejectionReason: '' }] },
      ],
    },
    {
      _id: 'doc8', title: 'Chuẩn bị Hội thi giáo viên dạy giỏi cấp trường', fileName: '', fileType: '', fileSize: 0, fileUrl: null, privateFile: false,
      content: 'Đăng ký tiết thi', deadline: '2026-11-02', status: 'approved', workStatus: 'pending_task', departmentId: 'dep_anh', departmentName: 'Tổ Tiếng Anh',
      assignmentCount: 1, approvalCount: 0, approvalTotal: 0, createdAt: T0 - 1 * DAY, createdBy: 'u_clerk', archived: false, canEdit: true, canDelete: true, taskCount: 2,
      assignments: [
        { _id: 'wi8', type: 'department', departmentId: 'dep_anh', departmentName: 'Tổ Tiếng Anh', content: 'Đăng ký tiết thi giáo viên dạy giỏi', deadline: '2026-11-02', status: 'in_progress', taskCount: 2, taskCompletedCount: 0,
          members: [{ ...person('u_t7', 'pending_task'), qualityPercent: null, rejectionReason: '' }, { ...person('u_t8', 'pending_task'), qualityPercent: null, rejectionReason: '' }] },
      ],
    },
    {
      _id: 'doc9', title: 'Báo cáo sơ kết tháng 9', fileName: 'bao-cao-thang-9.pdf', fileType: 'application/pdf', fileSize: 210400, fileUrl: null, privateFile: true, documentTypeName: 'Báo cáo',
      content: 'Báo cáo sơ kết', deadline: '2026-10-05', status: 'approved', workStatus: 'completed', departmentId: '', departmentName: 'Cá nhân',
      assignmentCount: 1, approvalCount: 0, approvalTotal: 0, createdAt: T0 - 25 * DAY, createdBy: 'u_clerk', archived: false, canEdit: false, canDelete: false, taskCount: 2,
      assignments: [
        { _id: 'wi9', type: 'individual', departmentName: 'Cá nhân', userNames: ['Lê Thị D', 'Đặng Văn M'], content: 'Gửi báo cáo sơ kết tháng 9 của tổ', deadline: '2026-10-05', status: 'completed', taskCount: 2, taskCompletedCount: 2,
          members: [{ ...person('u_leader', 'completed'), qualityPercent: 100, rejectionReason: '' }, { ...person('u_t6', 'completed'), qualityPercent: 90, rejectionReason: '' }] },
      ],
    },
  ];
}

function listMine(_args, { persona }) {
  const ops = isOps(persona);
  const lv = level(persona);
  const canCreate = ops || lv === 2 || lv === 3;
  return {
    userId: persona._id,
    level: lv,
    isAdmin: ops,
    canCreate,
    assignerMode: 'admin_mod',
    assignableUsers: [],
    approvals: [],
    departmentWorks: [],
    personalTasks: [],
    myTasks: ops ? [] : myTasks(),
    documentTypes: DOC_TYPES,
    // Reviews go to the person who created the work (Văn thư in these examples).
    pendingCompletionReviews: ops ? PENDING_REVIEWS : [],
  };
}

function formOptions(_args, { persona }) {
  const ops = isOps(persona);
  const users = USERS.filter((u) => u.role === 'user' && (ops || (u.departmentId === persona.departmentId && level(u) < level(persona))));
  return {
    canCreate: true,
    isOps: ops,
    assignerMode: 'admin_mod',
    departments: ops ? DEPARTMENTS.map((d) => ({ _id: d._id, name: d.name, code: d.code })) : [],
    users: users.map((u) => ({
      _id: u._id, name: u.name, email: u.email, role: u.role, departmentId: u.departmentId,
      departmentName: departmentById(u.departmentId)?.name || '', positionName: positionById(u.positionId)?.name || '', level: level(u),
    })),
    documentTypes: DOC_TYPES,
    approvers: [],
  };
}

/* ---------------------------------------------------------- Việc của tôi (to-do) */
const todo = (id, title, note, dueOffsetH, remindOffsetH, doneOffsetH = null) => ({
  _id: id,
  title,
  note,
  dueAt: dueOffsetH == null ? null : T0 + dueOffsetH * HOUR,
  remindAt: remindOffsetH == null ? null : T0 + remindOffsetH * HOUR,
  completedAt: doneOffsetH == null ? null : T0 + doneOffsetH * HOUR,
  createdAt: T0 - 3 * DAY,
  updatedAt: T0 - DAY,
});

const TODOS = {
  open: [
    todo('td1', 'Gọi phụ huynh Học sinh Mẫu 12', 'Hỏi lý do nghỉ học sáng nay', 7, 6),
    todo('td2', 'In phiếu học tập Toán 7 cho tiết 3', '', 24, 23),
    todo('td3', 'Nhập điểm kiểm tra 15 phút lớp 7/2', '', -20, null),
    todo('td4', 'Mượn máy chiếu phòng thiết bị', 'Dùng cho tiết thao giảng thứ Năm', null, null),
  ],
  completed: [todo('td5', 'Gửi danh sách đội tuyển Toán cho tổ trưởng', '', -30, -32, -26)],
};

/* ---------------------------------------------------------- Báo cáo công việc */
function workCalendar(args, { persona }) {
  const canViewAll = isOps(persona) || level(persona) >= 4;
  const visible = canViewAll ? USERS.filter((u) => u.role === 'user') : USERS.filter((u) => u.departmentId === persona.departmentId);
  const selected = userById(args.userId) || persona;
  const ev = (id, title, deadline, status, qualityPercent = null, kind = 'Cá nhân') => ({
    _id: id, content: title, deadline, startDate: deadline, endDate: deadline, status, qualityPercent,
    kindLabel: kind, documentName: title, departmentName: departmentById(selected.departmentId)?.name || '',
  });
  return {
    people: visible.map((u) => ({
      _id: u._id, name: u.name, email: u.email, isSelf: u._id === persona._id,
      departmentName: departmentById(u.departmentId)?.name || '', positionName: positionById(u.positionId)?.name || '', positionLevel: level(u),
    })).sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || b.positionLevel - a.positionLevel || a.name.localeCompare(b.name, 'vi')),
    visibilityScope: canViewAll ? 'all' : 'team',
    assignerMode: 'admin_mod',
    selectedUserId: selected._id,
    selectedUserName: selected.name,
    kpi: { total: 6, onTime: 2, late: 1, incomplete: 1 },
    events: [
      ev('r1', 'Nộp giáo án chủ đề Phân số', '2026-10-05', 'completed', 95),
      ev('r2', 'Cập nhật sổ điểm điện tử tháng 9', '2026-10-10', 'completed_late', 80, 'Phòng ban'),
      ev('r6', 'Dự giờ đồng nghiệp tháng 10', '2026-10-14', 'completed', 100),
      ev('r3', 'Báo cáo kết quả bồi dưỡng học sinh giỏi', '2026-10-19', 'overdue'),
      ev('r4', 'Nộp kế hoạch dạy học môn Toán học kỳ I', '2026-10-25', 'in_progress', null, 'Phòng ban'),
      ev('r5', 'Chuẩn bị đề kiểm tra giữa kỳ Toán 7', '2026-10-28', 'in_progress'),
    ],
  };
}

export const queries = {
  'work:listMine': listMine,
  'work:listAdmin': () => ({
    assignerMode: 'admin_mod', visibilityMode: 'school', canCreate: true, isOps: true,
    documents: adminDocuments(), documentTypes: DOC_TYPES, pendingCompletionReviews: PENDING_REVIEWS,
  }),
  'work:formOptions': formOptions,
  'personalTodos:listMine': () => TODOS,
  'reports:workCalendar': workCalendar,
};

export const mutations = {
  'documentTypes:ensureDefaults': null,
};

export { DOC_TYPES, POSITIONS };
