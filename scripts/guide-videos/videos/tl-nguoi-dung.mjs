// Thiết lập người dùng (Administrator): tạo tài khoản, sửa / đặt lại mật khẩu / phiên / khóa,
// import và xuất Excel. Fixtures: guide-shots/harness/fixtures/common.js (users:bootstrap) and
// settings.js (userImport:*, sessions:listForUser). The list after creating an account is a scene
// override built from the same fictional personas.
import { DEPARTMENTS, HOUR, PERMISSION_GROUPS, POSITIONS, T0, USERS } from '../../guide-shots/harness/fixtures/personas.js';

const created = {
  ...USERS.find((u) => u._id === 'u_t7'),
  _id: 'u_new',
  name: 'Đinh Thị Q',
  email: 'giaovien.q@truongmau.example',
  departmentId: 'dep_van',
  positionId: 'pos_gv',
  permissionGroupId: 'grp_gv',
  mustChangePassword: true,
};
const bootstrap = (extra = []) => ({
  currentUser: USERS[0],
  users: [...USERS.map((u) => (u._id === 'u_t5' ? { ...u, loginLockedAt: T0 - 2 * HOUR } : u)), ...extra],
  departments: DEPARTMENTS,
  permissionGroups: PERMISSION_GROUPS,
  positions: POSITIONS,
  systemRoles: [
    { key: 'admin', name: 'Administrator' },
    { key: 'moderator', name: 'Moderator' },
    { key: 'user', name: 'User' },
  ],
});

const page = '.users-management';
const form = 'form.admin-form';
const formHeading = 'form.admin-form .form-heading';
const select = (nth) => ({ css: 'form.admin-form select', nth });
const fieldLabel = (text) => ({ css: 'form.admin-form label', text });
const createButton = { css: 'form.admin-form .primary-button', text: 'Tạo tài khoản' };
const userRow = (name) => ({ css: '.user-row', text: name });
const rowButton = (name, label) => ({ css: '.user-row button', text: label, exact: true, within: userRow(name) });
const statusTag = (name) => ({ css: '.live-tag, .pending-tag', within: userRow(name) });
const feedback = '.users-management > .feedback';
const resetForm = 'form.compact-form';
const bulk = '.user-bulk-import';
const bulkButton = (label) => ({ css: '.user-bulk-import button', text: label });
// Downloads stay in the browser (no file is written); the real app saves an .xlsx here.
const NO_DOWNLOAD = 'navigator.msSaveBlob = () => true;';
const UPLOAD = (state) => `
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, options) => String(url).includes('__guide-upload')
    ? Promise.resolve(new Response(JSON.stringify({ storageId: 'st_guide_users' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    : realFetch(url, options);
  window.__guide.act({ upload: '.user-bulk-import input[type=file]', files: [{ name: 'nhap_lieu_giao_vien.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: '${state}' }] });
`;
const PAD = "document.querySelector('.shell-main').style.paddingBottom = '320px';";

