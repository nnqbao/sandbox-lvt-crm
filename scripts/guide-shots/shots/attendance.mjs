// Điểm danh (Giám thị) + Thiết lập năm học (Quản trị). Fixtures: harness/fixtures/attendance.js.
const MOCK_UPLOAD_FETCH = `
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, options) => String(url).includes('guide-harness.invalid')
    ? Promise.resolve(new Response(JSON.stringify({ storageId: 'st_guide_1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    : realFetch(url, options);
`;
const XLSX_FILE = {
  name: 'mau_diem_danh_20261021.xlsx',
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  text: 'guide-placeholder',
};

export default [
  {
    id: 'dd-tong-quan',
    scenario: 'supervisor',
    path: '/diem-danh',
    waitFor: '.att-class-list',
    callouts: [
      { n: 1, target: { css: '.att-grade-tabs button', text: 'Lớp 6' }, pos: 'tl' },
      { n: 2, target: { css: '.att-class-head', text: 'Lớp 6/3' }, pos: 'left' },
      { n: 3, target: { css: '.att-status', text: 'Đã lưu', nth: 0 }, pos: 'right' },
    ],
    clip: { target: '.att-view', pad: 16 },
    maxHeight: 760,
  },
  {
    id: 'dd-mo-lop',
    scenario: 'supervisor',
    path: '/diem-danh',
    height: 760,
    waitFor: '.att-class-list',
    actions: [
      { click: { css: '.att-class-head', text: 'Lớp 6/3' } },
      { waitFor: '.att-students' },
      { check: '#att-cls_6_3-cls_6_3_hs05' },
      { check: '#att-cls_6_3-cls_6_3_hs08' },
      { scrollTo: { css: '.att-class-head', text: 'Lớp 6/3' }, offset: -12 },
    ],
    callouts: [
      { n: 1, target: { css: '.att-class-head', text: 'Lớp 6/3' }, pos: 'left' },
      { n: 2, target: { css: '.att-students li.is-absent .att-absent-toggle', nth: 0 }, pos: 'left' },
      { n: 3, target: '.att-savebar .primary-button', pos: 'left' },
    ],
  },
  {
    id: 'dd-import-xem-truoc',
    scenario: 'supervisor',
    path: '/diem-danh',
    waitFor: '.att-class-list',
    actions: [
      { eval: MOCK_UPLOAD_FETCH },
      { click: { css: 'button', text: 'Import Excel' } },
      { waitFor: '.att-import' },
      { upload: '.att-import input[type=file]', files: [XLSX_FILE] },
      { waitFor: { css: 'button', text: 'Xác nhận lưu' }, after: 300 },
    ],
    callouts: [
      { n: 1, target: { css: 'button', text: 'Tải file mẫu' }, pos: 'left' },
      { n: 2, target: { css: '.att-head-actions button', text: 'Import Excel' }, pos: 'bottom' },
      { n: 3, target: '.att-import .att-file', pos: 'left' },
      { n: 4, target: '.att-preview .hr-table-wrap', pos: 'left' },
      { n: 5, target: { css: 'button', text: 'Xác nhận lưu' }, pos: 'left' },
    ],
    clip: { target: { css: '.att-view' }, pad: 16 },
    maxHeight: 900,
  },
  {
    id: 'dd-import-loi',
    scenario: 'supervisor',
    path: '/diem-danh',
    state: { importErrors: true },
    waitFor: '.att-class-list',
    actions: [
      { eval: MOCK_UPLOAD_FETCH },
      { click: { css: 'button', text: 'Import Excel' } },
      { waitFor: '.att-import' },
      { upload: '.att-import input[type=file]', files: [XLSX_FILE] },
      { waitFor: '.att-preview table', after: 300 },
    ],
    callouts: [
      { n: 1, target: '.att-preview .hr-notice, .att-preview [class*=notice]', pos: 'left' },
      { n: 2, target: '.att-preview .hr-table-wrap', pos: 'left' },
    ],
    clip: { target: '.att-import', pad: 16 },
  },
  {
    id: 'dd-dien-thoai-mobile',
    scenario: 'supervisor',
    path: '/diem-danh',
    width: 390,
    height: 844,
    waitFor: '.att-class-list',
    actions: [
      { click: { css: '.att-grade-tabs button', text: 'Lớp 7' } },
      { click: { css: '.att-class-head', text: 'Lớp 7/3' } },
      { waitFor: '.att-students' },
      { check: '#att-cls_7_3-cls_7_3_hs02' },
      { scrollTo: { css: '.att-class-head', text: 'Lớp 7/3' }, offset: -70 },
    ],
    callouts: [
      { n: 1, target: { css: '.att-class-head', text: 'Lớp 7/3' }, pos: 'tr', dx: -16 },
      { n: 2, target: { css: '.att-students li.is-absent .att-absent-toggle', nth: 0 }, pos: 'left' },
      { n: 3, target: '.att-savebar .primary-button', pos: 'top' },
    ],
  },
  {
    id: 'nh-tong-quan',
    scenario: 'admin',
    path: '/thiet-lap-nam-hoc',
    waitFor: '.sy-runs',
    callouts: [
      { n: 1, target: '.sy-add', pos: 'left' },
      { n: 2, target: '.sy-year-tab[aria-current="true"]', pos: 'left' },
      { n: 3, target: '.sy-stats', pos: 'tl' },
      { n: 4, target: { css: 'button', text: 'Gợi ý ngày lễ Việt Nam' }, pos: 'left' },
      { n: 5, target: { css: 'button', text: 'Thêm đợt nghỉ' }, pos: 'top' },
    ],
    clip: { target: '.sy-layout', pad: 16 },
    maxHeight: 980,
  },
  {
    id: 'nh-them-nam-hoc',
    scenario: 'admin',
    path: '/thiet-lap-nam-hoc',
    waitFor: '.sy-runs',
    actions: [
      { click: '.sy-add' },
      { waitFor: '#sy-year-form' },
    ],
    callouts: [
      { n: 1, target: { css: '#sy-year-form label', text: 'Ngày bắt đầu' }, pos: 'left' },
      { n: 2, target: { css: '#sy-year-form label', text: 'Tên năm học' }, pos: 'left' },
      { n: 3, target: { css: '#sy-year-form label', text: 'Giờ nhắc thiếu điểm danh' }, pos: 'right' },
      { n: 4, target: { css: 'button', text: 'Tạo năm học', exact: true }, pos: 'top' },
    ],
    clip: { target: '[role=dialog]', pad: 24 },
  },
  {
    id: 'nh-dot-nghi',
    scenario: 'admin',
    path: '/thiet-lap-nam-hoc',
    waitFor: '.sy-runs',
    actions: [
      { click: { css: 'button', text: 'Thêm đợt nghỉ' } },
      { waitFor: '#sy-holiday-form' },
      { click: { css: '.sy-presets button', text: 'Nghỉ giữa học kỳ' } },
      { fill: { css: '#sy-holiday-form label', text: 'Từ ngày' }, value: '' },
    ],
    callouts: [],
    clip: { target: '[role=dialog]', pad: 24 },
  },
];
