// Đánh giá nhân sự: hồ sơ của tôi (giáo viên), tự đánh giá và đánh giá người trong tổ (tổ trưởng),
// nhận xét của Ban Giám hiệu. Fixtures: guide-shots/harness/fixtures/people.js with
// state.peopleAppRules (permissions exactly as convex/peopleReview.ts).
// Uploads stop at the mocked file gateway, so "Lưu" after choosing a file is pointed at and the
// result is shown in the next scene through state.extraEvaluations.
const modal = '.pr-modal';
const save = '.pr-modal-actions .pr-primary-button';
const quarterSelect = { css: '.pr-modal .pr-form-section select', nth: 0 };
const quarterFile = { css: '.pr-modal .pr-form-section input[type=file]', nth: 0 };
const rowButton = (name) => ({ css: '.pr-mini-button', within: { css: '.pr-person-row', text: name } });
// The modal is position: fixed, so the engine's window scroll cannot bring its footer above the
// caption and the cursor would aim beside "Lưu": move the caption up and glide there by hand.
const toSave = { js: `const r = document.querySelector('${save}').getBoundingClientRect(); window.__video.placeCaption('${save}'); window.__video.cursorTo(r.left + r.width / 2, r.top + r.height / 2);`, hold: 1 };
const press = { js: 'window.__video.ripple(44);', hold: 0.5 };
const pressAndSave = { js: `window.__video.ripple(0); document.querySelector('${save}').click();`, wait: 400, hold: 1.2 };

const q4File = {
  _id: 'ev_q4', kind: 'quarterly', periodKey: 'Q4-2026', quarter: 4, year: 2026,
  fileName: 'danh-gia-quy-4-nguyen-van-a.pdf', versionCount: 1, lastUploadedAt: Date.parse('2026-10-21T08:40:00+07:00'),
  uploadedByName: 'Lê Thị D', texts: [],
};
const q4Text = {
  ...q4File,
  texts: [{ _id: 'tx_q4', evaluatorName: 'Hoàng Văn E', createdAt: Date.parse('2026-10-21T09:05:00+07:00'), content: 'Thực hiện tốt kế hoạch dạy học quý 4. Đề nghị tiếp tục bồi dưỡng học sinh giỏi.' }],
};

