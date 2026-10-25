// Lịch công tác. Fixtures: harness/fixtures/duties.js (tuần 19–24/10/2026, "hôm nay" Thứ Tư 21/10 09:00).
const MOCK_UPLOAD_FETCH = `
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, options) => String(url).includes('.invalid')
    ? Promise.resolve(new Response(JSON.stringify({ storageId: 'st_guide_duty' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    : realFetch(url, options);
`;
const workspace = { target: '.duty-workspace', pad: 12 };
const contentButton = (text) => ({ css: '.lct-content-cell', text });

export default [
  {
    id: 'ct-ca-nhan',
    scenario: 'teacher',
    state: { strictDutyPeople: true }, // teachers see only themselves, like reports:dutyCalendar
    path: '/cong-tac',
    height: 1000,
    callouts: [
      { n: 1, target: '.duty-workspace-tabs', pos: 'left' },
      { n: 2, target: '.report-people-panel', pos: 'tl' },
      { n: 3, target: '.report-mode-switch', pos: 'bottom' },
      { n: 4, target: '.report-period-nav', pos: 'top' },
      { n: 5, target: { css: '.lct-table tbody tr', text: 'Dự giờ tiết Toán lớp 7/2' }, pos: 'left' },
    ],
    clip: workspace,
    maxHeight: 960,
  },
  {
    id: 'ct-chi-tiet',
    scenario: 'teacher',
    state: { strictDutyPeople: true }, // teachers see only themselves, like reports:dutyCalendar
    path: '/cong-tac',
    height: 1000,
    actions: [{ click: { css: '.lct-table tbody tr', text: 'Dự giờ tiết Toán lớp 7/2' }, after: 400 }],
    callouts: [
      { n: 1, target: '.report-detail-attendance', pos: 'left' },
      { n: 2, target: '.report-detail-close', pos: 'left' },
    ],
    clip: { target: '.report-event-detail', pad: 16 },
  },
  {
    id: 'ct-ca-nhan-mobile',
    scenario: 'teacher',
    state: { strictDutyPeople: true }, // teachers see only themselves, like reports:dutyCalendar
    path: '/cong-tac',
    width: 390,
    height: 844,
    actions: [
      { click: { css: '.report-mode-switch button', text: 'List', exact: true }, after: 500 },
      { scrollTo: '.report-mode-switch', offset: -90 },
    ],
    callouts: [
      { n: 1, target: { css: '.report-mode-switch button', text: 'List', exact: true }, pos: 'right', dx: 210 },
      { n: 2, target: { css: '.duty-modern-card', nth: 0 }, pos: 'tr', dx: -14 },
      { n: 3, target: { css: '.personal-reminder-panel', nth: 0 }, pos: 'left', dx: 22 },
    ],
  },
  {
    id: 'ct-chung',
    scenario: 'teacher',
    path: '/cong-tac/chung',
    height: 900,
    callouts: [
      { n: 1, target: { css: '.duty-workspace-tabs button', text: 'Lịch công tác chung' }, pos: 'right' },
      { n: 2, target: '.lct-period-nav', pos: 'left' },
      { n: 3, target: '.lct-mode-switch', pos: 'bottom' },
      { n: 4, target: { css: '.lct-download button', text: 'Tải PDF' }, pos: 'bottom' },
    ],
    clip: workspace,
    maxHeight: 820,
  },
  {
    id: 'ct-nut-goc-phai',
    scenario: 'leader',
    path: '/cong-tac',
    callouts: [
      { n: 1, target: { css: '.duty-workspace-actions button', text: 'Import Excel' }, pos: 'bottom' },
      { n: 2, target: { css: '.duty-workspace-actions button', text: 'Tạo công tác' }, pos: 'bottom' },
    ],
    clip: workspace,
    maxHeight: 330,
  },
  {
    id: 'ct-tao',
    scenario: 'leader',
    path: '/cong-tac/tao',
    height: 1300,
    actions: [
      { fill: { css: '.duty-content-field input', nth: 0 }, value: 'Họp tổ Toán – Tin tháng 11' },
      { fill: { css: '.duty-content-field textarea', nth: 0 }, value: 'Họp tổ: phân công ra đề kiểm tra giữa kỳ I' },
      { fill: { css: 'input[type="datetime-local"]', nth: 0 }, value: '2026-10-27T14:00' },
      { fill: { css: 'input[type="datetime-local"]', nth: 1 }, value: '2026-10-27T16:00' },
      { fill: { css: '.duty-content-field input', text: '', nth: 1 }, value: 'Phòng họp Hội đồng' },
    ],
    callouts: [
      { n: 1, target: { css: '.duty-content-field', text: 'Tên công tác' }, pos: 'left' },
      { n: 2, target: { css: '.duty-content-field', text: 'Nội dung công tác' }, pos: 'left' },
      { n: 3, target: { css: 'fieldset, .duty-time-group, section', text: 'Thời gian' }, pos: 'left' },
      { n: 4, target: { css: '.duty-content-field', text: 'Địa điểm' }, pos: 'left' },
      { n: 5, target: { css: '.duty-field', text: 'Người tham gia' }, pos: 'left' },
      { n: 6, target: { css: '.duty-content-field', text: 'Thành phần khác' }, pos: 'left' },
      { n: 7, target: { css: '.duty-editor-actions button', text: 'Tạo', exact: true }, pos: 'left' },
    ],
    clip: { target: 'form.duty-modern-editor', pad: 24 },
    quality: 72,
  },
  {
    id: 'ct-xem-truoc',
    scenario: 'leader',
    path: '/cong-tac/tao',
    height: 1300,
    actions: [
      { fill: { css: '.duty-content-field input', nth: 0 }, value: 'Họp tổ Toán – Tin tháng 11' },
      { fill: { css: '.duty-content-field textarea', nth: 0 }, value: 'Họp tổ: phân công ra đề kiểm tra giữa kỳ I' },
      { fill: { css: 'input[type="datetime-local"]', nth: 0 }, value: '2026-10-27T14:00' },
      { fill: { css: 'input[type="datetime-local"]', nth: 1 }, value: '2026-10-27T16:00' },
      { fill: { css: '.duty-content-field input', nth: 1 }, value: 'Phòng họp Hội đồng' },
      { fill: { css: '.duty-content-field textarea', nth: 1 }, value: 'Toàn thể giáo viên tổ Toán – Tin' },
      { click: { css: '.duty-editor-actions button', text: 'Tạo', exact: true }, after: 400 },
    ],
    callouts: [
      { n: 1, target: '.duty-preview-list', pos: 'left' },
      { n: 2, target: { css: '.duty-preview-modal .work-primary-button' }, pos: 'left' },
    ],
    clip: { target: '.duty-preview-modal', pad: 24 },
  },
  {
    id: 'ct-import',
    scenario: 'clerk',
    path: '/cong-tac',
    height: 1000,
    actions: [
      { eval: MOCK_UPLOAD_FETCH },
      { click: { css: '.duty-workspace-actions button', text: 'Import Excel' } },
      { waitFor: '.duty-bulk-import' },
      {
        upload: { css: '.duty-bulk-import input[type=file]' },
        files: [{ name: 'lich_cong_tac_tuan_44.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: 'guide' }],
        after: 800,
      },
    ],
    callouts: [
      { n: 1, target: { css: '.duty-bulk-import button', text: 'Tải file nhập liệu mẫu' }, pos: 'left' },
      { n: 2, target: { css: '.duty-bulk-import button', text: 'Import file nhập liệu' }, pos: 'right' },
      { n: 3, target: '.duty-bulk-import-preview', pos: 'left' },
      { n: 4, target: { css: '.duty-bulk-import button', text: 'Xác nhận import' }, pos: 'left' },
    ],
    clip: { target: '.duty-bulk-import', pad: 20 },
  },
  {
    id: 'ct-import-loi',
    scenario: 'clerk',
    path: '/cong-tac',
    state: { importErrors: true },
    actions: [
      { eval: MOCK_UPLOAD_FETCH },
      { click: { css: '.duty-workspace-actions button', text: 'Import Excel' } },
      { waitFor: '.duty-bulk-import' },
      {
        upload: { css: '.duty-bulk-import input[type=file]' },
        files: [{ name: 'lich_cong_tac_tuan_44.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: 'guide' }],
        after: 800,
      },
    ],
    callouts: [{ n: 1, target: '.duty-bulk-import-errors', pos: 'left' }],
    clip: { target: '.duty-bulk-import', pad: 20 },
  },
  {
    id: 'ct-nop-duyet',
    scenario: 'clerk',
    path: '/cong-tac/chung',
    height: 900,
    callouts: [
      { n: 1, target: '.lct-week-pill', pos: 'left' },
      { n: 2, target: '.lct-week-changes', pos: 'left' },
      { n: 3, target: { css: '.lct-week-actions button', text: 'Nộp duyệt lại' }, pos: 'bottom' },
      { n: 4, target: { css: '.lct-week-actions button', text: 'Hủy thay đổi' }, pos: 'bottom' },
      { n: 5, target: { css: '.lct-table tbody tr', text: 'Tập huấn sử dụng CRM' }, pos: 'left' },
    ],
    clip: workspace,
    maxHeight: 820,
  },
  {
    id: 'ct-bgh-duyet',
    scenario: 'bgh',
    path: '/cong-tac/chung',
    height: 900,
    callouts: [
      { n: 1, target: '.lct-week-pill', pos: 'left' },
      { n: 2, target: '.lct-week-changes', pos: 'left' },
      { n: 3, target: { css: '.lct-week-actions button', text: 'Duyệt lịch tuần' }, pos: 'bottom' },
      { n: 4, target: { css: '.lct-week-actions button', text: 'Trả lại' }, pos: 'bottom' },
      { n: 5, target: { css: '.lct-table tbody tr', text: 'Họp Hội đồng sư phạm' }, pos: 'left' },
    ],
    clip: workspace,
    maxHeight: 820,
  },
  {
    id: 'ct-bgh-sua',
    scenario: 'bgh',
    path: '/cong-tac/chung',
    height: 1500,
    actions: [
      { click: { css: '.lct-content-button', text: 'Họp Hội đồng sư phạm' }, after: 500 },
      { waitFor: '.duty-edit-modal .duty-reviewer-note' },
      { click: { css: '.duty-edit-modal button', text: 'Lịch sử chỉnh sửa' }, after: 400 },
    ],
    callouts: [
      { n: 1, target: '.duty-reviewer-note', pos: 'left' },
      { n: 2, target: '.duty-history-list', pos: 'left' },
      { n: 3, target: { css: '.duty-edit-modal-footer button', text: 'Lưu thay đổi' }, pos: 'left' },
    ],
    clip: { target: '.duty-edit-modal', pad: 24 },
  },
];
