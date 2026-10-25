// Trao đổi (chat hub, /trao-doi): danh sách, cuộc trò chuyện theo công việc / công tác, gửi và thu hồi
// tin nhắn, tạo nhóm, quản lý thành viên (chủ nhóm), rời nhóm. Fixtures: guide-shots/harness/fixtures/social.js
// (state.chatSent / chatRecalled / newGroup / leftGroup + mutation chatHub:createGroup).
const filter = (text) => ({ css: '.chat-filters button', text, exact: true });
const conversation = (text) => ({ css: '.chat-conversation', text });
const membersButton = { css: '.chat-thread-head .chat-text-button', text: 'thành viên' };
const editor = '.chat-hub-thread .work-chat-editor';
const SENT = 'Lớp 7/2 có 8 em tham gia ạ.';

/** The composer is a contenteditable box: type it in a few chunks (insertText fires React's input event). */
function typeChat(text, chunks = 7) {
  const size = Math.ceil(text.length / chunks);
  const steps = [];
  for (let i = 0; i < text.length; i += size) {
    const part = JSON.stringify(text.slice(i, i + size));
    steps.push({ js: `const e = document.querySelector('${editor}'); e.focus(); document.execCommand('insertText', false, ${part});`, wait: 60, hold: 0.14 });
  }
  steps[steps.length - 1].hold = 1;
  return steps;
}

