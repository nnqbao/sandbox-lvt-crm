import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AttendanceReportsTable } from '../src/homeroom/AttendanceReportsTable.js';
import {
  ATTENDANCE_PDF_LAYOUT,
  VIETNAMESE_PDF_FONT,
  buildAttendancePdf,
  buildAttendancePdfLines,
  buildAttendanceReportVisibleMatrix,
  buildAttendanceXlsxMatrix,
  createAttendancePdf,
  formatAttendanceStudentLabel,
} from '../src/homeroom/homeroomExport.js';

const INTERNAL_STUDENT_ID = 'qn7abcinternalstudent01';

const uatPayload = {
  title: 'Báo cáo điểm danh lớp chủ nhiệm',
  schoolName: 'THCS Lê Văn Tám',
  className: '6A1',
  schoolYearName: '2026-2027',
  from: '2026-09-01',
  to: '2026-09-02',
  generatedAt: 1,
  generatedByUserId: 'u1',
  generatedByName: 'Giám thị',
  attendanceRate: 0.5,
  ratedRows: 2,
  rows: [
    {
      classId: 'class-6a1',
      studentId: INTERNAL_STUDENT_ID,
      studentCode: 'QA-HS001',
      fullName: 'Nguyễn An',
      attendanceDate: '2026-09-01',
      effectiveStatus: 'present',
      rawObservation: 'present',
    },
    {
      classId: 'class-6a1',
      studentId: INTERNAL_STUDENT_ID,
      studentCode: 'QA-HS001',
      fullName: 'Nguyễn An',
      attendanceDate: '2026-09-02',
      effectiveStatus: 'absent_unexcused',
      rawObservation: 'absent',
    },
  ],
};

function assertNoInternalIdentity(text) {
  assert.doesNotMatch(String(text), /qn7|qn[a-z0-9]+internal/i);
  assert.equal(String(text).includes(INTERNAL_STUDENT_ID), false);
}

test('report UI shows QA-HS001 / Nguyễn An and never the internal student id', () => {
  assert.equal(formatAttendanceStudentLabel(uatPayload.rows[0]), 'QA-HS001 Nguyễn An');
  assertNoInternalIdentity(formatAttendanceStudentLabel({
    studentId: INTERNAL_STUDENT_ID,
    studentCode: 'QA-HS001',
    fullName: 'Nguyễn An',
  }));
  assert.doesNotMatch(formatAttendanceStudentLabel({ studentId: INTERNAL_STUDENT_ID }), /qn7/);

  const matrix = buildAttendanceReportVisibleMatrix(uatPayload.rows);
  assert.deepEqual(matrix[0], ['Ngày', 'Học sinh', 'Trạng thái']);
  assert.deepEqual(matrix[1], ['2026-09-01', 'QA-HS001 Nguyễn An', 'Có mặt']);
  assert.deepEqual(matrix[2], ['2026-09-02', 'QA-HS001 Nguyễn An', 'Vắng không phép']);
  for (const row of matrix) {
    assertNoInternalIdentity(row.join(' '));
  }

  const html = renderToStaticMarkup(React.createElement(AttendanceReportsTable, { days: uatPayload.rows }));
  assert.match(html, /QA-HS001/);
  assert.match(html, /Nguyễn An/);
  assert.match(html, /Có mặt/);
  assert.match(html, /Vắng không phép/);
  assertNoInternalIdentity(html);

  const detailSource = readFileSync(new URL('../src/homeroom/HomeroomClassDetail.jsx', import.meta.url), 'utf8');
  const reportsFn = detailSource.slice(
    detailSource.indexOf('function ReportsTab'),
    detailSource.indexOf('function RateCell'),
  );
  assert.match(reportsFn, /AttendanceReportsTable/);
  assert.match(reportsFn, /report\.summary\.days/);
  assert.doesNotMatch(reportsFn, /<td>\{row\.studentId\}<\/td>/);
});

test('XLSX and PDF export matrices use code, name, class/year titles, and keep 50.0%', () => {
  const xlsx = buildAttendanceXlsxMatrix(uatPayload);
  const banner = xlsx[0][0];
  assert.match(banner, /6A1/);
  assert.match(banner, /2026-2027/);
  assert.doesNotMatch(banner, /Lớp ngoài phạm vi|Năm học rò rỉ/);
  assert.deepEqual(xlsx[1], ['Ngày', 'Mã HS', 'Học sinh', 'Trạng thái hiệu lực', 'Ghi nhận điểm danh']);
  assert.deepEqual(xlsx[2], ['2026-09-01', 'QA-HS001', 'Nguyễn An', 'Có mặt', 'Có mặt']);
  assert.deepEqual(xlsx[3], ['2026-09-02', 'QA-HS001', 'Nguyễn An', 'Vắng không phép', 'Vắng']);
  for (const row of xlsx) {
    assertNoInternalIdentity(Array.isArray(row) ? row.join(' | ') : row);
  }

  const pdf = buildAttendancePdfLines(uatPayload);
  assert.match(pdf[0], /điểm danh/);
  assert.match(pdf.join('\n'), /6A1/);
  assert.match(pdf.join('\n'), /2026-2027/);
  assert.match(pdf.join('\n'), /50\.0%/);
  assert.match(pdf.join('\n'), /QA-HS001/);
  assert.match(pdf.join('\n'), /Nguyễn An/);
  assert.match(pdf.join('\n'), /Có mặt/);
  assert.match(pdf.join('\n'), /Vắng không phép/);
  assert.ok(pdf.some((line) => line.includes('QA-HS001') && line.includes('Nguyễn An') && line.includes('Có mặt')));
  assert.ok(pdf.some((line) => line.includes('QA-HS001') && line.includes('Nguyễn An') && line.includes('Vắng không phép')));
  for (const line of pdf) {
    assertNoInternalIdentity(line);
  }
});

