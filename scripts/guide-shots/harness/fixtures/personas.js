// Fictional people, departments and positions shared by every fixture module.
// Names follow the "Nguyễn Văn A / Trần Thị B" convention so nobody mistakes
// them for real staff. Do not replace them with real data.

export const T0 = Date.parse('2026-10-21T09:00:00+07:00'); // frozen "now" (Thứ Tư 21/10/2026)
export const DAY = 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;

export const DEPARTMENTS = [
  { _id: 'dep_bgh', name: 'Ban Giám hiệu', code: 'BGH', active: true },
  { _id: 'dep_toan', name: 'Tổ Toán – Tin', code: 'TOAN', active: true },
  { _id: 'dep_van', name: 'Tổ Ngữ văn', code: 'VAN', active: true },
  { _id: 'dep_anh', name: 'Tổ Tiếng Anh', code: 'ANH', active: true },
  { _id: 'dep_vp', name: 'Tổ Văn phòng', code: 'VP', active: true },
].map((row) => ({ ...row, createdAt: T0 - 300 * DAY, updatedAt: T0 - 30 * DAY, _creationTime: T0 - 300 * DAY }));

export const POSITIONS = [
  { _id: 'pos_ht', name: 'Hiệu trưởng', code: 'HT', level: 5 },
  { _id: 'pos_pht', name: 'Phó Hiệu trưởng', code: 'PHT', level: 4 },
  { _id: 'pos_tt', name: 'Tổ trưởng', code: 'TT', level: 3 },
  { _id: 'pos_tp', name: 'Tổ phó', code: 'TP', level: 2 },
  { _id: 'pos_gv', name: 'Giáo viên', code: 'GV', level: 1 },
  { _id: 'pos_vt', name: 'Văn thư', code: 'VT', level: 1 },
  { _id: 'pos_gt', name: 'Giám thị', code: 'GT', level: 1 },
].map((row) => ({ ...row, active: true, createdAt: T0 - 300 * DAY, updatedAt: T0 - 30 * DAY, _creationTime: T0 - 300 * DAY }));

const MENUS = ['reports', 'notifications', 'duties', 'work', 'homeroom', 'attendance', 'people-review', 'staff-faults'];
const access = (map) => Object.fromEntries(MENUS.map((id) => [id, map[id] || (id === 'notifications' ? 'view' : 'hidden')]));

export const PERMISSION_GROUPS = [
  {
    _id: 'grp_gv',
    name: 'Giáo viên',
    code: 'GV',
    description: 'Giáo viên bộ môn',
    menuAccess: access({ duties: 'view', work: 'view', reports: 'view', 'people-review': 'view', 'staff-faults': 'view' }),
  },
  {
    _id: 'grp_gvcn',
    name: 'Giáo viên chủ nhiệm',
    code: 'GVCN',
    description: 'Giáo viên bộ môn kiêm chủ nhiệm lớp',
    menuAccess: access({ duties: 'view', work: 'view', reports: 'view', homeroom: 'view', 'people-review': 'view', 'staff-faults': 'view' }),
  },
  {
    _id: 'grp_gt',
    name: 'Giám thị',
    code: 'GT',
    description: 'Điểm danh học sinh các khối lớp',
    menuAccess: access({ duties: 'view', work: 'view', attendance: 'supervisor', 'staff-faults': 'view' }),
  },
  {
    _id: 'grp_tt',
    name: 'Tổ trưởng',
    code: 'TT',
    description: 'Tổ trưởng, tổ phó chuyên môn',
    menuAccess: access({ duties: 'view', work: 'view', reports: 'view', homeroom: 'view', 'people-review': 'view', 'staff-faults': 'view' }),
  },
  {
    _id: 'grp_bgh',
    name: 'Ban Giám hiệu',
    code: 'BGH',
    description: 'Xem toàn trường',
    menuAccess: access({ duties: 'view_all', work: 'view_all', reports: 'view_all', homeroom: 'view_all', 'people-review': 'view_all', 'staff-faults': 'view_all' }),
  },
].map((row) => ({
  ...row,
  menuAccess: Object.entries(row.menuAccess).map(([menu, level]) => ({ menu, access: level })),
  active: true,
  createdAt: T0 - 300 * DAY,
  updatedAt: T0 - 30 * DAY,
  _creationTime: T0 - 300 * DAY,
}));

