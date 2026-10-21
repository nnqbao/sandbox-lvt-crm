// Trao đổi + Thông báo. Fixtures: harness/fixtures/social.js.
export default [
  {
    id: 'td-trao-doi',
    scenario: 'teacher',
    path: '/trao-doi/nhom/grp_khoi7',
    actions: [{ eval: "const e = document.querySelector('.chat-hub-thread [contenteditable=true]'); if (e) { e.focus(); document.execCommand('insertText', false, 'Lớp 7/2 có 8 em tham gia ạ.'); e.blur(); }" }],
    callouts: [
      { n: 1, target: '.header-chat-button', pos: 'bottom' },
      { n: 2, target: '.chat-filters', pos: 'bottom' },
      { n: 3, target: { css: '.chat-conversation-list button', nth: 1 }, pos: 'tr', dx: -8 },
      { n: 4, target: { css: '.chat-hub-thread [contenteditable=true]' }, pos: 'left' },
      { n: 5, target: '.work-chat-recall', pos: 'left', pad: 6 },
      { n: 6, target: { css: '.chat-hub-list button', text: 'Tạo nhóm' }, pos: 'top' },
    ],
    clip: { target: '.shell-main', pad: 0 },
  },
  {
    id: 'td-trao-doi-mobile',
    scenario: 'teacher',
    path: '/trao-doi',
    width: 390,
    height: 760,
    callouts: [
      { n: 1, target: '.chat-filters', pos: 'bottom' },
      { n: 2, target: { css: '.chat-conversation-list button', nth: 0 }, pos: 'tr', dx: -12 },
    ],
  },
  {
    id: 'td-tao-nhom',
    scenario: 'teacher',
    path: '/trao-doi',
    actions: [
      { click: { css: 'button', text: 'Tạo nhóm' }, after: 400 },
      { fill: { css: '.chat-dialog input', nth: 0 }, value: 'Dự giờ khối 7' },
      { check: { css: '.chat-member-options input[type=checkbox]', nth: 1 } },
      { check: { css: '.chat-member-options input[type=checkbox]', nth: 3 } },
    ],
    callouts: [
      { n: 1, target: { css: '.chat-dialog .chat-field', text: 'Tên nhóm' }, pos: 'left' },
      { n: 2, target: '.chat-member-picker', pos: 'left' },
      { n: 3, target: { css: '.chat-dialog .work-primary-button' }, pos: 'left' },
    ],
    clip: { target: '.chat-dialog', pad: 20 },
  },
  {
    id: 'td-thanh-vien',
    scenario: 'gvcn',
    path: '/trao-doi/nhom/grp_khoi7',
    height: 1200,
    actions: [{ click: { css: '.chat-thread-head button', text: 'thành viên' }, after: 400 }],
    callouts: [
      { n: 1, target: '.chat-rename-row, .chat-group-name', pos: 'left' },
      { n: 2, target: '.chat-member-list', pos: 'left' },
      { n: 3, target: { css: '.chat-dialog .chat-field-label', text: 'Thêm thành viên' }, pos: 'left' },
    ],
    clip: { target: '.chat-dialog', pad: 20 },
  },
  {
    id: 'tb-chuong',
    scenario: 'teacher',
    path: '/cong-viec',
    actions: [{ click: '.notification-bell-button', after: 300 }],
    callouts: [
      { n: 1, target: '.notification-bell-button', pos: 'left' },
      { n: 2, target: { css: '.notification-popover-item', nth: 0 }, pos: 'left' },
      { n: 3, target: '.notification-popover-footer', pos: 'left' },
    ],
    clip: { target: '.notification-popover', pad: 60 },
  },
  {
    id: 'tb-trang-thong-bao',
    scenario: 'teacher',
    path: '/thong-bao',
    height: 900,
    callouts: [
      { n: 1, target: '.notifications-toolbar', pos: 'tl' },
      { n: 2, target: { css: '.notifications-toolbar button' }, pos: 'left' },
      { n: 3, target: { css: '.notification-card', nth: 0 }, pos: 'left' },
      { n: 4, target: { css: '.notification-card.is-rejection' }, pos: 'left' },
    ],
    clip: { target: '.notifications-view', pad: 12 },
  },
];
