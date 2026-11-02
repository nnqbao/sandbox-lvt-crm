// Thiết lập phòng ban (Administrator): many-to-many groups without permissions (units).
// Fixtures: guide-shots/harness/fixtures/personas.js (UNITS); later states are scene overrides.
import { UNITS, USERS } from '../../guide-shots/harness/fixtures/personas.js';

const form = 'form.admin-form';
const nameInput = { css: 'form.admin-form input', nth: 0 };
const codeInput = { css: 'form.admin-form input', nth: 1 };
const submit = 'form.admin-form .primary-button';
const card = (name) => ({ css: '.mgmt-card', text: name });
const cardButton = (name, label) => ({ css: '.mgmt-card button', text: label, exact: true, within: card(name) });

const NEW = 'Đoàn Thanh niên';
const slimUsers = USERS.map((u) => ({ _id: u._id, name: u.name, email: u.email, status: u.status, role: u.role, departmentId: u.departmentId }));
const withNew = (memberUserIds) => ({
  units: [...UNITS, { _id: 'unit_dtn', name: NEW, code: 'DTN', memberUserIds, active: true, createdAt: 0, updatedAt: 0, _creationTime: 0 }]
    .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
  users: slimUsers,
});

export default {
  id: 'tl-phong-ban',
  title: 'Thiết lập phòng ban',
  intro: 'Phòng ban là nhóm người như Ban Giám hiệu, Đảng uỷ, Công đoàn. Một người có thể thuộc nhiều phòng ban. Phòng ban không có phân quyền, chỉ để Văn thư giao nhanh công tác, công việc.',
  scenes: [
    {
      scenario: 'admin',
      path: '/thiet-lap-nguoi-dung',
      steps: [
        { step: 'Mở trang', caption: 'Ở cột menu bên trái, nhóm “Thiết lập tối cao”, bấm “Thiết lập phòng ban”.', click: { css: '.shell-nav-button', text: 'Thiết lập phòng ban' }, waitFor: '.units-management', hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Phía trên là khung “Thêm phòng ban”. Phía dưới là các phòng ban đang có; mỗi thẻ ghi số thành viên.', highlight: form, label: 'Khung thêm phòng ban', hold: 3 },
        { highlight: '.card-list', label: 'Các phòng ban', hold: 3 },
        { clear: true, step: 'Khác tổ chuyên môn', caption: 'Mỗi người chỉ thuộc một tổ chuyên môn, nhưng có thể nằm trong nhiều phòng ban. Ví dụ Phó Hiệu trưởng vừa ở Ban Giám hiệu, vừa ở Đảng uỷ và Công đoàn.' },
        { caption: 'Phòng ban không mở thêm menu hay quyền nào. Phân quyền vẫn theo tổ chuyên môn, chức vụ và nhóm quyền.' },
        { step: 'Bước 1', caption: 'Gõ “Tên phòng ban”, ví dụ “Đoàn Thanh niên”.', type: nameInput, text: NEW },
        { caption: 'Gõ “Mã” ngắn, ví dụ DTN: tối đa 20 ký tự, chỉ chữ không dấu, số, gạch ngang hoặc gạch dưới.', type: codeInput, text: 'dtn' },
        { clear: true, caption: 'Bấm “+ Thêm phòng ban”.', click: submit, hold: 1 },
      ],
    },
    {
      scenario: 'admin',
      path: '/thiet-lap-phong-ban',
      overrides: { 'units:list': withNew([]) },
      waitFor: form,
      steps: [
        { caption: 'Phòng ban mới hiện trong danh sách, chưa có thành viên.', highlight: card(NEW), label: 'Phòng ban vừa thêm', hold: 3.5 },
        { clear: true, step: 'Bước 2', caption: 'Thêm thành viên: bấm “Thêm user” trên thẻ phòng ban.', click: cardButton(NEW, 'Thêm user'), hold: 1.2 },
        { caption: 'Gõ tên hoặc email vào ô tìm kiếm. Khi chỉ còn một người khớp, người đó được chọn sẵn.', type: '.assign-panel .assign-search', text: 'Nguyễn Văn A', keepFocus: true },
        { caption: 'Bấm “+ Thêm user vào phòng ban”. Người đó vẫn giữ tổ chuyên môn và các phòng ban khác của mình.', click: '.assign-panel .primary-button', hold: 2 },
        { scene: { scenario: 'admin', path: '/thiet-lap-phong-ban', overrides: { 'units:list': withNew(['u_teacher', 'u_gvcn', 'u_t7']) }, waitFor: form } },
        { caption: 'Lặp lại để thêm từng người.', click: cardButton(NEW, 'Thêm user'), hold: 1 },
        { caption: 'Danh sách thành viên hiện bên dưới. Bấm “Gỡ” để bỏ một người khỏi phòng ban.', highlight: { css: '.member-list' }, label: 'Thành viên', hold: 3.5 },
        { clear: true, caption: 'Thẻ ghi số thành viên. Xong thì bấm “Ẩn user”.', click: cardButton(NEW, 'Ẩn user'), hold: 1 },
        { step: 'Dùng ở đâu', caption: 'Khi tạo công tác, Văn thư chọn ở ô “Phòng ban tham gia”. Khi tạo công việc, bấm “＋ Phòng ban”. Mọi thành viên của phòng ban đều nhận công tác, việc đó.' },
        { caption: 'Thêm hoặc gỡ thành viên thì danh sách tham gia các công tác chưa kết thúc tự cập nhật theo.' },
        { top: true },
        { step: 'Bước 3', caption: 'Muốn đổi tên hoặc mã: bấm “Sửa” trên thẻ, sửa ở khung phía trên rồi bấm “Lưu”. Đổi ý thì bấm “Hủy”.', click: cardButton(NEW, 'Sửa'), hold: 1 },
        { highlight: form, label: 'Đang sửa', hold: 3 },
        { clear: true, click: { css: 'form.admin-form .text-button', text: 'Hủy' }, hold: 1 },
        { step: 'Bước 4', caption: 'Muốn xóa: bấm “Xóa” trên thẻ, rồi bấm “OK” khi trình duyệt hỏi lại.', point: cardButton(NEW, 'Xóa'), hold: 2.5 },
        { step: 'Lưu ý', caption: 'Chỉ xóa được phòng ban khi không còn thành viên. Hãy gỡ hết người trước.' },
      ],
    },
  ],
};
