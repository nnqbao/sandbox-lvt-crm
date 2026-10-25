// Công việc (giáo viên): việc được giao, mở công văn, nộp bằng chứng, bài nộp bị trả về, Việc của tôi.
// Fixtures: guide-shots/harness/fixtures/work.js (state.workSubmitted, state.todoAdded, state.todoDone).
// The harness has no access token, so the file preview and the upload are cosmetic `js` steps:
// the real buttons are swapped for inert clones before the click (same look, no network call).
const tab = (text) => ({ css: '.work-list-tabs button', text });
const hubTab = (text) => ({ css: '.work-hub-tabs button', text, exact: true });
const card = (text) => ({ css: '.duty-modern-card', text });
const inert = (css) => `const b = document.querySelector(${JSON.stringify(css)}); const c = b.cloneNode(true); c.type = 'button'; b.replaceWith(c);`;

const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M5 20h14" /></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>';
// A Word page as docx-preview paints it (fictional content).
const PAGE = `<div class="docx-wrapper" style="padding:12px"><section style="background:#fff;padding:48px 64px;font:15px/1.6 'Times New Roman',serif;color:#111;box-shadow:0 0 6px rgba(0,0,0,.15)">
<p style="display:flex;justify-content:space-between;margin:0 0 4px;font-weight:700"><span>TỔ TOÁN – TIN</span><span>Độc lập – Tự do – Hạnh phúc</span></p>
<p style="text-align:right;margin:0 0 28px;font-style:italic">Ngày 16 tháng 10 năm 2026</p>
<h2 style="text-align:center;font-size:20px;margin:0 0 6px">KẾ HOẠCH DẠY HỌC MÔN TOÁN</h2>
<p style="text-align:center;margin:0 0 24px;font-weight:700">Học kỳ I – Năm học 2026–2027</p>
<p style="margin:0 0 10px"><b>1. Mục tiêu:</b> Hoàn thành chương trình học kỳ I theo phân phối chương trình; mỗi giáo viên nộp kế hoạch dạy học của từng khối mình phụ trách.</p>
<p style="margin:0 0 10px"><b>2. Yêu cầu:</b> Kế hoạch ghi rõ số tiết, chủ đề, thời lượng và hình thức kiểm tra đánh giá. Dùng đúng mẫu đính kèm.</p>
<p style="margin:0 0 10px"><b>3. Thời hạn:</b> Nộp trên hệ thống trước ngày 25/10/2026.</p>
<p style="margin:0"><b>4. Tổ chức thực hiện:</b> Tổ trưởng tổng hợp, kiểm tra và báo cáo Ban Giám hiệu.</p>
</section></div>`;
const OPEN_PREVIEW = `document.documentElement.classList.add('work-file-preview-split');
const wrap = document.createElement('div');
wrap.className = 'work-file-preview-backdrop';
wrap.id = 'video-file-preview';
wrap.innerHTML = ${JSON.stringify(`<section class="work-file-preview-dialog" role="dialog"><header><strong>ke-hoach-day-hoc-hk1.docx</strong><div><button type="button" class="work-file-preview-action">${ICON_DOWNLOAD}<span>Tải xuống</span></button><button type="button" class="work-file-preview-close" aria-label="Đóng xem trước">${ICON_CLOSE}</button></div></header><div class="work-file-preview-content is-office"><div class="work-office-preview"><p class="work-office-preview-note">Bản xem trước trên trình duyệt, có thể khác Microsoft Word. Tải xuống để xem bản gốc.</p><div class="work-docx-preview">${PAGE}</div></div></div></section>`)};
document.body.append(wrap);`;
const CLOSE_PREVIEW = "document.getElementById('video-file-preview')?.remove(); document.documentElement.classList.remove('work-file-preview-split');";
// After "Nộp": close the dialog the way the app does on success and show its confirmation.
const SUBMITTED = `document.querySelector('.work-modal .work-ghost-button').click();
setTimeout(() => {
  const view = document.querySelector('.work-user-view');
  const note = document.createElement('div');
  note.className = 'work-feedback success';
  note.textContent = 'Đã nộp công việc. Người tạo sẽ đánh dấu hoàn thành.';
  view.prepend(note);
}, 50);`;
const PDF = { name: 'ke-hoach-day-hoc-toan-hk1.pdf', type: 'application/pdf', text: '%PDF-1.4 guide' };
const TODO = { title: 'Chuẩn bị đồ dùng cho tiết thao giảng', note: 'Thước, compa, phiếu nhóm', dueOffsetH: 32, remindOffsetH: 22.5 };

