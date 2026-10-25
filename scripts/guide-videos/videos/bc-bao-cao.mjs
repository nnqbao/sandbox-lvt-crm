// Báo cáo → Công việc (lịch công việc theo người, theo kỳ, số liệu đúng hạn / trễ hạn) và Báo cáo → Bán trú.
// Fixtures: guide-shots/harness/fixtures/work.js (reports:workCalendar) + boarding.js (boarding:report).
const nav = (text) => ({ css: '.shell-nav-button', text });
const mode = (text) => ({ css: '.report-mode-switch button', text, exact: true });
const kpi = (nth) => ({ css: '.work-report-summary > div', nth });
const event = (text) => ({ css: '.report-event', text });

export default {
  id: 'bc-bao-cao',
  title: 'Báo cáo',
  intro: 'Menu Báo cáo có hai mục: Công việc cho biết mỗi người được giao gì, hoàn thành đúng hạn hay trễ hạn; Bán trú liệt kê giáo viên tham gia bán trú theo phòng ban.',
  scenes: [
    {
      scenario: 'leader',
      path: '/thong-bao',
      steps: [
        { chapter: 'Mở menu Báo cáo', step: 'Mở trang', caption: 'Ở cột menu bên trái, bấm “Báo cáo”.', click: nav('Báo cáo'), waitFor: '.report-people-panel', hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Ngay dưới menu hiện hai mục con: “Công việc” và “Bán trú”. Mặc định mở “Công việc”.', highlight: '.report-submenu', label: 'Hai mục con', hold: 5 },
        { caption: 'Cột “Nhân sự” bên trái liệt kê những người mình được xem, nhóm theo phòng ban.', highlight: '.report-people-panel', label: 'Nhân sự', hold: 5 },
        { caption: 'Giữa trang là thanh công cụ: tên người đang xem, kỳ đang xem, nút chuyển kỳ và cách xem.', highlight: '.report-calendar-toolbar', hold: 5 },
        { caption: 'Hàng số liệu tóm tắt kỳ đang xem. Bên dưới là lịch, mỗi ô màu là một việc đặt đúng ngày hạn.', highlight: '.work-report-summary', label: 'Số liệu', hold: 6 },
        { chapter: 'Chọn người và kỳ xem', clear: true, step: 'Bước 1', caption: 'Bấm vào tên một người để xem lịch công việc của người đó. Dòng “Lịch của tôi” là của chính mình.', click: { css: '.report-person', text: 'Nguyễn Văn A' }, hold: 1.5 },
        { caption: 'Tiêu đề đổi thành “Lịch công việc của Nguyễn Văn A”.', highlight: '.report-calendar-title', hold: 4 },
        { clear: true, step: 'Bước 2', caption: 'Chọn cách xem: “Tuần”, “Tháng”, “Quý” hoặc “Năm”. Mặc định là “Tháng”.', highlight: '.report-mode-switch', hold: 4 },
        { clear: true, caption: 'Bấm “Tuần” để xem từng ngày từ thứ Hai đến Chủ nhật, mỗi việc ghi đủ tên.', click: mode('Tuần'), hold: 2.5 },
        { caption: 'Dùng mũi tên ‹ › để lùi hoặc tiến một kỳ. Ví dụ bấm › để sang tuần sau.', click: '.report-period-nav button[aria-label="Kỳ sau"]', hold: 2.5 },
        { caption: 'Bấm “Hôm nay” để quay về kỳ có ngày hôm nay.', click: '.report-period-nav .today-button', hold: 2 },
        { caption: 'Xem theo “Quý” hoặc “Năm”: mỗi tháng là một lịch nhỏ, ngày có việc được tô màu kèm số việc.', click: mode('Quý'), hold: 2 },
        { highlight: { css: '.report-mini-month', nth: 0 }, label: 'Tháng 10', hold: 4 },
        { clear: true, caption: 'Bấm vào một ngày có số để mở chi tiết việc của ngày đó.', click: { css: '.report-mini-day.has-events', nth: 3 }, waitFor: '.report-event-detail', hold: 2.5 },
        { clear: true, caption: 'Quay lại cách xem “Tháng” để thấy cả tháng trên một lịch.', click: mode('Tháng'), hold: 2 },
        { chapter: 'Đọc số liệu và chi tiết', step: 'Đọc số liệu', caption: '“Mục công việc trong kỳ”: số việc có hạn nằm trong kỳ đang xem.', highlight: kpi(0), hold: 4 },
        { caption: '“Tổng giao cho cá nhân”: tổng số việc người này được giao.', highlight: kpi(1), hold: 4 },
        { caption: '“Hoàn thành đúng hạn” và “Hoàn thành trễ”: số việc đã xong trước hạn và sau hạn.', highlight: kpi(2), hold: 2.5 },
        { highlight: kpi(3), keep: true, hold: 2.5 },
        { clear: true, caption: '“Chưa hoàn thành”: việc còn đang làm hoặc đã quá hạn mà chưa xong.', highlight: kpi(4), hold: 4 },
        { clear: true, caption: 'Trên lịch, màu xanh lá là việc đã hoàn thành, màu đỏ là việc quá hạn chưa hoàn thành.', highlight: event('Báo cáo kết quả bồi dưỡng'), label: 'Quá hạn', hold: 5 },
        { clear: true, step: 'Bước 3', caption: 'Bấm vào một việc trên lịch để mở khung chi tiết bên phải.', click: event('Nộp giáo án chủ đề'), waitFor: '.report-event-detail', hold: 1.5 },
        { caption: 'Khung chi tiết ghi trạng thái, loại công việc, hạn hoàn thành, phòng ban và công văn gốc.', highlight: '.report-event-detail', label: 'Chi tiết', hold: 6 },
        { caption: '“Chất lượng” là phần trăm người duyệt chấm khi xác nhận hoàn thành; việc chưa duyệt chưa có ô này.', highlight: { css: '.report-event-detail dl > div', text: 'Chất lượng' }, hold: 6 },
        { clear: true, caption: 'Bấm dấu × để đóng khung chi tiết.', click: '.report-detail-close', hold: 1.5 },
        { top: true },
        { caption: 'Bấm “‹ Ẩn nhân sự” để thu cột Nhân sự, lịch rộng hơn; bấm “› Nhân sự” để hiện lại.', click: '.report-panel-toggle', hold: 3 },
      ],
    },
    {
      scenario: 'bgh',
      path: '/bao-cao/cong-viec',
      waitFor: '.report-people-panel',
      steps: [
        { chapter: 'Ai xem được gì', step: 'Phạm vi xem', caption: 'Ban Giám hiệu (quyền Báo cáo “Xem tối cao”) thấy nhân sự toàn trường, nhóm theo từng phòng ban.', highlight: '.report-people-panel', label: 'Toàn trường', hold: 6 },
        { clear: true, caption: 'Tổ trưởng chỉ thấy chính mình và giáo viên cấp dưới trong tổ. Giáo viên chỉ thấy lịch của mình.' },
        { caption: 'Văn thư bị giới hạn theo phòng ban thì chỉ xem được người trong phòng ban đó.' },
        { step: 'Lưu ý', caption: 'Việc chỉ được tính cho người được giao sau khi công việc đã phát hành; việc còn chờ Ban Giám hiệu duyệt chưa tính.' },
        { chapter: 'Báo cáo Bán trú', step: 'Bán trú', caption: 'Mục con “Bán trú”: chọn kỳ bán trú để xem giáo viên tham gia theo từng phòng ban.', click: { css: '.report-submenu button', text: 'Bán trú' }, waitFor: '.boarding-report-stats', hold: 1.5 },
        { caption: 'Ô “Kỳ bán trú” bên phải chọn học kỳ cần xem; mặc định là kỳ mới nhất.', highlight: '.boarding-period-picker label', hold: 4 },
        { caption: 'Hai ô số liệu: số giáo viên tham gia và số phòng ban. Bên dưới là bảng từng phòng ban.', highlight: '.boarding-report-stats', hold: 5 },
        { clear: true, step: 'Lưu ý', caption: 'Menu Báo cáo không có nút xuất file. Báo cáo điểm danh xuất Excel, PDF nằm ở tab “Báo cáo” của Lớp chủ nhiệm.' },
      ],
    },
  ],
};
