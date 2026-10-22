import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { evaluateDutyRefs } from '../convex/dutyWritePolicy.ts';
import {
  DUTY_IMPORT_HEADERS,
  DUTY_IMPORT_MAX_ROWS,
  rowsFromDutyMatrix,
  splitCommaList,
} from '../convex/dutyImportSheet.ts';
import {
  DUTY_IMPORT_MESSAGES,
  parseDutyAllDayFlag,
  parseDutyImportClock,
  validateDutyImportRows,
} from '../convex/dutyImportValidate.ts';
import { DUTY_IMPORT_HEADERS as CLIENT_HEADERS } from '../src/lib/dutyImportExcel.js';

const positions = [
  { _id: 'pos-lead', level: 3, active: true },
  { _id: 'pos-member', level: 1, active: true },
];

const departments = [
  { _id: 'dept-toan', name: 'Tổ Toán', code: 'TOAN', active: true },
  { _id: 'dept-van', name: 'Tổ Văn', code: 'VAN', active: true },
  { _id: 'dept-off', name: 'Tổ nghỉ', code: 'NGHI', active: false },
];

const users = [
  {
    _id: 'user-lead',
    name: 'Tổ trưởng',
    email: 'lead@school.edu',
    status: 'active',
    departmentId: 'dept-toan',
    positionId: 'pos-lead',
  },
  {
    _id: 'user-a',
    name: 'Nguyen Van A',
    email: 'a.nguyen@example.school',
    status: 'active',
    departmentId: 'dept-toan',
    positionId: 'pos-member',
  },
  {
    _id: 'user-b',
    name: 'Tran Thi B',
    email: 'b.tran@example.school',
    status: 'active',
    departmentId: 'dept-van',
    positionId: 'pos-member',
  },
  {
    _id: 'user-off',
    name: 'Disabled',
    email: 'off@school.edu',
    status: 'disabled',
    departmentId: 'dept-toan',
    positionId: 'pos-member',
  },
];

const opsActor = {
  user: { _id: 'admin-1', departmentId: 'dept-toan', positionId: 'pos-lead' },
  isOps: true,
  positions,
};

const leadActor = {
  user: { _id: 'user-lead', departmentId: 'dept-toan', positionId: 'pos-lead' },
  isOps: false,
  positions,
};

function baseRow(overrides = {}) {
  return {
    rowNumber: 2,
    ten_cong_tac: 'Hop to',
    noi_dung: 'Noi dung hop',
    dia_diem: 'Hoi truong',
    ngay_bat_dau: '2026-09-15',
    gio_bat_dau: '08:00',
    ngay_ket_thuc: '2026-09-15',
    gio_ket_thuc: '11:00',
    ca_ngay: '0',
    ma_phong_ban: 'TOAN',
    email_tham_gia: '',
    thanh_phan_khac: '',
    ...overrides,
  };
}

test('client template headers match server duty import headers', () => {
  assert.deepEqual(CLIENT_HEADERS, [...DUTY_IMPORT_HEADERS]);
});

test('rowsFromDutyMatrix accepts required headers and skips empty rows', () => {
  const parsed = rowsFromDutyMatrix([
    [...DUTY_IMPORT_HEADERS],
    ['Hop to', 'Noi dung', 'Hoi truong', '2026-09-15', '08:00', '2026-09-15', '11:00', '0', 'TOAN', '', ''],
    ['', '', '', '', '', '', '', '', '', '', ''],
  ]);
  assert.equal(parsed.headersOk, true);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].ten_cong_tac, 'Hop to');
  assert.equal(parsed.rows[0].thanh_phan_khac, '');
  assert.equal(parsed.rows[0].rowNumber, 2);
});

test('rowsFromDutyMatrix rejects missing headers', () => {
  const parsed = rowsFromDutyMatrix([
    ['ten_cong_tac', 'noi_dung'],
    ['Hop', 'Noi dung'],
  ]);
  assert.equal(parsed.headersOk, false);
  assert.deepEqual(parsed.rows, []);
});

