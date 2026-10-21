// Lịch công tác: one fictional school week (Thứ Hai 19/10 – Thứ Bảy 24/10/2026).
import { DEPARTMENTS, T0, USERS, departmentById, positionById, userById } from './personas.js';
import { LOCATIONS } from './common.js';

const WEEK_START = '2026-10-19';
const ALL_DEPTS = DEPARTMENTS.map((d) => d._id);
const loc = (id) => LOCATIONS.find((row) => row._id === id)?.name || '';

const RAW = [
  { _id: 'd1', title: 'Chào cờ đầu tuần', content: 'Chào cờ, sơ kết thi đua tuần 6', startDate: '2026-10-19', startTime: '07:00', endTime: '07:45', location: 'loc_sanTruong', departmentIds: ALL_DEPTS, participantUserIds: [], createdBy: 'u_clerk' },
  { _id: 'd2', title: 'Sinh hoạt chuyên môn tổ Toán – Tin', content: 'Sinh hoạt chuyên môn theo nghiên cứu bài học, chủ đề “Phân số”', startDate: '2026-10-20', startTime: '14:00', endTime: '16:30', location: 'loc_phonghop', departmentIds: ['dep_toan'], participantUserIds: [], createdBy: 'u_leader', team: true },
  { _id: 'd3', title: 'Dự giờ tiết Toán lớp 7/2', content: 'Dự giờ tiết Toán lớp 7/2 — GV Nguyễn Văn A dạy', startDate: '2026-10-21', startTime: '08:00', endTime: '10:00', location: '', locationText: 'Phòng học lớp 7/2', departmentIds: [], participantUserIds: ['u_teacher', 'u_leader', 'u_pht'], createdBy: 'u_leader', team: true },
  { _id: 'd4', title: 'Họp Hội đồng sư phạm tháng 10', content: 'Họp Hội đồng sư phạm tháng 10: đánh giá tháng, kế hoạch tháng 11', startDate: '2026-10-21', startTime: '14:00', endTime: '16:00', location: 'loc_hoitruong', departmentIds: ALL_DEPTS, participantUserIds: [], createdBy: 'u_clerk' },
  { _id: 'd5', title: 'Tập huấn sử dụng CRM', content: 'Tập huấn sử dụng CRM nội bộ cho giáo viên', startDate: '2026-10-22', startTime: '15:00', endTime: '16:30', location: 'loc_phongMay', departmentIds: ['dep_toan', 'dep_van'], participantUserIds: [], otherParticipants: 'Giáo viên mới nhận công tác', createdBy: 'u_clerk' },
  { _id: 'd6', title: 'Kiểm tra nề nếp khối 6', content: 'Kiểm tra nề nếp, vệ sinh các lớp khối 6', startDate: '2026-10-23', startTime: '07:30', endTime: '09:30', location: '', locationText: 'Các lớp khối 6', departmentIds: [], participantUserIds: ['u_supervisor', 'u_gvcn', 'u_pht'], createdBy: 'u_clerk' },
  { _id: 'd7', title: 'Ngày hội đọc sách', content: 'Tổ chức Ngày hội đọc sách cho học sinh', startDate: '2026-10-24', startTime: '08:00', endTime: '11:00', location: 'loc_thuVien', departmentIds: ['dep_van', 'dep_anh'], participantUserIds: [], otherParticipants: 'Đại diện Ban đại diện cha mẹ học sinh', createdBy: 'u_clerk' },
];

const toMs = (date, time) => Date.parse(`${date}T${time}:00+07:00`);

function involves(duty, user) {
  return duty.participantUserIds.includes(user._id) || duty.departmentIds.includes(user.departmentId);
}

function timing(duty) {
  const start = toMs(duty.startDate, duty.startTime);
  const end = toMs(duty.startDate, duty.endTime);
  return { isOngoing: T0 >= start && T0 <= end, isUpcoming: T0 < start, isOverdue: T0 > end, nearDeadline: false };
}

