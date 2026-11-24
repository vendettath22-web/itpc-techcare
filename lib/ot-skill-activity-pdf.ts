import { CASE_SERVICE_FORM_SECTIONS, type CaseServiceFormData } from '@/lib/case-service-forms';

const DEBUG_GRID = false;
const FONT_SIZE = 9;
const LINE_HEIGHT = 20;

export type OtSkillActivityStudent = {
  name: string;
  nickname: string;
  grade: string;
  room: string;
};

type PdfPage = import('pdf-lib').PDFPage;
type PdfFont = import('pdf-lib').PDFFont;
type PdfColor = ReturnType<typeof import('pdf-lib').rgb>;

const THAI_MARKS = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;
const THAI_CHARACTERS = /[\u0E00-\u0E7F]/;

function graphemes(text: string): string[] {
  const result: string[] = [];
  for (const character of Array.from(text)) {
    if (THAI_MARKS.test(character) && result.length) {
      result[result.length - 1] += character;
    } else {
      result.push(character);
    }
  }
  return result;
}

type ThaiTextRun = {
  text: string;
  advanceText: string;
  isThai: boolean;
};

function textRuns(text: string): ThaiTextRun[] {
  const runs: ThaiTextRun[] = [];

  for (const cluster of graphemes(text)) {
    const isThai = THAI_CHARACTERS.test(cluster);
    const baseCharacter = Array.from(cluster).find((character) => !THAI_MARKS.test(character)) ?? '';
    const previous = runs[runs.length - 1];

    if (!isThai && previous && !previous.isThai) {
      previous.text += cluster;
      previous.advanceText += cluster;
      continue;
    }

    runs.push({
      text: cluster,
      advanceText: isThai ? baseCharacter : cluster,
      isThai,
    });
  }

  return runs;
}

function textWidth(text: string, font: PdfFont, size: number): number {
  return textRuns(text).reduce(
    (width, run) => width + (run.advanceText ? font.widthOfTextAtSize(run.advanceText, size) : 0),
    0,
  );
}

function drawThaiText(
  page: PdfPage,
  font: PdfFont,
  text: string,
  options: { x: number; y: number; size: number; color: PdfColor; lineHeight?: number; firstLineX?: number },
): void {
  const lineHeight = options.lineHeight ?? options.size * 1.2;
  const lines = text.split(/\r?\n/);

  lines.forEach((line, lineIndex) => {
    let x = lineIndex === 0 && options.firstLineX !== undefined ? options.firstLineX : options.x;
    for (const run of textRuns(line)) {
      page.drawText(run.text, {
        x,
        y: options.y - lineIndex * lineHeight,
        size: options.size,
        font,
        color: options.color,
      });
      if (run.advanceText) {
        x += font.widthOfTextAtSize(run.advanceText, options.size);
      }
    }
  });
}

function wrapText(
  text: string,
  font: PdfFont,
  size: number,
  maxWidth: number,
  firstLineMaxWidth?: number,
): string[] {
  const lines: string[] = [];
  let isFirstLine = true;

  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const run of textRuns(paragraph)) {
      const currentMaxWidth = isFirstLine && firstLineMaxWidth !== undefined ? firstLineMaxWidth : maxWidth;
      if (line && textWidth(line + run.text, font, size) > currentMaxWidth) {
        lines.push(line.trimEnd());
        line = run.text.trimStart();
        isFirstLine = false;
      } else {
        line += run.text;
      }
    }
    lines.push(line);
    isFirstLine = false;
  }
  return lines;
}

