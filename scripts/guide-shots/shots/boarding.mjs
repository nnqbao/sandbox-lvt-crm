// Bán trú: kỳ bán trú (Văn thư/Admin) và danh sách tham gia. Fixtures: harness/fixtures/boarding.js.
export default [
  {
    id: 'bt-ky-ban-tru',
    scenario: 'clerk',
    path: '/ban-tru',
    height: 900,
    callouts: [
      { n: 1, target: { css: '.boarding-page-tabs button', text: 'Kỳ bán trú' }, pos: 'bottom' },
      { n: 2, target: '.boarding-add-button', pos: 'left' },
      { n: 3, target: { css: '.boarding-period-card', nth: 0 }, pos: 'tl' },
      { n: 4, target: { css: '.boarding-period-card footer button', text: 'Sửa', nth: 0 }, pos: 'bottom' },
    ],
    clip: { target: '.shell-main', pad: 0 },
    maxHeight: 760,
  },
  {
    id: 'bt-them-ky',
    scenario: 'clerk',
    path: '/ban-tru',
    height: 1100,
    actions: [
      { click: '.boarding-add-button', after: 300 },
      { click: { css: '.boarding-participant-heading button', text: 'Thêm giáo viên' }, after: 300 },
      { check: { css: '.boarding-teacher-option input', nth: 2 } },
      { check: { css: '.boarding-teacher-option input', nth: 5 } },
      { check: { css: '.boarding-teacher-option input', nth: 7 } },
      { click: { css: '.boarding-teacher-modal button', text: 'Hoàn thành' }, after: 300 },
    ],
    callouts: [
      { n: 1, target: '.boarding-semester-field', pos: 'left' },
      { n: 2, target: '.boarding-year-field', pos: 'left' },
      { n: 3, target: { css: '.boarding-participant-heading button', text: 'Thêm giáo viên' }, pos: 'left' },
      { n: 4, target: '.boarding-editor-actions .boarding-primary-button', pos: 'top' },
    ],
    clip: { target: '.boarding-editor', pad: 20 },
  },
  {
    id: 'bt-chon-giao-vien',
    scenario: 'clerk',
    path: '/ban-tru',
    height: 900,
    actions: [
      { click: '.boarding-add-button', after: 300 },
      { click: { css: '.boarding-participant-heading button', text: 'Thêm giáo viên' }, after: 300 },
      { check: { css: '.boarding-teacher-option input', nth: 2 } },
      { check: { css: '.boarding-teacher-option input', nth: 5 } },
    ],
    callouts: [
      { n: 1, target: '.boarding-picker-tools input', pos: 'left' },
      { n: 2, target: '.boarding-teacher-option.selected', pos: 'left' },
      { n: 3, target: { css: '.boarding-teacher-modal button', text: 'Hoàn thành' }, pos: 'left' },
    ],
    clip: { target: '.boarding-teacher-modal', pad: 20 },
  },
  {
    id: 'bt-danh-sach',
    scenario: 'bgh',
    path: '/ban-tru',
    height: 1000,
    callouts: [
      { n: 1, target: '.boarding-period-picker label', pos: 'left' },
      { n: 2, target: '.boarding-report-stats', pos: 'left' },
      { n: 3, target: { css: '.boarding-report-group', nth: 0 }, pos: 'tl' },
    ],
    clip: { target: '.shell-main', pad: 0 },
    maxHeight: 900,
  },
  {
    id: 'bt-danh-sach-mobile',
    scenario: 'teacher',
    path: '/ban-tru',
    width: 390,
    height: 844,
    callouts: [
      { n: 1, target: '.boarding-period-picker label', pos: 'bottom' },
    ],
  },
];
