// Điểm danh: Giám thị lưu từng lớp, GVCN đánh dấu vắng không phép, Văn thư / quản trị chọn ngày.
// Fixtures: guide-shots/harness/fixtures/attendance.js + homeroom.js.
export default {
  id: 'dd-diem-danh',
  title: 'Điểm danh học sinh',
  intro: 'Giám thị đánh dấu học sinh vắng của từng lớp mỗi buổi sáng. Giáo viên chủ nhiệm xem lớp mình và đánh dấu em nào vắng không phép.',
  scenes: [
    {
      scenario: 'supervisor',
      path: '/thong-bao',
      steps: [
        { chapter: 'Giám thị điểm danh', step: 'Giám thị', caption: 'Ở cột menu bên trái, bấm “Điểm danh”.', click: { css: '.shell-nav-button', text: 'Điểm danh' }, waitFor: '.att-class-list', hold: 1.2 },
        { top: true },
        { caption: 'Đầu trang ghi ngày hôm nay và năm học. Giám thị chỉ điểm danh được ngày hôm nay.', highlight: '.att-head-main', hold: 5 },
        { caption: 'Chọn khối lớp ở các tab. Số “2/5” cạnh tab nghĩa là đã lưu 2 trên 5 lớp của khối.', highlight: '.att-grade-tabs', label: 'Các khối', hold: 6 },
        { caption: 'Lớp đã lưu có nhãn xanh “Đã lưu” kèm giờ lưu và số học sinh vắng. Lớp chưa làm ghi “Chưa điểm danh”.', highlight: { css: '.att-status', text: 'Đã lưu', nth: 0 }, label: 'Đã lưu', hold: 6 },
        { clear: true, step: 'Bước 1', caption: 'Bấm vào tên lớp cần điểm danh, ví dụ Lớp 6/3.', click: { css: '.att-class-head', text: 'Lớp 6/3' }, waitFor: '.att-students', hold: 1.5 },
        { caption: 'Danh sách hiện cả lớp. Mặc định tất cả học sinh đều có mặt.', highlight: '.att-students', hold: 5 },
        { clear: true, step: 'Bước 2', caption: 'Tích ô “Vắng” cạnh tên học sinh vắng. Dòng đó chuyển sang màu hồng.', click: '#att-cls_6_3-cls_6_3_hs05', hold: 2 },
        { caption: 'Tích tiếp cho các em vắng khác.', click: '#att-cls_6_3-cls_6_3_hs08', hold: 2 },
        { caption: 'Thanh dưới cùng đếm số vắng và có mặt, kèm chữ “chưa lưu” khi còn thay đổi chưa lưu.', highlight: '.att-savebar-count', hold: 5 },
        { clear: true, step: 'Bước 3', caption: 'Bấm nút “Lưu lớp 6/3 (2 vắng)”. Thấy dòng “Đã lưu lớp 6/3” là xong; chuyển sang lớp khác.', click: '.att-savebar .primary-button', hold: 3 },
        { step: 'Mẹo', caption: 'Lớp không có ai vắng vẫn nên mở ra và bấm “Lưu … (0 vắng)” để nhãn chuyển sang “Đã lưu”: giáo viên chủ nhiệm và Ban Giám hiệu biết lớp đã được kiểm tra.' },
        { step: 'Chú ý', caption: 'Mỗi lần chỉ mở một lớp. Nếu đã tích mà chưa lưu rồi bấm sang lớp khác, hệ thống sẽ hỏi lại để tránh mất dữ liệu: chọn “Hủy” để quay lại lưu.' },
      ],
    },
    {
      scenario: 'gvcn',
      path: '/lop-chu-nhiem/lop/c_7a2/diem-danh',
      waitFor: '.hr-tabs',
      steps: [
        { chapter: 'Giáo viên chủ nhiệm', step: 'GV chủ nhiệm', caption: 'Giáo viên chủ nhiệm vào “Lớp học” → “Lớp chủ nhiệm”, mở lớp mình rồi chọn tab “Điểm danh”.', highlight: { css: '.hr-tabs button', text: 'Điểm danh' }, label: 'Tab Điểm danh', hold: 6 },
        { caption: 'Chọn ngày bằng mũi tên ‹ › (mặc định hôm nay). Dòng trên cùng cho biết Giám thị lưu lúc nào.', highlight: '.hr-day-strip', hold: 5 },
        { caption: 'Nhóm “Vắng” luôn nằm trên cùng, bên dưới là các em có mặt. Học sinh vắng mặc định là “Vắng có phép”.', highlight: { css: '.hr-att-heading', text: 'Vắng' }, hold: 6 },
        { clear: true, caption: 'Có thể ghi lý do vào “Ghi chú (không bắt buộc)”. Ghi chú tự lưu khi bấm ra ngoài ô.', type: { css: '.hr-att-note input', nth: 0 }, text: 'Gia đình chưa báo, đã gọi điện nhắc' },
        { caption: 'Nếu em vắng không lý do, tích “Vắng không phép”. Dòng chuyển màu đỏ và được lưu ngay.', click: { css: '.hr-att-row.is-absent .hr-att-check', nth: 0 }, hold: 0.4 },
        { js: "const row = document.querySelector('.hr-att-row.is-absent:not(.is-unexcused)'); row.classList.add('is-unexcused'); row.querySelector('.hr-att-check input').checked = true;", hold: 3 },
        { step: 'Lưu ý', caption: 'Giáo viên chủ nhiệm không tự thêm hay bớt học sinh vắng. Nếu Giám thị ghi nhầm, hãy báo Giám thị lưu lại lớp đó.' },
      ],
    },
    {
      scenario: 'clerk',
      path: '/diem-danh',
      state: { attendanceCanChooseDate: true },
      waitFor: '.att-class-list',
      steps: [
        { chapter: 'Văn thư chọn ngày', step: 'Văn thư', caption: 'Văn thư và quản trị viên chọn được ngày đã qua để điểm danh bù hoặc sửa, nhưng không chọn được ngày trong tương lai.', highlight: '.att-date', label: 'Ngày điểm danh', hold: 7 },
      ],
    },
  ],
};