const level = (user) => positionById(user.positionId)?.level || 0;
const isOps = (user) => user.role === 'admin' || user.role === 'moderator';
const isReviewer = (user) => !isOps(user) && level(user) >= 4;

function names(duty) {
  return {
    departmentNames: duty.departmentIds.map((id) => departmentById(id)?.name).filter(Boolean),
    participantNames: duty.participantUserIds.map((id) => userById(id)?.name).filter(Boolean),
    locationLabel: duty.location ? loc(duty.location) : duty.locationText || '',
  };
}

function baseEvent(duty) {
  const n = names(duty);
  return {
    _id: duty._id,
    title: duty.title,
    content: duty.content,
    startDate: duty.startDate,
    endDate: duty.startDate,
    startTime: duty.startTime,
    endTime: duty.endTime,
    allDay: false,
    departmentIds: duty.departmentIds,
    participantUserIds: duty.participantUserIds,
    departmentNames: n.departmentNames,
    participantNames: n.participantNames,
    otherParticipants: duty.otherParticipants || '',
    createdAt: T0 - 5 * 86400000,
    // Only the meeting was edited after creation ("Đã chỉnh sửa" marker in the table).
    updatedAt: duty._id === 'd4' ? T0 - 2 * 86400000 : T0 - 5 * 86400000,
    locationLabel: n.locationLabel,
  };
}

function dutyCalendar(args, { persona }) {
  const selected = userById(args.userId) || persona;
  const ops = isOps(persona);
  const reviewer = isReviewer(persona);
  const canViewAll = ops || reviewer;
  const visible = canViewAll ? USERS : USERS.filter((u) => u.departmentId === persona.departmentId);
  const people = visible
    .map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      isSelf: u._id === persona._id,
      departmentName: departmentById(u.departmentId)?.name || '',
      positionName: positionById(u.positionId)?.name || '',
      positionLevel: level(u),
    }))
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || b.positionLevel - a.positionLevel || a.name.localeCompare(b.name, 'vi'));
  const events = RAW.filter((d) => d.startDate >= args.startDate && d.startDate <= args.endDate && involves(d, selected)).map((duty) => {
    const t = timing(duty);
    const base = baseEvent(duty);
    const self = selected._id === persona._id;
    return {
      ...base,
      locationNames: [base.locationLabel].filter(Boolean),
      locationText: duty.locationText || '',
      assignmentType: duty.participantUserIds.includes(selected._id) ? 'individual' : 'department',
      attendanceStatus: t.isOverdue ? 'attended' : 'pending',
      awaitingApproval: false,
      canManage: ops || duty.createdBy === persona._id,
      canReviewerEdit: reviewer,
      canViewHistory: ops || reviewer || duty.createdBy === persona._id,
      canMarkSelectedUser: self,
      canMarkAttendance: self && t.isOngoing,
      timing: t,
      subordinateParticipants: [],
      visibleParticipants: canViewAll
        ? USERS.filter((u) => involves(duty, u)).slice(0, 8).map((u) => ({ _id: u._id, name: u.name, departmentName: departmentById(u.departmentId)?.name || '', status: t.isOverdue ? 'attended' : 'pending' }))
        : [],
    };
  });
  return {
    people,
    visibilityScope: canViewAll ? 'all' : 'team',
    selectedUserId: selected._id,
    selectedUserName: selected.name,
    actorUserId: persona._id,
    isSelectedSelf: selected._id === persona._id,
    canCreate: ops || [2, 3].includes(level(persona)),
    canEdit: true,
    canManageSubordinates: [2, 3].includes(level(persona)),
    attendanceConfirmationEnabled: true,
    startDate: args.startDate,
    endDate: args.endDate,
    revision: `guide-${persona._id}-${args.userId || ''}-${args.startDate}`,
    events,
  };
}

function viewerFor(persona) {
  if (isOps(persona)) return 'manager';
  if (isReviewer(persona)) return 'reviewer';
  return 'public';
}

