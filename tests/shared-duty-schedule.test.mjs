import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  buildSharedScheduleRows,
  canOpenDutyContentEditor,
  DUTY_EDITED_TOLERANCE_MS,
  formatDayCell,
  formatDutyClock,
  formatParticipantCell,
  formatTimeCell,
  formatVnDate,
  isEditedDuty,
  scheduleRange,
  sharedScheduleFilename,
} from '../src/duties/sharedDutySchedule.js';
import { dutiesPathname, parseDutyPath } from '../src/duties/dutyRoutes.js';
import { buildSharedDutySchedulePdf, SHARED_SCHEDULE_PDF_FONT } from '../src/duties/sharedDutySchedulePdf.js';
import { VIETNAMESE_PDF_FONT } from '../src/homeroom/homeroomExport.js';
import { parseSharedScheduleQuery } from '../scripts/lib/shared-duty-schedule-pdf.mjs';

const sampleEvents = [
  {
    _id: 'a',
    title: 'Chào cờ đầu tuần',
    startDate: '2026-09-07',
    endDate: '2026-09-07',
    startTime: '07:00',
    allDay: false,
    location: 'Trường',
    departmentNames: ['BGH'],
    participantNames: ['GVCN'],
  },
  {
    _id: 'b',
    title: 'Họp giao ban BGH',
    startDate: '2026-09-07',
    endDate: '2026-09-07',
    startTime: '09:00',
    allDay: false,
    location: 'Phòng truyền thống',
    departmentNames: ['BGH'],
    participantNames: [],
  },
  {
    _id: 'c',
    title: 'Khám sức khỏe học sinh khối 8, 9',
    startDate: '2026-09-08',
    endDate: '2026-09-08',
    startTime: '08:00',
    allDay: true,
    location: 'Trường',
    departmentNames: ['BGH'],
    participantNames: [],
  },
  {
    _id: 'd',
    title: 'Họp Ban nghiên cứu đề xuất nội dung phát triển chương trình',
    startDate: '2026-09-11',
    endDate: '2026-09-13',
    startTime: '08:00',
    allDay: false,
    location: 'Hải Phòng',
    departmentNames: [],
    participantNames: ['C. Xuân Oanh'],
  },
];

test('đường dẫn Lịch công tác có tab chung và trang tạo/sửa', () => {
  assert.equal(dutiesPathname(), '/cong-tac');
  assert.equal(dutiesPathname({ view: 'shared' }), '/cong-tac/chung');
  assert.equal(dutiesPathname({ view: 'create' }), '/cong-tac/tao');
  assert.equal(dutiesPathname({ view: 'edit', dutyId: 'abc' }), '/cong-tac/sua/abc');
  assert.equal(parseDutyPath('/cong-tac/chung').view, 'shared');
  assert.equal(parseDutyPath('/cong-tac/tao').view, 'create');
  assert.equal(parseDutyPath('/cong-tac/sua/abc').dutyId, 'abc');
  assert.equal(parseDutyPath('/cong-tac').view, 'personal');
});

