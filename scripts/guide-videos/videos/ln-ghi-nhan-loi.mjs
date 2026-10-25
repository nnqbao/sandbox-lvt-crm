// Ghi nhận lỗi: tổ trưởng ghi nhận lỗi kèm lý do và bằng chứng, ai ghi được cho ai, người bị ghi
// nhận thấy gì. Fixtures: guide-shots/harness/fixtures/people.js with state.peopleAppRules
// (permissions exactly as convex/peopleReview.ts) and state.extraFaults for the saved row.
// The evidence upload stops at the mocked file gateway, so "Ghi nhận" is pointed at and the
// saved row is shown in the next scene.
const modal = '.pr-modal';
const save = '.pr-modal-actions .pr-primary-button';
const section = (nth) => ({ css: '.duty-list-section', nth });
const newFault = {
  _id: 'sf_new', violationDate: '2026-10-20', targetId: 'u_teacher', recorderId: 'u_leader',
  reason: 'Vắng họp tổ chuyên môn chiều 20/10 không báo trước.', fileName: 'bien-ban-hop-to-20-10.pdf',
};
// The modal is position: fixed, so the engine's window scroll cannot bring its footer above the
// caption and the cursor would aim beside the button: move the caption up and glide there by hand.
const toSave = { js: `const r = document.querySelector('${save}').getBoundingClientRect(); window.__video.placeCaption('${save}'); window.__video.cursorTo(r.left + r.width / 2, r.top + r.height / 2);`, hold: 1 };
const press = { js: 'window.__video.ripple(44);', hold: 0.5 };