export default {
  id: 'td-trao-doi',
  title: 'Trao đổi: nhắn tin và nhóm',
  intro: 'Nhắn tin với đồng nghiệp ngay trong CRM: theo từng công việc, công tác hoặc trong nhóm. Video hướng dẫn gửi, thu hồi tin nhắn, tạo nhóm, quản lý thành viên và rời nhóm.',
  scenes: [
    {
      scenario: 'teacher',
      path: '/cong-viec',
      steps: [
        { chapter: 'Danh sách cuộc trò chuyện', step: 'Mở trang', caption: 'Trao đổi nằm ở góc phải trên cùng, có trên mọi trang: biểu tượng tin nhắn cạnh chuông thông báo. Số đỏ là số tin chưa đọc.', highlight: '.header-chat-button', label: 'Trao đổi', hold: 5 },
        { clear: true, caption: 'Bấm biểu tượng tin nhắn để mở trang Trao đổi.', click: '.header-chat-button', waitFor: '.chat-hub-list', hold: 1.2 },
        { top: true },
        { clear: true, step: 'Tổng quan', caption: 'Cột bên trái là danh sách cuộc trò chuyện, cuộc có tin mới nhất nằm trên cùng.', highlight: '.chat-hub-list', hold: 5 },
        { caption: 'Mỗi dòng ghi tên, tin nhắn cuối và giờ gửi. Con số bên phải là số tin chưa đọc.', highlight: { css: '.chat-conversation', nth: 0 }, hold: 5 },
        { caption: 'Có ba loại: biểu tượng lịch là Công tác, biểu tượng túi là Công việc, chữ viết tắt là Nhóm.', highlight: '.chat-conversation-list', hold: 6 },
        { clear: true, step: 'Mẹo', caption: 'Màn hình nhỏ? Bấm nút ‹ cạnh tên trang để ẩn menu bên trái, khung Trao đổi sẽ rộng hơn.', click: '.sidebar-collapse-button', hold: 1.5 },
        { step: 'Tổng quan', caption: 'Lọc nhanh bằng các nút “Tất cả”, “Công tác”, “Công việc”, “Nhóm”, hoặc gõ tên vào ô tìm kiếm.', highlight: '.chat-filters', label: 'Bộ lọc', hold: 5 },
        { clear: true, chapter: 'Trao đổi theo công việc, công tác', step: 'Bước 1', caption: 'Bấm “Công việc” để chỉ xem các cuộc trò chuyện gắn với công việc.', click: filter('Công việc'), hold: 1.5 },
        { caption: 'Bấm vào cuộc trò chuyện để mở, ví dụ “Kế hoạch dạy học học kỳ I”.', click: conversation('Kế hoạch dạy học học kỳ I'), waitFor: '.chat-hub-thread .work-chat-bubble', hold: 1.5 },
        { caption: 'Khung bên phải hiện toàn bộ tin nhắn. Người đọc được là những người liên quan đến công việc: người giao và người nhận.', highlight: '.chat-hub-thread .work-chat-list', hold: 6 },
        { caption: 'Bấm “Mở công việc” để chuyển sang đúng công việc đó trong menu Công việc.', highlight: { css: '.chat-thread-head .chat-text-button', text: 'Mở công việc' }, label: 'Mở công việc', hold: 5 },
        { clear: true, caption: 'Tương tự, bấm “Công tác” rồi chọn một buổi trong Lịch công tác.', click: filter('Công tác'), hold: 1.2 },
        { click: conversation('Họp Hội đồng sư phạm'), waitFor: '.chat-hub-thread .work-chat-bubble', hold: 1.5 },
        { caption: 'Nút “Mở công tác” đưa về đúng buổi công tác đó.', highlight: { css: '.chat-thread-head .chat-text-button', text: 'Mở công tác' }, label: 'Mở công tác', hold: 4.5 },
        { clear: true, step: 'Mẹo', caption: 'Trên thẻ công việc và dòng lịch công tác cũng có biểu tượng tin nhắn: bấm vào là mở đúng cuộc trò chuyện này.' },
        { chapter: 'Gửi và thu hồi tin nhắn', step: 'Bước 2', caption: 'Bấm “Tất cả”, rồi mở nhóm “GVCN khối 7”.', click: filter('Tất cả'), hold: 0.8 },
        { click: conversation('GVCN khối 7'), waitFor: '.chat-hub-thread .work-chat-bubble', hold: 1.5 },
        { caption: 'Tin của mình có nền xanh nhạt, ảnh đại diện bên phải. Mỗi tin ghi tên người gửi và giờ gửi.', highlight: { css: '.chat-hub-thread .work-chat-bubble.is-self', nth: 0 }, label: 'Tin của mình', hold: 5 },
        { clear: true, caption: 'Gõ nội dung vào ô “Nhập tin nhắn…” ở cuối khung.', highlight: '.chat-hub-thread .work-chat-editor', hold: 1.5 },
        ...typeChat(SENT),
        { caption: 'Thanh phía trên ô soạn tin dùng để in đậm, in nghiêng, gạch chân hoặc tạo danh sách.', highlight: '.chat-hub-thread .work-chat-toolbar', hold: 5 },
        { clear: true, caption: 'Bấm “Gửi”. Trên máy tính có thể bấm Ctrl + Enter.', highlight: '.chat-hub-thread .work-chat-composer-actions .work-primary-button', label: 'Gửi', hold: 2.5 },
        { act: { click: '.chat-hub-thread .work-chat-composer-actions .work-primary-button' }, hold: 1 },
      ],
    },
    {
      scenario: 'teacher',
      path: '/trao-doi/nhom/grp_khoi7',
      state: { chatSent: true },
      waitFor: '.chat-hub-thread .work-chat-bubble',
      steps: [
        { caption: 'Tin vừa gửi hiện ở cuối khung, mọi thành viên nhóm đều thấy.', highlight: { css: '.chat-hub-thread .work-chat-bubble.is-self', text: SENT }, label: 'Tin vừa gửi', hold: 5 },
        { clear: true, step: 'Bước 3', caption: 'Gửi nhầm? Bấm dấu × ở góc tin nhắn của mình để thu hồi.', click: { css: '.chat-hub-thread .work-chat-bubble.is-self .work-chat-recall', nth: 1 }, hold: 0.8 },
      ],
    },
    {
      scenario: 'teacher',
      path: '/trao-doi/nhom/grp_khoi7',
      state: { chatRecalled: true, chatDirectoryNoSelf: true },
      waitFor: '.chat-hub-thread .work-chat-recalled',
      steps: [
        { caption: 'Nội dung được thay bằng dòng “Tin nhắn đã được thu hồi” cho mọi người.', highlight: { css: '.chat-hub-thread .work-chat-bubble.is-recalled' }, hold: 5 },
        { clear: true, step: 'Lưu ý', caption: 'Chỉ thu hồi được tin của chính mình, trong vòng 15 phút sau khi gửi. Quá 15 phút, dấu × không còn hiện.' },
        { chapter: 'Tạo nhóm', step: 'Bước 4', caption: 'Muốn lập nhóm nhắn tin riêng: bấm “Tạo nhóm” phía trên danh sách.', click: { css: '.chat-list-toolbar .chat-text-button', text: 'Tạo nhóm' }, waitFor: '.chat-dialog', hold: 1.5 },
        { caption: 'Gõ “Tên nhóm”, ví dụ “Dự giờ khối 7”.', type: { css: '.chat-dialog .chat-field input' }, text: 'Dự giờ khối 7' },
        { caption: 'Tìm người theo tên, email hoặc tổ. Ví dụ gõ “Toán” để lọc giáo viên Tổ Toán – Tin.', type: '.chat-dialog .chat-member-picker input[type=search]', text: 'Toán' },
        { caption: 'Tích chọn từng thành viên.', click: { css: '.chat-dialog .chat-member-options label', text: 'Lê Thị D' }, hold: 1 },
        { click: { css: '.chat-dialog .chat-member-options label', text: 'Ngô Thị L' }, hold: 1.5 },
        { caption: 'Bấm “Tạo nhóm”. Nút chỉ bấm được khi đã có tên nhóm và ít nhất một thành viên.', click: '.chat-dialog footer .work-primary-button', hold: 1 },
      ],
    },
    {
      scenario: 'teacher',
      path: '/trao-doi/nhom/grp_dugio',
      state: { newGroup: true },
      waitFor: '.chat-hub-thread .work-chat-empty',
      steps: [
        { caption: 'Nhóm mới hiện trên cùng danh sách và mở sẵn. Người tạo là chủ nhóm.', highlight: { css: '.chat-conversation', nth: 0 }, label: 'Nhóm mới', hold: 5 },
        { clear: true, step: 'Lưu ý', caption: 'Chỉ thành viên đọc và gửi tin trong nhóm; quản trị viên xem được mọi nhóm. Một nhóm có tối đa 100 người, tính cả chủ nhóm.' },
      ],
    },
    {
      scenario: 'gvcn',
      path: '/trao-doi/nhom/grp_khoi7',
      waitFor: '.chat-hub-thread .work-chat-bubble',
      steps: [
        { chapter: 'Quản lý thành viên', step: 'Chủ nhóm', caption: 'Chủ nhóm quản lý nhóm: mở nhóm rồi bấm nút “… thành viên” trên đầu cuộc trò chuyện.', click: membersButton, waitFor: '.chat-dialog .chat-member-list', hold: 1.5 },
        { caption: 'Đổi tên: sửa ô “Tên nhóm” rồi bấm “Đổi tên”.', highlight: '.chat-dialog .chat-rename-row', label: 'Đổi tên nhóm', hold: 5 },
        { caption: 'Danh sách thành viên ghi rõ ai là “Chủ nhóm”. Bấm “Xóa” để đưa một người ra khỏi nhóm.', highlight: '.chat-dialog .chat-member-list', hold: 5 },
        { point: { css: '.chat-dialog .chat-member-list button', text: 'Xóa', nth: 0 }, hold: 1.5 },
        { clear: true, caption: 'Thêm người: ở mục “Thêm thành viên”, tích chọn người cần thêm.', click: { css: '.chat-dialog .chat-member-options label', text: 'Ngô Thị L' }, hold: 1.5 },
        { caption: 'Rồi bấm “Thêm vào nhóm”.', highlight: { css: '.chat-dialog button', text: 'Thêm vào nhóm' }, label: 'Thêm vào nhóm', hold: 2.5 },
        { act: { click: { css: '.chat-dialog button', text: 'Thêm vào nhóm' } }, hold: 1 },
        { clear: true, caption: 'Nút “Giải tán nhóm” xóa nhóm cho mọi người, có bước xác nhận. Quản trị viên cũng giải tán được mọi nhóm.', highlight: '.chat-dialog .chat-danger-button', label: 'Giải tán nhóm', hold: 6 },
      ],
    },
    {
      scenario: 'teacher',
      path: '/trao-doi/nhom/grp_khoi7',
      waitFor: '.chat-hub-thread .work-chat-bubble',
      steps: [
        { chapter: 'Rời nhóm', step: 'Thành viên', caption: 'Thành viên không phải chủ nhóm chỉ xem danh sách. Muốn rời nhóm: bấm “… thành viên”.', click: membersButton, waitFor: '.chat-dialog .chat-member-list', hold: 2 },
        { caption: 'Bấm “Rời nhóm” ở cuối hộp thoại.', click: { css: '.chat-dialog footer button', text: 'Rời nhóm' }, waitFor: '.work-confirm-modal', hold: 1.5 },
        { caption: 'Bấm “Rời nhóm” để xác nhận, hoặc “Hủy” để ở lại.', click: { css: '.work-confirm-modal button', text: 'Rời nhóm' }, hold: 1 },
      ],
    },
    {
      scenario: 'teacher',
      path: '/trao-doi',
      state: { leftGroup: true },
      waitFor: '.chat-hub-list',
      steps: [
        { caption: 'Nhóm biến mất khỏi danh sách của mình. Các thành viên khác vẫn trao đổi bình thường.', highlight: '.chat-conversation-list', hold: 5 },
        { clear: true, step: 'Lưu ý', caption: 'Nếu chủ nhóm rời nhóm, quyền chủ nhóm chuyển cho người tham gia sớm nhất. Nhóm không còn ai sẽ tự giải tán.' },
      ],
    },
  ],
};
