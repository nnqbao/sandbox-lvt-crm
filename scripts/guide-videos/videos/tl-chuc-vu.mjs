// Thiết lập chức vụ (Administrator). Fixtures: guide-shots/harness/fixtures/common.js (catalogs);
// the "after adding" list is passed as a scene override built from the same fictional personas.
import { POSITIONS, USERS } from '../../guide-shots/harness/fixtures/personas.js';

const form = 'form.admin-form';
const nameInput = { css: 'form.admin-form input', nth: 0 };
const codeInput = { css: 'form.admin-form input', nth: 1 };
const levelSelect = 'form.admin-form select';
const submit = 'form.admin-form .primary-button';
const card = (name) => ({ css: '.mgmt-card', text: name });
const cardButton = (name, label) => ({ css: '.mgmt-card button', text: label, exact: true, within: card(name) });

const added = { _id: 'pos_tv', name: 'Nhân viên thư viện', code: 'TV', level: 1, active: true, createdAt: 0, updatedAt: 0, _creationTime: 0 };
const slimUsers = USERS.map((u) => ({ _id: u._id, name: u.name, email: u.email, status: u.status, role: u.role, positionId: u.positionId }));
const afterAdd = { positions: [...POSITIONS, added].sort((a, b) => b.level - a.level), users: slimUsers };

export default {
  id: 'tl-chuc-vu',
  title: 'Thiết lập chức vụ',
  intro: 'Mỗi chức vụ gắn với một cấp bậc từ 1 đến 5 sao. Cấp bậc quyết định ai duyệt, ai giao việc và ghi nhận cho ai. Video này hướng dẫn thêm chức vụ, gán người và sửa, xóa.',
  scenes: [
    {
      scenario: 'admin',
      path: '/thiet-lap-phong-ban',
      steps: [
        { step: 'Mở trang', caption: 'Ở cột menu bên trái, nhóm “Thiết lập tối cao”, bấm “Thiết lập chức vụ”.', click: { css: '.shell-nav-button', text: 'Thiết lập chức vụ' }, waitFor: '.positions-management', hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Đọc khung “Quy tắc duyệt”: người có cấp sao cao hơn được duyệt cho người có cấp sao thấp hơn. Người 1 sao không duyệt cho ai.', highlight: '.positions-management .notice', label: 'Quy tắc duyệt', hold: 5 },
        { caption: 'Bên dưới là khung “Thêm chức vụ” và các thẻ chức vụ, xếp từ cấp cao xuống cấp thấp.', highlight: form, label: 'Khung thêm chức vụ', hold: 3 },
        { highlight: '.card-list', label: 'Các chức vụ', hold: 3 },
        { clear: true, caption: '5 sao và 4 sao là Ban Giám hiệu: duyệt lịch công tác tuần và công việc Văn thư gửi lên.' },
        { caption: '3 sao và 2 sao là tổ trưởng, tổ phó: tạo lịch tổ, giao việc cho người cấp thấp hơn trong tổ. 1 sao là người thực hiện: giáo viên, văn thư, giám thị.' },
        { top: true },
        { step: 'Bước 1', caption: 'Thêm chức vụ: gõ “Tên chức vụ”, ví dụ “Nhân viên thư viện”.', type: nameInput, text: 'Nhân viên thư viện' },
        { caption: 'Gõ “Mã” ngắn, ví dụ TV. Đây là cột “ma_chuc_vu” trong file nhập người dùng.', type: codeInput, text: 'tv' },
        { caption: 'Chọn “Cấp bậc (1–5 sao)”. Mặc định là 3 sao, nhớ đổi cho đúng: nhân viên thư viện là 1 sao.', choose: levelSelect, option: '1' },
        { caption: 'Hàng sao bên dưới đổi theo cấp vừa chọn.', highlight: { css: 'form.admin-form label', text: 'Cấp bậc' }, hold: 3 },
        { clear: true, caption: 'Bấm “+ Thêm chức vụ”.', click: submit, hold: 1 },
      ],
    },
    {
      scenario: 'admin',
      path: '/thiet-lap-chuc-vu',
      overrides: { 'positions:list': afterAdd },
      waitFor: form,
      steps: [
        // Room below the last cards so the cursor can reach them (no visible change at the top).
        { js: "document.querySelector('.shell-main').style.paddingBottom = '320px';", hold: 0.1 },
        { caption: 'Chức vụ mới hiện cùng các chức vụ 1 sao, có ghi “Cấp 1/5”.', highlight: card('Nhân viên thư viện'), label: 'Chức vụ vừa thêm', hold: 4 },
        { clear: true, step: 'Bước 2', caption: 'Gán người giữ chức vụ: bấm “Thêm user” trên thẻ.', click: cardButton('Nhân viên thư viện', 'Thêm user'), hold: 1.2 },
        { caption: 'Chọn người dùng trong danh sách thả xuống.', choose: '.assign-panel select', option: 'u_t7' },
        { caption: 'Bấm “+ Thêm user vào chức vụ”. Mỗi người chỉ giữ một chức vụ: gán ở đây sẽ thay chức vụ cũ của người đó.', click: '.assign-panel .primary-button', hold: 2 },
        { clear: true, click: cardButton('Nhân viên thư viện', 'Ẩn user'), hold: 0.6 },
        { step: 'Bước 3', caption: 'Muốn đổi tên, mã hoặc cấp bậc: bấm “Sửa” trên thẻ, sửa trong khung phía trên rồi bấm “Lưu chức vụ”.', click: cardButton('Nhân viên thư viện', 'Sửa'), hold: 1 },
        { highlight: form, label: 'Đang sửa', hold: 3 },
        { clear: true, caption: 'Đổi cấp bậc của một chức vụ sẽ áp dụng ngay cho mọi người đang giữ chức vụ đó.' },
        { caption: 'Đổi ý thì bấm “Hủy” ở góc khung.', click: { css: 'form.admin-form .text-button', text: 'Hủy' }, hold: 1.2 },
        { step: 'Lưu ý', caption: 'Chỉ xóa được chức vụ khi không còn ai giữ chức vụ đó. Bấm “Xóa” trên thẻ rồi bấm “OK” khi trình duyệt hỏi lại.', point: cardButton('Nhân viên thư viện', 'Xóa'), hold: 2.5 },
        { caption: 'Tài khoản User chưa có chức vụ, hoặc chức vụ 1 sao, không tạo được công việc. Hãy gán chức vụ cho mọi giáo viên.' },
      ],
    },
  ],
};
