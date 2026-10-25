// Lịch công tác (giáo viên): lịch cá nhân, xác nhận tham gia, Lịch công tác chung và Tải PDF.
// Fixtures: guide-shots/harness/fixtures/duties.js (tuần 19–24/10/2026, "hôm nay" Thứ Tư 21/10 09:00).
const row = (text) => ({ css: '.lct-table tbody tr', text });

// Mocked mutations do not refetch: show the saved "Đã tham gia" state the way the screen repaints it.
// The detail panel is position:fixed; the recorder scrolls the window to keep targets above the
// caption bar, so pin the panel to the page (same place on screen) and let it scroll with it.
// Blank room under the page lets the window scroll far enough to lift the buttons above the caption.
const PIN_DETAIL = `
  document.body.style.paddingBottom = '360px';
  const panel = document.querySelector('.report-event-detail');
  const before = panel.getBoundingClientRect();
  Object.assign(panel.style, { position: 'absolute', right: 'auto', animation: 'none' });
  const after = panel.getBoundingClientRect();
  const style = getComputedStyle(panel);
  panel.style.top = (parseFloat(style.top) + before.top - after.top) + 'px';
  panel.style.left = (parseFloat(style.left) + before.left - after.left) + 'px';
`;

const MARK_ATTENDED = `
  const panel = document.querySelector('.report-event-detail');
  const pill = panel.querySelector('.report-detail-status');
  pill.className = 'report-detail-status status-attended';
  pill.textContent = 'Đã tham gia';
  panel.querySelector('.report-detail-attendance .attend-btn:not(.absent)').classList.add('active');
`;