export default {
  id: 'tl-nguoi-dung',
  title: 'Thiết lập người dùng',
  intro: 'Cấp tài khoản cho thầy cô, đặt lại mật khẩu, khóa và mở khóa tài khoản, nhập và xuất danh sách bằng Excel. Trang này chỉ dành cho Administrator.',
  scenes: [
    {
      scenario: 'admin',
      path: '/thiet-lap-phong-ban',
      steps: [
        { chapter: 'Tổng quan', step: 'Mở trang', caption: 'Ở cột menu bên trái, nhóm “Thiết lập tối cao”, bấm “Thiết lập người dùng”.', click: { css: '.shell-nav-button', text: 'Thiết lập người dùng' }, waitFor: page, hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Đầu trang có hai khung nhỏ: “Import người dùng hàng loạt” và “Giới hạn đăng nhập thất bại”.', highlight: bulk, label: 'Import và xuất Excel', hold: 3 },
        { highlight: '.lockout-settings', label: 'Giới hạn đăng nhập', keep: true, hold: 3 },
        { clear: true, caption: 'Giữa trang là khung “Tạo tài khoản”, bên dưới là danh sách mọi người dùng.', highlight: form, label: 'Tạo tài khoản', hold: 3 },
        { highlight: '.user-table', label: 'Danh sách người dùng', hold: 3 },
        { clear: true },
        { top: true },
        { caption: 'Trước khi tạo tài khoản, hãy tạo sẵn Phòng ban, Chức vụ và Nhóm quyền để có lựa chọn trong các ô.' },

        { chapter: 'Tạo tài khoản', step: 'Bước 1', caption: 'Gõ “Họ tên” đầy đủ của thầy cô.', type: { css: 'form.admin-form input', nth: 0 }, text: 'Đinh Thị Q' },
        { caption: 'Gõ “Email (đăng nhập)”. Email phải chưa có trong hệ thống và không đổi được sau khi tạo.', type: 'form.admin-form input[type=email]', text: 'giaovien.q@truongmau.example' },
        { step: 'Bước 2', caption: 'Chọn “Vai trò” trước tiên: Administrator có toàn quyền; Moderator quản lý nghiệp vụ như văn thư nhưng không vào Thiết lập tối cao; User là giáo viên, nhân viên.', choose: select(0), option: 'user' },
        { caption: 'Chú ý: đổi Vai trò sang Administrator hoặc Moderator sẽ xóa Nhóm quyền đã chọn, vì hai vai trò này không dùng nhóm quyền.', highlight: fieldLabel('Nhóm quyền'), hold: 4.5 },
        { clear: true, step: 'Bước 3', caption: 'Chọn “Phòng ban”, ví dụ Tổ Ngữ văn.', choose: select(1), option: 'dep_van' },
        { caption: 'Riêng Moderator: nếu gán Phòng ban, người đó chỉ quản lý phòng ban này ở Công việc, Báo cáo, Đánh giá nhân sự và Ghi nhận lỗi. Để trống là toàn trường.', highlight: fieldLabel('Phòng ban'), hold: 5 },
        { clear: true, caption: 'Chọn “Chức vụ”. Số sao trong ngoặc là cấp bậc của chức vụ.', choose: select(2), option: 'pos_gv' },
        { caption: 'Với vai trò User, chọn “Nhóm quyền”: nhóm này quyết định menu nào được thấy.', choose: select(3), option: 'grp_gv' },
        { step: 'Bước 4', caption: 'Gõ “Mật khẩu tạm thời”, ít nhất 8 ký tự.', type: 'form.admin-form input[type=password]', text: 'Tam12345' },
        { caption: 'Bấm “+ Tạo tài khoản”.', click: createButton, hold: 0.8 },
      ],
    },
    {
      scenario: 'admin',
      path: '/thiet-lap-nguoi-dung',
      overrides: { 'users:bootstrap': bootstrap([created]) },
      waitFor: page,
      steps: [
        { js: PAD, hold: 0.1 },
        { caption: 'Tài khoản mới hiện cuối danh sách với trạng thái “Cần đổi MK”: lần đầu đăng nhập, thầy cô bắt buộc đổi mật khẩu.', highlight: userRow('Đinh Thị Q'), label: 'Tài khoản vừa tạo', hold: 5 },
        { clear: true, step: 'Lưu ý', caption: 'Gửi mật khẩu tạm thời trực tiếp cho người nhận, không gửi qua nhóm chat chung.' },

        { chapter: 'Sửa, mật khẩu và khóa', step: 'Sửa', caption: 'Muốn sửa họ tên, vai trò, phòng ban, chức vụ hoặc nhóm quyền: bấm “Sửa” ở dòng của người đó.', click: rowButton('Nguyễn Văn A', 'Sửa'), hold: 1 },
        { caption: 'Khung phía trên chuyển thành “Chỉnh sửa: …” với thông tin hiện tại. Ô email bị khóa vì email không đổi được.', highlight: formHeading, label: 'Đang sửa', hold: 4 },
        { clear: true, caption: 'Sửa xong bấm “Lưu thay đổi”. Đổi ý thì bấm “Hủy chỉnh sửa”.', click: { css: 'form.admin-form .text-button', text: 'Hủy chỉnh sửa' }, hold: 1.2 },
        { step: 'Đặt lại MK', caption: 'Thầy cô quên mật khẩu: bấm “Đặt lại MK” ở dòng của người đó.', click: rowButton('Nguyễn Văn A', 'Đặt lại MK'), waitFor: resetForm, hold: 1 },
        { caption: 'Khung “Đặt lại mật khẩu” hiện ra. Gõ mật khẩu tạm thời mới, ít nhất 8 ký tự.', type: `${resetForm} input[type=password]`, text: 'Moi12345' },
        { caption: 'Bấm “Đặt lại mật khẩu”. Mọi phiên đăng nhập cũ bị thu hồi và người dùng phải đổi mật khẩu khi đăng nhập lại.', click: `${resetForm} .primary-button`, hold: 1 },
        { highlight: feedback, label: 'Đã đặt lại', hold: 3 },
        { clear: true, step: 'Phiên', caption: 'Nút “Phiên” cho xem các thiết bị đang đăng nhập của người đó.', click: rowButton('Nguyễn Văn A', 'Phiên'), waitFor: '.admin-sessions-drawer .devices-row', hold: 1 },
        { caption: 'Bấm “Thu hồi” để đăng xuất một thiết bị, hoặc “Thu hồi tất cả phiên”, ví dụ khi thầy cô mất điện thoại.', highlight: '.admin-sessions-drawer', hold: 5 },
        { clear: true, click: rowButton('Nguyễn Văn A', 'Ẩn phiên'), hold: 0.8 },
        { step: 'Khóa ĐN', caption: 'Nhãn “Khóa ĐN” nghĩa là tài khoản bị khóa vì nhập sai mật khẩu quá số lần cho phép.', highlight: statusTag('Ngô Thị L'), label: 'Khóa ĐN', hold: 4 },
        { clear: true, caption: 'Sau khi xác minh đúng người, bấm “Mở khóa ĐN” để cho đăng nhập lại.', click: rowButton('Ngô Thị L', 'Mở khóa ĐN'), hold: 0.5 },
        { js: "const row = [...document.querySelectorAll('.user-row')].find((r) => r.textContent.includes('Ngô Thị L')); const tag = row.querySelector('.pending-tag'); tag.className = 'live-tag'; tag.textContent = 'Hoạt động'; [...row.querySelectorAll('button')].find((b) => b.textContent === 'Mở khóa ĐN')?.remove();", hold: 0.3 },
        { highlight: statusTag('Ngô Thị L'), label: 'Hoạt động', hold: 2.5 },
        { clear: true },
        { top: true },
        { caption: 'Số lần sai tối đa và khoảng thời gian tính (mặc định 5 lần trong 15 phút) chỉnh ở khung này, rồi bấm “Lưu cấu hình”.', highlight: '.lockout-settings', label: 'Giới hạn đăng nhập thất bại', hold: 5 },
        { clear: true, step: 'Khóa', caption: 'Thầy cô nghỉ công tác: bấm “Khóa” để tạm ngừng tài khoản. Tài khoản bị khóa không đăng nhập được.', click: rowButton('Trương Văn P', 'Khóa'), hold: 0.5 },
        { js: "const row = [...document.querySelectorAll('.user-row')].find((r) => r.textContent.includes('Trương Văn P')); const tag = row.querySelector('.live-tag'); tag.className = 'pending-tag'; tag.textContent = 'Đã khóa'; const b = [...row.querySelectorAll('button')].find((x) => x.textContent === 'Khóa'); if (b) b.textContent = 'Mở khóa';", hold: 0.3 },
        { caption: 'Nhãn chuyển thành “Đã khóa”, nút đổi thành “Mở khóa” để cho hoạt động lại khi cần.', highlight: userRow('Trương Văn P'), hold: 4 },
        { clear: true, step: 'Lưu ý', caption: 'Nút “Xóa” xóa hẳn tài khoản, có hỏi lại và không hoàn tác được. Nên dùng “Khóa” nếu có thể cần lại tài khoản.', point: rowButton('Trương Văn P', 'Xóa'), hold: 2 },
        { caption: 'Không thể khóa, xóa hoặc hạ quyền Administrator cuối cùng đang hoạt động: trường luôn phải còn một Administrator.', highlight: userRow('Võ Văn H'), label: 'Administrator', hold: 5 },
        { clear: true },
        { top: true },
        { js: NO_DOWNLOAD, hold: 0.1 },

        { chapter: 'Import và xuất Excel', step: 'Import', caption: 'Tạo nhiều tài khoản cùng lúc: trước hết bấm “Tải file nhập liệu mẫu”.', click: bulkButton('Tải file nhập liệu mẫu'), hold: 1 },
        { caption: 'Mỗi dòng trong file là một người: họ tên, email, mã phòng ban, mã chức vụ, mã nhóm quyền và mật khẩu tạm thời. Mã phải khớp mã đã tạo trong hệ thống.' },
        { caption: 'Điền xong, bấm “Import file nhập liệu” và chọn file .xlsx, tối đa 2 MB.', point: bulkButton('Import file nhập liệu'), hold: 1.2 },
        { js: UPLOAD('ok'), wait: 900, hold: 0.8 },
        { caption: 'Hệ thống kiểm tra từng dòng rồi hiện bảng “Xem trước”. Kiểm tra lại tên, phòng ban, chức vụ và nhóm quyền.', highlight: '.user-bulk-import-preview .user-table', label: 'Xem trước', hold: 5 },
        { clear: true, caption: 'Đúng hết thì bấm “Xác nhận import … tài khoản”. Import chỉ tạo tài khoản vai trò User.', click: '.user-bulk-import-preview .primary-button', hold: 1 },
        { caption: 'Bảng “Kết quả import” liệt kê các tài khoản vừa tạo.', highlight: '.user-bulk-import-result', label: 'Kết quả', hold: 4 },
      ],
    },
    {
      scenario: 'admin',
      path: '/thiet-lap-nguoi-dung',
      state: { importErrors: true },
      waitFor: page,
      steps: [
        { js: UPLOAD('errors'), wait: 900, hold: 0.8 },
        { step: 'Lỗi import', caption: 'Nếu có dù chỉ một dòng sai, hệ thống không tạo tài khoản nào và liệt kê lỗi theo số dòng trong file.', highlight: '.user-bulk-import-errors', label: 'Báo cáo lỗi', hold: 5 },
        { clear: true, caption: 'Lỗi hay gặp: trùng email, sai mã phòng ban, chức vụ hoặc nhóm quyền, mật khẩu ngắn hơn 8 ký tự. Sửa file rồi import lại.' },
        { js: NO_DOWNLOAD, hold: 0.1 },
        { clear: true, step: 'Xuất', caption: 'Muốn có danh sách hiện tại: bấm “Xuất DS người dùng”.', click: bulkButton('Xuất DS người dùng'), hold: 1.2 },
        { caption: 'File Excel chỉ gồm tài khoản đang hoạt động, không có mật khẩu và vai trò.', highlight: { css: '.user-bulk-import > .feedback' }, hold: 4 },
      ],
    },
  ],
};