function drawWrappedText(
  page: PdfPage,
  font: PdfFont,
  text: string | undefined,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  color: PdfColor,
  initialSize = FONT_SIZE,
  requestedLineHeight = LINE_HEIGHT,
  firstLineX?: number,
): void {
  if (!text?.trim()) return;

  let size = initialSize;
  const lineHeight = requestedLineHeight;
  const firstLineMaxWidth = firstLineX !== undefined ? Math.max(40, x + maxWidth - firstLineX) : undefined;
  let lines = wrapText(text.trim(), font, size, maxWidth, firstLineMaxWidth);
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));

  while (lines.length > maxLines && size > 7) {
    size -= 0.5;
    lines = wrapText(text.trim(), font, size, maxWidth, firstLineMaxWidth);
  }

  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const lastLineLimit = maxLines === 1 && firstLineMaxWidth !== undefined ? firstLineMaxWidth : maxWidth;
    let lastLine = lines[maxLines - 1];
    while (lastLine && textWidth(`${lastLine}…`, font, size) > lastLineLimit) {
      lastLine = graphemes(lastLine).slice(0, -1).join('');
    }
    lines[maxLines - 1] = `${lastLine}…`;
  }

  drawThaiText(page, font, lines.join('\n'), { x, y, size, color, lineHeight, firstLineX });
}

function drawGrid(page: PdfPage, font: PdfFont, rgb: typeof import('pdf-lib').rgb): void {
  const width = page.getWidth();
  const height = page.getHeight();
  const gridColor = rgb(0.78, 0.78, 0.78);

  for (let x = 0; x <= width; x += 50) {
    page.drawLine({
      start: { x, y: 0 },
      end: { x, y: height },
      thickness: 0.25,
      color: gridColor,
      opacity: 0.45,
    });
    drawThaiText(page, font, String(x), {
      x: Math.min(x + 2, width - 18),
      y: 2,
      size: 6,
      color: gridColor,
    });
  }

  for (let y = 0; y <= height; y += 50) {
    page.drawLine({
      start: { x: 0, y },
      end: { x: width, y },
      thickness: 0.25,
      color: gridColor,
      opacity: 0.45,
    });
    drawThaiText(page, font, String(y), {
      x: 2,
      y: Math.min(y + 2, height - 8),
      size: 6,
      color: gridColor,
    });
  }
}

function drawSlash(page: PdfPage, font: PdfFont, x: number, y: number, color: PdfColor): void {
  drawThaiText(page, font, '/', { x, y, size: FONT_SIZE, color });
}

function drawChecklist(
  page: PdfPage,
  font: PdfFont,
  selected: string[],
  options: readonly string[],
  positions: readonly { x: number; y: number }[],
  color: PdfColor,
): void {
  options.forEach((option, index) => {
    if (selected.includes(option) && positions[index]) {
      drawSlash(page, font, positions[index].x, positions[index].y, color);
    }
  });
}

function displayDate(value: string | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value ?? '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${Number(year) + 543}`;
}

function stringValue(data: CaseServiceFormData, id: string): string {
  const value = data[id];
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return typeof value === 'string' ? value : '';
}

function arrayValue(data: CaseServiceFormData, id: string): string[] {
  const value = data[id];
  return Array.isArray(value) ? value : [];
}

function selectedValue(data: CaseServiceFormData, id: string): string[] {
  const value = stringValue(data, id);
  return value ? [value] : [];
}

function otherSelected(data: CaseServiceFormData, id: string): boolean {
  const value = data[id];
  const isOther = (item: unknown) => typeof item === 'string' && item.replace(/\s+/g, '') === 'อื่นๆ';
  return Array.isArray(value) ? value.some(isOther) : isOther(value);
}

function localDateValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function drawField(
  page: PdfPage,
  font: PdfFont,
  text: string | undefined,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  color: PdfColor,
  lineHeight = LINE_HEIGHT,
  firstLineX?: number,
): void {
  drawWrappedText(page, font, text, x, y, maxWidth, maxHeight, color, FONT_SIZE, lineHeight, firstLineX);
}

function drawOtherField(
  page: PdfPage,
  font: PdfFont,
  data: CaseServiceFormData,
  fieldId: string,
  x: number,
  y: number,
  maxWidth: number,
  color: PdfColor,
): void {
  if (otherSelected(data, fieldId)) {
    drawField(page, font, stringValue(data, `${fieldId}Other`), x, y, maxWidth, 18, color);
  }
}

