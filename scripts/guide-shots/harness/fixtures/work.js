// Công việc + Việc của tôi + Báo cáo công việc. Fictional data only.
// Approval rule mirrored here (convex/workDocumentPolicy.ts): work created by Văn thư
// (admin/mod) waits for Ban giám hiệu approval; work created by BGH or a tổ trưởng is
// released immediately.
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

/**
 * Work items assigned to the signed-in teacher (Nguyễn Văn A).
 * Videos: state.workSubmitted shows wi1 after "Nộp" (waiting for the creator's review).
 */
function myTasks(state = {}) {
  const rows = [
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
  if (state.workSubmitted) {
    const wi1 = rows[0];
    wi1.status = 'pending_completion';
    wi1.completion = { status: 'pending_approval', note: state.workSubmitted === true ? 'Gửi kế hoạch dạy học đã họp tổ thống nhất.' : String(state.workSubmitted) };
    wi1.members = [person('u_teacher', 'pending_completion'), person('u_leader', 'pending_completion'), person('u_t5', 'completed')];
    wi1.pendingMembers = [person('u_teacher', 'pending_completion'), person('u_leader', 'pending_completion')];
  }
  return rows;
}

const PENDING_REVIEWS = [
  { kind: 'work_item', workItemId: 'wi1', taskId: null, userId: 'u_leader', userName: 'Lê Thị D', content: 'Nộp kế hoạch dạy học môn Toán học kỳ I', deadline: '2026-10-25', submittedAt: T0 - 3 * HOUR, submittedLate: false, note: 'Gửi kế hoạch đã họp tổ thống nhất.', type: 'department', departmentName: 'Tổ Toán – Tin' },
  { kind: 'work_item', workItemId: 'wi6', taskId: null, userId: 'u_t7', userName: 'Lý Thị N', content: 'Tổng hợp danh sách học sinh tham gia CLB tiếng Anh', deadline: '2026-10-18', submittedAt: T0 - 26 * HOUR, submittedLate: true, note: '', type: 'department', departmentName: 'Tổ Tiếng Anh' },
];

/* ---------------------------------------------------------- Ban giám hiệu duyệt */
const APPROVER_IDS = ['u_bgh', 'u_pht'];

/** One approver row as documentView() returns it. decision: 'approved' | 'rejected' | null. */
const approverRow = (id, decision = null, hoursAgo = 0, reason = '') => {
  const u = userById(id);
  return {
    _id: u._id, name: u.name, email: u.email, level: level(u),
    approved: decision === 'approved', rejected: decision === 'rejected',
    decidedAt: decision ? T0 - hoursAgo * HOUR : null, reason,
  };
};

const member = (id, status, qualityPercent = null) => ({ ...person(id, status), qualityPercent, rejectionReason: '' });

/** Approval fields of a document (released, waiting or returned). */
function approvalFields(approvers, { status, submittedHoursAgo, returnReason = '' }) {
  const approvalCount = approvers.filter((row) => row.approved).length;
  const decided = approvers.filter((row) => row.decidedAt).map((row) => row.decidedAt);
  return {
    status,
    requiresApproval: true,
    approvers,
    approvalCount,
    approvalTotal: approvers.length,
    approvalLocked: approvalCount > 0,
    submittedAt: T0 - submittedHoursAgo * HOUR,
    decidedAt: status === 'pending' || !decided.length ? null : Math.max(...decided),
    returnReason,
    creatorName: 'Đỗ Thị G',
    creatorRole: 'moderator',
  };
}

const RETURN_REASON = 'Đổi hạn nộp sang 06/11 để các tổ kịp chuẩn bị và bổ sung Tổ Văn phòng vào phân công.';

/** Documents created by Văn thư Đỗ Thị G. */
function clerkDocuments() {
  return [
    {
      // Released: both approvers approved → locked, assignees working.
      _id: 'doc1', title: 'Kế hoạch dạy học học kỳ I', fileName: 'ke-hoach-day-hoc-hk1.docx', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileSize: 48230,
      fileUrl: null, privateFile: true, documentTypeId: 'dt_kh', documentTypeName: 'Kế hoạch', content: 'Nộp kế hoạch dạy học môn học kỳ I', deadline: '2026-10-25', workStatus: 'in_progress',
      departmentId: 'dep_toan', departmentName: 'Tổ Toán – Tin', assignmentCount: 2, createdAt: T0 - 5 * DAY, createdBy: 'u_clerk',
      ...approvalFields([approverRow('u_bgh', 'approved', 100), approverRow('u_pht', 'approved', 98)], { status: 'approved', submittedHoursAgo: 120 }),
      // Members already submitted / completed → read-only for everyone.
      archived: false, canEdit: false, canDelete: false, hasSubmissions: true, taskCount: 6,
      assignments: [
        { _id: 'wi1', type: 'department', departmentId: 'dep_toan', departmentName: 'Tổ Toán – Tin', content: 'Nộp kế hoạch dạy học môn Toán học kỳ I', deadline: '2026-10-25', status: 'in_progress', taskCount: 3, taskCompletedCount: 1,
          members: [member('u_teacher', 'pending_task'), member('u_leader', 'pending_completion'), member('u_t5', 'completed', 90)] },
        { _id: 'wi7', type: 'department', departmentId: 'dep_van', departmentName: 'Tổ Ngữ văn', content: 'Nộp kế hoạch dạy học môn Ngữ văn học kỳ I', deadline: '2026-10-25', status: 'in_progress', taskCount: 3, taskCompletedCount: 0,
          members: [member('u_gvcn', 'pending_task'), member('u_t6', 'pending_task')] },
      ],
    },
    {
      // Returned by the Hiệu trưởng before anyone approved → editable, waiting for resubmission.
      _id: 'doc10', title: 'Kế hoạch tổ chức Ngày hội đọc sách', fileName: 'ke-hoach-ngay-hoi-doc-sach.pdf', fileType: 'application/pdf', fileSize: 96400,
      fileUrl: null, privateFile: true, documentTypeId: 'dt_kh', documentTypeName: 'Kế hoạch', content: 'Chuẩn bị gian sách của tổ', deadline: '2026-10-30', workStatus: 'approval_returned',
      departmentId: 'dep_van', departmentName: 'Tổ Ngữ văn', assignmentCount: 2, createdAt: T0 - 2 * DAY, createdBy: 'u_clerk',
      ...approvalFields([approverRow('u_bgh', 'rejected', 3, RETURN_REASON), approverRow('u_pht')], { status: 'rejected', submittedHoursAgo: 26, returnReason: RETURN_REASON }),
      archived: false, canEdit: true, canDelete: true, taskCount: 4,
      assignments: [
        { _id: 'wi10', type: 'department', departmentId: 'dep_van', departmentName: 'Tổ Ngữ văn', content: 'Chuẩn bị gian sách và tiết mục giới thiệu sách của tổ', deadline: '2026-10-30', status: 'in_progress', taskCount: 2, taskCompletedCount: 0,
          members: [member('u_gvcn', 'pending_task'), member('u_t6', 'pending_task')] },
        { _id: 'wi11', type: 'department', departmentId: 'dep_anh', departmentName: 'Tổ Tiếng Anh', content: 'Chuẩn bị góc sách tiếng Anh', deadline: '2026-10-30', status: 'in_progress', taskCount: 2, taskCompletedCount: 0,
          members: [member('u_t7', 'pending_task'), member('u_t8', 'pending_task')] },
      ],
    },
    {
      // Released with a single approver.
      _id: 'doc8', title: 'Chuẩn bị Hội thi giáo viên dạy giỏi cấp trường', fileName: '', fileType: '', fileSize: 0, fileUrl: null, privateFile: false,
      content: 'Đăng ký tiết thi', deadline: '2026-11-02', workStatus: 'pending_task', departmentId: 'dep_anh', departmentName: 'Tổ Tiếng Anh',
      assignmentCount: 1, createdAt: T0 - 1 * DAY, createdBy: 'u_clerk',
      ...approvalFields([approverRow('u_pht', 'approved', 20)], { status: 'approved', submittedHoursAgo: 24 }),
      archived: false, canEdit: false, canDelete: false, taskCount: 2,
      assignments: [
        { _id: 'wi8', type: 'department', departmentId: 'dep_anh', departmentName: 'Tổ Tiếng Anh', content: 'Đăng ký tiết thi giáo viên dạy giỏi', deadline: '2026-11-02', status: 'in_progress', taskCount: 2, taskCompletedCount: 0,
          members: [member('u_t7', 'pending_task'), member('u_t8', 'pending_task')] },
      ],
    },
    {
      // Waiting: Phó Hiệu trưởng approved, Hiệu trưởng not yet → already locked, still hidden from assignees.
      _id: 'doc11', title: 'Kế hoạch ôn tập kiểm tra giữa kỳ I', fileName: 'de-cuong-on-tap-gk1.docx', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileSize: 35100,
      fileUrl: null, privateFile: true, documentTypeId: 'dt_kh', documentTypeName: 'Kế hoạch', content: 'Nộp đề cương ôn tập', deadline: '2026-10-30', workStatus: 'awaiting_approval',
      departmentId: 'dep_toan', departmentName: 'Tổ Toán – Tin', assignmentCount: 2, createdAt: T0 - 5 * HOUR, createdBy: 'u_clerk',
      ...approvalFields([approverRow('u_bgh'), approverRow('u_pht', 'approved', 1)], { status: 'pending', submittedHoursAgo: 5 }),
      archived: false, canEdit: false, canDelete: false, taskCount: 0,
      assignments: [
        { _id: 'wi12', type: 'department', departmentId: 'dep_toan', departmentName: 'Tổ Toán – Tin', content: 'Nộp đề cương ôn tập môn Toán các khối', deadline: '2026-10-30', status: 'unassigned', taskCount: 3, taskCompletedCount: 0, members: [] },
        { _id: 'wi13', type: 'department', departmentId: 'dep_van', departmentName: 'Tổ Ngữ văn', content: 'Nộp đề cương ôn tập môn Ngữ văn các khối', deadline: '2026-10-30', status: 'unassigned', taskCount: 3, taskCompletedCount: 0, members: [] },
      ],
    },
    {
      // Waiting: nobody decided yet → creator can still edit or delete.
      _id: 'doc12', title: 'Kiểm tra hồ sơ chuyên môn tháng 11', fileName: '', fileType: '', fileSize: 0, fileUrl: null, privateFile: false,
      content: 'Chuẩn bị hồ sơ', deadline: '2026-11-06', workStatus: 'awaiting_approval', departmentId: '', departmentName: 'Cá nhân',
      assignmentCount: 1, createdAt: T0 - 2 * HOUR, createdBy: 'u_clerk',
      ...approvalFields([approverRow('u_bgh'), approverRow('u_pht')], { status: 'pending', submittedHoursAgo: 2 }),
      archived: false, canEdit: true, canDelete: true, taskCount: 0,
      assignments: [
        { _id: 'wi14', type: 'individual', departmentName: 'Cá nhân', userNames: ['Nguyễn Văn A', 'Ngô Thị L'], content: 'Hoàn thiện sổ ghi đầu bài và kế hoạch bài dạy tháng 11', deadline: '2026-11-06', status: 'unassigned', taskCount: 2, taskCompletedCount: 0, members: [] },
      ],
    },
    {
      _id: 'doc9', title: 'Báo cáo sơ kết tháng 9', fileName: 'bao-cao-thang-9.pdf', fileType: 'application/pdf', fileSize: 210400, fileUrl: null, privateFile: true, documentTypeId: 'dt_bc', documentTypeName: 'Báo cáo',
      content: 'Báo cáo sơ kết', deadline: '2026-10-05', workStatus: 'completed', departmentId: '', departmentName: 'Cá nhân',
      assignmentCount: 1, createdAt: T0 - 25 * DAY, createdBy: 'u_clerk',
      ...approvalFields([approverRow('u_bgh', 'approved', 24 * 24)], { status: 'approved', submittedHoursAgo: 25 * 24 }),
      archived: false, canEdit: false, canDelete: false, hasSubmissions: true, taskCount: 2,
      assignments: [
        { _id: 'wi9', type: 'individual', departmentName: 'Cá nhân', userNames: ['Lê Thị D', 'Đặng Văn M'], content: 'Gửi báo cáo sơ kết tháng 9 của tổ', deadline: '2026-10-05', status: 'completed', taskCount: 2, taskCompletedCount: 2,
          members: [member('u_leader', 'completed', 100), member('u_t6', 'completed', 90)] },
      ],
    },
  ];
}

/** Released immediately (no approvers): created by Ban giám hiệu or a tổ trưởng. */
function directDocument(id, title, createdBy, assignments, createdHoursAgo) {
  return {
    _id: id, title, fileName: '', fileType: '', fileSize: 0, fileUrl: null, privateFile: false, content: assignments[0].content,
    deadline: assignments[0].deadline, status: 'approved', workStatus: 'pending_task', departmentId: assignments[0].departmentId || '',
    departmentName: assignments[0].departmentName, assignmentCount: assignments.length, createdAt: T0 - createdHoursAgo * HOUR, createdBy,
    requiresApproval: false, approvers: [], approvalCount: 0, approvalTotal: 0, approvalLocked: false, submittedAt: T0 - createdHoursAgo * HOUR,
    decidedAt: null, returnReason: '', creatorName: userById(createdBy).name, creatorRole: ['admin', 'moderator'].includes(userById(createdBy).role) ? userById(createdBy).role : 'user', archived: false, canEdit: true, canDelete: true,
    taskCount: assignments.reduce((n, row) => n + row.taskCount, 0), assignments,
  };
}

function adminDocuments(persona) {
  if (persona._id === 'u_bgh') {
    return [
      directDocument('doc20', 'Dự giờ thao giảng chuyên đề đổi mới phương pháp', 'u_bgh', [
        { _id: 'wi20', type: 'department', departmentId: 'dep_toan', departmentName: 'Tổ Toán – Tin', content: 'Đăng ký tiết thao giảng chuyên đề', deadline: '2026-11-04', status: 'in_progress', taskCount: 3, taskCompletedCount: 0,
          members: [member('u_teacher', 'pending_task'), member('u_leader', 'pending_task'), member('u_t5', 'pending_task')] },
        { _id: 'wi21', type: 'individual', departmentName: 'Cá nhân', userNames: ['Lý Thị N'], content: 'Chuẩn bị tiết thao giảng tiếng Anh', deadline: '2026-11-04', status: 'in_progress', taskCount: 1, taskCompletedCount: 0,
          members: [member('u_t7', 'pending_task')] },
      ], 20),
    ];
  }
  if (persona._id === 'u_leader') {
    return [
      directDocument('doc21', 'Ra đề kiểm tra giữa kỳ I khối 7', 'u_leader', [
        { _id: 'wi22', type: 'individual', departmentName: 'Cá nhân', userNames: ['Nguyễn Văn A', 'Ngô Thị L'], content: 'Ra đề và đáp án kiểm tra giữa kỳ Toán 7', deadline: '2026-10-28', status: 'in_progress', taskCount: 2, taskCompletedCount: 0,
          members: [member('u_teacher', 'pending_task'), member('u_t5', 'pending_task')] },
      ], 30),
    ];
  }
  return clerkDocuments();
}

/** "Chờ tôi duyệt" for a Ban giám hiệu member: waiting first, then the 30-day history. */
function approvalsFor(persona) {
  if (!APPROVER_IDS.includes(persona._id)) return [];
  const decision = (document) => {
    const mine = document.approvers.find((row) => row._id === persona._id);
    const awaitingMyDecision = document.status === 'pending' && Boolean(mine) && !mine.approved && !mine.rejected;
    return { ...document, canEdit: false, canDelete: false, awaitingMyDecision, canReject: awaitingMyDecision && document.approvalCount === 0 };
  };
  return clerkDocuments()
    .filter((document) => document.approvers.some((row) => row._id === persona._id) && document.workStatus !== 'completed')
    .map(decision)
    .sort((a, b) => Number(b.awaitingMyDecision) - Number(a.awaitingMyDecision) || b.submittedAt - a.submittedAt);
}

function listMine(_args, { persona, state = {} }) {
  const ops = isOps(persona);
  const lv = level(persona);
  const canCreate = ops || lv >= 2; // canCreateWorkDocuments: level 1 uses Việc của tôi only
  return {
    userId: persona._id,
    level: lv,
    isAdmin: ops,
    canCreate,
    assignerMode: 'admin_mod',
    assignableUsers: [],
    approvals: approvalsFor(persona),
    departmentWorks: [],
    personalTasks: [],
    // Only released work reaches assignees; Ban giám hiệu has no assigned work in these examples.
    myTasks: ops || lv >= 4 ? [] : myTasks(state),
    documentTypes: DOC_TYPES,
    // Reviews go to the person who created the work (Văn thư in these examples).
    pendingCompletionReviews: ops ? PENDING_REVIEWS : [],
  };
}

function formOptions(_args, { persona }) {
  const ops = isOps(persona);
  const lv = level(persona);
  const bgh = !ops && lv >= 4;
  // ops → everyone except Ban giám hiệu (level ≥ 4); BGH → lower level in any department; others → lower level, same department.
  const users = USERS.filter((u) => u.role === 'user' && (ops ? level(u) < 4 : (level(u) < lv && (bgh || u.departmentId === persona.departmentId))));
  const option = (u) => ({
    _id: u._id, name: u.name, email: u.email, role: u.role, departmentId: u.departmentId,
    departmentName: departmentById(u.departmentId)?.name || '', positionName: positionById(u.positionId)?.name || '', level: level(u),
  });
  const canAssignDepartments = ops || bgh;
  return {
    canCreate: true,
    isOps: ops,
    requiresApproval: ops,
    canAssignDepartments,
    assignerMode: 'admin_mod',
    departments: canAssignDepartments ? DEPARTMENTS.map((d) => ({ _id: d._id, name: d.name, code: d.code })) : [],
    users: users.map(option),
    documentTypes: DOC_TYPES,
    // Active Ban giám hiệu (level 4+, never admin/moderator), highest level first.
    approvers: ops ? APPROVER_IDS.map((id) => option(userById(id))) : [],
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

/**
 * Videos: state.todoAdded = { title, note, dueOffsetH, remindOffsetH } appends a just-added to-do;
 * state.todoDone = ['td2', …] shows those to-dos ticked (moved to "Đã hoàn thành gần đây").
 */
function todosFor(state = {}) {
  let open = [...TODOS.open];
  if (state.todoAdded) {
    const a = state.todoAdded;
    open = [...open, todo('td_new', a.title, a.note || '', a.dueOffsetH ?? null, a.remindOffsetH ?? null)];
  }
  const done = new Set(state.todoDone || []);
  const ticked = open.filter((row) => done.has(row._id)).map((row) => ({ ...row, completedAt: T0 + 0.1 * HOUR }));
  return { open: open.filter((row) => !done.has(row._id)), completed: [...ticked, ...TODOS.completed] };
}

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
  'work:listAdmin': (_args, { persona }) => ({
    assignerMode: 'admin_mod', visibilityMode: 'school', canCreate: true, isOps: isOps(persona),
    documents: adminDocuments(persona), documentTypes: DOC_TYPES, pendingCompletionReviews: isOps(persona) ? PENDING_REVIEWS : [],
  }),
  'work:formOptions': formOptions,
  'personalTodos:listMine': (_args, { state }) => todosFor(state),
  'reports:workCalendar': workCalendar,
};

export const mutations = {
  'documentTypes:ensureDefaults': null,
};

export { DOC_TYPES, POSITIONS };
