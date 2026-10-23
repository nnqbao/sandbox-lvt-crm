// "Tra cứu theo menu": sidebar views used by the reference topics.
export default [
  {
    id: 'ref-bao-cao-menu',
    scenario: 'bgh',
    path: '/bao-cao/cong-viec',
    callouts: [
      { n: 1, target: { css: '.shell-nav-button', text: 'Báo cáo' }, pos: 'right' },
      { n: 2, target: { css: '.report-submenu button', text: 'Công việc' }, pos: 'right' },
      { n: 3, target: { css: '.report-submenu button', text: 'Bán trú' }, pos: 'right' },
    ],
    clip: { target: '.shell-sidebar', pad: 0 },
    maxHeight: 520,
  },
  {
    id: 'ref-thiet-lap-menu',
    scenario: 'admin',
    path: '/thiet-lap-giao-vien',
    height: 1300,
    callouts: [{ n: 1, target: { css: '.nav-label', text: 'Thiết lập tối cao' }, pos: 'right' }],
    clip: { target: '.shell-sidebar', pad: 0 },
    maxHeight: 1250,
  },
];