function user(id, name, email, role, departmentId, positionId, permissionGroupId, extra = {}) {
  return {
    _id: id,
    _creationTime: T0 - 200 * DAY,
    name,
    email,
    role,
    departmentId,
    positionId,
    permissionGroupId,
    status: 'active',
    mustChangePassword: false,
    hasAvatar: false,
    avatarVersion: null,
    createdAt: T0 - 200 * DAY,
    updatedAt: T0 - 10 * DAY,
    ...extra,
  };
}

/** Everyone in the fictional school. Emails use the reserved example.edu.vn style domain. */
export const USERS = [
  user('u_admin', 'Võ Văn H', 'admin@truongmau.example', 'admin', 'dep_vp', undefined, undefined),
  user('u_clerk', 'Đỗ Thị G', 'vanthu@truongmau.example', 'moderator', 'dep_vp', 'pos_vt', undefined),
  user('u_bgh', 'Hoàng Văn E', 'hieutruong@truongmau.example', 'user', 'dep_bgh', 'pos_ht', 'grp_bgh'),
  user('u_pht', 'Bùi Thị K', 'phohieutruong@truongmau.example', 'user', 'dep_bgh', 'pos_pht', 'grp_bgh'),
  user('u_leader', 'Lê Thị D', 'totruong.toan@truongmau.example', 'user', 'dep_toan', 'pos_tt', 'grp_tt'),
  user('u_teacher', 'Nguyễn Văn A', 'giaovien.a@truongmau.example', 'user', 'dep_toan', 'pos_gv', 'grp_gv'),
  user('u_gvcn', 'Trần Thị B', 'giaovien.b@truongmau.example', 'user', 'dep_van', 'pos_gv', 'grp_gvcn'),
  user('u_supervisor', 'Phạm Văn C', 'giamthi.c@truongmau.example', 'user', 'dep_vp', 'pos_gt', 'grp_gt'),
  user('u_t5', 'Ngô Thị L', 'giaovien.l@truongmau.example', 'user', 'dep_toan', 'pos_gv', 'grp_gv'),
  user('u_t6', 'Đặng Văn M', 'giaovien.m@truongmau.example', 'user', 'dep_van', 'pos_tt', 'grp_tt'),
  user('u_t7', 'Lý Thị N', 'giaovien.n@truongmau.example', 'user', 'dep_anh', 'pos_gv', 'grp_gvcn'),
  user('u_t8', 'Trương Văn P', 'giaovien.p@truongmau.example', 'user', 'dep_anh', 'pos_tt', 'grp_tt'),
];

export const userById = (id) => USERS.find((row) => row._id === id);
export const departmentById = (id) => DEPARTMENTS.find((row) => row._id === id);
export const positionById = (id) => POSITIONS.find((row) => row._id === id);
export const groupById = (id) => PERMISSION_GROUPS.find((row) => row._id === id);

/** scenario -> user id */
export const SCENARIO_USERS = {
  teacher: 'u_teacher', // Giáo viên bộ môn
  gvcn: 'u_gvcn', // Giáo viên chủ nhiệm
  supervisor: 'u_supervisor', // Giám thị
  leader: 'u_leader', // Tổ trưởng
  bgh: 'u_bgh', // Ban Giám hiệu (Hiệu trưởng)
  clerk: 'u_clerk', // Văn thư (Moderator)
  admin: 'u_admin', // Quản trị (Administrator)
  signedout: 'u_teacher',
  mustchange: 'u_teacher',
};

export function personaFor(scenario) {
  const id = SCENARIO_USERS[scenario] || SCENARIO_USERS.teacher;
  return userById(id);
}

export function menuAccessFor(personaUser) {
  if (personaUser.role === 'admin' || personaUser.role === 'moderator') {
    return Object.fromEntries(MENUS.map((id) => [id, 'view_all']));
  }
  const group = groupById(personaUser.permissionGroupId);
  return Object.fromEntries((group?.menuAccess || []).map((row) => [row.menu, row.access]));
}

export const shortDept = (id) => departmentById(id)?.name || '';
