// Thiết lập nhóm quyền (Administrator). Fixtures: guide-shots/harness/fixtures/common.js (catalogs).
// The menu list is passed as a scene override that mirrors convex/menuAccess.ts SYSTEM_MENU_DEFS
// (the shared fixture predates the Bán trú row and the "Lớp học" label).
import { PERMISSION_GROUPS, USERS } from '../../guide-shots/harness/fixtures/personas.js';

const MENUS = [
  { id: 'reports', label: 'Báo cáo' },
  { id: 'notifications', label: 'Thông báo' },
  { id: 'duties', label: 'Lịch công tác' },
  { id: 'work', label: 'Công việc' },
  { id: 'homeroom', label: 'Lớp học' },
  { id: 'attendance', label: 'Điểm danh' },
  { id: 'boarding', label: 'Bán trú' },
  { id: 'people-review', label: 'Đánh giá nhân sự' },
  { id: 'staff-faults', label: 'Ghi nhận lỗi' },
];
const slimUsers = USERS.map((u) => ({ _id: u._id, name: u.name, email: u.email, status: u.status, role: u.role, permissionGroupId: u.permissionGroupId }));
const access = { notifications: 'view', duties: 'view', work: 'view', attendance: 'supervisor' };
const added = {
  _id: 'grp_nvgt',
  name: 'Nhân viên giám thị',
  code: 'NVGT',
  description: 'Điểm danh, xem lịch công tác và công việc',
  menuAccess: MENUS.map((m) => ({ menu: m.id, access: access[m.id] || 'hidden' })),
  active: true,
  createdAt: 0,
  updatedAt: 0,
  _creationTime: 0,
};
const list = (groups) => ({ groups, menus: MENUS, users: slimUsers });

const form = 'form.admin-form';
const input = (nth) => ({ css: 'form.admin-form input:not([type=radio])', nth });
const row = (label) => ({ css: '.perm-matrix-row', text: label });
// Radio cells of a row, in column order (a "—" cell is not a label, so it is skipped).
const radio = (label, nth) => ({ css: 'label.radio-cell', nth, within: row(label) });
const submit = 'form.admin-form > .primary-button';
const card = (name) => ({ css: '.mgmt-card', text: name });
const cardButton = (name, label) => ({ css: '.mgmt-card button', text: label, exact: true, within: card(name) });