export default {
  id: 'ct-lich-cong-tac',
  title: 'Lịch công tác: xem lịch và xác nhận tham gia',
  intro: 'Xem lịch công tác của mình và lịch chung toàn trường, xác nhận đã tham gia một công tác và tải lịch tuần dạng PDF.',
  scenes: [
    {
      scenario: 'teacher',
      path: '/thong-bao',
      state: { strictDutyPeople: true },
      steps: [
        { chapter: 'Lịch công tác cá nhân', step: 'Mở trang', caption: 'Ở cột menu bên trái, bấm “Lịch công tác”.', click: { css: '.shell-nav-button', text: 'Lịch công tác' }, waitFor: '.report-workspace', hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Trang có hai tab: “Lịch công tác cá nhân” mở sẵn, và “Lịch công tác chung” của toàn trường.', highlight: '.duty-workspace-tabs', label: 'Hai tab', hold: 5 },
        { caption: 'Cột “Nhân sự” chọn sẵn “Lịch của tôi”. Tổ trưởng và Ban Giám hiệu thấy thêm tên người khác, bấm vào để xem lịch của họ.', highlight: '.report-people-panel', label: 'Nhân sự', hold: 6 },
        { caption: 'Chọn cách xem: List, Tuần, Tháng hoặc Năm. Trang mở sẵn dạng Tuần.', highlight: '.report-mode-switch', label: 'Cách xem', hold: 5 },
        { caption: 'Mũi tên ‹ › chuyển sang kỳ trước hoặc sau; bấm “Hôm nay” để quay về tuần hiện tại.', highlight: '.report-period-nav', label: 'Chuyển kỳ', hold: 5 },
        { caption: 'Dòng số liệu đếm số công tác trong kỳ, số đã tham gia và số chưa xác nhận.', highlight: '.report-summary-row', hold: 5 },
        { caption: 'Bảng tuần theo mẫu văn bản của trường, gồm các cột Ngày, Thời gian, Nội dung, Địa điểm và Thành phần.', highlight: '.report-calendar-stage .lct-table thead', label: 'Các cột', hold: 6 },
        { chapter: 'Xác nhận tham gia', clear: true, step: 'Bước 1', caption: 'Bấm vào một dòng công tác để xem chi tiết, ví dụ “Dự giờ tiết Toán lớp 7/2” đang diễn ra.', click: row('Dự giờ tiết Toán lớp 7/2'), waitFor: '.report-event-detail', hold: 1.5 },
        { js: PIN_DETAIL, hold: 0.1 },
        { caption: 'Khung chi tiết hiện bên phải: thời gian, ngày, địa điểm, nội dung và “Hình thức gán” (theo phòng ban hay gán cá nhân).', highlight: '.report-event-detail dl', hold: 6 },
        { clear: true, step: 'Bước 2', caption: 'Khi đang có mặt ở công tác, bấm “Đã tham gia”.', click: { css: '.report-detail-attendance .attend-btn', text: 'Đã tham gia' }, hold: 0.4 },
        { js: MARK_ATTENDED, hold: 1.5 },
        { caption: 'Nhãn đầu khung chuyển thành “Đã tham gia”. Bấm nhầm thì bấm “Chưa tham gia” để đổi lại, khi công tác vẫn đang diễn ra.', highlight: '.report-detail-status', hold: 6 },
        { clear: true, caption: 'Bấm “×” ở góc khung để đóng chi tiết.', highlight: '.report-detail-close', hold: 2.5 },
        { act: { click: '.report-detail-close' }, hold: 0.6 },
        { clear: true, step: 'Lưu ý', caption: 'Thử mở một công tác chưa đến giờ, ví dụ “Tập huấn sử dụng CRM” chiều thứ Năm.', click: row('Tập huấn sử dụng CRM'), waitFor: '.report-event-detail', hold: 1.5 },
        { js: PIN_DETAIL, hold: 0.1 },
        { caption: 'Hai nút bị khóa và ghi “Chưa đến giờ diễn ra”. Chỉ xác nhận được trong lúc công tác diễn ra; kết thúc rồi thì không đổi được nữa.', highlight: '.report-detail-attendance', hold: 7 },
        { act: { click: '.report-detail-close' }, hold: 0.6 },
        { chapter: 'Xem dạng List', clear: true, step: 'Dạng List', caption: 'Bấm “List” để xem dạng thẻ, dễ đọc trên điện thoại.', click: { css: '.report-mode-switch button', text: 'List', exact: true }, waitFor: '.report-list-tabs', hold: 1.5 },
        { caption: 'Bấm “Ẩn nhân sự” để thu gọn cột Nhân sự, thẻ công tác sẽ rộng và dễ đọc hơn.', click: '.report-panel-toggle', hold: 1.5 },
        { caption: 'Hai tab “Công tác chưa diễn ra” và “Công tác đã diễn ra”, cùng ô tìm kiếm theo tên hoặc nội dung.', highlight: '.report-list-tabs', hold: 3 },
        { highlight: '.report-calendar-search', keep: true, hold: 2.5 },
        { clear: true, caption: 'Mỗi thẻ có giờ, nội dung, địa điểm và người tham gia. Công tắc bên cạnh bật nhắc nhở riêng cho công tác đó.', highlight: { css: '.duty-modern-card', nth: 0 }, hold: 6 },
        { chapter: 'Lịch công tác chung · Tải PDF', top: true },
        { clear: true, step: 'Lịch chung', caption: 'Bấm tab “Lịch công tác chung” để xem lịch toàn trường.', click: { css: '.duty-workspace-tabs button', text: 'Lịch công tác chung' }, waitFor: '.lct-sheet', hold: 1.5 },
        { caption: 'Đây là lịch tuần của cả trường, đúng mẫu văn bản nhà trường ban hành. Giáo viên chỉ thấy lịch đã được Ban Giám hiệu duyệt.', highlight: '.lct-official-header', hold: 6 },
        { clear: true, caption: 'Công tác riêng của tổ (do tổ trưởng, tổ phó tạo) chỉ hiện ở lịch cá nhân, không có trên lịch chung.' },
        { caption: 'Chọn “Tuần” hoặc “Tháng”; dùng ‹ Hôm nay › để chuyển kỳ.', highlight: '.lct-shared-toolbar-center', hold: 5 },
        { caption: 'Bấm biểu tượng tin nhắn cạnh một công tác để trao đổi với những người cùng tham gia.', highlight: { css: '.lct-table .work-chat-button', nth: 0 }, label: 'Trao đổi', hold: 5 },
        { clear: true, step: 'Tải PDF', caption: 'Bấm “Tải PDF” để tải đúng bảng đang xem về máy, dùng để in hoặc gửi.', point: { css: '.lct-download button', text: 'Tải PDF' }, hold: 4 },
        { step: 'Lưu ý', caption: 'Bấm › để sang tuần sau.', click: '.lct-period-nav button[aria-label="Kỳ sau"]', waitFor: '.lct-unapproved-notice', hold: 1.2 },
        { caption: 'Tuần Ban Giám hiệu chưa duyệt sẽ ghi “Lịch tuần này chưa được duyệt”. Khi tuần được duyệt, lịch hiện ra và thầy cô nhận thông báo.', highlight: '.lct-unapproved-notice', hold: 7 },
      ],
    },
  ],
};
