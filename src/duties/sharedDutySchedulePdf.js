import { jsPDF } from 'jspdf';

import { loadSharedSchedulePdfFontBytes } from './sharedDutyScheduleFont.js';
import {
  LCT_ISSUING_AUTHORITY,
  LCT_NATIONAL_MOTTO_SUB,
  LCT_NATIONAL_MOTTO_TITLE,
  LCT_SCHOOL_LINES,
  SHARED_SCHEDULE_DRAFT_MARK,
  sharedScheduleFilename,
} from './sharedDutySchedule.js';

const PAGE = {
  format: /** @type {const} */ ('a4'),
  unit: /** @type {const} */ ('pt'),
  marginX: 48,
  marginTop: 28,
  marginBottom: 36,
  headerSize: 11,
  titleSize: 13,
  tableSize: 10,
  lineHeight: 13,
  cellPadX: 6,
  cellPadY: 5,
  /** @type {readonly [number, number, number]} */
  headerFill: [239, 239, 239],
  /** @type {readonly [number, number, number]} */
  ink: [31, 31, 31],
  /** @type {readonly [number, number, number]} */
  border: [31, 31, 31],
  /** Draft line / watermark (danger text tone). @type {readonly [number, number, number]} */
  draft: [155, 69, 57],
};

/** Light diagonal watermark across the page (drawn last, low opacity, never hides text). */
function drawDraftWatermark(doc, pageWidth, pageHeight) {
  const hasGState = typeof doc.GState === 'function' && typeof doc.setGState === 'function';
  if (hasGState) doc.saveGraphicsState();
  if (hasGState) doc.setGState(new doc.GState({ opacity: 0.12 }));
  applyScheduleFont(doc, 'bold');
  doc.setTextColor(PAGE.draft[0], PAGE.draft[1], PAGE.draft[2]);
  const angle = 35;
  const rad = (angle * Math.PI) / 180;
  doc.setFontSize(54);
  // Shrink so the rotated mark stays inside the page margins.
  const fit = Math.min(1, ((pageWidth - PAGE.marginX * 2) * 0.95) / (Math.cos(rad) * doc.getTextWidth(SHARED_SCHEDULE_DRAFT_MARK)));
  doc.setFontSize(54 * fit);
  const width = doc.getTextWidth(SHARED_SCHEDULE_DRAFT_MARK);
  // Start point so the rotated text is centred on the page.
  const x = pageWidth / 2 - (Math.cos(rad) * width) / 2;
  const y = pageHeight / 2 + (Math.sin(rad) * width) / 2;
  doc.text(SHARED_SCHEDULE_DRAFT_MARK, x, y, { angle });
  if (hasGState) doc.restoreGraphicsState();
}

const COL_RATIOS = [1800, 1500, 3000, 2200, 2132];

function normalizePdfText(value) {
  return String(value ?? '').normalize('NFC');
}

function bytesToVfsString(bytes) {
  let binary = '';
  const step = 8192;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return binary;
}

/** Tinos = Times New Roman metrics, matching the Word template (DESIGN.md §2). */
export const SHARED_SCHEDULE_PDF_FONT = Object.freeze({
  family: 'Tinos',
  regular: Object.freeze({ fileName: 'Tinos-Regular.ttf', style: 'normal' }),
  bold: Object.freeze({ fileName: 'Tinos-Bold.ttf', style: 'bold' }),
});

function registerScheduleFonts(doc) {
  const { regular, bold } = SHARED_SCHEDULE_PDF_FONT;
  if (doc.existsFileInVFS(regular.fileName) && doc.existsFileInVFS(bold.fileName)) return;
  const bytes = loadSharedSchedulePdfFontBytes();
  doc.addFileToVFS(regular.fileName, bytesToVfsString(bytes.regular));
  doc.addFont(regular.fileName, SHARED_SCHEDULE_PDF_FONT.family, regular.style);
  doc.addFileToVFS(bold.fileName, bytesToVfsString(bytes.bold));
  doc.addFont(bold.fileName, SHARED_SCHEDULE_PDF_FONT.family, bold.style);
}