export default {
  id: 'dg-danh-gia-nhan-su',
  title: 'Đánh giá nhân sự',
  intro: 'Hồ sơ đánh giá của từng người: lỗi được ghi nhận, kết quả công việc và các kỳ đánh giá. Tổ trưởng tải file đánh giá, Ban Giám hiệu ghi nhận xét.',
  scenes: [
    {
      scenario: 'teacher',
      path: '/thong-bao',
      state: { peopleAppRules: true },
      steps: [
        { chapter: 'Hồ sơ của tôi', step: 'Mở trang', caption: 'Ở cột menu bên trái, bấm “Đánh giá nhân sự”.', click: { css: '.shell-nav-button', text: 'Đánh giá nhân sự' }, waitFor: '.pr-section--eval', hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Giáo viên thấy hồ sơ của chính mình, gồm ba khung: Ghi nhận lỗi, Công việc và Kỳ đánh giá.', highlight: '.pr-section--faults', label: 'Ghi nhận lỗi', hold: 3 },
        { clear: true, caption: 'Khung “Ghi nhận lỗi” liệt kê các lần vi phạm: ngày, người ghi, lý do và file bằng chứng.', highlight: { css: '.pr-section--faults .pr-fault-card', nth: 0 }, hold: 5 },
        { clear: true, caption: 'Mặc định xem 30 ngày gần nhất. Đổi ngày ở ô “Từ” và “Đến” để xem khoảng khác.', highlight: { css: '.pr-section--faults .pr-date-filter' }, hold: 5 },
        { clear: true, caption: 'Khung “Công việc” đếm việc được giao trong menu Công việc: tổng số, đúng hạn, trễ hạn, chưa hoàn thành.', highlight: '.pr-section--work .pr-kpi-grid', hold: 6 },
        { clear: true, caption: 'Bên dưới là từng việc, kèm hạn và phần trăm chất lượng người giao đã duyệt.', highlight: '.pr-section--work .pr-task-list', hold: 5 },
        { clear: true, caption: 'Khung “Kỳ đánh giá” chứa file đánh giá theo quý và đánh giá viên chức theo năm học.', highlight: '.pr-section--eval .pr-eval-viewer', label: 'Kỳ đánh giá', hold: 5 },
        { clear: true, caption: 'Chọn kỳ ở ô bên phải tiêu đề. Bấm tên file để mở xem.', highlight: { css: '.pr-eval-block header select', nth: 0 }, hold: 4 },
        { clear: true, caption: 'Nhận xét của Ban Giám hiệu nằm ngay dưới file: người nhận xét, thời gian và nội dung.', highlight: { css: '.pr-text-list', nth: 0 }, hold: 5 },
        { clear: true, step: 'Lưu ý', caption: 'Giáo viên 1 sao không có nút “Thêm đánh giá”: file đánh giá của thầy cô do tổ trưởng hoặc tổ phó cùng tổ tải lên.' },
      ],
    },
    {
      scenario: 'leader',
      path: '/danh-gia-nhan-su',
      state: { peopleAppRules: true },
      waitFor: '.pr-people-panel',
      steps: [
        { chapter: 'Tự đánh giá', step: 'Tổ trưởng', caption: 'Tổ trưởng, tổ phó và Ban Giám hiệu có thêm cột danh sách bên trái. Dòng trên cùng là “Hồ sơ của tôi”.', highlight: '.pr-people-self', label: 'Hồ sơ của tôi', hold: 5 },
        { clear: true, step: 'Bước 1', caption: 'Để nộp file tự đánh giá: chọn “Hồ sơ của tôi”, rồi bấm “+ Thêm đánh giá”.', click: '.pr-person-actions .pr-primary-button', waitFor: modal, hold: 1.5 },
        { clear: true, caption: 'Mỗi loại đánh giá là một khung: “Đánh giá theo quý” và “Đánh giá viên chức” theo năm học.', highlight: { css: '.pr-modal .pr-form-section', nth: 0 }, hold: 5 },
        { clear: true, caption: 'Quý và năm mặc định là quý hiện tại; đổi nếu cần nộp cho kỳ khác.', highlight: '.pr-modal .pr-inline-fields', hold: 4 },
        { clear: true, step: 'Bước 2', caption: 'Bấm “Upload file” trong khung đó và chọn file PDF, PNG hoặc JPG, tối đa 20 MB.', point: quarterFile, anchor: 'left', hold: 1 },
        { act: { upload: quarterFile.css, files: [{ name: 'tu-danh-gia-quy-4-le-thi-d.pdf', type: 'application/pdf', text: 'pdf' }] }, hold: 2 },
        { step: 'Bước 3', caption: 'Bấm “Lưu”. File hiện trong khung “Kỳ đánh giá” của hồ sơ.' },
        toSave,
        press,
      ],
    },
    {
      scenario: 'leader',
      path: '/danh-gia-nhan-su',
      state: { peopleAppRules: true },
      waitFor: '.pr-people-panel',
      steps: [
        { chapter: 'Đánh giá người trong tổ', step: 'Tổ trưởng', caption: 'Danh sách chỉ có người cấp thấp hơn trong tổ mình. Bấm tên một người để xem hồ sơ bên phải.', click: { css: '.pr-person-main', text: 'Nguyễn Văn A' }, hold: 1.5 },
        { clear: true, caption: 'Hồ sơ bên phải giống hồ sơ của tôi: lỗi, công việc và các kỳ đánh giá của người đó.', highlight: '.pr-detail-panel .pr-section--faults', hold: 4 },
        { clear: true, step: 'Bước 1', caption: 'Bấm “Đánh giá” cạnh tên người cần tải file đánh giá.', click: rowButton('Nguyễn Văn A'), waitFor: modal, hold: 1.5 },
        { clear: true, caption: 'Đầu hộp ghi tên và tổ của người được đánh giá.', highlight: '.pr-modal h3', hold: 3 },
        { clear: true, step: 'Lưu ý', caption: 'Đổi sang Quý 3: kỳ này Ban Giám hiệu đã nhận xét, nên file ghi “Đã khóa upload” và không tải lại được.', choose: quarterSelect, option: '3' },
        { highlight: { css: '.pr-modal .pr-existing-file', nth: 0 }, hold: 4 },
        { clear: true, step: 'Bước 2', caption: 'Chọn lại Quý 4, kỳ chưa có file.', choose: quarterSelect, option: '4' },
        { caption: 'Bấm “Upload file” và chọn file đánh giá của giáo viên. Tải file khác cho cùng kỳ sẽ thay file cũ, khi kỳ đó chưa có nhận xét.', point: quarterFile, anchor: 'left', hold: 1 },
        { act: { upload: quarterFile.css, files: [{ name: 'danh-gia-quy-4-nguyen-van-a.pdf', type: 'application/pdf', text: 'pdf' }] }, hold: 2 },
        { step: 'Bước 3', caption: 'Bấm “Lưu”.' },
        toSave,
        press,
      ],
    },
    {
      scenario: 'leader',
      path: '/danh-gia-nhan-su',
      state: { peopleAppRules: true, extraEvaluations: [q4File] },
      waitFor: '.pr-people-panel',
      steps: [
        { click: { css: '.pr-person-main', text: 'Nguyễn Văn A' }, waitFor: '.pr-detail-panel .pr-eval-file', hold: 1 },
        { step: 'Kết quả', caption: 'File vừa tải hiện trong khung “Kỳ đánh giá” của giáo viên, ghi giờ cập nhật và người tải lên. Kỳ này chờ Ban Giám hiệu nhận xét.', highlight: { css: '.pr-detail-panel .pr-eval-block', nth: 0 }, hold: 6 },
        { clear: true, step: 'Lưu ý', caption: 'Tổ phó tải file cho giáo viên trong tổ; tổ trưởng tải cho giáo viên và tổ phó. Tổ trưởng không ghi ô “BGH đánh giá”.' },
      ],
    },
    {
      scenario: 'bgh',
      path: '/danh-gia-nhan-su',
      state: { peopleAppRules: true, extraEvaluations: [q4File] },
      waitFor: '.pr-people-panel',
      steps: [
        { chapter: 'Ban Giám hiệu nhận xét', step: 'Ban Giám hiệu', caption: 'Ban Giám hiệu thấy nhân sự toàn trường, nhóm theo tổ. Mỗi người có nút “Đánh giá”.', highlight: { css: '.pr-dept-group', nth: 1 }, label: 'Tổ Toán – Tin', hold: 5 },
        { clear: true, step: 'Bước 1', caption: 'Bấm “Đánh giá” cạnh tên giáo viên cần nhận xét.', click: rowButton('Nguyễn Văn A'), waitFor: modal, hold: 1.5 },
        { clear: true, caption: 'Quý 4 đã có file do tổ trưởng tải lên. Bấm tên file để đọc trước khi nhận xét.', highlight: { css: '.pr-modal .pr-existing-file', nth: 0 }, hold: 5 },
        { clear: true, step: 'Bước 2', caption: 'Ban Giám hiệu không tải file thay giáo viên, chỉ ghi nhận xét vào ô “BGH đánh giá”.', type: { css: '.pr-modal textarea', nth: 0 }, text: 'Thực hiện tốt kế hoạch dạy học quý 4. Đề nghị tiếp tục bồi dưỡng học sinh giỏi.' },
        { step: 'Bước 3', caption: 'Bấm “Lưu”.' },
        toSave,
        press,
        pressAndSave,
      ],
    },
    {
      scenario: 'bgh',
      path: '/danh-gia-nhan-su',
      state: { peopleAppRules: true, extraEvaluations: [q4Text] },
      waitFor: '.pr-people-panel',
      steps: [
        { click: { css: '.pr-person-main', text: 'Nguyễn Văn A' }, waitFor: '.pr-detail-panel .pr-text-list', hold: 1 },
        { step: 'Kết quả', caption: 'Nhận xét hiện trong khung “Kỳ đánh giá” của giáo viên. Giáo viên cũng thấy nhận xét này trong hồ sơ của mình.', highlight: { css: '.pr-detail-panel .pr-eval-block', nth: 0 }, hold: 6 },
        { clear: true, step: 'Lưu ý', caption: 'Có nhận xét đầu tiên là file kỳ đó bị khóa. Mỗi người chỉ nhận xét một lần cho mỗi kỳ và không sửa được, nên đọc kỹ trước khi bấm “Lưu”.' },
        { caption: 'Hiệu trưởng nhận xét được Phó Hiệu trưởng. Không ai nhận xét Hiệu trưởng.' },
        { caption: 'Tổ trưởng, tổ phó chỉ thấy người cấp dưới trong tổ. Văn thư, quản trị thấy toàn trường; Moderator bị giới hạn phòng ban chỉ thấy phòng ban đó.' },
      ],
    },
  ],
};