test('splitCommaList tách mã/email và bỏ khoảng trắng', () => {
  assert.deepEqual(splitCommaList('TOAN, VAN,  '), ['TOAN', 'VAN']);
  assert.deepEqual(splitCommaList('a@x.com, b@y.com'), ['a@x.com', 'b@y.com']);
});

test('parseDutyAllDayFlag đọc 1/0, có/không, true/false', () => {
  assert.deepEqual(parseDutyAllDayFlag(''), { ok: true, value: false });
  assert.deepEqual(parseDutyAllDayFlag('1'), { ok: true, value: true });
  assert.deepEqual(parseDutyAllDayFlag('có'), { ok: true, value: true });
  assert.deepEqual(parseDutyAllDayFlag('không'), { ok: true, value: false });
  assert.deepEqual(parseDutyAllDayFlag('true'), { ok: true, value: true });
  assert.deepEqual(parseDutyAllDayFlag('FALSE'), { ok: true, value: false });
  assert.equal(parseDutyAllDayFlag('maybe').ok, false);
});

test('parseDutyImportClock chuẩn hóa HH:mm', () => {
  assert.equal(parseDutyImportClock('8:00'), '08:00');
  assert.equal(parseDutyImportClock('17:00:30'), '17:00');
  assert.equal(parseDutyImportClock(''), null);
  assert.equal(parseDutyImportClock('25:00'), null);
});

test('validateDutyImportRows nhận ngày YYYY-MM-DD và dd/mm/yyyy', () => {
  const result = validateDutyImportRows(
    [
      baseRow({ ngay_bat_dau: '15/09/2026', ngay_ket_thuc: '15/09/2026' }),
    ],
    { actor: opsActor, departments, users },
  );
  assert.equal(result.ok, true);
  assert.equal(result.preview[0].startDate, '2026-09-15');
  assert.equal(result.preview[0].endDate, '2026-09-15');
});

test('ca_ngay dùng ngày bắt đầu và giờ mặc định 08:00-17:00', () => {
  const result = validateDutyImportRows(
    [
      baseRow({
        ca_ngay: '1',
        gio_bat_dau: '',
        gio_ket_thuc: '',
        ngay_ket_thuc: '',
      }),
    ],
    { actor: opsActor, departments, users },
  );
  assert.equal(result.ok, true);
  assert.equal(result.preview[0].allDay, true);
  assert.equal(result.preview[0].endDate, '2026-09-15');
  assert.equal(result.preview[0].startTime, '08:00');
  assert.equal(result.preview[0].endTime, '17:00');
});

test('tổ trưởng thiếu người tham gia thì all-or-nothing', () => {
  const result = validateDutyImportRows(
    [baseRow({ ma_phong_ban: '', email_tham_gia: '', thanh_phan_khac: '' })],
    { actor: leadActor, departments, users },
  );
  assert.equal(result.ok, false);
  assert.equal(result.preview.length, 0);
  assert.equal(result.errors.some((item) => item.message === DUTY_IMPORT_MESSAGES.participantsRequired), true);
});

test('văn thư nhập lịch 4 cột trước, chưa cần thành phần', () => {
  const result = validateDutyImportRows(
    [baseRow({ ma_phong_ban: '', email_tham_gia: '', thanh_phan_khac: '' })],
    { actor: opsActor, departments, users },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.preview[0].departmentIds, []);
  assert.deepEqual(result.preview[0].participantUserIds, []);
});

test('chỉ thành phần khác vẫn hợp lệ', () => {
  const result = validateDutyImportRows(
    [baseRow({ ma_phong_ban: '', email_tham_gia: '', thanh_phan_khac: '  Đoàn Sở GD  ' })],
    { actor: opsActor, departments, users },
  );
  assert.equal(result.ok, true);
  assert.equal(result.preview[0].otherParticipants, 'Đoàn Sở GD');
  assert.deepEqual(result.preview[0].departmentIds, []);
  assert.deepEqual(result.preview[0].participantUserIds, []);
});