const OT_SKILL_ACTIVITY_FIELDS = CASE_SERVICE_FORM_SECTIONS.ot_skill_activity.flatMap(
  (section) => section.fields,
);

function optionsFor(fieldId: string): readonly string[] {
  const field = OT_SKILL_ACTIVITY_FIELDS.find((item) => item.id === fieldId);
  if (!field?.options) {
    throw new Error(`ไม่พบตัวเลือกของฟิลด์ ${fieldId} ในแบบฟอร์มกิจกรรมส่งเสริมทักษะนักเรียน (OT)`);
  }
  return field.options;
}

export async function createOtSkillActivityPdfBlob(
  templateBytes: Uint8Array,
  fontBytes: Uint8Array,
  formData: CaseServiceFormData,
  students: OtSkillActivityStudent[],
  recordedBy: string,
): Promise<Blob> {
  const [{ PDFDocument, rgb }, fontkitModule] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
  ]);
  const pdfDoc = await PDFDocument.load(templateBytes);
  if (pdfDoc.getPageCount() !== 2) {
    throw new Error(`แบบฟอร์มต้นฉบับต้องมี 2 หน้า (พบ ${pdfDoc.getPageCount()} หน้า)`);
  }

  pdfDoc.registerFontkit(fontkitModule.default);
  const font = await pdfDoc.embedFont(fontBytes);
  const [page1, page2] = pdfDoc.getPages();
  const textColor = rgb(0.08, 0.08, 0.08);

  if (DEBUG_GRID) {
    drawGrid(page1, font, rgb);
    drawGrid(page2, font, rgb);
  }

  const studentNames = students.map((student) => student.name).filter(Boolean).join(', ');
  const nicknames = students.map((student) => student.nickname).filter(Boolean).join(', ');
  const grades = students
    .map((student) => [student.grade, student.room ? `ห้อง ${student.room}` : ''].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(', ');

  // หน้า 1
  // ซ่อมเส้นประบรรทัดที่ 1 ที่ถูกกล่องขาวในไฟล์ต้นฉบับบัง
  for (const [startX, endX] of [
    [215, 245],
    [302, 338],
    [372, 412],
    [446, 536],
  ]) {
    page1.drawLine({
      start: { x: startX, y: 600.5 },
      end: { x: endX, y: 600.5 },
      thickness: 0.75,
      dashArray: [2, 2],
      color: textColor,
    });
  }

  drawField(page1, font, studentNames, 123.17, 601.84, 128.04, 18, textColor);
  drawField(page1, font, nicknames, 282.28, 601.84, 53.4, 18, textColor);
  drawField(page1, font, stringValue(formData, 'studentAge'), 356.25, 601.84, 55.99, 18, textColor);
  drawField(page1, font, grades, 448.52, 601.84, 87.58, 18, textColor);
  drawField(page1, font, displayDate(stringValue(formData, 'serviceDate')), 141.56, 582.04, 74.04, 18, textColor);
  drawField(page1, font, stringValue(formData, 'serviceTime'), 238.53, 582.04, 49.49, 18, textColor);
  drawField(page1, font, stringValue(formData, 'location'), 320.43, 582.04, 70.11, 18, textColor);
  drawField(page1, font, stringValue(formData, 'sessionNumber'), 470, 582.04, 66, 18, textColor);

  const referralTypeOptions = optionsFor('referralType');
  drawChecklist(
    page1,
    font,
    selectedValue(formData, 'referralType'),
    referralTypeOptions,
    [
      { x: 207.2, y: 559.12 },
      { x: 306.86, y: 559.12 },
      { x: 374.44, y: 559.12 },
      { x: 455.2, y: 559.12 },
    ],
    textColor,
  );
  drawOtherField(page1, font, formData, 'referralType', 494, 559.5, 42, textColor);

  const serviceFormatOptions = optionsFor('serviceFormat');
  drawChecklist(
    page1,
    font,
    selectedValue(formData, 'serviceFormat'),
    serviceFormatOptions,
    [
      { x: 108.8, y: 536.08 },
      { x: 169.46, y: 536.08 },
      { x: 225.86, y: 536.08 },
    ],
    textColor,
  );
  drawOtherField(page1, font, formData, 'serviceFormat', 265, 536.5, 271, textColor);

  drawField(page1, font, stringValue(formData, 'provider'), 138.14, 516.28, 185, 18, textColor);
  drawField(page1, font, stringValue(formData, 'providerPosition'), 398, 516.28, 138, 18, textColor);

  drawChecklist(
    page1,
    font,
    arrayValue(formData, 'targetSkills'),
    optionsFor('targetSkills'),
    [
      { x: 75, y: 427.9 },
      { x: 182.5, y: 427.9 },
      { x: 291, y: 427.9 },
      { x: 399, y: 427.9 },
      { x: 75, y: 396.88 },
      { x: 182.5, y: 396.88 },
      { x: 291, y: 396.88 },
      { x: 399, y: 396.88 },
      { x: 75, y: 365.84 },
    ],
    textColor,
  );
  drawOtherField(page1, font, formData, 'targetSkills', 114, 368, 422, textColor);

  // [S] Subjective
  drawChecklist(
    page1,
    font,
    arrayValue(formData, 'subjective'),
    optionsFor('subjective'),
    [
      { x: 75, y: 284.42 },
      { x: 158, y: 284.42 },
      { x: 258.5, y: 284.42 },
      { x: 354.5, y: 284.42 },
    ],
    textColor,
  );
  drawWrappedText(
    page1,
    font,
    stringValue(formData, 'subjectiveDetails'),
    78,
    265.5,
    459.06,
    37,
    textColor,
    FONT_SIZE,
    18.5,
    120.94,
  );

  // [O] Objective
  drawWrappedText(
    page1,
    font,
    stringValue(formData, 'activity'),
    78,
    206,
    459.06,
    38.5,
    textColor,
    FONT_SIZE,
    19.25,
    108,
  );

  drawChecklist(
    page1,
    font,
    selectedValue(formData, 'assistanceLevel'),
    optionsFor('assistanceLevel'),
    [
      { x: 148, y: 162.44 },
      { x: 269.5, y: 162.44 },
      { x: 346, y: 162.44 },
      { x: 426.5, y: 162.44 },
    ],
    textColor,
  );
  drawChecklist(
    page1,
    font,
    arrayValue(formData, 'promptType'),
    optionsFor('promptType'),
    [
      { x: 136, y: 139.46 },
      { x: 195.5, y: 139.46 },
      { x: 247.5, y: 139.46 },
    ],
    textColor,
  );

  // [A] Assessment (พิมพ์บนเส้นประใต้หัวข้อ)
  drawWrappedText(
    page1,
    font,
    stringValue(formData, 'assessment'),
    78,
    100.5,
    459.06,
    45,
    textColor,
    FONT_SIZE,
    19.5,
  );

  // หน้า 2
  // [P] Plan (พิมพ์บนเส้นประ 3 บรรทัดใต้หัวข้อ)
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'plan'),
    78,
    643.5,
    459.06,
    65,
    textColor,
    FONT_SIZE,
    20.5,
  );
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'planOther'),
    78,
    563,
    459.06,
    42,
    textColor,
    FONT_SIZE,
    20.5,
    102,
  );
  drawField(
    page2,
    font,
    displayDate(stringValue(formData, 'followUpDate')),
    178.63,
    497.5,
    346.4,
    18,
    textColor,
  );
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'referral'),
    78,
    446.5,
    459.06,
    42,
    textColor,
    FONT_SIZE,
    20.5,
    188,
  );
  drawField(page2, font, recordedBy, 112, 345.5, 98, 18, textColor);
  drawField(
    page2,
    font,
    displayDate(stringValue(formData, 'recordDate') || localDateValue()),
    272,
    345.5,
    78,
    18,
    textColor,
  );

  const savedBytes = await pdfDoc.save();
  const blobBytes = new Uint8Array(savedBytes.length);
  blobBytes.set(savedBytes);
  return new Blob([blobBytes.buffer], { type: 'application/pdf' });
}