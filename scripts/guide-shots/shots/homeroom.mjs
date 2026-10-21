// Lớp chủ nhiệm (GVCN + quản lý lớp). Fixtures: harness/fixtures/homeroom.js.
const MOCK_UPLOAD_FETCH = `
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, options) => String(url).includes('.invalid')
    ? Promise.resolve(new Response(JSON.stringify({ storageId: 'st_guide_roster' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    : realFetch(url, options);
`;
const view = { target: '.homeroom-view', pad: 12 };

export default [
  {
    id: 'cn-tong-quan',
    scenario: 'gvcn',
    path: '/lop-chu-nhiem',
    height: 900,
    callouts: [
      { n: 1, target: '.hr-year-select', pos: 'left' },
      { n: 2, target: '.hr-day-strip', pos: 'left' },
      { n: 3, target: '.hr-kpi-grid', pos: 'tl' },
      { n: 4, target: { css: '.hr-class-card button', text: 'Xem 3 học sinh vắng' }, pos: 'right' },
      { n: 5, target: { css: '.hr-class-card button', text: 'Mở lớp' }, pos: 'right' },
    ],
    clip: view,
    maxHeight: 760,
  },
  {
    id: 'cn-hoc-sinh',
    scenario: 'gvcn',
    path: '/lop-chu-nhiem/lop/c_7a2/hoc-sinh',
    actions: [{ scrollTo: '.hr-tabs', offset: -120 }],
    callouts: [
      { n: 1, target: { css: '.hr-tabs button', text: 'Học sinh' }, pos: 'left' },
      { n: 2, target: '.hr-search', pos: 'right' },
      { n: 3, target: { css: 'button', text: 'Chi tiết', nth: 0 }, pos: 'left' },
    ],
    clip: { target: '.homeroom-view', pad: 12 },
    maxHeight: 700,
  },
  {
    id: 'cn-diem-danh-lop',
    scenario: 'gvcn',
    path: '/lop-chu-nhiem/lop/c_7a2/diem-danh',
    height: 1000,
    actions: [{ scrollTo: '.hr-tabs', offset: -16 }],
    callouts: [
      { n: 1, target: { css: '.hr-tabs button', text: 'Điểm danh' }, pos: 'left' },
      { n: 2, target: '.hr-day-strip', pos: 'left' },
      { n: 3, target: { css: '.hr-att-heading', text: 'Vắng' }, pos: 'left' },
      { n: 4, target: { css: '.hr-att-row.is-unexcused .hr-att-check' }, pos: 'left' },
      { n: 5, target: { css: '.hr-att-note', nth: 0 }, pos: 'right' },
    ],
    clip: { target: '.homeroom-view', pad: 12 },
    maxHeight: 900,
  },
  {
    id: 'cn-diem-danh-lop-mobile',
    scenario: 'gvcn',
    path: '/lop-chu-nhiem/lop/c_7a2/diem-danh',
    width: 390,
    height: 844,
    actions: [{ scrollTo: { css: '.hr-att-heading', text: 'Vắng' }, offset: -150 }],
    callouts: [
      { n: 3, target: { css: '.hr-att-heading', text: 'Vắng' }, pos: 'right' },
      { n: 4, target: { css: '.hr-att-row.is-unexcused .hr-att-check' }, pos: 'tr', dx: -12 },
    ],
  },
  {
    id: 'cn-bao-cao',
    scenario: 'gvcn',
    path: '/lop-chu-nhiem/lop/c_7a2/bao-cao',
    height: 1000,
    actions: [{ scrollTo: '.hr-tabs', offset: -16 }],
    callouts: [
      { n: 1, target: '.hr-segment', pos: 'left' },
      { n: 2, target: { css: 'label', text: 'Từ' }, pos: 'top' },
      { n: 3, target: { css: 'button', text: 'Excel' }, pos: 'left' },
      { n: 4, target: { css: 'button', text: 'PDF' }, pos: 'right' },
      { n: 5, target: { css: '.hr-table tbody tr', nth: 0 }, pos: 'left' },
    ],
    clip: { target: '.homeroom-view', pad: 12 },
    maxHeight: 820,
  },
  {
    id: 'cn-hoc-sinh-chi-tiet',
    scenario: 'gvcn',
    path: '/lop-chu-nhiem/hoc-sinh/st_03',
    height: 1000,
    actions: [{ scrollBy: 280 }],
    callouts: [
      { n: 1, target: { css: 'button', text: 'Thêm phụ huynh' }, pos: 'right' },
      { n: 2, target: { css: 'h3', text: 'Lịch sử điểm danh' }, pos: 'left' },
      { n: 3, target: { css: 'label', text: 'Chỉ hiện vắng / trễ' }, pos: 'left' },
    ],
    clip: view,
    maxHeight: 800,
  },
  {
    id: 'cn-quan-ly-lop',
    scenario: 'clerk',
    path: '/lop-chu-nhiem/quan-ly-lop',
    height: 1000,
    callouts: [
      { n: 1, target: { css: '.hr-shell-tab', text: 'Quản lý lớp' }, pos: 'bottom' },
      { n: 2, target: { css: 'button', text: 'Tạo lớp' }, pos: 'left' },
      { n: 3, target: { css: 'button', text: 'Gán GVCN' }, pos: 'left' },
      { n: 4, target: { css: 'button', text: 'Thay GVCN', nth: 0 }, pos: 'left' },
    ],
    clip: view,
  },
  {
    id: 'cn-nhap-danh-sach',
    scenario: 'clerk',
    path: '/lop-chu-nhiem/lop/c_7a2/hoc-sinh',
    actions: [
      { eval: MOCK_UPLOAD_FETCH },
      { click: { css: 'button', text: 'Nhập danh sách Excel' } },
      { waitFor: { css: 'button', text: 'Tải file mẫu' } },
      {
        upload: { css: '[role=dialog] input[type=file]' },
        files: [{ name: 'danh_sach_lop_7-2.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: 'guide' }],
        after: 800,
      },
    ],
    callouts: [
      { n: 1, target: { css: '[role=dialog] button', text: 'Tải file mẫu' }, pos: 'left' },
      { n: 2, target: { css: '[role=dialog] button', text: 'Chọn file .xlsx' }, pos: 'right' },
      { n: 3, target: { css: '[role=dialog] table' }, pos: 'left' },
    ],
    clip: { target: '[role=dialog]', pad: 24 },
  },
];
