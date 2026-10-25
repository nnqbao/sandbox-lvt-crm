// Thiết lập phòng ban (Administrator). Fixtures: guide-shots/harness/fixtures/common.js (catalogs);
// the "after adding" list is passed as a scene override built from the same fictional personas.
import { DEPARTMENTS, USERS } from '../../guide-shots/harness/fixtures/personas.js';

const form = 'form.admin-form';
const nameInput = { css: 'form.admin-form input', nth: 0 };
const codeInput = { css: 'form.admin-form input', nth: 1 };
const submit = 'form.admin-form .primary-button';
const card = (name) => ({ css: '.mgmt-card', text: name });
const cardButton = (name, label) => ({ css: '.mgmt-card button', text: label, exact: true, within: card(name) });

const added = { _id: 'dep_khtn', name: 'Tổ Khoa học tự nhiên', code: 'KHTN', active: true, createdAt: 0, updatedAt: 0, _creationTime: 0 };
const slimUsers = USERS.map((u) => ({ _id: u._id, name: u.name, email: u.email, status: u.status, role: u.role, departmentId: u.departmentId }));
const afterAdd = { departments: [...DEPARTMENTS, added], users: slimUsers };

export default {
  id: 'tl-phong-ban',
  title: 'Thiết lập phòng ban',
  intro: 'Phòng ban là các tổ chuyên môn, Ban Giám hiệu, Văn phòng… Video này hướng dẫn thêm phòng ban, gán người vào phòng ban, sửa và xóa.',
  scenes: [
    {
      scenario: 'admin',
      path: '/thiet-lap-nguoi-dung',
      steps: [
        { step: 'Mở trang', caption: 'Ở cột menu bên trái, nhóm “Thiết lập tối cao”, bấm “Thiết lập phòng ban”.', click: { css: '.shell-nav-button', text: 'Thiết lập phòng ban' }, waitFor: '.departments-management', hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Phía trên là khung “Thêm phòng ban”. Phía dưới là các phòng ban đang có, mỗi phòng ban một thẻ.', highlight: form, label: 'Khung thêm phòng ban', hold: 3 },
        { highlight: '.card-list', label: 'Các phòng ban', hold: 3 },
        { clear: true, caption: 'Nên tạo phòng ban đầu tiên khi thiết lập năm học: tạo tài khoản và nhập file người dùng đều cần chọn phòng ban có sẵn.' },
        { step: 'Bước 1', caption: 'Gõ “Tên phòng ban”, ví dụ “Tổ Khoa học tự nhiên”.', type: nameInput, text: 'Tổ Khoa học tự nhiên' },
        { caption: 'Gõ “Mã” ngắn, ví dụ KHTN: tối đa 20 ký tự, chỉ chữ không dấu, số, gạch ngang hoặc gạch dưới. Mã tự chuyển thành chữ in hoa.', type: codeInput, text: 'khtn' },
        { caption: 'Mã này chính là cột “ma_phong_ban” trong file nhập người dùng hàng loạt, nên đặt ngắn và dễ nhớ.', highlight: codeInput, hold: 3 },
        { clear: true, caption: 'Bấm “+ Thêm phòng ban”.', click: submit, hold: 1 },
      ],
    },
    {
      scenario: 'admin',
      path: '/thiet-lap-phong-ban',
      overrides: { 'departments:list': afterAdd },
      waitFor: form,
      steps: [
        { caption: 'Phòng ban mới hiện ở cuối danh sách.', highlight: card('Tổ Khoa học tự nhiên'), label: 'Phòng ban vừa thêm', hold: 3.5 },
        { clear: true, step: 'Bước 2', caption: 'Gán người vào phòng ban: bấm “Thêm user” trên thẻ phòng ban.', click: cardButton('Tổ Khoa học tự nhiên', 'Thêm user'), hold: 1.2 },
        { caption: 'Thẻ mở rộng ra. Phòng ban mới nên chưa có ai.', highlight: { css: '.assign-panel' }, hold: 3 },
        { clear: true, caption: 'Chọn người dùng trong danh sách thả xuống.', choose: '.assign-panel select', option: 'u_t7' },
        { caption: 'Bấm “+ Thêm user vào phòng ban”. Mỗi người chỉ thuộc một phòng ban: gán vào đây sẽ chuyển người đó khỏi phòng ban cũ.', click: '.assign-panel .primary-button', hold: 2 },
        { caption: 'Xong thì bấm “Ẩn user” để thu gọn thẻ.', click: cardButton('Tổ Khoa học tự nhiên', 'Ẩn user'), hold: 1 },
        { caption: 'Mở “Thêm user” ở một phòng ban đã có người, sẽ thấy danh sách thành viên kèm nút “Gỡ” để bỏ người khỏi phòng ban.', click: cardButton('Tổ Toán – Tin', 'Thêm user'), hold: 1 },
        { highlight: { css: '.member-list' }, label: 'Thành viên', hold: 3.5 },
        { clear: true, click: cardButton('Tổ Toán – Tin', 'Ẩn user'), hold: 0.6 },
        { top: true },
        { step: 'Bước 3', caption: 'Muốn đổi tên hoặc mã: bấm “Sửa” trên thẻ. Khung phía trên chuyển thành “Sửa: …”, sửa xong bấm “Lưu”.', click: cardButton('Tổ Khoa học tự nhiên', 'Sửa'), hold: 1 },
        { highlight: form, label: 'Đang sửa', hold: 3 },
        { clear: true, caption: 'Đổi ý thì bấm “Hủy” ở góc khung.', click: { css: 'form.admin-form .text-button', text: 'Hủy' }, hold: 1.2 },
        { step: 'Bước 4', caption: 'Muốn xóa: bấm “Xóa” trên thẻ, rồi bấm “OK” khi trình duyệt hỏi lại.', point: cardButton('Tổ Khoa học tự nhiên', 'Xóa'), hold: 2.5 },
        { step: 'Lưu ý', caption: 'Chỉ xóa được phòng ban khi không còn ai được gán vào đó. Hãy chuyển hoặc gỡ hết người trước.' },
        { caption: 'Phòng ban đã xóa không mất hẳn: tạo lại đúng mã cũ sẽ khôi phục phòng ban đó.' },
      ],
    },
  ],
};
