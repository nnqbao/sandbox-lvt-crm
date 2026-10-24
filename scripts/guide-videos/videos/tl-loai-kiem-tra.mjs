// Thiết lập loại kiểm tra (Administrator). Fixtures: guide-shots/harness/fixtures/teaching.js.
const form = 'form.hr-panel';
const nameInput = { css: 'form.hr-panel input', nth: 0 };
const coefInput = { css: 'form.hr-panel input', nth: 1 };
const added = [{ _id: 'tt_tt', name: 'Thuyết trình', coefficient: 1, active: true }];

export default {
  id: 'tl-loai-kiem-tra',
  title: 'Thiết lập loại kiểm tra',
  intro: 'Loại kiểm tra và hệ số điểm được dùng khi giáo viên nhập điểm Học bạ và khi tính điểm trung bình môn.',
  scenes: [
    {
      scenario: 'admin',
      path: '/thiet-lap-mon-hoc',
      steps: [
        { step: 'Mở trang', caption: 'Ở cột menu bên trái, nhóm “Thiết lập tối cao”, bấm “Thiết lập loại kiểm tra”.', click: { css: '.shell-nav-button', text: 'Thiết lập loại kiểm tra' }, waitFor: form, hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Hệ thống có sẵn 6 loại: Miệng, 15 phút, Thực hành (hệ số 1); 1 tiết, Giữa kỳ (hệ số 2); Cuối kỳ (hệ số 3).', highlight: '.hr-table', label: 'Các loại kiểm tra', hold: 5 },
        { caption: 'Cột “Hệ số điểm” cho biết điểm đó nặng bao nhiêu khi tính trung bình. Ví dụ: một bài Cuối kỳ hệ số 3 được tính bằng 3 bài hệ số 1.', highlight: { css: '.hr-table tbody tr td', text: 'Hệ số 3' }, label: 'Hệ số 3', hold: 7 },
        { clear: true, step: 'Bước 1', caption: 'Thêm loại mới: bấm vào ô “Tên loại kiểm tra” và gõ tên, ví dụ “Thuyết trình”.', type: nameInput, text: 'Thuyết trình' },
        { caption: 'Nhập “Hệ số điểm”: số từ 1 đến 5. Bài thuyết trình tính như bài thường nên để hệ số 1.', fill: coefInput, value: '1' },
        { caption: 'Bấm nút “Thêm”.', click: { css: 'form.hr-panel .primary-button' }, hold: 0.8 },
      ],
    },
    {
      scenario: 'admin',
      path: '/thiet-lap-loai-kiem-tra',
      state: { extraTestTypes: added },
      waitFor: form,
      steps: [
        { caption: 'Loại mới xuất hiện trong danh sách. Giáo viên sẽ thấy loại này khi bấm “Thêm điểm” trong Học bạ.', highlight: { css: '.hr-table tbody tr', text: 'Thuyết trình' }, label: 'Loại vừa thêm', hold: 4.5 },
        { clear: true, step: 'Bước 2', caption: 'Muốn đổi tên hoặc hệ số: bấm “Sửa” ở dòng đó. Khung phía trên chuyển sang chế độ sửa.', click: { css: '.hr-table tbody tr .hr-button', text: 'Sửa', nth: 6 } },
        { caption: 'Đổi hệ số, ví dụ thành 2, rồi bấm “Lưu”.', fill: coefInput, value: '2' },
        { click: { css: 'form.hr-panel .primary-button' }, hold: 1 },
        { step: 'Lưu ý', caption: 'Đổi hệ số chỉ áp dụng cho điểm nhập sau đó. Điểm đã nhập trước vẫn giữ hệ số lúc nhập, nên điểm trung bình cũ không bị thay đổi.' },
        { step: 'Bước 3', caption: 'Muốn xóa: bấm “Xóa” ở dòng đó rồi xác nhận trong hộp thoại.', click: { css: '.hr-table tbody tr .hr-button', text: 'Xóa', nth: 6 }, hold: 1.5 },
        { highlight: '.work-confirm-modal', hold: 3.5 },
        { clear: true, click: { css: '.work-confirm-modal button', text: 'Hủy' }, hold: 1 },
      ],
    },
  ],
};
