import * as XLSX from 'xlsx';

export const VIETNAMESE_PDF_FONT = {
  family: 'NotoSans',
  fileName: 'NotoSans-Regular.ttf',
  style: 'normal',
};

export const ATTENDANCE_PDF_LAYOUT = {
  format: /** @type {const} */ ('a4'),
  unit: /** @type {const} */ ('pt'),
  margin: 48,
  titleSize: 16,
  metaSize: 10,
  tableSize: 9,
  footerSize: 8,
  metaGap: 14,
  tableLineHeight: 12,
  footerBand: 40,
  columns: {
    date: 78,
    code: 72,
    name: 210,
    status: 139,
  },
  /**
   * @param {number} pageWidth
   */
  contentRight(pageWidth) {
    return pageWidth - this.margin;
  },
};

const STATUS_LABELS = {
  present: 'Có mặt',
  late: 'Đi trễ',
  absent_excused: 'Vắng có phép',
  absent_unexcused: 'Vắng không phép',
  absent_pending: 'Vắng chờ xử lý',
  no_data: 'Chưa có dữ liệu',
  exempt: 'Miễn',
};

export function attendanceStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function formatAttendanceStudentLabel(row) {
  const code = String(row?.studentCode || '').trim();
  const name = String(row?.fullName || '').trim();
  return [code, name].filter(Boolean).join(' ');
}

export function buildAttendanceReportVisibleMatrix(days) {
  return [
    ['Ngày', 'Học sinh', 'Trạng thái'],
    ...(days || []).map((row) => [
      row.attendanceDate,
      formatAttendanceStudentLabel(row),
      attendanceStatusLabel(row.effectiveStatus),
    ]),
  ];
}

/** What was observed (Giám thị điểm danh; "Đi trễ" only exists in old camera data). */
const RAW_OBSERVATION_LABELS = {
  present: 'Có mặt',
  late: 'Đi trễ',
  absent: 'Vắng',
  unknown: 'Không rõ',
};

export function rawObservationLabel(raw) {
  if (!raw) return '';
  return RAW_OBSERVATION_LABELS[raw] || raw;
}

export function buildAttendanceXlsxMatrix(payload) {
  const header = [
    payload.title,
    `Lớp: ${payload.className || 'Theo lớp đang chủ nhiệm'}`,
    `Năm học: ${payload.schoolYearName || ''}`,
    `Từ ${payload.from} đến ${payload.to}`,
    `Tạo lúc: ${new Date(payload.generatedAt).toISOString()}`,
    `Người tạo: ${payload.generatedByName || payload.generatedByUserId}`,
  ];
  return [
    [header.join(' | ')],
    ['Ngày', 'Mã HS', 'Học sinh', 'Trạng thái hiệu lực', 'Ghi nhận điểm danh'],
    ...(payload.rows || []).map((row) => [
      row.attendanceDate,
      row.studentCode,
      row.fullName,
      attendanceStatusLabel(row.effectiveStatus),
      rawObservationLabel(row.rawObservation),
    ]),
  ];
}

export function buildStudentTotalsMatrix(payload) {
  return [
    ['Mã HS', 'Học sinh', 'Có mặt', 'Đi trễ', 'Vắng có phép', 'Vắng không phép', 'Vắng chờ xử lý', 'Tổng vắng', 'Chuyên cần'],
    ...(payload.studentTotals || []).map((row) => [
      row.studentCode,
      row.fullName,
      row.present || 0,
      row.late || 0,
      row.absent_excused || 0,
      row.absent_unexcused || 0,
      row.absent_pending || 0,
      (row.absent_excused || 0) + (row.absent_unexcused || 0) + (row.absent_pending || 0),
      `${((row.attendanceRate || 0) * 100).toFixed(1)}%`,
    ]),
  ];
}

export function buildAttendancePdfLines(payload) {
  return [
    payload.title,
    `${payload.schoolName} — ${payload.className || ''} — ${payload.schoolYearName || ''}`,
    `Khoảng: ${payload.from} đến ${payload.to}`,
    `Tạo: ${new Date(payload.generatedAt).toLocaleString('vi-VN')} bởi ${payload.generatedByName || payload.generatedByUserId}`,
    `Tỷ lệ chuyên cần (không tính miễn/chưa có dữ liệu): ${(payload.attendanceRate * 100).toFixed(1)}%`,
    ...(payload.rows || []).map((row) =>
      `${row.attendanceDate}  ${row.studentCode}  ${row.fullName}  ${attendanceStatusLabel(row.effectiveStatus)}`,
    ),
  ];
}

export function downloadAttendanceXlsx(payload) {
  const workbook = XLSX.utils.book_new();
  if (payload.studentTotals?.length) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildStudentTotalsMatrix(payload)), 'tong_hop_hoc_sinh');
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildAttendanceXlsxMatrix(payload)), 'diem_danh');
  XLSX.writeFile(workbook, `bao_cao_diem_danh_${payload.from}_${payload.to}.xlsx`);
}

export async function buildAttendancePdf(payload) {
  const { buildAttendancePdf: renderAttendancePdf } = await import('./attendancePdf.js');
  return renderAttendancePdf(payload, { statusLabel: attendanceStatusLabel });
}

export async function createAttendancePdf(payload) {
  const { createAttendancePdf: renderAttendancePdfBytes } = await import('./attendancePdf.js');
  return renderAttendancePdfBytes(payload, { statusLabel: attendanceStatusLabel });
}

export async function downloadAttendancePdf(payload) {
  const { downloadAttendancePdf: saveAttendancePdf } = await import('./attendancePdf.js');
  return saveAttendancePdf(payload, { statusLabel: attendanceStatusLabel });
}