test('tổ trưởng được tạo công tác chỉ với thành phần khác', () => {
  const result = validateDutyImportRows(
    [baseRow({ ma_phong_ban: '', email_tham_gia: '', thanh_phan_khac: 'Khách mời phòng GD' })],
    { actor: leadActor, departments, users },
  );
  assert.equal(result.ok, true);
  assert.equal(result.preview[0].otherParticipants, 'Khách mời phòng GD');
});

test('thành phần khác quá 500 ký tự bị chặn', () => {
  const result = validateDutyImportRows(
    [baseRow({ ma_phong_ban: '', email_tham_gia: '', thanh_phan_khac: 'x'.repeat(501) })],
    { actor: opsActor, departments, users },
  );
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.message === DUTY_IMPORT_MESSAGES.otherParticipantsInvalid), true);
});

test('địa điểm là chữ gõ tự do: không tra danh mục, chỉ bắt buộc và tối đa 200 ký tự', () => {
  const free = validateDutyImportRows(
    [baseRow({ dia_diem: '  UBND phường 5, số 12 đường A  ' })],
    { actor: opsActor, departments, users },
  );
  assert.equal(free.ok, true);
  assert.equal(free.preview[0].locationText, 'UBND phường 5, số 12 đường A');

  const longest = validateDutyImportRows([baseRow({ dia_diem: 'x'.repeat(200) })], { actor: opsActor, departments, users });
  assert.equal(longest.ok, true);

  const tooLong = validateDutyImportRows([baseRow({ dia_diem: 'x'.repeat(201) })], { actor: opsActor, departments, users });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.errors.some((item) => item.message === DUTY_IMPORT_MESSAGES.locationInvalid), true);

  const empty = validateDutyImportRows([baseRow({ dia_diem: '   ' })], { actor: opsActor, departments, users });
  assert.equal(empty.ok, false);
  assert.equal(empty.errors.some((item) => item.message === DUTY_IMPORT_MESSAGES.locationRequired), true);
});

test('mã phòng ban và email sai bị chặn', () => {
  const result = validateDutyImportRows(
    [
      baseRow({ ma_phong_ban: 'KHONGCO', email_tham_gia: 'missing@school.edu' }),
    ],
    { actor: opsActor, departments, users },
  );
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.message === DUTY_IMPORT_MESSAGES.invalidDepartment), true);
  assert.equal(result.errors.some((item) => item.message === DUTY_IMPORT_MESSAGES.invalidParticipant), true);
});

test('nhiều mã phòng và email cách phẩy được map', () => {
  const result = validateDutyImportRows(
    [
      baseRow({
        ma_phong_ban: 'toan, van',
        email_tham_gia: 'a.nguyen@example.school, b.tran@example.school',
      }),
    ],
    { actor: opsActor, departments, users },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.preview[0].departmentIds, ['dept-toan', 'dept-van']);
  assert.deepEqual(result.preview[0].participantEmails, [
    'a.nguyen@example.school',
    'b.tran@example.school',
  ]);
});

test('tổ trưởng không được điền ma_phong_ban', () => {
  const result = validateDutyImportRows(
    [baseRow({ ma_phong_ban: 'TOAN', email_tham_gia: '' })],
    { actor: leadActor, departments, users },
  );
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.message === DUTY_IMPORT_MESSAGES.departmentForbidden), true);
});

test('tổ trưởng được gán email cấp dưới cùng phòng', () => {
  const result = validateDutyImportRows(
    [baseRow({ ma_phong_ban: '', email_tham_gia: 'a.nguyen@example.school' })],
    { actor: leadActor, departments, users },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.preview[0].participantUserIds, ['user-a']);
});

