import * as XLSX from 'xlsx';
import { templateFileName } from '../attendance/attendanceState.js';

/** Must match SUPERVISOR_IMPORT_HEADERS in convex/supervisorAttendancePolicy.ts. */
export const SUPERVISOR_TEMPLATE_HEADERS = ['Lớp học', 'Tên học sinh', 'Vắng'];
export const SUPERVISOR_TEMPLATE_SHEET = 'diem_danh';
export const SUPERVISOR_TEMPLATE_INSTRUCTIONS_SHEET = 'huong_dan';

export const SUPERVISOR_TEMPLATE_INSTRUCTIONS = [
  ['File điểm danh Giám thị — tải mới mỗi ngày từ menu Điểm danh (danh sách lớp luôn cập nhật).'],
  ['Giữ nguyên 3 cột: Lớp học, Tên học sinh, Vắng. Không đổi tên lớp, tên học sinh.'],
  ['Học sinh vắng: ghi x vào cột Vắng. Để trống = có mặt.'],
  ['Có thể xóa bớt lớp không cần nhập; lớp không có trong file giữ nguyên điểm danh trên phần mềm.'],
  ['Học sinh của một lớp có trong file nhưng bị xóa dòng sẽ được tính là có mặt.'],
];

export function supervisorTemplateMatrix(rows) {
  return [SUPERVISOR_TEMPLATE_HEADERS, ...(rows || []).map((row) => [row.className, row.studentName, ''])];
}

export function buildSupervisorTemplateWorkbook(rows) {
  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet(supervisorTemplateMatrix(rows));
  dataSheet['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 8 }];
  const instructionSheet = XLSX.utils.aoa_to_sheet(SUPERVISOR_TEMPLATE_INSTRUCTIONS);
  instructionSheet['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(workbook, dataSheet, SUPERVISOR_TEMPLATE_SHEET);
  XLSX.utils.book_append_sheet(workbook, instructionSheet, SUPERVISOR_TEMPLATE_INSTRUCTIONS_SHEET);
  return workbook;
}

export function downloadSupervisorTemplate(rows, date) {
  XLSX.writeFile(buildSupervisorTemplateWorkbook(rows), templateFileName(date));
}
