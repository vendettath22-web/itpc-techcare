import { CASE_SERVICE_FORM_SECTIONS, type CaseServiceFormData } from '@/lib/case-service-forms';

const DEBUG_GRID = false;
const FONT_SIZE = 9;
const LINE_HEIGHT = 20;
const CHECKBOX_WIDTH = 12.04;
const CHECKBOX_Y_OFFSET = 2.5;

export type PsychologySkillActivityStudent = {
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

function normalizedOther(value: string): string {
  return value.replace(/\s+/g, '');
}

function matchesOption(selected: string, option: string): boolean {
  return normalizedOther(option) === 'อื่นๆ'
    ? normalizedOther(selected) === 'อื่นๆ'
    : selected === option;
}

function drawChecklist(
  page: PdfPage,
  font: PdfFont,
  selected: string[],
  options: readonly string[],
  positions: readonly { x: number; y: number }[],
  color: PdfColor,
): void {
  const slashWidth = font.widthOfTextAtSize('/', FONT_SIZE);
  const xOffset = (CHECKBOX_WIDTH - slashWidth) / 2;

  options.forEach((option, index) => {
    const position = positions[index];
    if (position && selected.some((item) => matchesOption(item, option))) {
      drawSlash(page, font, position.x + xOffset, position.y + CHECKBOX_Y_OFFSET, color);
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
  const isOther = (item: unknown) => typeof item === 'string' && normalizedOther(item) === 'อื่นๆ';
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

const PSYCHOLOGY_SKILL_ACTIVITY_FIELDS = CASE_SERVICE_FORM_SECTIONS.psychology_skill_activity.flatMap(
  (section) => section.fields,
);

function optionsFor(fieldId: string): readonly string[] {
  const field = PSYCHOLOGY_SKILL_ACTIVITY_FIELDS.find((item) => item.id === fieldId);
  if (!field?.options) {
    throw new Error(`ไม่พบตัวเลือกของฟิลด์ ${fieldId} ในแบบฟอร์มกิจกรรมส่งเสริมทักษะนักเรียน (Psycho)`);
  }
  return field.options;
}

export async function createPsychologySkillActivityPdfBlob(
  templateBytes: Uint8Array,
  fontBytes: Uint8Array,
  formData: CaseServiceFormData,
  students: PsychologySkillActivityStudent[],
  recordedBy: string,
): Promise<Blob> {
  const [{ PDFDocument, rgb }, fontkitModule] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
  ]);
  const pdfDoc = await PDFDocument.load(templateBytes);
  if (pdfDoc.getPageCount() !== 3) {
    throw new Error(`แบบฟอร์มต้นฉบับต้องมี 3 หน้า (พบ ${pdfDoc.getPageCount()} หน้า)`);
  }

  pdfDoc.registerFontkit(fontkitModule.default);
  const font = await pdfDoc.embedFont(fontBytes);
  const [page1, page2, page3] = pdfDoc.getPages();
  const textColor = rgb(0.08, 0.08, 0.08);

  if (DEBUG_GRID) {
    drawGrid(page1, font, rgb);
    drawGrid(page2, font, rgb);
    drawGrid(page3, font, rgb);
  }

  const studentNames = students.map((student) => student.name).filter(Boolean).join(', ');
  const nicknames = students.map((student) => student.nickname).filter(Boolean).join(', ');
  const grades = students
    .map((student) => [student.grade, student.room ? `ห้อง ${student.room}` : ''].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(', ');

  // หน้า 1
  drawField(page1, font, studentNames, 123.17, 603.5, 128.04, 18, textColor);
  drawField(page1, font, nicknames, 282.28, 603.5, 53.4, 18, textColor);
  drawField(page1, font, stringValue(formData, 'studentAge'), 356.25, 603.5, 55.99, 18, textColor);
  drawField(page1, font, grades, 448.52, 603.5, 87.58, 18, textColor);
  drawField(page1, font, displayDate(stringValue(formData, 'serviceDate')), 141.56, 584, 74.04, 18, textColor);
  drawField(page1, font, stringValue(formData, 'serviceTime'), 238.53, 584, 49.49, 18, textColor);
  drawField(page1, font, stringValue(formData, 'location'), 320.43, 584, 70.11, 18, textColor);
  drawField(page1, font, stringValue(formData, 'sessionNumber'), 469.12, 584, 66.88, 18, textColor);

  drawChecklist(
    page1,
    font,
    selectedValue(formData, 'referralType'),
    optionsFor('referralType'),
    [
      { x: 204.2, y: 559.12 },
      { x: 303.86, y: 559.12 },
      { x: 371.44, y: 559.12 },
      { x: 452.2, y: 559.12 },
    ],
    textColor,
  );
  drawOtherField(page1, font, formData, 'referralType', 494, 559.5, 42, textColor);

  drawChecklist(
    page1,
    font,
    selectedValue(formData, 'serviceFormat'),
    optionsFor('serviceFormat'),
    [
      { x: 105.8, y: 536.08 },
      { x: 166.46, y: 536.08 },
      { x: 222.86, y: 536.08 },
    ],
    textColor,
  );
  drawOtherField(page1, font, formData, 'serviceFormat', 265, 536.5, 271, textColor);

  drawField(page1, font, stringValue(formData, 'provider'), 138.14, 518.2, 185, 18, textColor);
  drawField(page1, font, stringValue(formData, 'providerPosition'), 396.65, 518.2, 139.35, 18, textColor);

  const targetSkillOptions = optionsFor('targetSkills');
  drawChecklist(
    page1,
    font,
    arrayValue(formData, 'targetSkills'),
    targetSkillOptions,
    [
      { x: 72, y: 427.9 },
      { x: 180.02, y: 427.9 },
      { x: 288.02, y: 427.9 },
      { x: 396.04, y: 427.9 },
      { x: 72, y: 396.88 },
      { x: 180.02, y: 396.88 },
      { x: 288.02, y: 396.88 },
      { x: 396.04, y: 396.88 },
      { x: 72, y: 365.84 },
    ],
    textColor,
  );
  drawOtherField(page1, font, formData, 'targetSkills', 114, 367, 422, textColor);

  drawField(
    page1,
    font,
    stringValue(formData, 'behavioralObjective'),
    78,
    338.5,
    459.06,
    40,
    textColor,
    20,
    176,
  );
  drawField(
    page1,
    font,
    stringValue(formData, 'successCriteria'),
    78,
    291,
    459.06,
    40,
    textColor,
    20,
    175,
  );

  drawField(
    page1,
    font,
    stringValue(formData, 'activitySteps'),
    78,
    215.5,
    459.06,
    94,
    textColor,
    18.8,
    184,
  );
  drawField(
    page1,
    font,
    stringValue(formData, 'materials'),
    78,
    117,
    459.06,
    60,
    textColor,
    20,
    154,
  );

  // หน้า 2
  drawField(
    page2,
    font,
    stringValue(formData, 'activityAdjustments'),
    78,
    663.5,
    459.06,
    41,
    textColor,
    20.5,
    276,
  );

  drawChecklist(
    page2,
    font,
    selectedValue(formData, 'participation'),
    optionsFor('participation'),
    [
      { x: 157.46, y: 584.56 },
      { x: 194.06, y: 584.56 },
      { x: 250.76, y: 584.56 },
      { x: 288.38, y: 584.56 },
    ],
    textColor,
  );
  drawOtherField(page2, font, formData, 'participation', 331, 585, 205, textColor);

  drawField(
    page2,
    font,
    stringValue(formData, 'observedBehaviors'),
    78,
    557,
    459.06,
    40,
    textColor,
    20,
    216,
  );
  drawField(
    page2,
    font,
    stringValue(formData, 'strengthsProgress'),
    78,
    509.5,
    459.06,
    40,
    textColor,
    20,
    192,
  );
  drawField(
    page2,
    font,
    stringValue(formData, 'barriers'),
    78,
    462,
    459.06,
    40,
    textColor,
    20,
    291,
  );

  drawChecklist(
    page2,
    font,
    arrayValue(formData, 'evidence'),
    optionsFor('evidence'),
    [
      { x: 144.02, y: 388.96 },
      { x: 216.02, y: 388.96 },
      { x: 288.02, y: 388.96 },
      { x: 360.04, y: 388.96 },
      { x: 144.02, y: 365.96 },
    ],
    textColor,
  );
  drawOtherField(page2, font, formData, 'evidence', 186, 366.5, 351, textColor);

  drawChecklist(
    page2,
    font,
    selectedValue(formData, 'outcome'),
    optionsFor('outcome'),
    [
      { x: 144.02, y: 334.94 },
      { x: 231.38, y: 334.94 },
      { x: 303.32, y: 334.94 },
      { x: 363.1, y: 334.94 },
    ],
    textColor,
  );
  drawField(page2, font, stringValue(formData, 'outcomeDetails'), 78, 307.5, 459.06, 40, textColor, 20, 125);

  drawChecklist(
    page2,
    font,
    selectedValue(formData, 'comparison'),
    optionsFor('comparison'),
    [
      { x: 164, y: 256.34 },
      { x: 201.8, y: 256.34 },
      { x: 268.64, y: 256.34 },
      { x: 388.9, y: 256.34 },
    ],
    textColor,
  );

  drawField(
    page2,
    font,
    stringValue(formData, 'additionalSkills'),
    78,
    201,
    459.06,
    40,
    textColor,
    20,
    176,
  );
  drawField(
    page2,
    font,
    stringValue(formData, 'generalization'),
    78,
    153.5,
    459.06,
    40,
    textColor,
    20,
    276,
  );
  drawField(
    page2,
    font,
    stringValue(formData, 'nextPlan'),
    78,
    106,
    459.06,
    58,
    textColor,
    19,
    186,
  );

  // หน้า 3
  drawField(
    page3,
    font,
    displayDate(stringValue(formData, 'followUpDate')),
    160,
    663.5,
    376,
    18,
    textColor,
  );
  drawField(
    page3,
    font,
    stringValue(formData, 'referral'),
    78,
    612,
    459.06,
    80,
    textColor,
    20,
    188,
  );
  drawField(page3, font, recordedBy, 106.09, 511.5, 105, 18, textColor);
  drawField(
    page3,
    font,
    displayDate(stringValue(formData, 'recordDate') || localDateValue()),
    267.42,
    511.5,
    169.58,
    18,
    textColor,
  );

  const savedBytes = await pdfDoc.save();
  const blobBytes = new Uint8Array(savedBytes.length);
  blobBytes.set(savedBytes);
  return new Blob([blobBytes.buffer], { type: 'application/pdf' });
}