function weekSummary(persona, state) {
  const status = state.weekStatus || (viewerFor(persona) === 'reviewer' ? 'submitted' : viewerFor(persona) === 'manager' ? 'approved_changed' : 'approved');
  const changes = [
    { id: 'd5', kind: 'added', title: 'Tập huấn sử dụng CRM' },
    { id: 'd4', kind: 'changed', title: 'Họp Hội đồng sư phạm tháng 10' },
  ];
  const pending = ['submitted', 'approved_changed', 'returned', 'draft'].includes(status);
  return {
    weekStart: WEEK_START,
    weekEnd: '2026-10-24',
    status,
    dutyCount: 5,
    publishedCount: pending ? 4 : 5,
    changeCount: pending ? changes.length : 0,
    changes: pending ? changes : [],
    missingParticipants: 0,
    hasApprovedVersion: true,
    submittedBy: 'u_clerk',
    submittedByName: 'Đỗ Thị G',
    submittedAt: Date.parse('2026-10-20T16:10:00+07:00'),
    returnedBy: status === 'returned' ? 'u_bgh' : undefined,
    returnedByName: status === 'returned' ? 'Hoàng Văn E' : '',
    returnedAt: status === 'returned' ? Date.parse('2026-10-20T17:05:00+07:00') : undefined,
    returnNote: status === 'returned' ? 'Thứ Tư đổi giờ họp Hội đồng sang 14g30.' : undefined,
    approvedBy: 'u_bgh',
    approvedByName: 'Hoàng Văn E',
    approvedAt: Date.parse('2026-10-17T10:20:00+07:00'),
  };
}

function sharedSchedule(args, { persona, state }) {
  const viewer = viewerFor(persona);
  // Team duties (written by a tổ trưởng/tổ phó) never appear on the shared sheet.
  const events = RAW.filter((d) => !d.team && d.startDate >= args.startDate && d.startDate <= args.endDate).map((duty) => {
    const base = baseEvent(duty);
    return {
      ...base,
      location: base.locationLabel,
      locationText: duty.locationText || base.locationLabel,
      approvalChange: viewer !== 'public' && duty._id === 'd5' ? 'added' : viewer !== 'public' && duty._id === 'd4' ? 'changed' : null,
      canManage: isOps(persona) || duty.createdBy === persona._id,
      canReviewerEdit: viewer === 'reviewer',
      canViewHistory: viewer !== 'public' || duty.createdBy === persona._id,
      canChat: true,
    };
  });
  const weeks = args.startDate <= WEEK_START && args.endDate >= WEEK_START ? [weekSummary(persona, state)] : [];
  return {
    startDate: args.startDate,
    endDate: args.endDate,
    viewer,
    canSubmit: viewer === 'manager',
    canReview: viewer === 'reviewer',
    weeks,
    revision: `guide-shared-${persona._id}-${args.startDate}`,
    events,
  };
}

function formOptions(_args, { persona }) {
  const ops = isOps(persona);
  return {
    canCreate: true,
    isOps: ops,
    locations: [],
    departments: ops ? DEPARTMENTS.map((d) => ({ _id: d._id, name: d.name, code: d.code })) : [],
    users: USERS.filter((u) => ops || (u.departmentId === persona.departmentId && level(u) < level(persona))).map((u) => ({ _id: u._id, name: u.name, email: u.email, departmentId: u.departmentId })),
  };
}

function dutyDoc(duty) {
  const base = baseEvent(duty);
  return { ...base, locationIds: [], locationText: base.locationLabel, active: true, createdBy: duty.createdBy };
}