export default {
  id: 'tl-nhom-quyen',
  title: 'Thiết lập nhóm quyền',
  intro: 'Nhóm quyền quyết định mỗi tài khoản User thấy menu nào và ở mức nào, kể cả quyền Giám thị cho menu Điểm danh. Video này hướng dẫn tạo nhóm, chọn quyền và gán người vào nhóm.',
  scenes: [
    {
      scenario: 'admin',
      path: '/thiet-lap-phong-ban',
      overrides: { 'permissionGroups:list': list(PERMISSION_GROUPS) },
      steps: [
        { step: 'Mở trang', caption: 'Ở cột menu bên trái, nhóm “Thiết lập tối cao”, bấm “Thiết lập nhóm quyền”.', click: { css: '.shell-nav-button', text: 'Thiết lập nhóm quyền' }, waitFor: '.permission-groups-management', hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Phía trên là khung “Thêm nhóm quyền” có bảng quyền. Phía dưới là các nhóm đang có.', highlight: form, label: 'Khung thêm nhóm quyền', hold: 3.5 },
        { clear: true, caption: 'Nhóm quyền chỉ áp dụng cho vai trò User. Administrator và Moderator có toàn quyền nên không cần nhóm quyền.' },
        { step: 'Bước 1', caption: 'Gõ “Tên nhóm quyền”, ví dụ “Nhân viên giám thị”.', type: input(0), text: 'Nhân viên giám thị' },
        { caption: 'Gõ “Mã nhóm quyền”, ví dụ NVGT. Mã này là cột “ma_nhom_quyen” trong file nhập người dùng hàng loạt.', type: input(1), text: 'nvgt' },
        { caption: 'Mô tả không bắt buộc, giúp người khác hiểu nhóm này dùng cho ai.', type: input(2), text: 'Điểm danh, xem lịch công tác và công việc' },
        { step: 'Bước 2', caption: 'Bảng quyền có một dòng cho mỗi menu và bốn cột: Ẩn, Xem, Xem tối cao, Giám thị.', highlight: '.perm-matrix-head', label: 'Bốn mức quyền', hold: 4 },
        { clear: true, caption: 'Ẩn: không thấy menu. Xem: làm việc trong phạm vi của mình. Xem tối cao: xem rộng hơn, ví dụ toàn trường, ở menu có hỗ trợ.' },
        { caption: 'Bấm vào ô tròn để chọn mức. Ví dụ “Lịch công tác”: chọn “Xem”.', click: radio('Lịch công tác', 1), hold: 1.2 },
        { caption: '“Công việc”: chọn “Xem”.', click: radio('Công việc', 1), hold: 1.2 },
        { caption: 'Dòng “Điểm danh” chỉ có hai lựa chọn: Ẩn hoặc Giám thị. Các menu khác hiện dấu gạch ở cột Giám thị.', highlight: row('Điểm danh'), label: 'Chỉ Ẩn hoặc Giám thị', hold: 4.5 },
        { clear: true, caption: 'Chọn “Giám thị” ở dòng Điểm danh để nhóm này được điểm danh học sinh.', click: radio('Điểm danh', 1), hold: 1.5 },
        { step: 'Chú ý', caption: 'Mức Giám thị chỉ mở menu Điểm danh: lưu điểm danh của ngày hôm nay. Nó không mở Lớp học hay bất kỳ menu nào khác.', highlight: row('Lớp học'), label: 'Lớp học vẫn Ẩn', hold: 5 },
        { clear: true, caption: 'Dòng “Bán trú”: Xem là phòng ban của mình, Xem tối cao là toàn trường.', highlight: row('Bán trú'), hold: 4 },
        { clear: true, step: 'Bước 3', caption: 'Kiểm tra lại từng dòng rồi bấm “+ Thêm nhóm quyền”.', click: submit, hold: 1 },
      ],
    },
    {
      scenario: 'admin',
      path: '/thiet-lap-nhom-quyen',
      overrides: { 'permissionGroups:list': list([...PERMISSION_GROUPS, added]) },
      waitFor: form,
      steps: [
        { js: "document.querySelector('.shell-main').style.paddingBottom = '320px';", hold: 0.1 },
        { caption: 'Nhóm mới hiện ở cuối danh sách. Thẻ tóm tắt mức quyền của từng menu, ví dụ “Điểm danh: Giám thị”.', highlight: card('Nhân viên giám thị'), label: 'Nhóm vừa thêm', hold: 5 },
        { clear: true, step: 'Bước 4', caption: 'Gán người vào nhóm: bấm “Thêm user” trên thẻ.', click: cardButton('Nhân viên giám thị', 'Thêm user'), hold: 1.2 },
        { caption: 'Chọn người dùng trong danh sách thả xuống.', choose: '.assign-panel select', option: 'u_t5' },
        { caption: 'Bấm “+ Thêm user vào nhóm quyền”. Mỗi User chỉ thuộc một nhóm: gán ở đây sẽ chuyển người đó khỏi nhóm cũ.', click: '.assign-panel .primary-button', hold: 2 },
        { clear: true, click: cardButton('Nhân viên giám thị', 'Ẩn user'), hold: 0.6 },
        { step: 'Bước 5', caption: 'Muốn đổi quyền: bấm “Sửa” trên thẻ, chỉnh trong bảng quyền phía trên rồi bấm “Lưu nhóm quyền”. Thay đổi áp dụng cho mọi người trong nhóm.', click: cardButton('Nhân viên giám thị', 'Sửa'), hold: 1 },
        { highlight: 'form.admin-form .form-heading', label: 'Đang sửa', hold: 3 },
        { clear: true, caption: 'Đổi ý thì bấm “Hủy” ở góc khung.', click: { css: 'form.admin-form .text-button', text: 'Hủy' }, hold: 1.2 },
        { step: 'Lưu ý', caption: 'Chỉ xóa được nhóm quyền khi không còn ai trong nhóm. Bấm “Xóa” trên thẻ rồi bấm “OK” khi trình duyệt hỏi lại.', point: cardButton('Nhân viên giám thị', 'Xóa'), hold: 2.5 },
      ],
    },
  ],
};