const NFD_NGUYEN = 'Nguyễn'.normalize('NFD');
const NFC_NGUYEN = 'Nguyễn'.normalize('NFC');

function vietnamesePdfPayload(overrides = {}) {
  return {
    ...uatPayload,
    title: 'Báo cáo điểm danh lớp chủ nhiệm',
    generatedByName: 'Giám thị',
    rows: [
      {
        ...uatPayload.rows[0],
        studentCode: 'QA-HS001',
        fullName: `${NFC_NGUYEN} An`,
        effectiveStatus: 'present',
      },
      {
        ...uatPayload.rows[0],
        attendanceDate: '2026-09-02',
        studentCode: 'QA-HS002',
        fullName: 'Trần Bình',
        effectiveStatus: 'absent_excused',
      },
    ],
    ...overrides,
  };
}

function manyAttendanceRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    classId: 'class-6a1',
    studentId: `${INTERNAL_STUDENT_ID}-${index}`,
    studentCode: `QA-HS${String(index + 1).padStart(3, '0')}`,
    fullName: index === 0 ? `${NFC_NGUYEN} An` : index === 1 ? 'Trần Bình' : `Học sinh ${index + 1}`,
    attendanceDate: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`,
    effectiveStatus: index % 4 === 1 ? 'absent_excused' : 'present',
    rawObservation: 'present',
  }));
}

function pdfLatin1(bytes) {
  return Buffer.from(bytes).toString('latin1');
}

test('attendance PDF lines keep every row and never truncate at 40', () => {
  const rows = manyAttendanceRows(45);
  const pdf = buildAttendancePdfLines({ ...uatPayload, rows });
  assert.equal(pdf.filter((line) => line.includes('QA-HS')).length, 45);
  assert.match(pdf[44 + 5], /QA-HS045/);
});

test('createAttendancePdf returns bytes with bundled Unicode TTF, NFC text, wrapping, and pagination', async () => {
  const fontUrl = new URL('../src/assets/fonts/NotoSans-Regular.ttf', import.meta.url);
  const licenseUrl = new URL('../src/assets/fonts/OFL.txt', import.meta.url);
  const provenanceUrl = new URL('../src/assets/fonts/README.md', import.meta.url);
  assert.equal(existsSync(fontUrl), true, 'Noto Sans TTF must be vendored in the repo');
  assert.equal(existsSync(licenseUrl), true, 'OFL license must sit beside the font');
  assert.equal(existsSync(provenanceUrl), true, 'font provenance must sit beside the font');
  const fontBytes = readFileSync(fontUrl);
  const signature = fontBytes.subarray(0, 4);
  assert.notEqual(signature.toString('ascii'), 'wOF2');
  assert.notEqual(signature.toString('ascii'), 'wOFF');
  assert.ok(
    signature.equals(Buffer.from([0, 1, 0, 0])) || signature.toString('ascii') === 'OTTO' || signature.toString('ascii') === 'true',
    'vendored file must be a TrueType/OpenType font, not WOFF2',
  );
  assert.match(readFileSync(licenseUrl, 'utf8'), /SIL OPEN FONT LICENSE/i);
  assert.match(readFileSync(provenanceUrl, 'utf8'), /Noto Sans/);
  assert.equal(VIETNAMESE_PDF_FONT.family, 'NotoSans');
  assert.equal(VIETNAMESE_PDF_FONT.fileName, 'NotoSans-Regular.ttf');

  assert.notEqual(NFD_NGUYEN, NFC_NGUYEN);

  const longSchool = `THCS ${'Lê Văn Tám '.repeat(12).trim()}`;
  const longName = `Trần ${'Thị '.repeat(18)}Ánh Tuyết`;
  const payload = vietnamesePdfPayload({
    schoolName: longSchool,
    generatedByName: NFD_NGUYEN,
    rows: [
      {
        ...uatPayload.rows[0],
        studentCode: 'QA-HS001',
        fullName: `${NFD_NGUYEN} An`,
        effectiveStatus: 'present',
      },
      {
        ...uatPayload.rows[0],
        attendanceDate: '2026-09-02',
        studentCode: 'QA-HS002',
        fullName: longName,
        effectiveStatus: 'absent_excused',
      },
      ...manyAttendanceRows(80).slice(2),
    ],
  });

  const bytes = await createAttendancePdf(payload);
  assert.ok(bytes instanceof ArrayBuffer);
  const header = Buffer.from(bytes.slice(0, 5)).toString('ascii');
  assert.equal(header, '%PDF-');

  const built = await buildAttendancePdf(payload);
  assert.ok(built.bytes instanceof ArrayBuffer);
  assert.equal(Buffer.from(built.bytes).subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(built.doc.getNumberOfPages(), built.layout.pageCount);
  assert.equal(built.doc.getFont().fontName, VIETNAMESE_PDF_FONT.family);
  assert.equal(built.layout.rowCount, payload.rows.length);
  assert.ok(built.layout.pageCount >= 2);
  assert.equal(built.layout.footers.length, built.layout.pageCount);
  assert.deepEqual(
    built.layout.footers,
    Array.from({ length: built.layout.pageCount }, (_, index) => `Trang ${index + 1}/${built.layout.pageCount}`),
  );
  assert.equal(built.layout.tableHeaderPages.length, built.layout.pageCount);
  assert.ok(built.layout.wrappedLineCount >= 2);

  const visible = built.layout.visibleTexts.join('\n');
  assert.match(visible, /Báo cáo điểm danh lớp chủ nhiệm/);
  assert.match(visible, /Nguyễn/);
  assert.match(visible, /Trần/);
  assert.match(visible, /Vắng có phép/);
  assert.match(visible, /Tỷ lệ chuyên cần/);
  assert.match(visible, /50\.0%/);
  assert.match(visible, /QA-HS001/);
  assert.match(visible, /QA-HS080/);
  assert.doesNotMatch(visible, /QA-HS081/);
  assert.ok(visible.includes(NFC_NGUYEN));
  assert.equal(visible.includes(NFD_NGUYEN) && NFD_NGUYEN !== NFC_NGUYEN, false);
  for (const text of built.layout.visibleTexts) {
    assert.equal(text, text.normalize('NFC'));
    assertNoInternalIdentity(text);
  }

  const pageWidth = built.layout.pageWidth;
  const margin = ATTENDANCE_PDF_LAYOUT.margin;
  assert.equal(margin, 48);
  assert.ok(pageWidth >= 595 && pageWidth <= 596);
  assert.ok(built.layout.maxX <= pageWidth - margin + 0.75);
  assert.ok(built.layout.minX >= margin - 0.75);
  assert.ok(built.layout.maxX <= ATTENDANCE_PDF_LAYOUT.contentRight(pageWidth) + 0.75);

  const latin1 = pdfLatin1(bytes);
  assert.match(latin1, /NotoSans/);
  assert.match(latin1, /FontFile2/);
  assert.match(latin1, /\/Subtype\s*\/(TrueType|Type0|CIDFontType2)/);
  assert.doesNotMatch(latin1, /qn7abcinternalstudent01/);
  const baseFonts = [...latin1.matchAll(/\/BaseFont\s*\/([^\s[/]+)/g)].map((match) => match[1]);
  assert.ok(baseFonts.some((name) => name.includes('NotoSans')));
  assert.ok(
    baseFonts.some((name) => name.includes('NotoSans')) && latin1.includes('FontFile2'),
    'PDF must embed the Unicode TTF rather than a Helvetica-only path',
  );

  const extractedLiterals = [...latin1.matchAll(/\((?:\\.|[^\\)])*\)/g)]
    .map((match) => match[0].slice(1, -1))
    .join('\n');
  if (extractedLiterals.includes('Báo cáo') || extractedLiterals.includes('Nguyễn') || extractedLiterals.includes('50.0%')) {
    assert.match(extractedLiterals, /Báo cáo điểm danh lớp chủ nhiệm|Nguyễn|50\.0%|Tỷ lệ chuyên cần/);
  }

  const exportSource = readFileSync(new URL('../src/homeroom/homeroomExport.js', import.meta.url), 'utf8');
  const pdfSource = readFileSync(new URL('../src/homeroom/attendancePdf.js', import.meta.url), 'utf8');
  const fontSource = readFileSync(new URL('../src/homeroom/vietnamesePdfFont.js', import.meta.url), 'utf8');
  const combined = `${exportSource}\n${pdfSource}\n${fontSource}`;
  assert.match(combined, /addFileToVFS/);
  assert.match(combined, /addFont/);
  assert.match(combined, /setFont/);
  assert.match(combined, /splitTextToSize/);
  assert.match(combined, /normalize\(\s*['"]NFC['"]\s*\)/);
  assert.doesNotMatch(combined, /setFont\(\s*['"]helvetica['"]/i);
  assert.doesNotMatch(combined, /montserrat|woff2|fonts\.google|cdn\./i);
  assert.doesNotMatch(combined, /data:font\/|AAEAAA[A-Za-z0-9+/]{40,}/);
  assert.match(readFileSync(fileURLToPath(new URL('../src/homeroom/homeroomExport.js', import.meta.url)), 'utf8')
    + readFileSync(fileURLToPath(new URL('../src/homeroom/attendancePdf.js', import.meta.url)), 'utf8'), /createAttendancePdf|buildAttendancePdf/);
  assert.match(pdfSource, /\.save\(/);
});