test('format lịch chung theo mẫu Word, ngày luôn dd/MM/yyyy (tuần 07/09–12/09)', async () => {
  assert.equal(formatDutyClock('07:00'), '7g00');
  assert.equal(formatDutyClock('16:45'), '16g45');
  assert.equal(formatDutyClock('21:00'), '21g00');
  assert.equal(formatDayCell('2026-09-07'), 'Thứ Hai 07/09');
  assert.equal(formatVnDate('2026-09-07'), '07/09/2026');
  assert.equal(formatTimeCell({ startDate: '2026-09-07', endDate: '2026-09-07', allDay: true }), 'Cả ngày');
  assert.equal(
    formatTimeCell({ startDate: '2026-09-11', endDate: '2026-09-13', allDay: false, startTime: '08:00' }),
    'Từ 11/09 – 13/09',
  );

  const range = scheduleRange('week', '2026-09-09');
  assert.equal(range.startIso, '2026-09-07');
  assert.equal(range.endIso, '2026-09-12');
  assert.equal(range.title, 'LỊCH CÔNG TÁC TỪ NGÀY 07/09/2026 ĐẾN 12/09/2026');
  assert.equal(sharedScheduleFilename(range), 'LCT tu 07.9-12.9.pdf');
  const { formatVnDateSpan } = await import('../src/duties/sharedDutySchedule.js');
  assert.equal(formatVnDateSpan('2026-09-07', '2026-09-07'), '07/09/2026');
  assert.equal(formatVnDateSpan('2026-09-07', '2026-09-09'), '07/09/2026 → 09/09/2026');

  const { rows } = buildSharedScheduleRows('week', '2026-09-09', sampleEvents);
  const monday = rows.filter((row) => row.dayIso === '2026-09-07');
  assert.equal(monday.length, 2);
  assert.equal(monday[0].showDay, true);
  assert.equal(monday[0].rowSpan, 2);
  assert.equal(monday[1].showDay, false);
  assert.equal(monday[0].time, '7g00');
  assert.equal(monday[1].time, '9g00');
  assert.equal(monday[0].participants, 'BGH, GVCN');

  const tuesday = rows.filter((row) => row.dayIso === '2026-09-08');
  assert.equal(tuesday[0].time, 'Cả ngày');

  const friday = rows.filter((row) => row.dayIso === '2026-09-11');
  assert.equal(friday[0].time, 'Từ 11/09 – 13/09');

  const saturday = rows.filter((row) => row.dayIso === '2026-09-12');
  assert.equal(saturday.length, 1);
  assert.equal(saturday[0].content, '');
  assert.equal(rows.some((row) => row.dayIso === '2026-09-13'), false);
  assert.equal(
    formatParticipantCell({
      departmentNames: ['BGH'],
      participantNames: ['GVCN'],
      otherParticipants: 'Đoàn Sở GD',
    }),
    'BGH, GVCN, Đoàn Sở GD',
  );
  assert.equal(
    formatParticipantCell({ departmentNames: [], participantNames: [], otherParticipants: 'Khách mời' }),
    'Khách mời',
  );
});

test('query PDF lịch chung chỉ nhận tuần/tháng và ngày ISO', () => {
  assert.deepEqual(
    parseSharedScheduleQuery(new URLSearchParams('mode=week&anchor=2026-09-11')),
    { mode: 'week', anchor: '2026-09-11' },
  );
  assert.deepEqual(
    parseSharedScheduleQuery(new URLSearchParams('mode=month&anchor=2026-09-01')),
    { mode: 'month', anchor: '2026-09-01' },
  );
  assert.throws(() => parseSharedScheduleQuery(new URLSearchParams('mode=year&anchor=2026-09-11')), /INVALID_DATE_RANGE/);
  assert.throws(() => parseSharedScheduleQuery(new URLSearchParams('mode=week')), /INVALID_DATE_RANGE/);
});

test('PDF lịch chung nhúng font tiếng Việt và giữ tiêu đề/cột của mẫu', async () => {
  const payload = buildSharedScheduleRows('week', '2026-09-09', sampleEvents);
  const built = buildSharedDutySchedulePdf(payload);
  assert.equal(Buffer.from(built.bytes.slice(0, 5)).toString('ascii'), '%PDF-');
  assert.equal(built.filename, 'LCT tu 07.9-12.9.pdf');
  assert.equal(built.doc.getFont().fontName, SHARED_SCHEDULE_PDF_FONT.family);
  assert.notEqual(SHARED_SCHEDULE_PDF_FONT.family, VIETNAMESE_PDF_FONT.family);
  const visible = built.visibleTexts.join('\n');
  assert.match(visible, /UBND PHƯỜNG BÌNH THẠNH/);
  assert.match(visible, /LÊ VĂN TÁM/);
  assert.match(visible, /CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM/);
  assert.match(visible, /Độc lập – Tự do – Hạnh phúc/);
  assert.match(visible, /LỊCH CÔNG TÁC TỪ NGÀY 07\/09\/2026 ĐẾN 12\/09\/2026/);
  assert.match(visible, /Ngày/);
  assert.match(visible, /Thời gian/);
  assert.match(visible, /Nội dung/);
  assert.match(visible, /Địa điểm/);
  assert.match(visible, /Thành phần/);
  assert.match(visible, /Chào cờ đầu tuần/);
  assert.match(visible, /7g00/);
  assert.match(visible, /Thứ Bảy/);
  assert.match(visible, /12\/09/);
  assert.match(visible, /Thứ Năm/);
});

