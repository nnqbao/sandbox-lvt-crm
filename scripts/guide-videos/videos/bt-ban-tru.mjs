// Bán trú: Văn thư lập kỳ bán trú và chọn giáo viên; mọi người xem danh sách tham gia theo phòng ban.
// Fixtures: guide-shots/harness/fixtures/boarding.js (state.extraBoardingPeriods = kỳ vừa tạo).
const nav = (text) => ({ css: '.shell-nav-button', text });
const option = (text) => ({ css: '.boarding-teacher-option', text });
const created = [{ _id: 'bp_2627_2', semester: 2, schoolYear: '2026-2027', participantUserIds: ['u_leader', 'u_t5', 'u_teacher'] }];

export default {
  id: 'bt-ban-tru',
  title: 'Bán trú',
  intro: 'Văn thư lập danh sách giáo viên tham gia bán trú cho từng học kỳ. Ban Giám hiệu và giáo viên xem danh sách đó theo phòng ban.',
  scenes: [
    {
      scenario: 'clerk',
      path: '/thong-bao',
      steps: [
        { chapter: 'Thêm kỳ bán trú', step: 'Mở trang', caption: 'Ở cột menu bên trái, bấm “Bán trú”.', click: nav('Bán trú'), waitFor: '.boarding-page-tabs', hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Văn thư và quản trị viên có hai tab: “Kỳ bán trú” để thiết lập, “Danh sách tham gia” để xem.', highlight: '.boarding-page-tabs', label: 'Hai tab', hold: 5 },
        { caption: 'Mỗi thẻ là một kỳ bán trú: học kỳ, năm học, số giáo viên tham gia và tên từng người.', highlight: { css: '.boarding-period-card', nth: 0 }, label: 'Một kỳ', hold: 5 },
        { clear: true, step: 'Bước 1', caption: 'Bấm “＋ Thêm kỳ bán trú” ở góc phải.', click: '.boarding-add-button', waitFor: '.boarding-editor', hold: 1.5 },
        { caption: 'Biểu mẫu “Thêm kỳ bán trú” mở ra phía trên danh sách các kỳ.', highlight: '.boarding-editor', hold: 4 },
        { clear: true, step: 'Bước 2', caption: 'Chọn học kỳ. Mặc định là Học kỳ 1; năm nay Học kỳ 1 đã có kỳ, nên bấm “Học kỳ 2”.', click: { css: '.boarding-semester-field label', text: 'Học kỳ 2' }, hold: 2 },
        { step: 'Bước 3', caption: 'Chọn “Năm học”, mặc định là năm học hiện tại 2026-2027.', choose: '.boarding-year-field select', option: '2026-2027' },
        { step: 'Bước 4', caption: 'Bấm “＋ Thêm giáo viên” để mở danh sách nhân sự.', click: { css: '.boarding-participant-heading button', text: 'Thêm giáo viên' }, waitFor: '.boarding-teacher-modal', hold: 1.5 },
        { caption: 'Gõ tên, email hoặc phòng ban vào ô tìm kiếm để lọc nhanh, ví dụ “Toán”.', type: '.boarding-picker-tools input', text: 'Toán', keepFocus: true },
        { caption: 'Tích từng giáo viên tham gia. Thẻ được chọn chuyển sang viền xanh.', click: option('Lê Thị D'), hold: 1.2 },
        { click: option('Ngô Thị L'), hold: 1 },
        { click: option('Nguyễn Văn A'), hold: 1.2 },
        { caption: 'Dưới cùng đếm số giáo viên đã chọn.', highlight: '.boarding-teacher-modal footer > span', hold: 3.5 },
        { clear: true, caption: 'Bấm “Hoàn thành” để đưa danh sách vào biểu mẫu.', click: { css: '.boarding-teacher-modal button', text: 'Hoàn thành' }, hold: 1.5 },
        { caption: 'Mỗi người đã chọn hiện thành một thẻ tên. Bấm dấu × trên thẻ để bỏ người đó.', highlight: '.boarding-selected-teachers', hold: 5 },
        { clear: true, step: 'Bước 5', caption: 'Bấm “Tạo kỳ bán trú” để lưu.', click: '.boarding-editor-actions .boarding-primary-button', hold: 1 },
      ],
    },
    {
      scenario: 'clerk',
      path: '/ban-tru',
      state: { extraBoardingPeriods: created },
      waitFor: '.boarding-period-card',
      steps: [
        { js: "const box = document.createElement('div'); box.className = 'boarding-feedback success'; box.textContent = 'Đã thêm kỳ bán trú.'; document.querySelector('.boarding-management .work-page-actions').after(box);", hold: 0.6 },
        { caption: 'Thấy dòng “Đã thêm kỳ bán trú.” là xong. Kỳ mới nằm đầu danh sách.', highlight: { css: '.boarding-period-card', nth: 0 }, label: 'Kỳ vừa tạo', hold: 5 },
        { chapter: 'Sửa, xóa kỳ', clear: true, step: 'Sửa kỳ', caption: 'Cần thêm hoặc bớt người: bấm “Sửa” ở thẻ của kỳ đó.', click: { css: '.boarding-period-card footer button', text: 'Sửa', nth: 0 }, waitFor: '.boarding-editor', wait: 700, hold: 1.5 },
        { top: true },
        { caption: 'Biểu mẫu “Sửa kỳ bán trú” điền sẵn danh sách hiện tại. Thêm, bỏ người rồi bấm “Lưu thay đổi”.', highlight: '.boarding-editor', label: 'Đang sửa', hold: 6 },
        { clear: true, caption: 'Đổi ý thì bấm “Hủy” để đóng biểu mẫu, không có gì thay đổi.', click: { css: '.boarding-editor-actions button', text: 'Hủy' }, hold: 1.5 },
        { step: 'Xóa kỳ', caption: 'Muốn bỏ hẳn một kỳ: bấm “Xóa” ở thẻ đó, rồi xác nhận khi trình duyệt hỏi lại.', point: { css: '.boarding-period-card footer button', text: 'Xóa', nth: 0 }, hold: 3 },
        { chapter: 'Danh sách tham gia', step: 'Danh sách', caption: 'Bấm tab “Danh sách tham gia” để xem giáo viên theo từng phòng ban.', click: { css: '.boarding-page-tabs button', text: 'Danh sách tham gia' }, waitFor: '.boarding-report-stats', hold: 1.5 },
        { caption: 'Ô “Kỳ bán trú” bên phải chọn kỳ cần xem (mặc định là kỳ mới nhất), ví dụ Học kỳ 1 năm học 2026-2027.', choose: '.boarding-period-picker select', option: 'bp_2627_1' },
        { caption: 'Hai ô số liệu: tổng số giáo viên tham gia và số phòng ban có người tham gia.', highlight: '.boarding-report-stats', hold: 5 },
        { caption: 'Bên dưới là từng phòng ban: họ tên, email, chức vụ của từng giáo viên đã đăng ký.', highlight: { css: '.boarding-report-group', nth: 0 }, label: 'Một phòng ban', hold: 6 },
      ],
    },
    {
      scenario: 'bgh',
      path: '/thong-bao',
      steps: [
        { chapter: 'Ban Giám hiệu, giáo viên xem', clear: true, step: 'Ban Giám hiệu', caption: 'Ban Giám hiệu mở menu “Bán trú”, hoặc mở “Báo cáo” rồi chọn mục con “Bán trú” ngay bên dưới.', click: nav('Báo cáo'), waitFor: '.report-submenu', hold: 1.2 },
        { click: { css: '.report-submenu button', text: 'Bán trú' }, waitFor: '.boarding-report-stats', hold: 1.5 },
        { caption: 'Ban Giám hiệu xem được toàn bộ phòng ban tham gia bán trú của trường.', highlight: '.boarding-period-picker > div', hold: 5 },
      ],
    },
    {
      scenario: 'teacher',
      path: '/ban-tru',
      waitFor: '.boarding-report-stats',
      steps: [
        { step: 'Giáo viên', caption: 'Giáo viên mở menu “Bán trú” và chỉ thấy người tham gia trong phòng ban của mình.', highlight: '.boarding-period-picker > div', hold: 6 },
        { clear: true, caption: 'Ở đây chỉ có tổ Toán – Tin. Giáo viên không thêm hay sửa được kỳ bán trú.', highlight: { css: '.boarding-report-group', nth: 0 }, hold: 5 },
        { clear: true, step: 'Lưu ý', caption: 'Mỗi học kỳ của một năm học chỉ có một kỳ bán trú. Báo “Kỳ bán trú này đã tồn tại” thì bấm “Sửa” ở kỳ có sẵn.' },
        { caption: 'Chỉ chọn được người đang hoạt động. Khi đang tìm kiếm, nút “Chọn tất cả” đổi thành “Chọn … người đang hiện” và chỉ chọn những người trong kết quả.' },
        { caption: 'Không thấy menu Bán trú, hoặc chỉ thấy tổ mình: nhờ quản trị viên kiểm tra dòng “Bán trú” trong nhóm quyền.' },
      ],
    },
  ],
};
