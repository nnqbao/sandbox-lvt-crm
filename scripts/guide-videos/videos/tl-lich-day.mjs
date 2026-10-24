// Thiết lập lịch dạy (Administrator). Fixtures: guide-shots/harness/fixtures/teaching.js.
const cell = (row, col) => `.tc-grid tbody tr:nth-child(${row}) td:nth-of-type(${col}) select`;

export default {
  id: 'tl-lich-day',
  title: 'Thiết lập lịch dạy',
  intro: 'Xếp thời khóa biểu theo từng lớp: chọn giáo viên dạy mỗi tiết. Muốn xếp theo từng giáo viên thì dùng Thiết lập giáo viên → Thêm lịch dạy.',
  scenes: [
    {
      scenario: 'admin',
      path: '/thiet-lap-mon-hoc',
      steps: [
        { step: 'Mở trang', caption: 'Ở cột menu bên trái, nhóm “Thiết lập tối cao”, bấm “Thiết lập lịch dạy”.', click: { css: '.shell-nav-button', text: 'Thiết lập lịch dạy' }, waitFor: '.tc-group-head', hold: 1.2 },
        { top: true },
        { step: 'Bước 1', caption: 'Kiểm tra năm học ở mũi tên ‹ ›. Mặc định là năm học đang dùng.', highlight: '.tc-year-stepper', label: 'Năm học', hold: 4 },
        { clear: true, caption: 'Bấm vào khối để xổ ra các lớp của khối đó.', click: { css: '.tc-group-head', text: 'Khối 7' }, hold: 1.5 },
        { caption: 'Bấm vào lớp cần xếp lịch. Bên phải ghi số tiết/tuần đã xếp.', click: { css: '.tc-class-link', text: 'Lớp 7/2' }, waitFor: '.tc-grid', hold: 1.5 },
        { top: true },
        { step: 'Bước 2', caption: 'Khung xanh cho biết năm học từ ngày nào đến ngày nào, số ngày nghỉ lễ và số ngày học sẽ áp dụng.', highlight: '.hr-notice', hold: 6 },
        { clear: true, caption: 'Trước tiên chọn “Áp dụng từ ngày”. Lịch mới áp dụng từ ngày này đến hết năm học; các ngày trước giữ nguyên giáo viên cũ. Đổi ngày sau khi đã chọn sẽ xóa các ô vừa đổi.', fill: { css: '.tc-savebar label.hr-field input' }, value: '2026-10-26' },
        { step: 'Bước 3', caption: 'Mỗi ô là một tiết trong tuần. Bấm vào ô và chọn giáo viên; mỗi lựa chọn ghi “Tên · Môn”.', choose: cell(3, 1), option: 'Lý Thị N' },
        { caption: 'Ô vừa đổi có viền vàng để dễ nhận ra.', highlight: '.tc-cell.is-changed', label: 'Ô vừa đổi', hold: 4 },
        { clear: true, caption: 'Muốn bỏ một tiết, chọn “— Trống —”. Giáo viên đang dạy lớp khác cùng tiết sẽ bị mờ và ghi “đang dạy …”.', choose: cell(4, 2), option: '— Trống —' },
        { caption: 'Kiểm tra số tiết thay đổi ở thanh dưới cùng rồi bấm “Lưu lịch dạy”.', click: '.tc-savebar .primary-button', hold: 1.5 },
        { step: 'Lưu ý', caption: 'Mỗi lớp chỉ hiện các giáo viên có lớp đó trong “Lớp giảng dạy” (Thiết lập giáo viên). Lịch tự bỏ các ngày nghỉ lễ trong Thiết lập năm học.' },
      ],
    },
  ],
};
