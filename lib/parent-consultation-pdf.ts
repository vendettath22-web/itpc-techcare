import type { CaseServiceFormData } from '@/lib/case-service-forms';

const DEBUG_GRID = false;
const FONT_SIZE = 9;
const LINE_HEIGHT = 20;

export type ParentConsultationStudent = {
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

export async function createParentConsultationPdfBlob(
  templateBytes: Uint8Array,
  fontBytes: Uint8Array,
  formData: CaseServiceFormData,
  students: ParentConsultationStudent[],
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
  drawField(page1, font, studentNames, 123, 599.02, 128, 18, textColor);

  // ชื่อเล่นนักเรียน
  drawField(page1, font, nicknames, 282, 599.02, 53, 18, textColor);

  // อายุของนักเรียน
  drawField(page1, font, stringValue(formData, 'studentAge'), 356, 599.02, 56, 18, textColor);

  // ชั้นเรียนและห้องเรียน
  drawField(page1, font, grades, 448, 599.02, 56, 18, textColor);

  // วันที่เข้ารับบริการ
  drawField(page1, font, displayDate(stringValue(formData, 'serviceDate')), 141, 579.22, 74.5, 18, textColor);

  // เวลาที่เข้ารับบริการ
  drawField(page1, font, stringValue(formData, 'serviceTime'), 238, 579.22, 50, 18, textColor);

  // สถานที่ให้คำปรึกษา
  drawField(page1, font, stringValue(formData, 'location'), 366, 579.22, 65, 18, textColor);

  // จำนวนครั้งที่เข้ารับบริการ
  drawField(page1, font, stringValue(formData, 'sessionNumber'), 504, 579.22, 36, 18, textColor);

  // ชื่อผู้ให้คำปรึกษา
  drawField(page1, font, stringValue(formData, 'provider'), 128, 559.54, 194.5, 18, textColor);

  // ตำแหน่งผู้ให้คำปรึกษา
  drawField(page1, font, stringValue(formData, 'providerPosition'), 360, 559.54, 179.5, 18, textColor);

  // ชื่อผู้รับคำปรึกษา
  drawField(page1, font, stringValue(formData, 'consultee'), 129, 531.64, 194.5, 18, textColor);

  // ความเกี่ยวข้องกับนักเรียน
  drawField(page1, font, stringValue(formData, 'relationship'), 432, 531.64, 71.5, 18, textColor);

  // ตัวเลือกช่องทาง
  drawChecklist(
    page1,
    font,
    arrayValue(formData, 'channel'),
    ['พบด้วยตนเอง', 'โทรศัพท์', 'ออนไลน์', 'อื่น ๆ'],
    [
      { x: 110.48, y: 510.66 },
      { x: 183.02, y: 510.66 },
      { x: 235.76, y: 510.66 },
      { x: 288.26, y: 510.66 },
    ],
    textColor,
  );

  // รายละเอียดช่องทางอื่น ๆ
  drawField(page1, font, stringValue(formData, 'channelOther'), 325, 508.66, 179, 18, textColor);

  // ตัวเลือกลักษณะบริการ
  drawChecklist(
    page1,
    font,
    arrayValue(formData, 'consultationType'),
    ['ปรึกษาครั้งแรก', 'ติดตามต่อเนื่อง', 'ประชุมร่วมหลายฝ่าย', 'อื่น ๆ'],
    [
      { x: 135.38, y: 487.68 },
      { x: 211.88, y: 487.68 },
      { x: 288.62, y: 487.68 },
      { x: 389.98, y: 487.68 },
    ],
    textColor,
  );

  // รายละเอียดลักษณะบริการอื่น ๆ
  drawField(page1, font, stringValue(formData, 'consultationTypeOther'), 427, 485.68, 77, 18, textColor);

  // ตัวเลือกผู้ริเริ่มขอรับคำปรึกษา
  drawChecklist(
    page1,
    font,
    selectedValue(formData, 'initiator'),
    ['ผู้ปกครอง', 'คุณครู', 'ฝ่ายส่งเสริมพัฒนาการฯ', 'อื่น ๆ'],
    [
      { x: 161.06, y: 424.26 },
      { x: 218.48, y: 424.26 },
      { x: 264.56, y: 424.26 },
      { x: 384.64, y: 424.26 },
    ],
    textColor,
  );

  // รายละเอียดผู้ริเริ่มอื่น ๆ
  drawField(page1, font, stringValue(formData, 'initiatorOther'), 422, 422.26, 82, 18, textColor);

  // ประเด็นที่นำมาปรึกษาและข้อกังวลหลัก
  drawWrappedText(
    page1,
    font,
    stringValue(formData, 'mainConcern'),
    72,
    393.34,
    468,
    36.2,
    textColor,
    FONT_SIZE,
    18.1,
    217,
  );

  // ความต้องการหรือผลลัพธ์ที่คาดหวัง
  drawWrappedText(
    page1,
    font,
    stringValue(formData, 'expectedOutcome'),
    72,
    348.56,
    468,
    36.2,
    textColor,
    FONT_SIZE,
    18.1,
    258,
  );

  // อาการหรือปัญหาสำคัญ
  drawField(page1, font, stringValue(formData, 'symptoms'), 152, 279.26, 388, 18, textColor);

  // ผลกระทบต่อการเรียน อารมณ์ พฤติกรรม หรือความสัมพันธ์
  drawWrappedText(
    page1,
    font,
    stringValue(formData, 'impact'),
    72,
    251.36,
    468,
    39.4,
    textColor,
    FONT_SIZE,
    19.7,
    296,
  );

  // วิธีช่วยเหลือที่เคยใช้และผลที่สังเกตได้
  drawWrappedText(
    page1,
    font,
    stringValue(formData, 'previousSupport'),
    72,
    203.78,
    468,
    39.6,
    textColor,
    FONT_SIZE,
    19.8,
    214,
  );

  // จุดแข็งของนักเรียนและปัจจัยสนับสนุน
  drawWrappedText(
    page1,
    font,
    stringValue(formData, 'strengths'),
    72,
    156.2,
    468,
    39.4,
    textColor,
    FONT_SIZE,
    19.7,
    224,
  );

  // ==========================================
  // หน้า 2
  // ==========================================

  // ข้อมูลหรือแนวทางที่ให้คำปรึกษา
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'guidance'),
    72,
    632.5,
    468,
    61.5,
    textColor,
    FONT_SIZE,
    20.3,
    197,
  );

  // ความคิดเห็น การตอบสนอง หรือข้อจำกัดที่สะท้อน
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'response'),
    72,
    565.12,
    468,
    36.2,
    textColor,
    FONT_SIZE,
    18.1,
    314,
  );

  // เป้าหมายที่ตกลงร่วมกัน
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'sharedGoals'),
    72,
    497.14,
    468,
    36.2,
    textColor,
    FONT_SIZE,
    18.1,
    164,
  );

  // แนวทางที่บ้าน
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'homePlan'),
    72,
    452.38,
    468,
    36.2,
    textColor,
    FONT_SIZE,
    18.1,
    130,
  );

  // แนวทางที่โรงเรียน
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'schoolPlan'),
    72,
    407.62,
    468,
    36.2,
    textColor,
    FONT_SIZE,
    18.1,
    144,
  );

  // วิธีประเมินผลและช่วงเวลาติดตาม
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'evaluationPlan'),
    72,
    362.84,
    468,
    36.2,
    textColor,
    FONT_SIZE,
    18.1,
    201,
  );

  // สรุปประเด็นสำคัญและเรื่องที่ยังต้องติดตาม
  drawWrappedText(
    page2,
    font,
    stringValue(formData, 'summary'),
    72,
    292.04,
    468,
    63,
    textColor,
    FONT_SIZE,
    21,
    242,
  );

  // ตัวเลือกการประสานงาน
  drawChecklist(
    page2,
    font,
    arrayValue(formData, 'coordination'),
    ['ไม่จำเป็น', 'ครู', 'ผู้ปกครอง', 'ฝ่ายส่งเสริมพัฒนาการฯ', 'ผู้เชี่ยวชาญภายนอก'],
    [
      { x: 140.9, y: 220.66 },
      { x: 195.38, y: 220.66 },
      { x: 226.46, y: 220.66 },
      { x: 283.88, y: 220.66 },
      { x: 391.54, y: 220.66 },
    ],
    textColor,
  );

  // วันที่นัดติดตาม
  const followUpDate = displayDate(stringValue(formData, 'followUpDate'));
  if (followUpDate) {
    drawField(page2, font, followUpDate, 132, 187.64, 67.5, 18, textColor);
  }

  // ตัวเลือกสถานะการติดตาม
  drawChecklist(
    page2,
    font,
    selectedValue(formData, 'serviceEnded'),
    ['ยังไม่กำหนด', 'ยุติการให้บริการครั้งนี้'],
    [
      { x: 208.76, y: 189.64 },
      { x: 275.42, y: 189.64 },
    ],
    textColor,
  );

  // รายละเอียดการส่งต่อ
  drawField(page2, font, stringValue(formData, 'referral'), 185, 159.8, 355, 18, textColor);

  // ชื่อผู้บันทึก
  drawField(page2, font, recordedBy, 319, 87.3, 113, 18, textColor);

  // วันที่บันทึก
  drawField(
    page2,
    font,
    displayDate(stringValue(formData, 'recordDate') || localDateValue()),
    483,
    87.3,
    56.5,
    18,
    textColor,
  );

  const savedBytes = await pdfDoc.save();
  const blobBytes = new Uint8Array(savedBytes.length);
  blobBytes.set(savedBytes);
  return new Blob([blobBytes.buffer], { type: 'application/pdf' });
}