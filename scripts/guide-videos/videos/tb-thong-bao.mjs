// Thông báo: chuông góc phải + trang /thong-bao (mở đúng mục, đánh dấu đã đọc, xóa).
// Fixtures: guide-shots/harness/fixtures/social.js (state.notificationsRead / notificationsCanDelete).
const bell = '.notification-bell-button';

export default {
  id: 'tb-thong-bao',
  title: 'Thông báo',
  intro: 'Chuông thông báo nhắc lịch công tác, công việc sắp đến hạn và tin nhắn mới trong nhóm. Bấm vào thông báo là mở đúng chỗ cần xử lý.',
  scenes: [
    {
      scenario: 'teacher',
      path: '/cong-viec',
      steps: [
        { chapter: 'Chuông thông báo', step: 'Mở chuông', caption: 'Chuông thông báo nằm ở góc phải trên cùng, có trên mọi trang. Số đỏ là số thông báo chưa đọc.', highlight: bell, label: 'Chuông', hold: 5 },
        { clear: true, step: 'Bước 1', caption: 'Bấm vào chuông để xem nhanh các thông báo gần nhất.', click: bell, waitFor: '.notification-popover', hold: 1.5 },
        { caption: 'Đầu khung ghi số thông báo chưa đọc. Khung hiện tối đa 10 thông báo mới nhất.', highlight: '.notification-popover header', hold: 5 },
        { caption: 'Mỗi dòng ghi loại và mốc nhắc, ví dụ “Công tác · Còn 5 giờ”, rồi đến tên và mô tả. Dòng chưa đọc có nền xanh nhạt.', highlight: { css: '.notification-popover-item', nth: 0 }, hold: 6 },
        { caption: 'Dòng chữ đỏ “Từ chối hoàn thành” là bài nộp bị trả về: cần sửa rồi nộp lại.', highlight: '.notification-popover-item.is-rejection', hold: 5 },
        { clear: true, step: 'Bước 2', caption: 'Bấm vào một thông báo để mở đúng chỗ, ví dụ tin nhắn mới trong nhóm “GVCN khối 7”.', click: { css: '.notification-popover-item', text: 'GVCN khối 7' }, waitFor: '.chat-hub-thread .work-chat-bubble', hold: 1.5 },
        { caption: 'Trang Trao đổi mở đúng nhóm đó. Thông báo vừa bấm được tính là đã đọc.', highlight: '.chat-hub-thread', hold: 5 },
      ],
    },
    {
      scenario: 'teacher',
      path: '/cong-viec',
      steps: [
        { chapter: 'Trang Thông báo', clear: true, step: 'Bước 3', caption: 'Muốn xem tất cả: bấm chuông, rồi bấm “Xem toàn bộ” ở cuối khung.', click: bell, waitFor: '.notification-popover', hold: 1.2 },
        { click: '.notification-popover-footer', waitFor: '.notifications-view', hold: 1.5 },
        { top: true },
        { step: 'Trang Thông báo', caption: 'Trang Thông báo chia theo Công tác, Trao đổi nhóm và Công việc. Con số ở góc mỗi cột là số thông báo.', highlight: '.notification-category-grid', hold: 6 },
        { caption: 'Dòng trên cùng ghi các mốc nhắc nhà trường đang dùng, ví dụ công tác nhắc trước 24 giờ, 12 giờ và khi đến hạn.', highlight: '.notifications-toolbar p', hold: 6 },
        { caption: 'Mỗi thẻ ghi mốc nhắc, hạn, tên và mô tả. Chấm đỏ bên phải là thông báo chưa đọc.', highlight: { css: '.notification-card.is-unread', nth: 0 }, hold: 5 },
        { caption: 'Thẻ đã đọc hiện mờ hơn và không còn chấm đỏ.', highlight: { css: '.notification-card.is-read', nth: 0 }, hold: 4 },
        { caption: 'Thẻ nền hồng có dấu chấm than đỏ, ghi “Cần nộp lại”, là bài nộp bị trả về, kèm lý do.', highlight: '.notification-card.is-rejection', hold: 5 },
        { clear: true, step: 'Bước 4', caption: 'Bấm vào một thẻ để mở đúng việc đó, ví dụ “Chuẩn bị đề kiểm tra giữa kỳ Toán 7”.', click: { css: '.notification-card-main', text: 'Chuẩn bị đề kiểm tra giữa kỳ Toán 7' }, waitFor: '.is-notification-focus', wait: 200, hold: 1.2 },
        { caption: 'Menu Công việc mở ra và viền sáng đúng công việc đó trong giây lát.', highlight: '.is-notification-focus', hold: 4 },
      ],
    },
    {
      scenario: 'teacher',
      path: '/thong-bao',
      waitFor: '.notifications-view',
      steps: [
        { chapter: 'Đánh dấu đã đọc', clear: true, step: 'Bước 5', caption: 'Đã xem hết? Bấm “Đánh dấu tất cả là đã đọc”.', click: '.notifications-toolbar button', hold: 1 },
      ],
    },
    {
      scenario: 'teacher',
      path: '/thong-bao',
      state: { notificationsRead: true, notificationsCanDelete: true },
      waitFor: '.notifications-view',
      steps: [
        { caption: 'Mọi thẻ chuyển sang đã đọc và số đỏ trên chuông biến mất.', highlight: bell, label: 'Hết số đỏ', hold: 5 },
        { clear: true, step: 'Mẹo', caption: 'Không cần một thông báo nữa? Bấm dấu × ở góc thẻ để xóa khỏi danh sách của mình.', highlight: { css: '.notification-dismiss-button', nth: 0 }, label: 'Xóa', hold: 5 },
        { clear: true, step: 'Lưu ý', caption: 'Ban Giám hiệu nhận “Công việc chờ duyệt” mỗi khi Văn thư gửi hoặc gửi lại công việc cần duyệt.' },
        { caption: 'Văn thư nhận “Công việc đã được duyệt” hoặc “Công việc bị trả lại” kèm lý do. Người nhận chỉ thấy “Mới phân công” khi công việc đã được duyệt đủ.' },
        { step: 'Mẹo', caption: 'Cài ứng dụng LVT CRM trên điện thoại để nhận thông báo đẩy ngay cả khi không mở trình duyệt.' },
      ],
    },
  ],
};
