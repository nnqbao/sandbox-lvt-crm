// Thiết lập hiển thị (Administrator). Fixtures: guide-shots/harness/fixtures/settings.js
// (state.attendanceConfirmation / state.workVisibilityMode drive settings:displaySettings).
const view = '.display-settings-view';
const sectionCard = (nth) => ({ css: '.display-settings-card', nth });
const panel = (nth) => ({ css: '.notification-source-panel', nth });
const workPanel = panel(1);
const toggleOf = (nth) => ({ css: '.display-toggle', within: panel(nth) });

export default {
  id: 'tl-hien-thi',
  title: 'Thiết lập hiển thị',
  intro: 'Bật hoặc tắt xác nhận tham gia công tác, chọn ai nhìn thấy công việc và đặt các mốc nhắc trước hạn. Các thiết lập này áp dụng cho cả trường.',
  scenes: [
    {
      scenario: 'admin',
      path: '/thiet-lap-loai-van-ban',
      steps: [
        { step: 'Mở trang', caption: 'Ở cột menu bên trái, nhóm “Thiết lập tối cao”, bấm “Thiết lập hiển thị”.', click: { css: '.shell-nav-button', text: 'Thiết lập hiển thị' }, waitFor: view, hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Trang có ba phần: Công tác, Công việc và Thông báo.', highlight: sectionCard(0), label: 'Công tác', hold: 2.5 },
        { highlight: sectionCard(1), label: 'Công việc', hold: 2.5 },
        { highlight: sectionCard(2), label: 'Thông báo', hold: 2.5 },
        { clear: true },
        { top: true },
        { step: 'Bước 1', caption: '“Hiển thị xác nhận tham gia”: khi bật, người tham gia công tác bấm được “Đã tham gia” hoặc “Chưa tham gia”, và cấp trên thấy trạng thái này.', highlight: sectionCard(0), hold: 5 },
        { clear: true, caption: 'Bấm vào nút gạt để tắt hoặc bật. Phần này lưu ngay khi bấm, không cần nút Lưu.', click: { css: '.display-toggle', within: sectionCard(0) }, hold: 0.4 },
      ],
    },
    {
      scenario: 'admin',
      path: '/thiet-lap-hien-thi',
      state: { attendanceConfirmation: false },
      waitFor: view,
      steps: [
        { caption: 'Nút chuyển sang “Đang tắt”: các nút xác nhận bị ẩn, công tác được xem là đã tham gia, báo cáo chỉ đếm tổng số công tác.', highlight: sectionCard(0), label: 'Đang tắt', hold: 5 },
        { clear: true, step: 'Bước 2', caption: '“Ai nhìn thấy công việc?”: người được giao luôn thấy việc của mình. Phần này chọn thêm ai được xem việc người khác tạo.', highlight: sectionCard(1), hold: 5 },
        { clear: true, caption: 'Lựa chọn thứ hai (đang bật): người tạo, người nhận, Ban Giám hiệu 4 và 5 sao, admin và mod cùng nhìn thấy. Đồng cấp không thấy việc của nhau.', point: { css: '.display-toggle', nth: 1, within: sectionCard(1) }, hold: 2 },
        { caption: '“Chỉ người tạo”: danh sách quản lý chỉ hiện việc mình tạo. Bấm để chọn, hệ thống lưu ngay.', point: { css: '.display-toggle', nth: 0, within: sectionCard(1) }, hold: 2 },
        { step: 'Bước 3', caption: '“Thông báo gần đến hạn”: Công tác và Công việc có nút bật tắt và danh sách mốc giờ riêng.', highlight: sectionCard(2), hold: 4 },
        { clear: true, caption: 'Bấm nút gạt “Công tác” để tắt nhắc hạn công tác. Bấm lần nữa để bật lại.', click: toggleOf(0), hold: 2 },
        { click: toggleOf(0), hold: 1.2 },
        { caption: 'Thêm mốc: gõ số giờ trước hạn vào ô “Số giờ”, ví dụ 6 giờ cho Công việc.', fill: { css: 'input[type=number]', within: workPanel }, value: '6' },
        { caption: 'Bấm “+ Thêm mốc”. Mốc mới được xếp vào đúng thứ tự.', click: { css: 'button', text: '+ Thêm mốc', within: workPanel }, hold: 1.2 },
        { highlight: { css: '.notification-milestone-list', within: workPanel }, label: 'Đã có mốc 6 giờ', hold: 3 },
        { clear: true, caption: 'Bỏ một mốc: bấm dấu × cạnh mốc đó, ví dụ mốc 2 giờ.', click: { css: 'button[aria-label="Xóa mốc 2 giờ"]', within: workPanel }, hold: 1.5 },
        { caption: 'Mốc “Đến hạn” (0 giờ) là thông báo ngay lúc đến hạn. Mỗi mốc là số giờ nguyên từ 0 đến 720.', highlight: { css: '.notification-milestone-list span', text: 'Đến hạn', within: workPanel }, hold: 4 },
        { clear: true, caption: 'Xong thì bấm “Lưu thiết lập thông báo”. Phần Thông báo chỉ được lưu khi bấm nút này.', click: '.notification-settings-actions button', hold: 1.5 },
        { highlight: '.notification-settings-actions', label: 'Đã lưu', hold: 2.5 },
        { clear: true, step: 'Lưu ý', caption: 'Mỗi nguồn phải giữ ít nhất một mốc, nếu không nút Lưu bị khóa.' },
        { caption: 'Đổi thiết lập xong, hãy báo các thầy cô để tránh bỡ ngỡ.' },
      ],
    },
  ],
};