/** @param {'normal' | 'bold'} [style] */
function applyScheduleFont(doc, style = 'normal') {
  registerScheduleFonts(doc);
  doc.setFont(SHARED_SCHEDULE_PDF_FONT.family, style);
}

function columnWidths(contentWidth) {
  const total = COL_RATIOS.reduce((sum, value) => sum + value, 0);
  return COL_RATIOS.map((ratio) => (contentWidth * ratio) / total);
}

function wrapText(doc, text, width) {
  const wrapped = doc.splitTextToSize(normalizePdfText(text || ' '), Math.max(12, width));
  return Array.isArray(wrapped) ? wrapped : [String(wrapped)];
}

function rowHeight(lineCount) {
  return lineCount * PAGE.lineHeight + PAGE.cellPadY * 2;
}

/**
 * @param {{ range: { title: string, startIso: string, endIso: string }, rows: Array<{
 *   dayLabel: string, time: string, content: string, location: string, participants: string,
 *   showDay: boolean, rowSpan: number
 * }> }} payload
 */
export function buildSharedDutySchedulePdf(payload) {
  const doc = new jsPDF({ unit: PAGE.unit, format: PAGE.format });
  applyScheduleFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE.marginX * 2;
  const widths = columnWidths(contentWidth);
  const visibleTexts = [];
  const footerTop = pageHeight - PAGE.marginBottom;

  const pushText = (value) => {
    const text = normalizePdfText(value);
    if (text.trim()) visibleTexts.push(text);
    return text;
  };

  const drawWrapped = (lines, x, y, options = {}) => {
    applyScheduleFont(doc, options.bold ? 'bold' : 'normal');
    if (options.fontSize) doc.setFontSize(options.fontSize);
    doc.setTextColor(PAGE.ink[0], PAGE.ink[1], PAGE.ink[2]);
    for (const line of lines) {
      pushText(line);
      if (options.align === 'center') {
        doc.text(line, x, y, { align: 'center' });
      } else {
        doc.text(line, x, y);
      }
      y += PAGE.lineHeight;
    }
    return y;
  };

  let y = PAGE.marginTop;
  const leftCenter = PAGE.marginX + contentWidth * (4103 / 10632) / 2;
  const rightCenter = PAGE.marginX + contentWidth * (4103 / 10632) + contentWidth * (6529 / 10632) / 2;

  doc.setFontSize(PAGE.headerSize);
  drawWrapped([LCT_ISSUING_AUTHORITY], leftCenter, y, { fontSize: PAGE.headerSize, align: 'center' });
  drawWrapped([LCT_NATIONAL_MOTTO_TITLE], rightCenter, y, { fontSize: PAGE.headerSize, align: 'center', bold: true });
  y += PAGE.lineHeight;
  drawWrapped([LCT_SCHOOL_LINES[0]], leftCenter, y, { fontSize: PAGE.headerSize, align: 'center', bold: true });
  drawWrapped([LCT_NATIONAL_MOTTO_SUB], rightCenter, y, { fontSize: PAGE.headerSize, align: 'center', bold: true });
  y += PAGE.lineHeight;
  drawWrapped([LCT_SCHOOL_LINES[1]], leftCenter, y, { fontSize: PAGE.headerSize, align: 'center', bold: true });
  y += PAGE.lineHeight + 10;

  doc.setFontSize(PAGE.titleSize);
  const title = payload.range?.title || '';
  drawWrapped([title], pageWidth / 2, y, { fontSize: PAGE.titleSize, align: 'center', bold: true });
  y += 18;
  if (payload.draft) {
    applyScheduleFont(doc, 'bold');
    doc.setFontSize(PAGE.headerSize);
    doc.setTextColor(PAGE.draft[0], PAGE.draft[1], PAGE.draft[2]);
    pushText(SHARED_SCHEDULE_DRAFT_MARK);
    doc.text(SHARED_SCHEDULE_DRAFT_MARK, pageWidth / 2, y - 2, { align: 'center' });
    doc.setTextColor(PAGE.ink[0], PAGE.ink[1], PAGE.ink[2]);
    y += 12;
  }

  const headers = ['Ngày', 'Thời gian', 'Nội dung', 'Địa điểm', 'Thành phần'];
  const xs = [];
  let cursorX = PAGE.marginX;
  for (const width of widths) {
    xs.push(cursorX);
    cursorX += width;
  }

  const drawHeader = (top) => {
    applyScheduleFont(doc, 'bold');
    doc.setTextColor(PAGE.ink[0], PAGE.ink[1], PAGE.ink[2]);
    doc.setFillColor(PAGE.headerFill[0], PAGE.headerFill[1], PAGE.headerFill[2]);
    doc.setDrawColor(PAGE.border[0], PAGE.border[1], PAGE.border[2]);
    doc.setLineWidth(0.5);
    doc.rect(PAGE.marginX, top, contentWidth, rowHeight(1), 'FD');
    doc.setFontSize(PAGE.tableSize);
    headers.forEach((label, index) => {
      pushText(label);
      doc.text(label, xs[index] + PAGE.cellPadX, top + PAGE.cellPadY + 10);
    });
    let lineX = PAGE.marginX;
    for (const width of widths.slice(0, -1)) {
      lineX += width;
      doc.line(lineX, top, lineX, top + rowHeight(1));
    }
    return top + rowHeight(1);
  };

  y = drawHeader(y);

  const rows = payload.rows || [];
  for (const row of rows) {
    const cells = [row.showDay ? row.dayLabel : '', row.time, row.content, row.location, row.participants];
    const wrapped = cells.map((cell, index) => wrapText(doc, cell, widths[index] - PAGE.cellPadX * 2));
    const height = rowHeight(Math.max(...wrapped.map((lines) => lines.length), 1));
    if (y + height > footerTop) {
      doc.addPage();
      y = PAGE.marginTop;
      y = drawHeader(y);
    }
    doc.setDrawColor(PAGE.border[0], PAGE.border[1], PAGE.border[2]);
    doc.setLineWidth(0.5);
    doc.rect(PAGE.marginX, y, contentWidth, height);
    let lineX = PAGE.marginX;
    for (const width of widths.slice(0, -1)) {
      lineX += width;
      doc.line(lineX, y, lineX, y + height);
    }
    wrapped.forEach((lines, index) => {
      // Day column is bold like the Word template's row headers.
      applyScheduleFont(doc, index === 0 ? 'bold' : 'normal');
      let textY = y + PAGE.cellPadY + 10;
      for (const line of lines) {
        if (String(line).trim() && String(line).trim() !== '') {
          pushText(line);
        }
        doc.setFontSize(PAGE.tableSize);
        doc.setTextColor(PAGE.ink[0], PAGE.ink[1], PAGE.ink[2]);
        doc.text(line === ' ' ? '' : line, xs[index] + PAGE.cellPadX, textY);
        textY += PAGE.lineHeight;
      }
    });
    y += height;
  }

  const pageCount = doc.getNumberOfPages();
  const footers = [];
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    applyScheduleFont(doc);
    doc.setFontSize(8);
    doc.setTextColor(90, 96, 105);
    const label = `Trang ${page}/${pageCount}`;
    footers.push(label);
    doc.text(label, pageWidth - PAGE.marginX, pageHeight - 18, { align: 'right' });
    if (payload.draft) drawDraftWatermark(doc, pageWidth, pageHeight);
  }

  return {
    doc,
    bytes: doc.output('arraybuffer'),
    filename: sharedScheduleFilename(payload.range || {}),
    visibleTexts,
    pageCount,
    footers,
    draft: Boolean(payload.draft),
  };
}

export function downloadSharedDutySchedulePdf(payload) {
  const built = buildSharedDutySchedulePdf(payload);
  built.doc.save(built.filename);
  return built;
}
