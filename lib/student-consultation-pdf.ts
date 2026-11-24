import { CASE_SERVICE_FORM_SECTIONS, type CaseServiceFormData } from '@/lib/case-service-forms';

const DEBUG_GRID = false;
const FONT_SIZE = 9;
const LINE_HEIGHT = 20;

export type StudentConsultationStudent = {
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
): void {
  drawWrappedText(page, font, text, x, y, maxWidth, maxHeight, color, FONT_SIZE, lineHeight);
}

const STUDENT_CONSULTATION_FIELDS = CASE_SERVICE_FORM_SECTIONS.student_consultation.flatMap(
  (section) => section.fields,
);

function optionsFor(fieldId: string): readonly string[] {
  const field = STUDENT_CONSULTATION_FIELDS.find((item) => item.id === fieldId);
  if (!field?.options) {
    throw new Error(`ไม่พบตัวเลือกของฟิลด์ ${fieldId} ในแบบฟอร์มให้คำปรึกษานักเรียน`);
  }
  return field.options;
}

export async function createStudentConsultationPdfBlob(
  templateBytes: Uint8Array,
  fontBytes: Uint8Array,
  formData: CaseServiceFormData,
  students: StudentConsultationStudent[],
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

  // ==========================================
  // หน้า 1
  // ==========================================

  // ชื่อ-นามสกุลนักเรียน
  drawField(page1, font, studentNames, 123.2, 601.84, 128.04, 18, textColor);

  // ชื่อเล่นนักเรียน
  drawField(page1, font, nicknames, 282.3, 601.84, 53.02, 18, textColor);

  // อายุของนักเรียน
  drawField(page1, font, stringValue(formData, 'studentAge'), 356.25, 601.84, 55.99, 18, textColor);

  // ชั้นเรียนและห้องเรียน
  drawField(page1, font, grades, 448.52, 601.84, 55.52, 18, textColor);

  // วันที่เข้ารับบริการ
  drawField(page1, font, displayDate(stringValue(formData, 'serviceDate')), 141.56, 582.04, 74.04, 18, textColor);

  // เวลาที่เข้ารับบริการ
  drawField(page1, font, stringValue(formData, 'serviceTime'), 238.53, 582.04, 49.49, 18, textColor);

  // สถานที่ให้คำปรึกษา
  drawField(page1, font, stringValue(formData, 'location'), 366.2, 582.04, 65.06, 18, textColor);

  // จำนวนครั้งที่เข้ารับบริการ
  drawField(page1, font, stringValue(formData, 'sessionNumber'), 505.12, 582.04, 34.94, 18, textColor);

  // ตัวเลือกประเภทการส่งต่อ: นักเรียนขอรับบริการ, คุณครูส่งต่อ, ผู้ปกครองส่งต่อ, อื่น ๆ
  drawChecklist(
    page1,
    font,
    selectedValue(formData, 'referralType'),
    optionsFor('referralType'),
    [
      { x: 207.2, y: 561.12 },
      { x: 306.86, y: 561.12 },
      { x: 374.44, y: 561.12 },
      { x: 455.2, y: 561.12 },
    ],
    textColor,
  );

  // รายละเอียดประเภทการส่งต่ออื่น ๆ
  drawField(page1, font, stringValue(formData, 'referralTypeOther'), 492.74, 559.12, 47.26, 18, textColor);

  // ตัวเลือกรูปแบบ: รายบุคคล, กลุ่มย่อย, อื่น ๆ
  drawChecklist(
    page1,
    font,
    selectedValue(formData, 'serviceFormat'),
    optionsFor('serviceFormat'),
    [
      { x: 108.8, y: 538.08 },
      { x: 169.46, y: 538.08 },
      { x: 225.86, y: 538.08 },
    ],
    textColor,
  );

  // รายละเอียดรูปแบบอื่น ๆ
  drawField(page1, font, stringValue(formData, 'serviceFormatOther'), 263.34, 536.08, 276.66, 18, textColor);

  // ชื่อผู้ให้คำปรึกษา
  drawField(page1, font, stringValue(formData, 'provider'), 128.51, 516.28, 194.09, 18, textColor);

  // ตำแหน่งผู้ให้คำปรึกษา
  drawField(page1, font, stringValue(formData, 'providerPosition'), 360.65, 516.28, 179.05, 18, textColor);

  // ลักษณะทั่วไปและพฤติกรรมที่สังเกตได้
  drawWrappedText(
    page1,
    font,
    stringValue(formData, 'generalBehavior'),
    72,
    458.92,
    468,
    59.4,
    textColor,
    FONT_SIZE,
    19.8,
    212.04,
  );

  // ประเด็นปัญหาสำคัญ (Chief Complaint)
  drawWrappedText(
    page1,
    font,
    stringValue(formData, 'chiefComplaint'),
    72,
    391.54,
    468,
    59.4,
    textColor,
    FONT_SIZE,
    19.8,
    229.7,
  );

  // เป้าหมายการพัฒนา
  drawWrappedText(
    page1,
    font,
    stringValue(formData, 'developmentGoal'),
    72,
    324.2,
    468,
    19.8,
    textColor,
    FONT_SIZE,
    19.8,
    150.3,
  );

  // สรุปเนื้อหาการให้คำปรึกษาโดยสังเขป
  drawWrappedText(
    page1,
    font,
    stringValue(formData, 'consultationSummary'),
    72,
    296.36,
    468,
    79.2,
    textColor,
    FONT_SIZE,
    19.8,
    215.1,
  );

  // ปัจจัยปกป้องและจุดแข็ง (Protective Factor)
  drawWrappedText(
    page1,
    font,
    stringValue(formData, 'protectiveFactors'),
    72,
    209.24,
    468,
    19.8,
    textColor,
    FONT_SIZE,
    19.8,
    246.5,
  );

  // ปัจจัยเสี่ยง (Risk Factor)
  drawWrappedText(
    page1,
    font,
    stringValue(formData, 'riskFactors'),
    72,
    181.46,
    468,
    19.8,
    textColor,
    FONT_SIZE,
    19.8,
    169.9,
  );

  // ตัวเลือกเทคนิค: รับฟังและสะท้อนความรู้สึก, ช่วยระบุอารมณ์, ฝึกทักษะการแก้ปัญหา
  // ตัวเลือกเทคนิค: ฝึกทักษะกำกับอารมณ์, ใช้สื่อ / กิจกรรม / การเล่น, ฝึกทักษะทางสังคม, อื่น ๆ
  drawChecklist(
    page1,
    font,
    arrayValue(formData, 'techniques'),
    optionsFor('techniques'),
    [
      { x: 147.02, y: 124.6 },
      { x: 291.02, y: 124.6 },
      { x: 399.04, y: 124.6 },
      { x: 75, y: 93.56 },
      { x: 183.02, y: 93.56 },
      { x: 289.64, y: 93.56 },
      { x: 399.04, y: 93.56 },
    ],
    textColor,
  );

  // รายละเอียดเทคนิคอื่น ๆ
  drawField(page1, font, stringValue(formData, 'techniquesOther'), 436.48, 91.56, 67.56, 18, textColor);

  // ==========================================
  // หน้า 2
  // ==========================================

  // รายละเอียดเพิ่มเติมต่อจากส่วนที่ 3
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'techniquesDetails'),
    72,
    663.12,
    468,
    41.4,
    textColor,
    FONT_SIZE,
    20.7,
    149.54,
  );

  // ตัวเลือกความคืบหน้า: ก้าวหน้า, คงเดิม, ยังประเมินไม่ได้
  drawChecklist(
    page2,
    font,
    selectedValue(formData, 'progress'),
    optionsFor('progress'),
    [
      { x: 195.08, y: 589.74 },
      { x: 247.04, y: 589.74 },
      { x: 291.62, y: 589.74 },
    ],
    textColor,
  );

  // รายละเอียดความคืบหน้า
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'progressDetails'),
    72,
    559.9,
    468,
    39.4,
    textColor,
    FONT_SIZE,
    19.7,
    120.94,
  );

  // ประเด็นที่ควรติดตามเพิ่มเติม
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'followUpConcerns'),
    72,
    512.32,
    468,
    39.4,
    textColor,
    FONT_SIZE,
    19.7,
    183,
  );

  // การวางแผนสำหรับครั้งถัดไป
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'nextPlan'),
    72,
    436.9,
    468,
    34.6,
    textColor,
    FONT_SIZE,
    17.3,
    182.04,
  );

  // การประเมินโดยนักจิตวิทยา
  drawField(page2, font, stringValue(formData, 'psychologistAssessment'), 181.32, 393.64, 358.68, 18, textColor);

  // ตัวเลือกระดับความเสี่ยง: ต่ำ, ปานกลาง, สูง
  drawChecklist(
    page2,
    font,
    selectedValue(formData, 'riskLevel'),
    optionsFor('riskLevel'),
    [
      { x: 75, y: 340 },
      { x: 75, y: 320.2 },
      { x: 75, y: 300.4 },
    ],
    textColor,
  );

  // รายละเอียดการส่งต่อ (Referral)
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'referral'),
    72,
    253.64,
    468,
    36,
    textColor,
    FONT_SIZE,
    19.8,
    184.43,
  );

  // ชื่อผู้บันทึก
  drawField(page2, font, recordedBy, 106.12, 181.16, 109.9, 18, textColor);

  // วันที่บันทึก
  drawField(
    page2,
    font,
    displayDate(stringValue(formData, 'recordDate') || localDateValue()),
    264.35,
    181.16,
    59.15,
    18,
    textColor,
  );

  const savedBytes = await pdfDoc.save();
  const blobBytes = new Uint8Array(savedBytes.length);
  blobBytes.set(savedBytes);
  return new Blob([blobBytes.buffer], { type: 'application/pdf' });
}