export default {
  id: 'ln-ghi-nhan-loi',
  title: 'Ghi nhận lỗi',
  intro: 'Xem các lỗi mình bị ghi nhận. Tổ trưởng, tổ phó, Văn thư và quản trị ghi nhận lỗi cho người mình quản lý, kèm lý do và bằng chứng.',
  scenes: [
    {
      scenario: 'leader',
      path: '/thong-bao',
      state: { peopleAppRules: true },
      steps: [
        { chapter: 'Ghi nhận một lỗi', step: 'Mở trang', caption: 'Ở cột menu bên trái, bấm “Ghi nhận lỗi”.', click: { css: '.shell-nav-button', text: 'Ghi nhận lỗi' }, waitFor: '.duty-list-section', hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Khung “Lỗi của tôi” là các lần thầy cô bị ghi nhận. Chưa có lỗi nào thì hiện mặt cười.', highlight: section(0), label: 'Lỗi của tôi', hold: 5 },
        { clear: true, caption: 'Khung “Lỗi do tôi ghi nhận” là các lỗi thầy cô đã ghi cho người khác: tên, tổ, ngày, lý do và file bằng chứng.', highlight: { css: '.pr-fault-card', within: section(1) }, hold: 6 },
        { clear: true, caption: 'Ô tìm kiếm lọc theo tên. Bấm “Tìm kiếm nâng cao” để lọc theo ngày vi phạm.', click: { css: '.duty-list-search-advanced-toggle', nth: 1 }, hold: 1 },
        { highlight: '.duty-list-search-advanced', hold: 3.5 },
        { clear: true, click: { css: '.duty-list-search-advanced-toggle', nth: 1 }, hold: 0.8 },
        { top: true },
        { step: 'Bước 1', caption: 'Bấm “+ Thêm ghi nhận lỗi”.', click: { css: 'button', text: 'Thêm ghi nhận lỗi' }, waitFor: '.pr-picker-list', hold: 1.5 },
        { caption: 'Hộp “Chọn nhân sự” chỉ hiện người thầy cô được phép ghi nhận. Tổ trưởng thấy giáo viên cấp dưới trong tổ mình.', highlight: '.pr-picker-list', hold: 6 },
        { clear: true, caption: 'Gõ tên để tìm nhanh.', type: '#staff-fault-person-search', text: 'Nguyễn' },
        { caption: 'Bấm vào tên người cần ghi nhận.', click: '.pr-picker-person', waitFor: '.pr-modal textarea', hold: 1.5 },
        { step: 'Bước 2', caption: 'Tên người bị ghi nhận hiện ở đầu hộp. Kiểm tra đúng người trước khi ghi.', highlight: '.pr-modal h3', hold: 4 },
        { clear: true, caption: 'Chọn “Ngày vi phạm”. Mặc định là hôm nay; không chọn được ngày trong tương lai.', fill: '.pr-modal input[type=date]', value: '2026-10-20' },
        { caption: 'Ghi “Lý do” cụ thể, khách quan: việc gì, lúc nào.', type: '.pr-modal textarea', text: newFault.reason },
        { step: 'Bước 3', caption: 'Đính kèm “Ảnh / PDF bằng chứng”: PDF, PNG hoặc JPG, tối đa 20 MB. Không có bằng chứng thì không lưu được.', point: '.pr-modal input[type=file]', anchor: 'left', hold: 1 },
        { act: { upload: '.pr-modal input[type=file]', files: [{ name: newFault.fileName, type: 'application/pdf', text: 'pdf' }] }, hold: 2 },
        { step: 'Bước 4', caption: 'Bấm “Ghi nhận”.' },
        toSave,
        press,
      ],
    },
    {
      scenario: 'leader',
      path: '/ghi-nhan-loi',
      state: { peopleAppRules: true, extraFaults: [newFault] },
      waitFor: '.duty-list-section',
      steps: [
        { step: 'Kết quả', caption: 'Lỗi vừa ghi nằm đầu khung “Lỗi do tôi ghi nhận”.', highlight: { css: '.pr-fault-card', within: section(1) }, hold: 5 },
        { clear: true, step: 'Lưu ý', caption: 'Ghi nhận đã lưu không sửa hay xóa được trên màn hình, nên kiểm tra kỹ người, ngày và lý do trước khi bấm “Ghi nhận”.' },
      ],
    },
    {
      scenario: 'admin',
      path: '/ghi-nhan-loi',
      state: { peopleAppRules: true },
      waitFor: '.duty-list-section',
      steps: [
        { chapter: 'Ai ghi nhận được cho ai', step: 'Phạm vi', caption: 'Văn thư và quản trị bấm “+ Thêm ghi nhận lỗi” sẽ thấy giáo viên, nhân viên các tổ.', click: { css: 'button', text: 'Thêm ghi nhận lỗi' }, waitFor: '.pr-picker-list', hold: 1.5 },
        { caption: 'Danh sách không có Ban Giám hiệu: Văn thư và quản trị không ghi nhận lỗi cho Ban Giám hiệu.', highlight: '.pr-picker-list', hold: 6 },
        { clear: true, caption: 'Moderator được giới hạn phòng ban chỉ thấy người trong phòng ban đó.' },
        { caption: 'Hiệu trưởng ghi nhận Phó Hiệu trưởng, Văn thư và quản trị. Phó Hiệu trưởng chỉ ghi nhận Văn thư và quản trị. Không ai ghi nhận lỗi cho Hiệu trưởng.' },
        { caption: 'Tổ trưởng, tổ phó ghi nhận giáo viên cấp thấp hơn trong tổ. Giáo viên 1 sao không có nút “Thêm ghi nhận lỗi”.' },
      ],
    },
    {
      scenario: 'teacher',
      path: '/thong-bao',
      state: { peopleAppRules: true, extraFaults: [newFault] },
      steps: [
        { chapter: 'Người bị ghi nhận thấy gì', step: 'Giáo viên', caption: 'Giáo viên bị ghi nhận mở menu “Ghi nhận lỗi”.', click: { css: '.shell-nav-button', text: 'Ghi nhận lỗi' }, waitFor: '.duty-list-section', hold: 1.2 },
        { top: true },
        { caption: 'Lỗi hiện trong khung “Lỗi của tôi”: ngày vi phạm, người ghi, lý do và file bằng chứng.', highlight: { css: '.pr-fault-card', nth: 0 }, hold: 6 },
        { clear: true, caption: 'Bấm tên file để mở bằng chứng.', point: { css: '.pr-file-link', nth: 0 }, hold: 2.5 },
        { caption: 'Giáo viên chỉ thấy lỗi của chính mình, không thấy lỗi của người khác.' },
      ],
    },
    {
      scenario: 'teacher',
      path: '/danh-gia-nhan-su',
      state: { peopleAppRules: true, extraFaults: [newFault] },
      waitFor: '.pr-section--faults',
      steps: [
        { caption: 'Lỗi cũng hiện trong khung “Ghi nhận lỗi” của menu “Đánh giá nhân sự”, nơi tổ trưởng và Ban Giám hiệu xem khi đánh giá.', highlight: '.pr-section--faults', hold: 6 },
        { clear: true, step: 'Lưu ý', caption: 'Người bị ghi nhận luôn thấy lý do và bằng chứng, vì vậy hãy ghi khách quan, cụ thể và đính kèm bằng chứng rõ ràng.' },
      ],
    },
  ],
};
