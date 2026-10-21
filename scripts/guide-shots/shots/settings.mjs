// Thiết lập tối cao (Administrator). Fixtures: common.js + settings.js.
const MOCK_UPLOAD_FETCH = `
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, options) => String(url).includes('__guide-upload')
    ? Promise.resolve(new Response(JSON.stringify({ storageId: 'st_guide_users' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    : realFetch(url, options);
`;
const XLSX = { name: 'nhap_lieu_giao_vien.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: 'guide' };
const label = (text) => ({ css: 'form.admin-form label', text });
// Labels whose own text starts the label (helper text can mention other fields).
const field = (nth) => ({ css: 'form.admin-form > label, form.admin-form .form-grid > label, form.admin-form label', nth });

export default [
  {
    id: 'tl-tao-tai-khoan',
    scenario: 'admin',
    path: '/thiet-lap-nguoi-dung',
    height: 1300,
    actions: [
      { fill: { css: 'form.admin-form input', nth: 0 }, value: 'Đỗ Thị G' },
      { fill: { css: 'form.admin-form input[type=email]' }, value: 'vanthu@truongmau.example' },
      { select: { css: 'form.admin-form select', nth: 0 }, value: 'moderator' },
      { select: { css: 'form.admin-form select', nth: 1 }, value: 'dep_vp' },
      { select: { css: 'form.admin-form select', nth: 2 }, value: 'pos_vt' },
    ],
    callouts: [
      { n: 1, target: label('Họ tên'), pos: 'left' },
      { n: 2, target: label('Email (đăng nhập)'), pos: 'right' },
      { n: 3, target: label('Vai trò'), pos: 'left' },
      { n: 4, target: label('Phòng ban'), pos: 'right' },
      { n: 5, target: label('Chức vụ'), pos: 'left' },
      { n: 6, target: { css: 'form.admin-form label.field-disabled' }, pos: 'right' },
      { n: 7, target: label('Mật khẩu tạm thời'), pos: 'left' },
      { n: 8, target: { css: 'form.admin-form button', text: 'Tạo tài khoản' }, pos: 'left' },
    ],
    clip: { target: 'form.admin-form', pad: 24 },
  },
  {
    id: 'tl-danh-sach-nguoi-dung',
    scenario: 'admin',
    path: '/thiet-lap-nguoi-dung',
    height: 2400,
    actions: [{ scrollTo: '.user-table-head', offset: -20 }],
    callouts: [
      { n: 1, target: { css: '.user-row', text: 'Nguyễn Văn A' }, pos: 'left' },
      { n: 2, target: { css: '.user-row button', text: 'Sửa', exact: true, within: { css: '.user-row', text: 'Nguyễn Văn A' } }, pos: 'top' },
      { n: 3, target: { css: '.user-row button', text: 'Đặt lại MK', within: { css: '.user-row', text: 'Nguyễn Văn A' } }, pos: 'top' },
      { n: 4, target: { css: '.user-row button', text: 'Phiên', within: { css: '.user-row', text: 'Nguyễn Văn A' } }, pos: 'right' },
      { n: 5, target: { css: '.user-row button', text: 'Mở khóa ĐN' }, pos: 'right' },
    ],
    clip: { target: '.user-table-head', pad: 0 },
    quality: 72,
  },
  {
    id: 'tl-import-nguoi-dung',
    scenario: 'admin',
    path: '/thiet-lap-nguoi-dung',
    height: 1400,
    actions: [
      { eval: MOCK_UPLOAD_FETCH },
      { upload: '.user-bulk-import input[type=file]', files: [XLSX], after: 900 },
    ],
    callouts: [
      { n: 1, target: { css: '.user-bulk-import button', text: 'Tải file nhập liệu mẫu' }, pos: 'left' },
      { n: 2, target: { css: '.user-bulk-import button', text: 'Import file nhập liệu' }, pos: 'right' },
      { n: 3, target: '.user-bulk-import-preview', pos: 'left' },
      { n: 4, target: { css: '.user-bulk-import-preview .primary-button' }, pos: 'left' },
      { n: 5, target: { css: '.user-bulk-import button', text: 'Xuất DS người dùng' }, pos: 'right' },
    ],
    clip: { target: '.user-bulk-import', pad: 16 },
  },
  {
    id: 'tl-import-loi',
    scenario: 'admin',
    path: '/thiet-lap-nguoi-dung',
    height: 1400,
    state: { importErrors: true },
    actions: [
      { eval: MOCK_UPLOAD_FETCH },
      { upload: '.user-bulk-import input[type=file]', files: [XLSX], after: 900 },
    ],
    callouts: [{ n: 1, target: '.user-bulk-import-errors', pos: 'left' }],
    clip: { target: '.user-bulk-import-errors', pad: 20 },
  },
  {
    id: 'tl-phong-ban',
    scenario: 'admin',
    path: '/thiet-lap-phong-ban',
    callouts: [
      { n: 1, target: label('Tên phòng ban'), pos: 'left' },
      { n: 2, target: label('Mã'), pos: 'right' },
      { n: 3, target: { css: 'button', text: 'Thêm phòng ban' }, pos: 'left' },
      { n: 4, target: { css: '.mgmt-card button', text: 'Thêm user', nth: 1 }, pos: 'bottom' },
    ],
    clip: { target: '.shell-main > section', pad: 0 },
    maxHeight: 760,
  },
  {
    id: 'tl-chuc-vu',
    scenario: 'admin',
    path: '/thiet-lap-chuc-vu',
    height: 1300,
    callouts: [
      { n: 1, target: '.positions-management .notice', pos: 'left' },
      { n: 2, target: 'form.admin-form', pos: 'tl' },
      { n: 3, target: { css: '.mgmt-card', nth: 2 }, pos: 'tl' },
    ],
    clip: { target: '.shell-main > section', pad: 0 },
    maxHeight: 1100,
    quality: 72,
  },
  {
    id: 'tl-nhom-quyen',
    scenario: 'admin',
    path: '/thiet-lap-nhom-quyen',
    height: 1300,
    actions: [
      { fill: { css: 'form.admin-form input', nth: 0 }, value: 'Giám thị' },
      { fill: { css: 'form.admin-form input', nth: 1 }, value: 'GT2' },
      { check: { css: '.perm-matrix-row', text: 'Điểm danh', nth: 0 }, value: true },
      { eval: "const row = [...document.querySelectorAll('.perm-matrix-row')].find((r) => r.textContent.includes('Điểm danh')); const inputs = row ? row.querySelectorAll('input[type=radio]') : []; inputs[inputs.length - 1]?.click();" },
    ],
    callouts: [
      { n: 1, target: { css: 'form.admin-form label', text: 'Tên nhóm quyền' }, pos: 'left' },
      { n: 2, target: '.perm-matrix-head', pos: 'left' },
      { n: 3, target: { css: '.perm-matrix-row', text: 'Điểm danh' }, pos: 'left' },
      { n: 4, target: { css: 'form.admin-form button', text: 'Thêm nhóm quyền' }, pos: 'left' },
    ],
    clip: { target: 'form.admin-form', pad: 24 },
    quality: 72,
  },
  {
    id: 'tl-nhom-quyen-the',
    scenario: 'admin',
    path: '/thiet-lap-nhom-quyen',
    height: 2100,
    callouts: [
      { n: 1, target: { css: '.mgmt-card', text: 'Giám thị', nth: 0 }, pos: 'tl' },
      { n: 2, target: { css: '.mgmt-card button', text: 'Thêm user', nth: 2 }, pos: 'bottom' },
    ],
    clip: { target: '.card-list', pad: 16 },
    quality: 72,
  },
  {
    id: 'tl-loai-van-ban',
    scenario: 'admin',
    path: '/thiet-lap-loai-van-ban',
    callouts: [
      { n: 1, target: 'form', pos: 'tl' },
      { n: 2, target: { css: 'button', text: 'Sửa', nth: 0 }, pos: 'top' },
    ],
    clip: { target: '.shell-main > section', pad: 0 },
    maxHeight: 760,
  },
  {
    id: 'tl-hien-thi',
    scenario: 'admin',
    path: '/thiet-lap-hien-thi',
    height: 1700,
    callouts: [
      { n: 1, target: { css: 'section, article', text: 'Hiển thị xác nhận tham gia', nth: 0 }, pos: 'tl' },
      { n: 2, target: { css: 'section, article', text: 'Ai nhìn thấy công việc?', nth: 0 }, pos: 'tl' },
      { n: 3, target: { css: 'section, article', text: 'Thông báo gần đến hạn', nth: 0 }, pos: 'tl' },
      { n: 4, target: { css: 'button', text: 'Lưu thiết lập thông báo' }, pos: 'left' },
    ],
    clip: { target: '.shell-main > section, .shell-main > div', pad: 0 },
    maxHeight: 1600,
    quality: 70,
  },
];
