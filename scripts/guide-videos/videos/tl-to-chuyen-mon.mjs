// Thiết lập tổ chuyên môn (Administrator). Fixtures: guide-shots/harness/fixtures/common.js (catalogs);
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
  id: 'tl-to-chuyen-mon',
  title: 'Thiết lập tổ chuyên môn',
  intro: 'Tổ chuyên môn theo cơ cấu của trường: giáo viên thuộc tổ của môn mình dạy; Ban Giám hiệu, nhân viên, giám thị thuộc Tổ Văn phòng. Mỗi người thuộc đúng một tổ.',
  scenes: [
    {
      scenario: 'admin',
      path: '/thiet-lap-nguoi-dung',
      steps: [
        { step: 'Mở trang', caption: 'Ở cột menu bên trái, nhóm “Thiết lập tối cao”, bấm “Thiết lập tổ chuyên môn”.', click: { css: '.shell-nav-button', text: 'Thiết lập tổ chuyên môn' }, waitFor: '.departments-management', hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Phía trên là khung “Thêm tổ chuyên môn”. Phía dưới là các tổ đang có, mỗi tổ một thẻ.', highlight: form, label: 'Khung thêm tổ', hold: 3 },
        { highlight: { css: '.mgmt-card', text: 'Tổ Văn phòng' }, label: 'Tổ Văn phòng', caption: 'Tổ Văn phòng gồm Ban Giám hiệu, văn thư, nhân viên và giám thị. Giáo viên thuộc tổ của môn mình dạy.', hold: 3 },
        { clear: true, caption: 'Tổ quyết định tổ trưởng quản lý ai, Moderator theo tổ, phạm vi xem ở Báo cáo, Bán trú, Đánh giá nhân sự, và việc giao theo tổ.' },
        { caption: 'Nên tạo tổ đầu tiên khi thiết lập năm học: tạo tài khoản và nhập file người dùng đều cần chọn tổ có sẵn.' },
        { step: 'Bước 1', caption: 'Gõ “Tên tổ chuyên môn”, ví dụ “Tổ Khoa học tự nhiên”.', type: nameInput, text: 'Tổ Khoa học tự nhiên' },
        { caption: 'Gõ “Mã” ngắn, ví dụ KHTN: tối đa 20 ký tự, chỉ chữ không dấu, số, gạch ngang hoặc gạch dưới. Mã tự chuyển thành chữ in hoa.', type: codeInput, text: 'khtn' },
        { caption: 'Mã này chính là cột “ma_phong_ban” trong file nhập người dùng và file nhập công tác, nên đặt ngắn và dễ nhớ.', highlight: codeInput, hold: 3 },
        { clear: true, caption: 'Bấm “+ Thêm tổ chuyên môn”.', click: submit, hold: 1 },
      ],
    },
    {
      scenario: 'admin',
      path: '/thiet-lap-to-chuyen-mon',
      overrides: { 'departments:list': afterAdd },
      waitFor: form,
      steps: [
        { caption: 'Tổ mới hiện ở cuối danh sách.', highlight: card('Tổ Khoa học tự nhiên'), label: 'Tổ vừa thêm', hold: 3.5 },
        { clear: true, step: 'Bước 2', caption: 'Thêm người vào tổ: bấm “Thêm user” trên thẻ của tổ.', click: cardButton('Tổ Khoa học tự nhiên', 'Thêm user'), hold: 1.2 },
        { caption: 'Thẻ mở rộng ra. Tổ mới nên chưa có ai.', highlight: { css: '.assign-panel' }, hold: 3 },
        { clear: true, caption: 'Gõ tên hoặc email vào ô tìm kiếm. Khi chỉ còn một người khớp, người đó được chọn sẵn.', type: '.assign-panel .assign-search', text: 'Lý Thị', keepFocus: true },
        { caption: 'Bấm “+ Thêm user vào tổ chuyên môn”. Mỗi người chỉ thuộc một tổ: thêm vào đây sẽ chuyển người đó khỏi tổ cũ.', click: '.assign-panel .primary-button', hold: 2 },
        { caption: 'Xong thì bấm “Ẩn user” để thu gọn thẻ.', click: cardButton('Tổ Khoa học tự nhiên', 'Ẩn user'), hold: 1 },
        { caption: 'Mở “Thêm user” ở một tổ đã có người, sẽ thấy danh sách thành viên kèm nút “Gỡ” để bỏ người khỏi tổ.', click: cardButton('Tổ Toán – Tin', 'Thêm user'), hold: 1 },
        { highlight: { css: '.member-list' }, label: 'Thành viên', hold: 3.5 },
        { clear: true, click: cardButton('Tổ Toán – Tin', 'Ẩn user'), hold: 0.6 },
        { top: true },
        { step: 'Bước 3', caption: 'Muốn đổi tên hoặc mã: bấm “Sửa” trên thẻ. Khung phía trên chuyển thành “Sửa: …”, sửa xong bấm “Lưu”.', click: cardButton('Tổ Khoa học tự nhiên', 'Sửa'), hold: 1 },
        { highlight: form, label: 'Đang sửa', hold: 3 },
        { clear: true, caption: 'Đổi ý thì bấm “Hủy” ở góc khung.', click: { css: 'form.admin-form .text-button', text: 'Hủy' }, hold: 1.2 },
        { step: 'Bước 4', caption: 'Muốn xóa: bấm “Xóa” trên thẻ, rồi bấm “OK” khi trình duyệt hỏi lại.', point: cardButton('Tổ Khoa học tự nhiên', 'Xóa'), hold: 2.5 },
        { step: 'Lưu ý', caption: 'Chỉ xóa được tổ khi không còn ai trong tổ. Hãy chuyển hoặc gỡ hết người trước. Tạo lại đúng mã cũ sẽ khôi phục tổ đã xóa.' },
        { caption: 'Muốn gom người của nhiều tổ thành một nhóm, như Ban Giám hiệu hay Đảng uỷ, hãy dùng “Thiết lập phòng ban”.' },
      ],
    },
  ],
};