test('PDF lịch chung nhúng Tinos Regular + Bold (Times New Roman metrics), không dùng NotoSans', () => {
  for (const name of ['Tinos-Regular.ttf', 'Tinos-Bold.ttf']) {
    const bytes = readFileSync(new URL(`../src/assets/fonts/${name}`, import.meta.url));
    assert.ok(bytes.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])), `${name} must be a TrueType font`);
    assert.ok(bytes.length > 100_000);
  }
  assert.match(readFileSync(new URL('../src/assets/fonts/Tinos-OFL.txt', import.meta.url), 'utf8'), /SIL Open Font License/i);
  const payload = buildSharedScheduleRows('week', '2026-09-09', sampleEvents);
  const built = buildSharedDutySchedulePdf(payload);
  assert.deepEqual([...built.doc.getFontList().Tinos].sort(), ['bold', 'normal']);
  const latin1 = Buffer.from(built.bytes).toString('latin1');
  const baseFonts = [...latin1.matchAll(/\/BaseFont\s*\/([^\s[/]+)/g)].map((match) => match[1]);
  assert.ok(baseFonts.includes('Tinos'), `fonts: ${baseFonts}`);
  assert.ok(!baseFonts.some((name) => /NotoSans/.test(name)), `fonts: ${baseFonts}`);
  // Regular + Bold TrueType programs embedded (standard-14 fonts carry no FontFile2).
  assert.ok((latin1.match(/\/FontFile2/g) || []).length >= 2);
  assert.match(latin1, /FontFile2/);
  const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(vite, /src\/duties\/sharedDutyScheduleFont\.js/);
  assert.match(vite, /Tinos-Regular\.ttf/);
  assert.match(vite, /Tinos-Bold\.ttf/);
});

