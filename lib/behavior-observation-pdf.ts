import type { CaseServiceFormData } from '@/lib/case-service-forms';

const DEBUG_GRID = false;
const FONT_SIZE = 9;
const LINE_HEIGHT = 20;

export type BehaviorObservationStudent = {
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

export async function createBehaviorObservationPdfBlob(
  templateBytes: Uint8Array,
  fontBytes: Uint8Array,
  formData: CaseServiceFormData,
  students: BehaviorObservationStudent[],
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
  // หน้า 1 (PAGE 1)
  // ==========================================

  // --- หัวข้อ 1. ข้อมูลการสังเกต ---

  // ชื่อ-นามสกุล
  if (studentNames.trim()) {
    drawThaiText(page1, font, studentNames, { x: 135, y: 602, size: FONT_SIZE, color: textColor });
  }

  // ชื่อเล่น
  if (nicknames.trim()) {
    drawThaiText(page1, font, nicknames, { x: 295, y: 602, size: FONT_SIZE, color: textColor });
  }

  // อายุ
  const studentAge = stringValue(formData, 'studentAge');
  if (studentAge.trim()) {
    drawThaiText(page1, font, studentAge, { x: 370, y: 603, size: FONT_SIZE, color: textColor });
  }

  // ชั้นเรียน
  if (grades.trim()) {
    drawThaiText(page1, font, grades, { x: 460, y: 602, size: FONT_SIZE, color: textColor });
  }

  // ครูประจำชั้น
  const homeroomTeacher = stringValue(formData, 'homeroomTeacher');
  if (homeroomTeacher.trim()) {
    drawThaiText(page1, font, homeroomTeacher, { x: 145, y: 583, size: FONT_SIZE, color: textColor });
  }

  // วันที่เข้าสังเกต
  const obsDate = displayDate(stringValue(formData, 'observationDate'));
  if (obsDate.trim()) {
    drawThaiText(page1, font, obsDate, { x: 350, y: 583, size: FONT_SIZE, color: textColor });
  }

  // เวลา
  const obsTime = stringValue(formData, 'observationTime');
  if (obsTime.trim()) {
    drawThaiText(page1, font, obsTime, { x: 465, y: 583, size: FONT_SIZE, color: textColor });
  }

  // สถานที่ / รายวิชา / กิจกรรม
  const locationActivity = stringValue(formData, 'locationActivity');
  if (locationActivity.trim()) {
    drawThaiText(page1, font, locationActivity, { x: 205, y: 562, size: FONT_SIZE, color: textColor });
  }

  // รูปแบบกิจกรรม (ติ๊กเครื่องหมาย /)
  const activityOptions = ['ทั้งชั้น', 'กลุ่มย่อย', 'รายบุคคล', 'อื่น ๆ'];
  const activityPositions = [
    { x: 140, y: 543 }, // [1] ทั้งชั้น
    { x: 180, y: 543 }, // [2] กลุ่มย่อย
    { x: 233, y: 543 }, // [3] รายบุคคล
    { x: 290, y: 543 }, // [4] อื่น ๆ
  ];
  drawChecklist(page1, font, [stringValue(formData, 'activityFormat')], activityOptions, activityPositions, textColor);

  // รูปแบบกิจกรรม -> ข้อความช่อง "อื่น ๆ"
  drawWrappedText(page1, font, stringValue(formData, 'activityFormatOther'), 330, 543, 130, 18, textColor, FONT_SIZE, 18);

  // ผู้เข้าสังเกตการณ์
  const observerNames = stringValue(formData, 'observers');
  if (observerNames.trim()) {
    drawThaiText(page1, font, observerNames, { x: 165, y: 522, size: FONT_SIZE, color: textColor });
  }

  // ตำแหน่ง (ของผู้เข้าสังเกตการณ์)
  const observerPos = stringValue(formData, 'observerPosition');
  if (observerPos.trim()) {
    drawThaiText(page1, font, observerPos, { x: 410, y: 522, size: FONT_SIZE, color: textColor });
  }

  // อาการนำส่ง
  const referralReason = stringValue(formData, 'referralReason');
  if (referralReason.trim()) {
    drawThaiText(page1, font, referralReason, { x: 135, y: 502.5, size: FONT_SIZE, color: textColor });
  }

  // ผู้นำส่ง (ติ๊กเครื่องหมาย /)
  const referralOptions = ['ครูประจำชั้น', 'ผู้ปกครอง', 'ฝ่ายส่งเสริมพัฒนาการฯ', 'อื่น ๆ'];
  const referralPositions = [
    { x: 103, y: 481 }, // [1] ครูประจำชั้น
    { x: 194, y: 481 }, // [2] ผู้ปกครอง
    { x: 256, y: 481 }, // [3] ฝ่ายส่งเสริมพัฒนาการฯ
    { x: 358, y: 481 }, // [4] อื่น ๆ
  ];
  drawChecklist(page1, font, [stringValue(formData, 'referralSource')], referralOptions, referralPositions, textColor);

  // ผู้นำส่ง -> ข้อความช่อง "อื่น ๆ"
  const referralSourceOther = stringValue(formData, 'referralSourceOther');
  if (referralSourceOther.trim()) {
    drawThaiText(page1, font, referralSourceOther, { x: 400, y: 481, size: FONT_SIZE, color: textColor });
  }

  // --- หัวข้อ 2. บริบทการสังเกต ---

  // ลักษณะทั่วไป (2 บรรทัด: บรรทัดแรกเริ่ม 140 บรรทัดสองกลับไป 75)
  drawWrappedText(page1, font, stringValue(formData, 'generalCharacteristics'), 75, 425, 460, 40, textColor, FONT_SIZE, 20, 140);

  // ลักษณะงาน คำสั่ง กิจกรรม สภาพแวดล้อม และบุคคลที่เกี่ยวข้อง (3 บรรทัด: บรรทัดแรกเริ่ม 338 บรรทัดสอง-สามกลับไป 75)
  drawWrappedText(page1, font, stringValue(formData, 'observationContext'), 75, 385, 460, 60, textColor, FONT_SIZE, 20, 338);

  // พฤติกรรมหลักที่ต้องการเก็บข้อมูล (ติ๊กเครื่องหมาย /)
  const targetOptions = [
    { values: ['Fine motor'], x: 76, y: 290 },                                                                    // Fine motor
    { values: ['Gross motor'], x: 146, y: 290 },                                                                  // Gross motor
    { values: ['การเคลื่อนไหว'], x: 220, y: 290 },                                                                // การเคลื่อนไหว
    { values: ['ด้านการบูรณาการประสาทสัมผัส (SI)', 'การบูรณาการประสาทสัมผัส (SI)'], x: 290, y: 290 },             // ด้านการบูรณาการประสาทสัมผัส (SI)
    { values: ['Social skill'], x: 76, y: 260 },                                                                  // Social skill
    { values: ['Emotional'], x: 146, y: 260 },                                                                    // Emotional
    { values: ['ADL / Play or Leisure / Productive activity'], x: 220, y: 260 },                                  // ADL / Play
    { values: ['Perception and cognition'], x: 76, y: 230 },                                                      // Perception and cognition
    { values: ['Attention'], x: 220, y: 230 },                                                                    // Attention
    { values: ['Hyperactive'], x: 290, y: 230 },                                                                  // Hyperactive
    { values: ['การเรียน'], x: 76, y: 202 },                                                                     // การเรียน
    { values: ['สติปัญญา'], x: 146, y: 202 },                                                                    // สติปัญญา
    { values: ['การอ่าน/เขียน'], x: 220, y: 202 },                                                                // การอ่าน/เขียน
    { values: ['Visual perception'], x: 290, y: 202 },                                                            // Visual perception
    { values: ['Eye hand coordination'], x: 400, y: 202 },                                                        // Eye hand coordination
    { values: ['อื่น ๆ'], x: 76, y: 173 },                                                                       // อื่น ๆ (ติ๊ก)
  ];
  const selectedTargets = arrayValue(formData, 'targetBehaviors');
  targetOptions.forEach((option) => {
    if (option.values.some((value) => selectedTargets.includes(value))) {
      drawSlash(page1, font, option.x, option.y, textColor);
    }
  });

  // พฤติกรรมหลักฯ -> ข้อความช่อง "อื่น ๆ" (จำกัดความกว้าง 175 ไม่ให้เลยเส้นประ)
  drawWrappedText(page1, font, stringValue(formData, 'otherTargetBehavior'), 98, 173, 175, 18, textColor, FONT_SIZE, 18);

  // --- หัวข้อ 3. สิ่งที่สังเกตได้ (2 บรรทัด: y=120, 100) ---
  drawWrappedText(page1, font, stringValue(formData, 'observedBehaviors'), 75, 120, 460, 40, textColor, FONT_SIZE, 20);

  // ==========================================
  // หน้า 2 (PAGE 2)
  // ==========================================

  // --- หัวข้อ 4. สรุปประเด็นปัญหาที่พบ (3 บรรทัด: y=593, 573, 553) ---
  drawWrappedText(page2, font, stringValue(formData, 'identifiedConcerns'), 75, 593, 460, 60, textColor, FONT_SIZE, 20);

  // --- หัวข้อ 5. จุดแข็งและเงื่อนไขที่ช่วยให้นักเรียนทำได้ดี (2 บรรทัด: บรรทัดแรกเริ่ม 360 บรรทัดสองกลับไป 75) ---
  drawWrappedText(page2, font, stringValue(formData, 'strengths'), 75, 495, 460, 40, textColor, FONT_SIZE, 20, 360);

  // --- หัวข้อ 6. แนวทางช่วยเหลือและติดตาม ---

  // รายการแนวทางช่วยเหลือ (ติ๊กเครื่องหมาย /)
  const supportOptions = [
    'ปรับวิธีการสื่อสารหรือให้คำสั่ง',
    'ปรับกิจกรรมหรือสภาพแวดล้อมการเรียนรู้',
    'ใช้การเสริมแรงทางบวก',
    'ให้ความช่วยเหลือด้านการจัดการอารมณ์',
    'ให้คำปรึกษาหรือช่วยเหลือรายบุคคล',
    'ประสานความร่วมมือกับครูและผู้ปกครอง',
    'วางแผนการเข้าสังเกตการณ์ซ้ำ',
    'ประเมินโดยใช้แบบประเมินหรือแบบคัดกรองเพิ่มเติม',
    'อื่น ๆ',
  ];
  const supportPositions = [
    { x: 76, y: 420 },  // [1] ปรับวิธีการสื่อสารหรือให้คำสั่ง
    { x: 255, y: 420 }, // [2] ปรับกิจกรรมหรือสภาพแวดล้อมการเรียนรู้
    { x: 76, y: 400 },  // [3] ใช้การเสริมแรงทางบวก
    { x: 255, y: 400 }, // [4] ให้ความช่วยเหลือด้านการจัดการอารมณ์
    { x: 76, y: 380 },  // [5] ให้คำปรึกษาหรือช่วยเหลือรายบุคคล
    { x: 255, y: 380 }, // [6] ประสานความร่วมมือกับครูและผู้ปกครอง
    { x: 76, y: 360 },  // [7] วางแผนการเข้าสังเกตการณ์ซ้ำ
    { x: 255, y: 360 }, // [8] ประเมินโดยใช้แบบประเมินหรือแบบคัดกรองเพิ่มเติม
    { x: 76, y: 340 },  // [9] อื่น ๆ
  ];
  drawChecklist(page2, font, arrayValue(formData, 'supportStrategies'), supportOptions, supportPositions, textColor);

  // แนวทางช่วยเหลือ -> ข้อความช่อง "อื่น ๆ"
  drawWrappedText(page2, font, stringValue(formData, 'supportStrategiesOther'), 120, 336, 220, 18, textColor, FONT_SIZE, 18);

  // ข้อเสนอแนะ (2 บรรทัด: บรรทัดแรกเริ่ม 125 บรรทัดสองกลับไป 75)
  drawWrappedText(page2, font, stringValue(formData, 'recommendations'), 75, 308, 460, 40, textColor, FONT_SIZE, 20, 125);

  // กำหนดติดตามครั้งถัดไป (ถ้ามี)
  drawWrappedText(page2, font, stringValue(formData, 'followUpDate') ? displayDate(stringValue(formData, 'followUpDate')) : '', 205, 262, 145, 18, textColor, FONT_SIZE, 18);

  // ผู้รับผิดชอบ
  drawWrappedText(page2, font, stringValue(formData, 'responsiblePerson'), 375, 260, 160, 18, textColor, FONT_SIZE, 18);

  // --- ส่วนลงชื่อท้ายเอกสาร ---

  // ผู้สังเกต (ด้านล่าง)
  drawWrappedText(page2, font, observerNames, 108, 150, 190, 18, textColor, FONT_SIZE, 18);

  // วันที่ (ด้านล่าง)
  drawWrappedText(page2, font, displayDate(stringValue(formData, 'recordDate')), 250, 150, 150, 18, textColor, FONT_SIZE, 18);

  const bytes = await pdfDoc.save();
  const blobBytes = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(blobBytes).set(bytes);
  return new Blob([blobBytes], { type: 'application/pdf' });
}