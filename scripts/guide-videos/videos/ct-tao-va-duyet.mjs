// Lịch công tác: tổ trưởng tạo công tác cho tổ, Văn thư tạo / import lịch trường và nộp tuần,
// Ban Giám hiệu duyệt, trả lại hoặc sửa trực tiếp.
// Fixtures: guide-shots/harness/fixtures/duties.js (tuần 19–24/10/2026, "hôm nay" Thứ Tư 21/10 09:00).
const form = 'form.duty-modern-editor';
const textInput = (nth) => ({ css: `${form} .duty-content-field input`, nth });
const textArea = (nth) => ({ css: `${form} .duty-content-field textarea`, nth });
const when = (nth) => ({ css: `${form} input[type="datetime-local"]`, nth });
const headAction = (text) => ({ css: '.duty-workspace-actions button', text });
const weekAction = (text) => ({ css: '.lct-week-actions button', text, exact: true });
const confirmButton = (text) => ({ css: '.work-confirm-modal button', text, exact: true });
const modal = '.duty-edit-modal';

// The upload goes to a Convex upload URL first; the harness has no server, so answer it locally.
const MOCK_UPLOAD_FETCH = `
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, options) => String(url).includes('.invalid')
    ? Promise.resolve(new Response(JSON.stringify({ storageId: 'st_guide_duty' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    : realFetch(url, options);
`;
const UPLOAD = {
  upload: { css: '.duty-bulk-import input[type=file]' },
  files: [{ name: 'lich_cong_tac_tuan_44.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: 'guide' }],
};

export default {
  id: 'ct-tao-va-duyet',
  title: 'Lịch công tác: tạo lịch và duyệt theo tuần',
  intro: 'Tổ trưởng tạo công tác cho tổ; Văn thư soạn lịch trường bằng tay hoặc Excel rồi nộp; Ban Giám hiệu duyệt cả tuần một lần hoặc sửa trực tiếp.',
  scenes: [
    {
      scenario: 'leader',
      path: '/thong-bao',
      state: { strictDutyPeople: true },
      steps: [
        { chapter: 'Tổ trưởng tạo công tác cho tổ', step: 'Mở trang', caption: 'Ở cột menu bên trái, bấm “Lịch công tác”.', click: { css: '.shell-nav-button', text: 'Lịch công tác' }, waitFor: '.duty-workspace-actions', hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Tổ trưởng, tổ phó và Văn thư thấy hai nút ở góc phải: “Import Excel” và “+ Tạo công tác”.', highlight: '.duty-workspace-actions', hold: 5 },
        { clear: true, step: 'Bước 1', caption: 'Bấm “+ Tạo công tác”.', click: headAction('Tạo công tác'), waitFor: form, hold: 1.5 },
        { caption: 'Nhập “Tên công tác” và “Nội dung công tác”.', type: textInput(0), text: 'Họp tổ Toán – Tin tháng 11' },
        { type: textArea(0), text: 'Phân công ra đề kiểm tra giữa kỳ I' },
        { step: 'Bước 2', caption: 'Chọn “Từ ngày” và “Đến ngày” kèm giờ. Công tác cả ngày thì tích “Cả ngày”.', fill: when(0), value: '2026-10-27T14:00' },
        { fill: when(1), value: '2026-10-27T16:00' },
        { caption: 'Gõ “Địa điểm”, ví dụ “Phòng họp Hội đồng”.', type: textInput(1), text: 'Phòng họp Hội đồng' },
        { step: 'Bước 3', caption: 'Mở ô “Người tham gia”: tổ trưởng chỉ chọn được giáo viên cấp dưới trong tổ.', click: `${form} .multi-check-toggle`, hold: 1.2 },
        { caption: 'Tích tên từng người. Khách mời ngoài tổ ghi vào “Thành phần khác”.', click: { css: '.multi-check-item', text: 'Nguyễn Văn A' }, hold: 0.8 },
        { click: { css: '.multi-check-item', text: 'Ngô Thị L' }, hold: 1.5 },
        { step: 'Bước 4', caption: 'Bấm “Tạo”, kiểm tra lại bảng xem trước rồi bấm “Xác nhận tạo”.', click: { css: '.duty-editor-actions button', text: 'Tạo', exact: true }, waitFor: '.duty-preview-modal', hold: 1.2 },
        { highlight: '.duty-preview-list', hold: 3.5 },
        { clear: true, click: { css: '.duty-preview-modal .work-primary-button' }, hold: 1.5 },
        { step: 'Lưu ý', caption: 'Công tác của tổ hiện ngay với người được chọn, không cần duyệt và không lên Lịch công tác chung.' },
      ],
    },
    {
      scenario: 'clerk',
      path: '/cong-tac/tao',
      waitFor: form,
      steps: [
        { chapter: 'Văn thư tạo lịch trường', step: 'Văn thư', caption: 'Văn thư dùng cùng biểu mẫu, có thêm ô “Phòng ban tham gia” để mời cả tổ.', click: { css: `${form} .multi-check-toggle`, nth: 0 }, hold: 0.8 },
        { highlight: { css: `${form} .duty-field`, text: 'Phòng ban tham gia' }, hold: 3.5 },
        { clear: true, step: 'Lưu ý', caption: 'Lịch trường chỉ hiện với giáo viên sau khi Ban Giám hiệu duyệt tuần. Thành phần có thể bổ sung sau, trước khi nộp.' },
      ],
    },
    {
      scenario: 'clerk',
      path: '/cong-tac',
      waitFor: '.duty-workspace-actions',
      steps: [
        { js: MOCK_UPLOAD_FETCH, hold: 0.1 },
        { chapter: 'Import Excel', step: 'Import Excel', caption: 'Nhập cả tuần một lần: bấm “Import Excel” ở góc phải.', click: headAction('Import Excel'), waitFor: '.duty-bulk-import', hold: 1.5 },
        { caption: 'Lần đầu, bấm “Tải file nhập liệu mẫu”. Mỗi dòng trong file là một công tác.', point: { css: '.duty-bulk-import button', text: 'Tải file nhập liệu mẫu' }, hold: 3 },
        { caption: 'Điền xong, bấm “Import file nhập liệu” và chọn file.', click: { css: '.duty-bulk-import button', text: 'Import file nhập liệu' }, hold: 0.6 },
        { act: UPLOAD, wait: 800, hold: 1 },
        { caption: 'Hệ thống kiểm tra từng dòng rồi hiện “Xem trước” các công tác sẽ tạo.', highlight: '.duty-bulk-import-preview ul', hold: 4 },
        { clear: true, caption: 'Bấm “Xác nhận import 3 công tác” để tạo.', click: { css: '.duty-bulk-import-preview button', text: 'Xác nhận import' }, hold: 1 },
        { highlight: '.duty-bulk-import-result', hold: 3 },
      ],
    },
    {
      scenario: 'clerk',
      path: '/cong-tac',
      state: { importErrors: true },
      waitFor: '.duty-workspace-actions',
      steps: [
        { js: MOCK_UPLOAD_FETCH, hold: 0.1 },
        { act: { click: headAction('Import Excel') }, hold: 0.3 },
        { act: UPLOAD, wait: 800, hold: 0.3 },
        { step: 'Lưu ý', caption: 'Có dòng sai thì chưa nhập dòng nào; “Báo cáo lỗi” chỉ rõ từng dòng. Sửa file rồi import lại.', highlight: '.duty-bulk-import-errors', hold: 5 },
        { clear: true, caption: 'Tổ trưởng, tổ phó không điền mã phòng ban, chỉ điền email người trong tổ.' },
      ],
    },
    {
      scenario: 'clerk',
      path: '/cong-tac/chung',
      waitFor: '.lct-week-status',
      steps: [
        { chapter: 'Nộp lịch tuần cho Ban Giám hiệu', step: 'Nộp duyệt', caption: 'Ở “Lịch công tác chung”, thanh vàng ghi trạng thái tuần và các thay đổi “Thêm / Sửa” chưa duyệt.', highlight: '.lct-week-status-main', hold: 5 },
        { caption: 'Khi còn thay đổi chưa duyệt, bảng và file PDF ghi “BẢN NHÁP – CHƯA DUYỆT”. Giáo viên vẫn xem bản cũ.', highlight: '.lct-draft-mark', hold: 5 },
        { clear: true, caption: '“Hủy thay đổi” bỏ hết thay đổi chưa duyệt, quay về bản đã duyệt.', highlight: weekAction('Hủy thay đổi'), hold: 4 },
        { clear: true, caption: 'Bấm “Nộp duyệt lại” (lần đầu nút ghi “Nộp BGH duyệt”), rồi “Nộp duyệt”.', click: weekAction('Nộp duyệt lại'), waitFor: '.work-confirm-modal', hold: 1.2 },
        { click: confirmButton('Nộp duyệt'), hold: 1 },
        { highlight: '.lct-week-status .work-feedback', hold: 3 },
        { clear: true, step: 'Lưu ý', caption: 'Sửa lịch khi tuần đang chờ duyệt sẽ rút bản đã nộp về; cần nộp lại lần nữa.' },
      ],
    },
    {
      scenario: 'clerk',
      path: '/cong-tac/chung',
      state: { weekStatus: 'returned' },
      waitFor: '.lct-week-status',
      steps: [
        { caption: 'Nếu Ban Giám hiệu “Trả lại”, thanh trạng thái chuyển sang “Bị trả lại” kèm lý do. Sửa xong bấm “Nộp lại”.', highlight: '.lct-week-status-main', hold: 5 },
      ],
    },
    {
      scenario: 'bgh',
      path: '/cong-tac/chung',
      waitFor: '.lct-week-status',
      steps: [
        { chapter: 'Ban Giám hiệu duyệt lịch tuần', step: 'Ban Giám hiệu', caption: 'Ban Giám hiệu mở “Lịch công tác chung”: tuần Văn thư đã nộp có nhãn “Chờ duyệt” và danh sách thay đổi.', highlight: '.lct-week-status-main', hold: 5 },
        { clear: true, caption: 'Lịch cần sửa nhiều thì bấm “Trả lại”.', click: weekAction('Trả lại'), waitFor: '.lct-week-return-modal', hold: 1.2 },
        { caption: 'Ghi lý do (bắt buộc) rồi bấm “Trả lại”; bấm “Hủy” nếu đổi ý.', type: '.lct-week-return-modal textarea', text: 'Thứ Tư đổi giờ họp Hội đồng sang 14g30.' },
        { point: '.lct-week-return-confirm', hold: 1.5 },
        { click: { css: '.lct-week-return-modal button', text: 'Hủy', exact: true }, hold: 0.8 },
        { caption: 'Lịch đúng thì bấm “Duyệt lịch tuần”, rồi xác nhận. Chỉ cần một người trong Ban Giám hiệu duyệt.', click: weekAction('Duyệt lịch tuần'), waitFor: '.work-confirm-modal', hold: 1.2 },
        { click: confirmButton('Duyệt lịch tuần'), hold: 1 },
        { caption: 'Giáo viên thấy lịch tuần mới và nhận thông báo ngay.', highlight: '.lct-week-status .work-feedback', hold: 3 },
        { chapter: 'Ban Giám hiệu sửa trực tiếp', clear: true, step: 'Sửa trực tiếp', caption: 'Chỉ cần sửa nhỏ: bấm vào nội dung công tác trong bảng.', click: { css: '.lct-content-button', text: 'Họp Hội đồng sư phạm' }, waitFor: `${modal} .duty-reviewer-note`, hold: 1.5 },
        { caption: 'Thay đổi của Ban Giám hiệu áp dụng ngay, không cần duyệt lại và được ghi lịch sử.', highlight: `${modal} .duty-reviewer-note`, hold: 5 },
        { clear: true, caption: 'Sửa thông tin cần đổi, ví dụ giờ họp sang 14:30 – 16:30.', fill: { css: `${modal} input[type="datetime-local"]`, nth: 0 }, value: '2026-10-21T14:30' },
        { fill: { css: `${modal} input[type="datetime-local"]`, nth: 1 }, value: '2026-10-21T16:30' },
        { caption: '“Lịch sử chỉnh sửa” cho biết ai đã sửa gì, lúc nào, kèm giá trị cũ và mới.', click: `${modal} .duty-history-toggle`, waitFor: `${modal} .duty-history-list`, hold: 0.8 },
        { highlight: `${modal} .duty-history-list`, hold: 4 },
        { clear: true, caption: 'Bấm “Lưu thay đổi”, rồi “Lưu” trong hộp xác nhận.', highlight: { css: `${modal} .duty-edit-modal-footer button`, text: 'Lưu thay đổi' }, hold: 2 },
        { act: { click: { css: `${modal} .duty-edit-modal-footer button`, text: 'Lưu thay đổi' } }, hold: 0.4 },
        { clear: true },
        { click: confirmButton('Lưu'), hold: 1.5 },
        { step: 'Lưu ý', caption: 'Văn thư sửa lịch đã duyệt thì phải nộp duyệt lại; Ban Giám hiệu sửa trực tiếp thì có hiệu lực ngay.' },
      ],
    },
  ],
};
