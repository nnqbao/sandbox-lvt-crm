// Thiết lập giáo viên (Administrator). Fixtures: guide-shots/harness/fixtures/teaching.js.
const modal = '.hr-modal';
const save = '.hr-modal-foot .primary-button';
const cell = (row, col, part) => `.tc-grid tbody tr:nth-child(${row}) td:nth-of-type(${col}) ${part}`;

export default {
  id: 'tl-giao-vien',
  title: 'Thiết lập giáo viên',
  intro: 'Gán Môn giảng dạy, Lớp giảng dạy, Lớp chủ nhiệm và xếp Lịch dạy cho từng giáo viên. Làm lần lượt: môn → lớp → lịch.',
  scenes: [
    {
      scenario: 'admin',
      path: '/thiet-lap-mon-hoc',
      steps: [
        { step: 'Mở trang', caption: 'Ở cột menu bên trái, nhóm “Thiết lập tối cao”, bấm “Thiết lập giáo viên”.', click: { css: '.shell-nav-button', text: 'Thiết lập giáo viên' }, waitFor: '.tc-group', hold: 1.2 },
        { top: true },
        { chapter: 'Tổng quan', step: 'Tổng quan', caption: 'Giáo viên được nhóm theo tổ chuyên môn. Mỗi dòng có Môn giảng dạy, Lớp giảng dạy, Lớp chủ nhiệm và Lịch dạy.', highlight: { css: '.tc-group', nth: 0 }, label: 'Một tổ chuyên môn', hold: 6 },
        { caption: 'Mũi tên ‹ › để chuyển năm học. Mặc định là năm học đang dùng.', highlight: '.tc-year-stepper', label: 'Năm học', hold: 4 },
        { chapter: 'Môn giảng dạy', clear: true, step: 'Bước 1', caption: 'Chọn Môn giảng dạy: bấm biểu tượng bút ở cột “Môn giảng dạy” của giáo viên.', click: '[aria-label="Sửa môn giảng dạy của Ngô Thị L"]', waitFor: modal, hold: 1.5 },
        { caption: 'Tích các môn giáo viên dạy. Một giáo viên có thể dạy nhiều môn, ví dụ Toán và Tin học.', click: { css: '.hr-modal label.hr-switch', text: 'Tin học' }, hold: 2.5 },
        { caption: 'Bấm “Lưu”.', click: save, hold: 1.5 },
        { step: 'Chú ý', caption: 'Giáo viên chưa có Môn giảng dạy thì nút (+) ở cột Lớp giảng dạy bị mờ. Bấm vào sẽ thấy lời nhắc chọn môn trước.', click: '[aria-label="Thêm lớp giảng dạy của Hoàng Văn E"]', hold: 1 },
        { highlight: '.tc-cell-hint', label: 'Lời nhắc', hold: 4 },
        { chapter: 'Lớp giảng dạy', clear: true, step: 'Bước 2', caption: 'Chọn Lớp giảng dạy: bấm (+) ở cột “Lớp giảng dạy”.', click: '[aria-label="Thêm lớp giảng dạy của Đặng Văn M"]', waitFor: modal, hold: 1.5 },
        { caption: 'Các lớp được nhóm theo khối. Tích tất cả các lớp giáo viên dạy trong năm học.', highlight: { css: '.hr-modal .tc-pick-group', nth: 0 }, hold: 4 },
        { clear: true, click: { css: '.hr-modal .tc-pick', text: 'Lớp 8/1' }, hold: 1 },
        { click: { css: '.hr-modal .tc-pick', text: 'Lớp 9/1' }, hold: 1.5 },
        { caption: 'Bấm “Lưu”. Khi xếp lịch dạy, chỉ những lớp này được hiện ra.', click: save, hold: 1.5 },
        { chapter: 'Lớp chủ nhiệm', step: 'Bước 3', caption: 'Chọn Lớp chủ nhiệm: bấm (+) ở cột “Lớp chủ nhiệm”.', click: '[aria-label="Thêm lớp chủ nhiệm của Nguyễn Văn A"]', waitFor: modal, hold: 1.5 },
        { caption: 'Mỗi giáo viên chủ nhiệm một lớp. Lớp đang có giáo viên chủ nhiệm khác sẽ ghi tên người đó; chọn lớp này sẽ thay giáo viên chủ nhiệm từ hôm nay.', highlight: { css: '.hr-modal .tc-pick', text: 'Lớp 7/2' }, hold: 7 },
        { clear: true, caption: 'Chọn lớp, rồi bấm “Lưu”.', click: { css: '.hr-modal .tc-pick', text: 'Lớp 7/1' }, hold: 1.2 },
        { click: save, hold: 1.5 },
        { chapter: 'Thêm lịch dạy', step: 'Bước 4', caption: 'Xếp Lịch dạy: bấm “Xem lịch” ở dòng của giáo viên.', click: { css: 'button', text: 'Xem lịch', within: { css: 'tr', text: 'Lê Thị D' } }, waitFor: { css: 'button', text: 'Thêm lịch dạy' }, hold: 1.5 },
        { top: true },
        { caption: 'Đây là lịch dạy cả năm của giáo viên, xem theo Danh sách, Tuần, Tháng, Quý hoặc Năm.', highlight: '.hr-segment', hold: 4 },
        { clear: true, caption: 'Bấm “Thêm lịch dạy” ở góc phải.', click: { css: 'button', text: 'Thêm lịch dạy' }, waitFor: '.tc-class-link', hold: 1.5 },
        { caption: 'Chỉ hiện các Lớp giảng dạy đã chọn ở Bước 2, nhóm theo khối. Bấm vào lớp cần xếp lịch.', click: { css: '.tc-class-link', text: 'Lớp 7/2' }, waitFor: '.tc-grid', hold: 1.5 },
        { top: true },
        { caption: 'Lưới gồm các thứ trong tuần và 10 tiết: 5 tiết sáng, 5 tiết chiều. Ô xám là tiết đã có giáo viên khác hoặc giáo viên đang dạy lớp khác cùng giờ.', highlight: '.tc-grid', hold: 7 },
        { clear: true, caption: 'Trước tiên chọn “Áp dụng từ ngày”: lịch áp dụng cho mọi ngày học từ ngày này đến hết năm học; các ngày trước giữ nguyên. Đổi ngày sau khi đã tick sẽ xóa các ô vừa tick.', fill: { css: '.tc-savebar label.hr-field input' }, value: '2026-10-26' },
        { caption: 'Tích vào ô đúng thứ và tiết giáo viên dạy.', click: cell(7, 1, 'label'), hold: 1.2 },
        { caption: 'Giáo viên dạy nhiều môn phải chọn môn cho từng tiết.', choose: cell(7, 1, 'select'), option: 'Tin học' },
        { caption: 'Tích thêm tiết khác. Tiết chưa chọn môn có viền đỏ, và nút Lưu bị khóa cho đến khi chọn đủ.', click: cell(8, 1, 'label'), hold: 1 },
        { highlight: 'select.is-missing', label: 'Chưa chọn môn', hold: 3.5 },
        { clear: true, choose: cell(8, 1, 'select'), option: 'Toán' },
        { caption: 'Kiểm tra số tiết thay đổi ở thanh dưới cùng rồi bấm “Lưu lịch dạy”.', click: '.tc-savebar .primary-button', hold: 1.5 },
        { step: 'Lưu ý', caption: 'Không bỏ được một Lớp giảng dạy khi giáo viên còn tiết ở lớp đó: hãy xóa các tiết trước. Sang năm học mới, Lớp giảng dạy và Lớp chủ nhiệm bắt đầu trống.' },
      ],
    },
  ],
};