test('tổ trưởng không gán email phòng khác', () => {
  const result = validateDutyImportRows(
    [baseRow({ ma_phong_ban: '', email_tham_gia: 'b.tran@example.school' })],
    { actor: leadActor, departments, users },
  );
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.message === DUTY_IMPORT_MESSAGES.notSubordinate), true);
});

test('file quá 200 dòng bị chặn', () => {
  const rows = Array.from({ length: DUTY_IMPORT_MAX_ROWS + 1 }, (_, index) =>
    baseRow({ rowNumber: index + 2, ten_cong_tac: `Hop ${index}` }),
  );
  const result = validateDutyImportRows(rows, { actor: opsActor, departments, users });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].message, DUTY_IMPORT_MESSAGES.tooManyRows);
});

test('evaluateDutyRefs giữ rule tạo tay', () => {
  assert.equal(
    evaluateDutyRefs({ departmentIds: ['dept-toan'], participantUserIds: [] }, leadActor, {
      departments,
      users,
    }),
    'DUTY_DEPARTMENT_FORBIDDEN',
  );
  assert.equal(
    evaluateDutyRefs({ departmentIds: [], participantUserIds: [] }, opsActor, {
      departments,
      users,
    }),
    null,
  );
  assert.equal(
    evaluateDutyRefs({ departmentIds: [], participantUserIds: [] }, leadActor, {
      departments,
      users,
    }),
    'DUTY_PARTICIPANTS_REQUIRED',
  );
  assert.equal(
    evaluateDutyRefs(
      { departmentIds: [], participantUserIds: [], otherParticipants: 'Đoàn Sở GD' },
      opsActor,
      { departments, users },
    ),
    null,
  );
  assert.equal(
    evaluateDutyRefs(
      { departmentIds: [], participantUserIds: [], otherParticipants: 'Khách mời' },
      leadActor,
      { departments, users },
    ),
    null,
  );
});

test('một dòng lỗi thì không có preview commit', () => {
  const result = validateDutyImportRows(
    [baseRow(), baseRow({ rowNumber: 3, ten_cong_tac: '' })],
    { actor: opsActor, departments, users },
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.preview, []);
});

test('UI Công tác có nút Import Excel và gọi dutyImport', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const calendar = readFileSync(new URL('../src/reports/DutyReportsView.jsx', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/duties/DutyBulkImport.jsx', import.meta.url), 'utf8');
  const head = readFileSync(new URL('../src/duties/DutyWorkspaceTabs.jsx', import.meta.url), 'utf8');
  const shared = readFileSync(new URL('../src/duties/SharedDutyScheduleView.jsx', import.meta.url), 'utf8');
  assert.match(main, /DutyBulkImport/);
  // Page-level actions live in the Lịch công tác head on both tabs, not inside a tab.
  assert.match(head, /Import Excel/);
  assert.match(head, /Tạo công tác/);
  assert.match(head, /work-primary-button/);
  assert.doesNotMatch(calendar, /DutyCreateToolbarActions|Import Excel|Tạo công tác/);
  assert.doesNotMatch(shared, /\+ Tạo công tác/);
  assert.match(shared, /DutyBulkImport/);
  assert.match(shared, /canCreate=\{canCreate\}/);
  assert.equal((main.match(/canCreate=\{canCreateDuties\}/g) || []).length, 3);
  assert.match(ui, /Import Excel/);
  assert.match(ui, /anyApi\.dutyImport\.generateUploadUrl/);
  assert.match(ui, /anyApi\.dutyImport\.validateUpload/);
  assert.match(ui, /anyApi\.dutyImport\.commit/);
  assert.match(ui, /Tải file nhập liệu mẫu/);
  const editor = readFileSync(new URL('../src/duties/DutyEditorFields.jsx', import.meta.url), 'utf8');
  assert.match(editor, /Thành phần khác/);
});
