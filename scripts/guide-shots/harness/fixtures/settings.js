// Thiết lập tối cao (Administrator): loại văn bản, thiết lập hiển thị, import user.
// Shared catalogs (users / departments / positions / permission groups) live in common.js.
// ALL DATA IS FICTIONAL.
import { DAY, T0 } from './personas.js';

const stamp = (offsetDays) => ({
  createdAt: T0 - offsetDays * DAY,
  updatedAt: T0 - offsetDays * DAY,
  _creationTime: T0 - offsetDays * DAY,
});

export const DOCUMENT_TYPES = [
  { _id: 'dt_kh', name: 'Kế hoạch', code: 'KH', active: true, isDefault: true, sortOrder: 1, ...stamp(300) },
  { _id: 'dt_bb', name: 'Biên bản', code: 'BB', active: true, isDefault: true, sortOrder: 2, ...stamp(300) },
  { _id: 'dt_bc', name: 'Báo cáo', code: 'BC', active: true, isDefault: true, sortOrder: 3, ...stamp(300) },
  { _id: 'dt_tb', name: 'Thông báo', code: 'TB', active: true, sortOrder: 4, ...stamp(120) },
  { _id: 'dt_qd', name: 'Quyết định', code: 'QD', active: true, sortOrder: 5, ...stamp(90) },
];

/** Rows the (mocked) server returns after reading a valid import file. */
const IMPORT_PREVIEW = [
  ['Giáo viên Mẫu 01', 'giaovien.mau01@truongmau.example', 'TOAN', 'Tổ Toán – Tin', 'GV', 'Giáo viên', 'GV', 'Giáo viên'],
  ['Giáo viên Mẫu 02', 'giaovien.mau02@truongmau.example', 'VAN', 'Tổ Ngữ văn', 'GV', 'Giáo viên', 'GVCN', 'Giáo viên chủ nhiệm'],
  ['Giáo viên Mẫu 03', 'giaovien.mau03@truongmau.example', 'ANH', 'Tổ Tiếng Anh', 'TP', 'Tổ phó', 'TT', 'Tổ trưởng'],
  ['Giáo viên Mẫu 04', 'giamthi.mau04@truongmau.example', 'VP', 'Tổ Văn phòng', 'GT', 'Giám thị', 'GT', 'Giám thị'],
].map(([name, email, departmentCode, departmentName, positionCode, positionName, permissionGroupCode, permissionGroupName], index) => ({
  rowNumber: index + 2,
  name,
  email,
  role: 'user',
  departmentCode,
  departmentName,
  positionCode,
  positionName,
  permissionGroupCode,
  permissionGroupName,
}));

const IMPORT_ERRORS = [
  {
    rowNumber: 3,
    message: 'Thông tin [Phòng ban, Chức vụ, Nhóm quyền] không chính xác, vui lòng đảm bảo chính xác với hệ thống',
    detail: 'Phòng ban không khớp hệ thống (mã: TOANTIN).',
  },
  {
    rowNumber: 5,
    message: 'Phát hiện email trùng, vui lòng kiểm tra lại',
    detail: 'Email đã tồn tại trong hệ thống (giaovien.a@truongmau.example).',
  },
  { rowNumber: 6, message: 'Mật khẩu tạm thời phải có ít nhất 8 ký tự', detail: null },
  { rowNumber: 7, message: 'Vui lòng điền đầy đủ các cột thông tin người dùng', detail: null },
];

export const queries = {
  // state.extraDocumentTypes (videos): rows added after "+ Thêm loại văn bản".
  'documentTypes:list': (_args, { state }) => ({ documentTypes: [...DOCUMENT_TYPES, ...(state.extraDocumentTypes || [])] }),
  // "Phiên" drawer in Thiết lập người dùng (admin view of another user's sessions).
  'sessions:listForUser': () => [
    { sessionId: 'ses_u1', deviceName: 'Chrome trên Windows', platformLabel: 'Web · Windows', clientKind: 'web', lastActiveAt: T0 - 40 * 60 * 1000, createdAt: T0 - 6 * DAY, isCurrent: false },
    { sessionId: 'ses_u2', deviceName: 'iPhone', platformLabel: 'iOS · Ứng dụng LVT CRM', clientKind: 'ios', lastActiveAt: T0 - 26 * 60 * 60 * 1000, createdAt: T0 - 30 * DAY, isCurrent: false },
  ],
  'settings:displaySettings': (_args, { state }) => ({
    dutyAttendanceConfirmationEnabled: state.attendanceConfirmation !== false,
    workVisibilityMode: state.workVisibilityMode || 'school',
    notificationDutiesEnabled: true,
    notificationWorkEnabled: true,
    notificationDutyMilestonesHours: [48, 24, 12, 0],
    notificationWorkMilestonesHours: [72, 24, 2, 0],
  }),
};

export const mutations = {
  'userImport:generateUploadUrl': () => '/__guide-upload',
  'userImport:registerUpload': () => ({ uploadId: 'imp_1', expiresAt: T0 + 60 * 60 * 1000 }),
  'userImport:validateUpload': (_args, { state }) =>
    state.importErrors
      ? { ok: false, errors: IMPORT_ERRORS, preview: [], fileName: 'nhap_lieu_giao_vien.xlsx', expiresAt: T0 + 3600000 }
      : { ok: true, errors: [], preview: IMPORT_PREVIEW, fileName: 'nhap_lieu_giao_vien.xlsx', expiresAt: T0 + 3600000 },
  'userImport:commit': () => ({
    createdCount: IMPORT_PREVIEW.length,
    users: IMPORT_PREVIEW.map((row) => ({ name: row.name, email: row.email })),
  }),
};