export default {
  id: 'cv-viec-duoc-giao',
  title: 'Công việc: việc được giao và Việc của tôi',
  intro: 'Xem việc nhà trường giao, mở công văn, nộp bằng chứng hoàn thành, xử lý bài nộp bị trả về và ghi việc riêng trong Việc của tôi.',
  scenes: [
    {
      scenario: 'teacher',
      path: '/thong-bao',
      steps: [
        { chapter: 'Việc được giao', step: 'Mở menu', caption: 'Ở cột menu bên trái, bấm “Công việc”. Số đỏ cạnh menu là số việc cần chú ý.', click: { css: '.shell-nav-button', text: 'Công việc' }, waitFor: '.work-list-tabs', hold: 1.2 },
        { top: true },
        { step: 'Tổng quan', caption: 'Trang có hai tab: “Công việc” là việc nhà trường giao; “Việc của tôi” là sổ tay việc riêng.', highlight: '.work-hub-tabs', hold: 4 },
        { caption: 'Ở tab “Công việc”, việc được giao chia 4 tab: Việc cần làm, Đang chờ duyệt, Quá hạn, Đã duyệt hoàn thành. Số đỏ là số việc trong tab.', highlight: '.work-list-tabs', hold: 4 },
        { caption: 'Mỗi thẻ ghi hạn chót, tên việc, nội dung, phòng ban hoặc người nhận và tệp công văn đính kèm.', highlight: { css: '.duty-modern-card .duty-card-toggle', nth: 0 }, hold: 4 },
        { caption: 'Công tắc bên phải bật nhắc nhở riêng cho việc này.', highlight: { css: '.personal-reminder-panel', nth: 0 }, hold: 4 },
        { clear: true, step: 'Lưu ý', caption: 'Việc do Văn thư giao chỉ hiện sau khi Ban Giám hiệu duyệt. Việc tổ trưởng, tổ phó hoặc Ban Giám hiệu giao thì hiện ngay.' },
        { clear: true, step: 'Bước 1', caption: 'Bấm vào thẻ (hoặc nút ›) để mở chi tiết.', click: { css: '.duty-card-toggle', nth: 0 }, waitFor: '.duty-detail .work-file-actions', hold: 1.5 },
        { caption: 'Phần chi tiết có tệp công văn và tiến độ của cả tổ khi việc giao cho phòng ban.', highlight: { css: '.duty-modern-card.is-open .duty-detail' }, hold: 4 },
        { js: inert('.duty-modern-card.is-open .work-file-icon-button'), hold: 0.1 },
        { clear: true, caption: 'Bấm biểu tượng con mắt để xem công văn ngay trên trang; biểu tượng mũi tên để tải về máy.', click: { css: '.duty-modern-card.is-open .work-file-icon-button', nth: 0 }, hold: 0.3 },
        { js: OPEN_PREVIEW, hold: 1 },
        { caption: 'Công văn mở ở khung bên phải; nút “Tải xuống” để lưu bản gốc. Bấm × để đóng.', highlight: '#video-file-preview .work-file-preview-dialog > header', hold: 4 },
        { js: CLOSE_PREVIEW, hold: 0.8 },
        { chapter: 'Nộp bằng chứng', clear: true, step: 'Bước 2', caption: 'Làm xong việc, bấm “Nộp bằng chứng hoàn thành”.', click: { css: '.duty-modern-card.is-open button', text: 'Nộp bằng chứng hoàn thành' }, waitFor: '.work-modal', hold: 1.5 },
        { caption: 'Kéo thả file vào khung, hoặc bấm vào khung để chọn file: PDF, Word, Excel, ảnh PNG, JPG, tối đa 20 MB.', point: '.work-modal .work-file-dropzone', hold: 1 },
        { act: { upload: '.work-modal input[type=file]', files: [PDF] }, hold: 2.5 },
        { caption: 'Chọn “Loại văn bản” của file vừa nộp, ví dụ Kế hoạch.', choose: '#completion-document-type', option: 'Kế hoạch' },
        { caption: 'Ghi lời nhắn cho người giao nếu cần (không bắt buộc).', type: '#completion-note', text: 'Gửi kế hoạch dạy học đã họp tổ thống nhất.' },
        { js: inert('.work-modal button[type=submit]'), hold: 0.1 },
        { caption: 'Bấm “Nộp”.', click: '.work-modal .work-modal-actions .work-primary-button', hold: 0.3 },
        { js: SUBMITTED, wait: 300, hold: 1 },
        { caption: 'Hệ thống báo đã nộp. Người tạo việc sẽ duyệt và chấm mức độ hoàn thành.', highlight: '.work-feedback.success', hold: 4 },
      ],
    },
    {
      scenario: 'teacher',
      path: '/cong-viec',
      state: { workSubmitted: true },
      waitFor: '.work-list-tabs',
      steps: [
        { clear: true, step: 'Chờ duyệt', caption: 'Việc vừa nộp chuyển sang tab “Đang chờ duyệt”.', click: tab('Đang chờ duyệt'), hold: 1.5 },
        { caption: 'Nhãn “Chờ duyệt hoàn thành” nghĩa là đang chờ người giao xem. Việc chỉ tính là hoàn thành khi người giao duyệt.', highlight: card('Nộp kế hoạch dạy học'), hold: 4 },
        { chapter: 'Bài nộp bị trả về', clear: true, step: 'Bị trả về', caption: 'Nếu bài nộp chưa đạt, việc có nhãn “Bị từ chối hoàn thành”, thường nằm ở tab “Việc cần làm” hoặc “Quá hạn”.', click: tab('Quá hạn'), hold: 2 },
        { caption: 'Bấm vào thẻ để mở chi tiết.', click: { css: '.duty-card-toggle', nth: 0 }, waitFor: '.work-rejection-banner', hold: 1.2 },
        { caption: 'Khung đỏ “Lý do chưa duyệt” ghi điều cần sửa. Bên dưới là nội dung lần nộp trước.', highlight: '.work-rejection-banner', hold: 4 },
        { clear: true, caption: 'Sửa xong, bấm “Nộp lại bằng chứng hoàn thành” và nộp như lần đầu.', highlight: { css: '.duty-modern-card button', text: 'Nộp lại bằng chứng hoàn thành' }, hold: 4 },
        { clear: true, step: 'Đã xong', caption: 'Tab “Đã duyệt hoàn thành” lưu các việc người giao đã duyệt.', click: tab('Đã duyệt hoàn thành'), hold: 4 },
        { chapter: 'Việc của tôi', clear: true, step: 'Việc của tôi', caption: 'Bấm tab “Việc của tôi” ở đầu trang: sổ tay việc riêng, chỉ mình thầy cô thấy, không cần ai duyệt.', click: hubTab('Việc của tôi'), waitFor: '.todo-form', hold: 1.5 },
        { caption: 'Nhập “Tên việc” (bắt buộc).', type: { css: '.todo-form input[type=text]' }, text: TODO.title },
        { caption: 'Thêm ghi chú nếu cần.', type: { css: '.todo-form textarea' }, text: TODO.note },
        { caption: 'Chọn “Hạn chót”.', fill: { css: '.todo-form input[type=datetime-local]', nth: 0 }, value: '2026-10-22T17:00' },
        { caption: 'Chọn “Nhắc lúc”: đến giờ này hệ thống gửi thông báo cho thầy cô. Giờ nhắc phải ở tương lai.', fill: { css: '.todo-form input[type=datetime-local]', nth: 1 }, value: '2026-10-22T07:30' },
        { caption: 'Bấm “Thêm việc”.', click: '.todo-form button[type=submit]', hold: 2 },
      ],
    },
    {
      scenario: 'teacher',
      path: '/cong-viec',
      state: { todoAdded: TODO },
      waitFor: '.work-hub-tabs',
      steps: [
        { act: { click: hubTab('Việc của tôi') }, wait: 400, hold: 0.2 },
        { caption: 'Việc mới nằm trong danh sách “Cần làm”, kèm hạn chót và giờ nhắc.', highlight: { css: '.todo-item', text: TODO.title }, hold: 4 },
        { clear: true, caption: 'Việc quá hạn có nhãn đỏ “Quá hạn”.', highlight: { css: '.todo-item', text: 'Nhập điểm kiểm tra' }, hold: 4 },
        { js: inert('.todo-item:nth-child(2) .todo-check input'), hold: 0.1 },
        { clear: true, caption: 'Làm xong, tích ô vuông cạnh tên việc.', click: '.todo-item:nth-child(2) .todo-check input', hold: 1.2 },
      ],
    },
    {
      scenario: 'teacher',
      path: '/cong-viec',
      state: { todoAdded: TODO, todoDone: ['td2'] },
      waitFor: '.work-hub-tabs',
      steps: [
        { act: { click: hubTab('Việc của tôi') }, wait: 400, hold: 0.2 },
        { caption: 'Việc chuyển xuống “Đã hoàn thành gần đây”. Bỏ tích để đưa việc trở lại “Cần làm”.', highlight: { css: '.todo-card', text: 'Đã hoàn thành gần đây' }, hold: 4 },
        { clear: true, caption: 'Nút “Sửa” và “Xóa” ở mỗi việc để chỉnh hoặc bỏ việc.', highlight: { css: '.todo-actions', nth: 0 }, hold: 4 },
        { step: 'Lưu ý', caption: 'Việc của tôi là riêng tư: Ban Giám hiệu và quản trị viên cũng không xem được. Mọi tài khoản đều có tab này.' },
      ],
    },
  ],
};