test('ô công tác đã sửa khi updatedAt muộn hơn createdAt quá dung sai', () => {
  const createdAt = 1_700_000_000_000;
  assert.equal(DUTY_EDITED_TOLERANCE_MS, 1000);
  assert.equal(isEditedDuty({ createdAt, updatedAt: createdAt }), false);
  assert.equal(isEditedDuty({ createdAt, updatedAt: createdAt + DUTY_EDITED_TOLERANCE_MS }), false);
  assert.equal(isEditedDuty({ createdAt, updatedAt: createdAt + DUTY_EDITED_TOLERANCE_MS + 1 }), true);
  assert.equal(isEditedDuty({ createdAt }), false);
  assert.equal(isEditedDuty({ updatedAt: createdAt }), false);
  assert.equal(isEditedDuty(null), false);

  const { rows } = buildSharedScheduleRows('week', '2026-09-09', [
    { ...sampleEvents[0], createdAt, updatedAt: createdAt },
    { ...sampleEvents[1], createdAt, updatedAt: createdAt + 5000 },
  ]);
  const monday = rows.filter((row) => row.dayIso === '2026-09-07');
  assert.equal(monday[0].edited, false);
  assert.equal(monday[1].edited, true);
  assert.equal(rows.find((row) => row.dayIso === '2026-09-12').edited, false);

  const table = readFileSync(new URL('../src/duties/DutyScheduleTable.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/duties/sharedDutySchedule.css', import.meta.url), 'utf8');
  const duties = readFileSync(new URL('../convex/duties.ts', import.meta.url), 'utf8');
  const reports = readFileSync(new URL('../convex/reports.ts', import.meta.url), 'utf8');
  assert.match(table, /lct-content-edited/);
  assert.doesNotMatch(table, /lct-row-edited/);
  assert.match(table, /DutyChatButton/);
  assert.match(table, /PencilIcon/);
  assert.match(css, /text-align:\s*center/);
  assert.match(css, /vertical-align:\s*middle/);
  assert.match(css, /\.lct-content-edited \{[\s\S]*background:\s*#fff4c2/);
  assert.doesNotMatch(css, /\.lct-row-edited/);
  assert.match(css, /\.lct-content-with-actions[\s\S]*align-items:\s*center/);
  assert.match(duties, /updatedAt: duty\.updatedAt/);
  assert.match(reports, /createdAt: duty\.createdAt/);
  assert.match(reports, /updatedAt: duty\.updatedAt/);
});

test('admin/mod bấm Nội dung trên bảng tuần/tháng để sửa tại chỗ, user thường thì không', () => {
  const { rows } = buildSharedScheduleRows('week', '2026-09-09', [
    { ...sampleEvents[0], canManage: true },
    { ...sampleEvents[1], canManage: false },
  ]);
  const monday = rows.filter((row) => row.dayIso === '2026-09-07');
  assert.equal(monday[0].canManage, true);
  assert.equal(monday[0].eventId, 'a');
  assert.equal(canOpenDutyContentEditor(monday[0]), true);
  assert.equal(canOpenDutyContentEditor(monday[1]), false);
  assert.equal(canOpenDutyContentEditor(rows.find((row) => row.dayIso === '2026-09-12')), false);
  assert.equal(canOpenDutyContentEditor({ eventId: 'x' }), false);
  assert.equal(canOpenDutyContentEditor({ eventId: 'x', canManage: true }), true);

  const shared = readFileSync(new URL('../src/duties/SharedDutyScheduleView.jsx', import.meta.url), 'utf8');
  const table = readFileSync(new URL('../src/duties/DutyScheduleTable.jsx', import.meta.url), 'utf8');
  const modal = readFileSync(new URL('../src/duties/DutyEditModal.jsx', import.meta.url), 'utf8');
  const personal = readFileSync(new URL('../src/reports/DutyReportsView.jsx', import.meta.url), 'utf8');
  const tabCss = readFileSync(new URL('../src/duties/sharedDutySchedule.css', import.meta.url), 'utf8');
  assert.match(shared, /DutyScheduleTable/);
  assert.match(shared, /DutyEditModal/);
  assert.match(shared, /onEditContent/);
  assert.match(table, /lct-content-button/);
  assert.match(table, /canOpenDutyContentEditor/);
  assert.match(table, /Sửa công tác/);
  assert.match(modal, /duties\.update/);
  assert.match(modal, /DutyEditorFields/);
  assert.match(modal, /Sửa công tác/);
  assert.match(modal, /duty-edit-scope/);
  assert.match(modal, /duty-edit-backdrop/);
  assert.match(modal, /duty-edit-modal-body duty-modern-editor/);
  assert.match(modal, /duty-edit-modal-footer/);
  assert.doesNotMatch(modal, /className="work-modal /);
  const dutyCss = readFileSync(new URL('../src/duties/duties.css', import.meta.url), 'utf8');
  assert.match(dutyCss, /\.duty-edit-backdrop[\s\S]*background:\s*rgba\(13,\s*32,\s*58,\s*0\.58\)/);
  assert.match(dutyCss, /\.duty-edit-modal \{[\s\S]*background:\s*#fff/);
  assert.match(dutyCss, /\.duty-edit-modal-body \{[\s\S]*overflow:\s*auto/);
  assert.match(dutyCss, /\.duty-edit-modal-footer \.work-primary-button \{[\s\S]*color:\s*#fff[\s\S]*background:\s*var\(--lvt-navy/);
  assert.match(personal, /DutyScheduleTable/);
  assert.match(personal, /DutyEditModal/);
  assert.match(personal, /onEditContent/);
  assert.match(personal, /openDutyEditor/);
  assert.match(personal, /report-content-edit/);
  assert.match(personal, /event\.canManage/);
  assert.match(tabCss, /duty-edit-backdrop/);
});

test('UI Lịch công tác có 2 tab, lịch cá nhân dạng lịch, trang tạo riêng, và gỡ Báo cáo Công tác', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const tabs = readFileSync(new URL('../src/duties/DutyWorkspaceTabs.jsx', import.meta.url), 'utf8');
  const shared = readFileSync(new URL('../src/duties/SharedDutyScheduleView.jsx', import.meta.url), 'utf8');
  const personal = readFileSync(new URL('../src/reports/DutyReportsView.jsx', import.meta.url), 'utf8');
  assert.match(readFileSync(new URL('../src/navigationRoutes.js', import.meta.url), 'utf8'), /\['duties', 'Lịch công tác'\]/);
  assert.match(main, /chooseDutyView\('create'\)|onDutyNavigate\?\.\('create'\)|onDutyNavigate\('create'\)/);
  assert.match(main, /SharedDutyScheduleView/);
  assert.match(main, /DutyReportsView/);
  assert.doesNotMatch(main, /Công tác của tôi/);
  assert.doesNotMatch(main, /Công tác tôi tạo/);
  assert.match(tabs, /Lịch công tác cá nhân/);
  assert.match(tabs, /Lịch công tác chung/);
  assert.match(shared, /Tải PDF/);
  assert.match(shared, /Tuần/);
  assert.match(shared, /Tháng/);
  assert.match(shared, /lct-shared-toolbar-center/);
  const tabCss = readFileSync(new URL('../src/duties/sharedDutySchedule.css', import.meta.url), 'utf8');
  assert.match(tabCss, /margin:\s*50px auto 18px/);
  assert.match(tabCss, /lct-shared-toolbar-center/);
  assert.match(personal, /reports\.dutyCalendar/);
  assert.match(personal, /Chọn một người để xem lịch công tác/);
  assert.match(personal, /Lịch công tác của/);
  assert.match(personal, /\['list', 'List'\]/);
  assert.match(personal, /\['week', 'Tuần'\]/);
  assert.match(personal, /\['month', 'Tháng'\]/);
  assert.match(personal, /\['year', 'Năm'\]/);
  assert.doesNotMatch(personal, /\['quarter', 'Quý'\]/);
  assert.match(personal, /useState\('week'\)/);
  assert.match(personal, /DutyListSearch/);
  assert.match(personal, /DutyListTabs/);
  assert.match(personal, /report-calendar-search/);
});

test('gateway PDF lịch chung dùng cùng builder web và bắt buộc query hợp lệ', () => {
  const server = readFileSync(new URL('../scripts/serve-production.mjs', import.meta.url), 'utf8');
  const helper = readFileSync(new URL('../scripts/lib/shared-duty-schedule-pdf.mjs', import.meta.url), 'utf8');
  assert.match(server, /\/api\/duties\/shared-schedule\.pdf/);
  assert.match(helper, /duties\.sharedSchedule/);
  assert.match(helper, /buildSharedDutySchedulePdf/);
});

test('native Lịch CT mở hub trên tab, PDF qua cùng gateway, deep link vào lịch cá nhân', () => {
  const androidRoot = readFileSync(new URL('../android-app/app/src/main/java/lvt/crm/ui/LvtRoot.kt', import.meta.url), 'utf8');
  const androidRepo = readFileSync(new URL('../android-app/app/src/main/java/lvt/crm/data/duties/DutiesRepository.kt', import.meta.url), 'utf8');
  const androidStrings = readFileSync(new URL('../android-app/app/src/main/res/values/strings.xml', import.meta.url), 'utf8');
  const iosRoot = readFileSync(new URL('../ios-uikit-lvt/LvtCrmUIKit/RootTabBarController.swift', import.meta.url), 'utf8');
  const iosRepo = readFileSync(new URL('../ios-uikit-lvt/LvtCrmUIKit/DutiesRepository.swift', import.meta.url), 'utf8');
  const androidHub = readFileSync(new URL('../android-app/app/src/main/java/lvt/crm/ui/duties/DutiesTabHost.kt', import.meta.url), 'utf8');
  const iosHub = readFileSync(new URL('../ios-uikit-lvt/LvtCrmUIKit/DutiesHubViewController.swift', import.meta.url), 'utf8');
  assert.match(androidStrings, /Lịch CT/);
  assert.match(androidHub, /Lịch công tác cá nhân/);
  assert.match(androidHub, /Lịch công tác chung/);
  assert.match(androidHub, /heightIn\(min = 132\.dp\)/);
  assert.doesNotMatch(androidHub, /Modifier\s*\n\s*\.fillMaxSize\(\)\s*\n\s*\.padding\(horizontal = 20\.dp, vertical = 18\.dp\)/);
  assert.match(iosHub, /Lịch công tác cá nhân/);
  assert.match(iosHub, /Lịch công tác chung/);
  assert.match(iosHub, /fillEqually/);
  assert.match(androidRoot, /dutiesSkipHub/);
  assert.match(androidRoot, /DutiesTabHost/);
  assert.match(androidRepo, /\/api\/duties\/shared-schedule\.pdf/);
  assert.match(androidRepo, /withContext\(Dispatchers\.IO\)/);
  assert.match(iosRoot, /title: "Lịch CT"/);
  assert.match(iosRoot, /shouldSelect/);
  assert.match(iosRoot, /openPersonal/);
  assert.match(iosRepo, /\/api\/duties\/shared-schedule\.pdf/);
});

test('PDF/bảng lịch từ bản làm việc chưa duyệt có dấu "BẢN NHÁP – CHƯA DUYỆT"; bản đã duyệt/công khai không đổi', async () => {
  const { sharedScheduleIsDraft, buildSharedSchedulePayload, SHARED_SCHEDULE_DRAFT_MARK } = await import('../src/duties/sharedDutySchedule.js');
  const { buildAuthorizedSharedSchedulePdf } = await import('../scripts/lib/shared-duty-schedule-pdf.mjs');
  const approvedWeek = { weekStart: '2026-09-07', status: 'approved' };
  assert.equal(SHARED_SCHEDULE_DRAFT_MARK, 'BẢN NHÁP – CHƯA DUYỆT');
  assert.equal(sharedScheduleIsDraft({ viewer: 'public', weeks: [], events: [{ approvalChange: 'added' }] }), false);
  assert.equal(sharedScheduleIsDraft({ viewer: 'manager', weeks: [approvedWeek], events: sampleEvents }), false);
  assert.equal(sharedScheduleIsDraft({ viewer: 'manager', weeks: [{ ...approvedWeek, status: 'empty' }], events: [] }), false);
  for (const status of ['draft', 'submitted', 'returned', 'approved_changed']) {
    assert.equal(sharedScheduleIsDraft({ viewer: 'manager', weeks: [{ ...approvedWeek, status }], events: [] }), true, status);
  }
  assert.equal(sharedScheduleIsDraft({ viewer: 'reviewer', weeks: [approvedWeek], events: [{ approvalChange: 'changed' }] }), true);
  assert.equal(sharedScheduleIsDraft(undefined), false);

  const draftData = { viewer: 'manager', weeks: [{ ...approvedWeek, status: 'approved_changed' }], events: sampleEvents };
  const draftPayload = buildSharedSchedulePayload('week', '2026-09-09', draftData);
  assert.equal(draftPayload.draft, true);
  const draftPdf = buildSharedDutySchedulePdf(draftPayload);
  assert.equal(draftPdf.draft, true);
  assert.ok(draftPdf.visibleTexts.includes(SHARED_SCHEDULE_DRAFT_MARK));
  assert.match(Buffer.from(draftPdf.bytes).toString('latin1'), /\/ca 0\.12/, 'watermark is drawn with low opacity');

  const publicPdf = buildSharedDutySchedulePdf(buildSharedSchedulePayload('week', '2026-09-09', { viewer: 'public', events: sampleEvents }));
  assert.equal(publicPdf.draft, false);
  assert.ok(!publicPdf.visibleTexts.includes(SHARED_SCHEDULE_DRAFT_MARK));

  // Server gateway path builds through the same payload helper.
  const fakeClient = (data) => ({ query: async () => data });
  const serverDraft = await buildAuthorizedSharedSchedulePdf(fakeClient(draftData), 'week', '2026-09-09');
  assert.equal(serverDraft.draft, true);
  const serverApproved = await buildAuthorizedSharedSchedulePdf(
    fakeClient({ viewer: 'manager', weeks: [approvedWeek], events: sampleEvents }),
    'week',
    '2026-09-09',
  );
  assert.equal(serverApproved.draft, false);

  const table = readFileSync(new URL('../src/duties/DutyScheduleTable.jsx', import.meta.url), 'utf8');
  assert.match(table, /lct-draft-mark/);
  const view = readFileSync(new URL('../src/duties/SharedDutyScheduleView.jsx', import.meta.url), 'utf8');
  assert.match(view, /buildSharedSchedulePayload\(mode, anchorIso, data\)/);
  assert.match(view, /draft=\{built\.draft\}/);
});

test('Lịch công tác: chi tiết và xem trước import không hiện ngày ISO; nút Tải PDF có lề', () => {
  const reports = readFileSync(new URL('../src/reports/DutyReportsView.jsx', import.meta.url), 'utf8');
  assert.match(reports, /formatVnDateSpan\(event\.startDate, event\.endDate\)/);
  assert.doesNotMatch(reports, /event\.startDate === event\.endDate \? event\.startDate/);
  const bulk = readFileSync(new URL('../src/duties/DutyBulkImport.jsx', import.meta.url), 'utf8');
  assert.match(bulk, /formatVnDate\(row\.startDate\)/);
  const css = readFileSync(new URL('../src/duties/sharedDutySchedule.css', import.meta.url), 'utf8');
  assert.match(css, /\.lct-shared-view \{\n  \/\*[^*]*\*\/\n  padding: 0 24px 32px;/);
});
