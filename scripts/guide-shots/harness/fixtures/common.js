// Shell-level fixtures: session, sidebar badges, account pages and the shared
// catalogs (users / departments / positions / permission groups / school years).
import {
  DAY,
  DEPARTMENTS,
  HOUR,
  PERMISSION_GROUPS,
  POSITIONS,
  T0,
  USERS,
  departmentById,
  groupById,
  menuAccessFor,
  positionById,
} from './personas.js';

function sessionContext(_args, { scenario, persona }) {
  const department = departmentById(persona.departmentId);
  const position = positionById(persona.positionId);
  const group = groupById(persona.permissionGroupId);
  const isAdmin = persona.role === 'admin';
  const isModerator = persona.role === 'moderator';
  const level = position?.level || 0;
  return {
    user: { ...persona, mustChangePassword: scenario === 'mustchange' },
    isAdmin,
    isModerator,
    isOperationalManager: isAdmin || isModerator,
    menuAccess: menuAccessFor(persona),
    department: department ? { _id: department._id, name: department.name, code: department.code } : null,
    permissionGroup: group && persona.role === 'user' ? { _id: group._id, name: group.name } : null,
    position: position ? { _id: position._id, name: position.name, level: position.level, code: position.code } : null,
    // Mirrors convex/assignmentPolicy.ts (levels 2–3) and dutyApproval.ts (reviewer ≥ 4, never admin/mod).
    canCreateDuties: isAdmin || isModerator || level === 2 || level === 3,
    isDutyReviewer: !isAdmin && !isModerator && level >= 4,
  };
}

export const SCHOOL_YEARS = [
  {
    _id: 'sy_2627',
    _creationTime: T0 - 60 * DAY,
    name: '2026-2027',
    startDate: '2026-09-05',
    endDate: '2027-05-31',
    attendanceUploadDueTime: '08:30',
    active: true,
    createdBy: 'u_admin',
    createdAt: T0 - 60 * DAY,
    updatedAt: T0 - 60 * DAY,
  },
  {
    _id: 'sy_2526',
    _creationTime: T0 - 420 * DAY,
    name: '2025-2026',
    startDate: '2025-09-05',
    endDate: '2026-05-31',
    attendanceUploadDueTime: '08:30',
    active: false,
    lockedAt: T0 - 120 * DAY,
    createdBy: 'u_admin',
    createdAt: T0 - 420 * DAY,
    updatedAt: T0 - 120 * DAY,
  },
];

const slimUsers = (field) => USERS.map((u) => ({ _id: u._id, name: u.name, email: u.email, status: u.status, role: u.role, [field]: u[field] }));

export const queries = {
  'users:sessionContext': sessionContext,
  'users:bootstrap': () => ({
    currentUser: USERS[0],
    // One account locked after too many wrong passwords, to illustrate "Mở khóa ĐN".
    users: USERS.map((u) => (u._id === 'u_t5' ? { ...u, loginLockedAt: T0 - 2 * HOUR } : u)),
    departments: DEPARTMENTS,
    permissionGroups: PERMISSION_GROUPS,
    positions: POSITIONS,
    systemRoles: [
      { key: 'admin', name: 'Administrator' },
      { key: 'moderator', name: 'Moderator' },
      { key: 'user', name: 'User' },
    ],
  }),
  'departments:list': () => ({ departments: DEPARTMENTS, users: slimUsers('departmentId') }),
  'positions:list': () => ({ positions: [...POSITIONS].sort((a, b) => b.level - a.level), users: slimUsers('positionId') }),
  'permissionGroups:list': () => ({
    groups: PERMISSION_GROUPS,
    menus: [
      { id: 'reports', label: 'Báo cáo' },
      { id: 'notifications', label: 'Thông báo' },
      { id: 'duties', label: 'Lịch công tác' },
      { id: 'work', label: 'Công việc' },
      { id: 'homeroom', label: 'Lớp chủ nhiệm' },
      { id: 'attendance', label: 'Điểm danh' },
      { id: 'people-review', label: 'Đánh giá nhân sự' },
      { id: 'staff-faults', label: 'Ghi nhận lỗi' },
    ],
    users: slimUsers('permissionGroupId'),
  }),
  'schoolYears:list': () => SCHOOL_YEARS,
  'loginSecurity:lockoutSettings': () => ({ maxFailedAttempts: 5, windowMinutes: 15 }),
  'work:badge': (_args, { state }) => ({ count: state.workBadge ?? 3 }),
  'chatHub:unreadTotal': (_args, { state }) => ({ count: state.chatUnread ?? 2 }),
  'sessions:listMine': () => [
    {
      sessionId: 'ses_1',
      deviceName: 'Chrome trên macOS',
      platformLabel: 'Web · macOS',
      clientKind: 'web',
      lastActiveAt: T0 - 2 * 60 * 1000,
      createdAt: T0 - 3 * DAY,
      isCurrent: true,
    },
    {
      sessionId: 'ses_2',
      deviceName: 'iPhone',
      platformLabel: 'iOS · Ứng dụng LVT CRM',
      clientKind: 'ios',
      lastActiveAt: T0 - 5 * HOUR,
      createdAt: T0 - 20 * DAY,
      isCurrent: false,
    },
    {
      sessionId: 'ses_3',
      deviceName: 'Samsung Galaxy',
      platformLabel: 'Android · Ứng dụng LVT CRM',
      clientKind: 'android',
      lastActiveAt: T0 - 4 * DAY,
      createdAt: T0 - 40 * DAY,
      isCurrent: false,
    },
  ],
};