export const queries = {
  'reports:dutyCalendar': dutyCalendar,
  'reports:dutyCalendarRevision': (args, ctx) => ({ revision: dutyCalendar(args, ctx).revision }),
  'duties:sharedSchedule': sharedSchedule,
  'duties:sharedScheduleRevision': (args, ctx) => ({ revision: sharedSchedule(args, ctx).revision }),
  'duties:formOptions': formOptions,
  'duties:listAdmin': () => ({ duties: RAW.map(dutyDoc) }),
  'duties:listMine': (_args, { persona }) => ({ canCreate: [2, 3].includes(level(persona)), duties: RAW.filter((d) => d.createdBy === persona._id).map(dutyDoc) }),
  'duties:reviewerEditContext': (args) => {
    const duty = RAW.find((d) => d._id === args.id) || RAW[3];
    const doc = dutyDoc(duty);
    return {
      duty: { ...doc, title: duty.title, locationText: doc.locationText },
      departments: DEPARTMENTS.map((d) => ({ _id: d._id, name: d.name, code: d.code })),
      users: USERS.map((u) => ({ _id: u._id, name: u.name, email: u.email, departmentId: u.departmentId })),
    };
  },
  'duties:changeHistory': () => [
    {
      _id: 'h3', at: Date.parse('2026-10-20T17:12:00+07:00'), atLabel: '17:12 20/10/2026', action: 'reviewer_update', actionLabel: 'Ban Giám hiệu sửa trực tiếp',
      actorName: 'Hoàng Văn E', actorKind: 'reviewer', actorRoleLabel: 'Ban Giám hiệu',
      changes: [{ field: 'Thời gian', before: '14:00 – 16:00', after: '14:30 – 16:30' }],
    },
    {
      _id: 'h2', at: Date.parse('2026-10-19T09:40:00+07:00'), atLabel: '09:40 19/10/2026', action: 'update', actionLabel: 'Sửa công tác',
      actorName: 'Đỗ Thị G', actorKind: 'manager', actorRoleLabel: 'Văn thư',
      changes: [{ field: 'Địa điểm', before: 'Phòng họp Hội đồng', after: 'Hội trường' }],
    },
    {
      _id: 'h1', at: Date.parse('2026-10-16T15:05:00+07:00'), atLabel: '15:05 16/10/2026', action: 'create', actionLabel: 'Tạo công tác',
      actorName: 'Đỗ Thị G', actorKind: 'manager', actorRoleLabel: 'Văn thư', changes: [],
    },
  ],
  'dutyMessages:list': () => ({ messages: [], canSend: true }),
  'personalReminders:listMine': () => [],
};

export const mutations = {
  'dutyImport:generateUploadUrl': 'https://guide-upload.invalid/duty',
  'dutyImport:registerUpload': { uploadId: 'dup_1' },
  'dutyImport:validateUpload': (_args, { state }) =>
    state.importErrors
      ? {
          ok: false,
          errors: [
            { rowNumber: 4, message: 'Thiếu ngày bắt đầu.', detail: 'Cột ngay_bat_dau phải có dạng dd/mm/yyyy.' },
            { rowNumber: 7, message: 'Không tìm thấy email người tham gia.', detail: 'giaovien.x@truongmau.example' },
          ],
          preview: [],
        }
      : {
          ok: true,
          errors: [],
          preview: [
            { rowNumber: 2, title: 'Chào cờ đầu tuần', startDate: '26/10/2026', startTime: '07:00', endDate: '26/10/2026', endTime: '07:45', allDay: false, location: 'Sân trường', departmentNames: ['Ban Giám hiệu', 'Tổ Toán – Tin', 'Tổ Ngữ văn'], participantEmails: [], otherParticipants: '' },
            { rowNumber: 3, title: 'Họp tổ Ngữ văn', startDate: '27/10/2026', startTime: '14:00', endDate: '27/10/2026', endTime: '16:00', allDay: false, location: 'Phòng họp Hội đồng', departmentNames: ['Tổ Ngữ văn'], participantEmails: [], otherParticipants: '' },
            { rowNumber: 4, title: 'Thao giảng cấp trường', startDate: '29/10/2026', startTime: '', endDate: '29/10/2026', endTime: '', allDay: true, location: 'Các lớp khối 8', departmentNames: [], participantEmails: ['giaovien.a@truongmau.example'], otherParticipants: 'Ban Giám khảo' },
          ],
        },
};
