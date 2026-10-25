// Thiết lập môn học (Administrator). Fixtures: guide-shots/harness/fixtures/teaching.js.
const form = 'form.hr-panel';
const nameInput = { css: 'form.hr-panel input', nth: 0 };
const codeInput = { css: 'form.hr-panel input', nth: 1 };
const added = [{ _id: 'sub_kns', name: 'Kỹ năng sống', code: 'KNS', active: true }];

export default {
  id: 'tl-mon-hoc',
  title: 'Thiết lập môn học',
  intro: 'Danh mục môn học dùng cho Môn giảng dạy của giáo viên, Lịch dạy và Học bạ. Video này hướng dẫn thêm, sửa và xóa một môn.',
  scenes: [
    {
      scenario: 'admin',
      path: '/thiet-lap-nam-hoc',
      steps: [
        { step: 'Mở trang', caption: 'Ở cột menu bên trái, tìm nhóm “Thiết lập tối cao” và bấm “Thiết lập môn học”.', click: { css: '.shell-nav-button', text: 'Thiết lập môn học' }, waitFor: form, hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Phía trên là khung “Thêm môn học”. Phía dưới là danh sách các môn đang dùng.', highlight: form, label: 'Khung thêm môn học', hold: 3 },
        { highlight: '.hr-table', label: 'Danh sách môn học', hold: 3 },
        { clear: true, caption: 'Hệ thống đã tạo sẵn các môn THCS theo chương trình GDPT 2018, nên thường chỉ cần thêm môn riêng của trường.' },
        { step: 'Bước 1', caption: 'Thêm môn mới: bấm vào ô “Tên môn học” và gõ tên môn, ví dụ “Kỹ năng sống”.', type: nameInput, text: 'Kỹ năng sống' },
        { caption: 'Gõ “Mã” môn: viết tắt, không dấu, ví dụ KNS. Mã giúp phân biệt các môn có tên gần giống nhau.', type: codeInput, text: 'KNS' },
        { caption: 'Bấm nút “Thêm”.', click: { css: 'form.hr-panel .primary-button' }, hold: 0.8 },
      ],
    },
    {
      scenario: 'admin',
      path: '/thiet-lap-mon-hoc',
      state: { extraSubjects: added },
      waitFor: form,
      steps: [
        { caption: 'Môn mới xuất hiện ở cuối danh sách và dùng được ngay khi chọn Môn giảng dạy cho giáo viên.', highlight: { css: '.hr-table tbody tr', text: 'Kỹ năng sống' }, label: 'Môn vừa thêm', hold: 4 },
        { clear: true, step: 'Bước 2', caption: 'Muốn đổi tên hoặc mã: bấm “Sửa” ở dòng của môn đó.', click: { css: '.hr-table tbody tr .hr-button', text: 'Sửa', nth: 12 } },
        { caption: 'Khung phía trên chuyển thành “Sửa: …” và điền sẵn thông tin hiện tại.', highlight: form, label: 'Đang sửa', hold: 3.5 },
        { clear: true, caption: 'Sửa lại tên cho đúng, ví dụ “Giáo dục kỹ năng sống”.', type: nameInput, text: 'Giáo dục kỹ năng sống' },
        { caption: 'Bấm “Lưu” để lưu thay đổi. Nếu đổi ý, bấm “Hủy sửa”.', point: { css: 'form.hr-panel .primary-button' }, hold: 2.5 },
        { click: { css: 'form.hr-panel .primary-button' }, hold: 1 },
        { step: 'Bước 3', caption: 'Muốn xóa một môn: bấm “Xóa” ở dòng đó. Hệ thống sẽ hỏi lại trước khi xóa.', click: { css: '.hr-table tbody tr .hr-button', text: 'Xóa', nth: 12 }, hold: 1.5 },
        { caption: 'Bấm “Xóa” trong hộp xác nhận để xóa hẳn, hoặc “Hủy” để giữ lại môn.', highlight: '.work-confirm-modal', hold: 4 },
        { clear: true, click: { css: '.work-confirm-modal button', text: 'Hủy' }, hold: 1 },
        { step: 'Lưu ý', caption: 'Không xóa được môn đang có trong lịch dạy hiện tại. Điểm và lịch dạy cũ vẫn giữ tên môn như lúc nhập.' },
      ],
    },
  ],
};
