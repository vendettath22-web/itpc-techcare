import { type StudentIntakeFormData } from '@/lib/student-intake-form';

const FONT_SIZE = 9;
const LINE_HEIGHT = 20;
const CHECKBOX_WIDTH = 12.04;
const CHECKBOX_Y_OFFSET = 2.5;

export type StudentRecordPdfStudent = {
  name: string;
  nickname: string;
  studentId: string;
  grade: string;
  room: string;
  phone: string;
  photoUrl?: string | null;
};

type PdfPage = import('pdf-lib').PDFPage;
type PdfFont = import('pdf-lib').PDFFont;
type PdfColor = ReturnType<typeof import('pdf-lib').rgb>;

const THAI_MARKS = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;
const THAI_CHARACTERS = /[\u0E00-\u0E7F]/;

function graphemes(text: string): string[] {
  const result: string[] = [];
  for (const character of Array.from(text)) {
    if (THAI_MARKS.test(character) && result.length) result[result.length - 1] += character;
    else result.push(character);
  }
  return result;
}

type ThaiTextRun = { text: string; advanceText: string; isThai: boolean };

function textRuns(text: string): ThaiTextRun[] {
  const runs: ThaiTextRun[] = [];
  for (const cluster of graphemes(text)) {
    const isThai = THAI_CHARACTERS.test(cluster);
    const baseCharacter = Array.from(cluster).find((character) => !THAI_MARKS.test(character)) ?? '';
    const previous = runs[runs.length - 1];
    if (!isThai && previous && !previous.isThai) {
      previous.text += cluster;
      previous.advanceText += cluster;
    } else {
      runs.push({ text: cluster, advanceText: isThai ? baseCharacter : cluster, isThai });
    }
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
  text.split(/\r?\n/).forEach((line, lineIndex) => {
    let x = lineIndex === 0 && options.firstLineX !== undefined ? options.firstLineX : options.x;
    for (const run of textRuns(line)) {
      page.drawText(run.text, { x, y: options.y - lineIndex * lineHeight, size: options.size, font, color: options.color });
      if (run.advanceText) x += font.widthOfTextAtSize(run.advanceText, options.size);
    }
  });
}

function wrapText(text: string, font: PdfFont, size: number, maxWidth: number, firstLineMaxWidth?: number): string[] {
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
      } else line += run.text;
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
  const firstLineMaxWidth = firstLineX !== undefined ? Math.max(40, x + maxWidth - firstLineX) : undefined;
  let lines = wrapText(text.trim(), font, size, maxWidth, firstLineMaxWidth);
  const maxLines = Math.max(1, Math.floor(maxHeight / requestedLineHeight));
  while (lines.length > maxLines && size > 7) {
    size -= 0.5;
    lines = wrapText(text.trim(), font, size, maxWidth, firstLineMaxWidth);
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let lastLine = lines[maxLines - 1];
    const limit = maxLines === 1 && firstLineMaxWidth !== undefined ? firstLineMaxWidth : maxWidth;
    while (lastLine && textWidth(`${lastLine}…`, font, size) > limit) lastLine = graphemes(lastLine).slice(0, -1).join('');
    lines[maxLines - 1] = `${lastLine}…`;
  }
  drawThaiText(page, font, lines.join('\n'), { x, y, size, color, lineHeight: requestedLineHeight, firstLineX });
}

function drawSlash(page: PdfPage, font: PdfFont, x: number, y: number, color: PdfColor): void {
  drawThaiText(page, font, '/', { x, y, size: FONT_SIZE, color });
}

function normalized(value: string): string {
  return value.replace(/\s+/g, '');
}

function isOther(value: unknown): boolean {
  return typeof value === 'string' && (normalized(value) === 'อื่นๆ' || normalized(value) === 'อื่น');
}

function drawChecklist(
  page: PdfPage,
  font: PdfFont,
  selected: readonly string[],
  options: readonly string[],
  positions: readonly { x: number; y: number }[],
  color: PdfColor,
): void {
  const slashWidth = font.widthOfTextAtSize('/', FONT_SIZE);
  const xOffset = (CHECKBOX_WIDTH - slashWidth) / 2;
  options.forEach((option, index) => {
    const position = positions[index];
    if (position && selected.some((item) => (isOther(option) ? isOther(item) : item === option))) {
      drawSlash(page, font, position.x + xOffset, position.y + CHECKBOX_Y_OFFSET, color);
    }
  });
}

function stringValue(data: StudentIntakeFormData, key: string): string {
  const value = data[key];
  return typeof value === 'string' ? value : '';
}

function arrayValue(data: StudentIntakeFormData, key: string): string[] {
  const value = data[key];
  return Array.isArray(value) ? value : [];
}

function displayDate(value: string | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value ?? '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${Number(year) + 543}`;
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
  data: StudentIntakeFormData,
  key: string,
  x: number,
  y: number,
  maxWidth: number,
  color: PdfColor,
): void {
  if (arrayValue(data, key).some(isOther)) {
    drawField(page, font, stringValue(data, `${key}Other`), x, y, maxWidth, 18, color);
  }
}

function calculateAgeMonths(dateOfBirth: string): { years: string; months: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return { years: '', months: '' };
  const birthYear = Number(match[1]);
  const birthMonth = Number(match[2]);
  const birthDay = Number(match[3]);
  const now = new Date();
  let years = now.getFullYear() - birthYear;
  let months = now.getMonth() + 1 - birthMonth;
  if (now.getDate() < birthDay) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return { years: '', months: '' };
  return { years: String(years), months: String(months) };
}

function isPngBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpgBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function createStudentRecordPdfBlob(
  templateBytes: Uint8Array,
  fontBytes: Uint8Array,
  formData: StudentIntakeFormData,
  student: StudentRecordPdfStudent,
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

  if (student.photoUrl) {
    try {
      const response = await fetch(student.photoUrl);
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
        let image;
        if (isPngBytes(bytes) || contentType.includes('png')) {
          image = await pdfDoc.embedPng(bytes);
        } else if (isJpgBytes(bytes) || contentType.includes('jpeg') || contentType.includes('jpg')) {
          image = await pdfDoc.embedJpg(bytes);
        }
        if (image) {
          const frame = { x: 455.02, y: 646.9, width: 90.56, height: 92.3 };
          const scale = Math.min(frame.width / image.width, frame.height / image.height);
          const width = image.width * scale;
          const height = image.height * scale;
          page1.drawImage(image, {
            x: frame.x + (frame.width - width) / 2,
            y: frame.y + (frame.height - height) / 2,
            width,
            height,
          });
        }
      }
    } catch {
      // Missing or inaccessible photos remain blank inside the photo frame.
    }
  }

  // ==================== หน้า 1 ====================
  // 1. ข้อมูลประจำตัวนักเรียน
  drawField(page1, font, student.name, 124, 587.5, 164, 18, textColor);
  drawField(page1, font, student.nickname, 316, 587.5, 80, 18, textColor);
  drawField(page1, font, student.studentId, 442, 587.5, 94, 18, textColor);
  drawField(
    page1,
    font,
    [student.grade, student.room ? `ห้อง ${student.room}` : ''].filter(Boolean).join(' '),
    104,
    569.2,
    148,
    18,
    textColor,
  );
  drawField(page1, font, stringValue(formData, 'homeroomTeacher'), 299, 569.2, 237, 18, textColor);

  drawChecklist(
    page1,
    font,
    arrayValue(formData, 'schoolLevels'),
    ['อนุบาล', 'ประถมศึกษา'],
    [{ x: 153.92, y: 549.04 }, { x: 220.52, y: 549.04 }],
    textColor,
  );

  drawField(page1, font, displayDate(stringValue(formData, 'dateOfBirth')), 123, 532.5, 93, 18, textColor);
  const age = stringValue(formData, 'dateOfBirth')
    ? (stringValue(formData, 'ageYears') || calculateAgeMonths(stringValue(formData, 'dateOfBirth')).years)
    : stringValue(formData, 'ageYears');
  const ageMonths = stringValue(formData, 'ageMonths')
    || (stringValue(formData, 'dateOfBirth') ? calculateAgeMonths(stringValue(formData, 'dateOfBirth')).months : '');
  drawField(page1, font, age, 235, 532.5, 88, 18, textColor);
  drawField(page1, font, ageMonths, 405, 532.5, 28, 18, textColor);

  drawField(page1, font, stringValue(formData, 'caregiverName'), 122, 514, 94, 18, textColor);
  drawField(page1, font, stringValue(formData, 'caregiverRelation'), 265, 514, 95, 18, textColor);
  drawField(page1, font, student.phone || stringValue(formData, 'caregiverContact'), 440, 514, 96, 18, textColor);

  // 2. ข้อมูลการส่งต่อและการรับบริการ
  drawField(page1, font, stringValue(formData, 'referrer'), 141, 441.5, 183, 18, textColor);
  drawField(page1, font, stringValue(formData, 'referrerRelationPosition'), 415, 441.5, 121, 18, textColor);

  drawChecklist(
    page1,
    font,
    arrayValue(formData, 'parentNotification'),
    ['แจ้งแล้ว', 'อยู่ระหว่างดำเนินการ', 'ยังไม่เกี่ยวข้อง/ระบุเหตุผล'],
    [{ x: 180.02, y: 417.76 }, { x: 232.64, y: 417.76 }, { x: 336.46, y: 417.76 }],
    textColor,
  );
  drawField(page1, font, stringValue(formData, 'parentNotificationReason'), 456, 419.5, 80, 18, textColor);

  drawField(page1, font, stringValue(formData, 'referralReason'), 78, 400.5, 458, 38, textColor, 19, 312);

  drawChecklist(
    page1,
    font,
    arrayValue(formData, 'concernAreas'),
    ['ด้านการเรียนรู้และวิชาการ', 'ด้านพฤติกรรม อารมณ์ และสังคม', 'ด้านพัฒนาการ การเคลื่อนไหว กล้ามเนื้อ และการรับความรู้สึก', 'อื่น ๆ'],
    [{ x: 72, y: 361.22 }, { x: 216.52, y: 361.22 }, { x: 72, y: 341.48 }, { x: 324.54, y: 341.48 }],
    textColor,
  );
  drawOtherField(page1, font, formData, 'concernAreas', 359, 343.2, 177, textColor);

  drawField(page1, font, stringValue(formData, 'problemDescription'), 78, 309.2, 458, 40, textColor, 19.5, 182);

  // 3. ประวัติการรักษา ประวัติพัฒนาการ และสุขภาพที่เกี่ยวข้อง
  drawChecklist(
    page1,
    font,
    arrayValue(formData, 'dataSources'),
    ['ผู้ปกครอง', 'ครู', 'เอกสารเดิม', 'อื่น ๆ'],
    [{ x: 252.02, y: 223.52 }, { x: 312.08, y: 223.52 }, { x: 343.96, y: 223.52 }, { x: 409.72, y: 223.52 }],
    textColor,
  );
  drawOtherField(page1, font, formData, 'dataSources', 451, 225.2, 85, textColor);

  drawField(page1, font, stringValue(formData, 'developmentHealthHistory'), 78, 204.3, 458, 54, textColor, 18.5, 416);
  drawChecklist(
    page1,
    font,
    arrayValue(formData, 'expertServiceStatus'),
    ['เคย', 'ไม่เคย', 'ไม่ทราบ'],
    [{ x: 234.02, y: 144.92 }, { x: 279.5, y: 144.92 }, { x: 360.04, y: 144.92 }],
    textColor,
  );
  drawField(page1, font, stringValue(formData, 'expertServiceDetails'), 417, 146.6, 119, 18, textColor);
  drawField(page1, font, stringValue(formData, 'treatmentDiagnosisHistory'), 78, 125.7, 458, 36, textColor, 18.8, 200);
  drawField(page1, font, stringValue(formData, 'currentMedications'), 78, 88, 458, 36, textColor, 18.5, 180);

  // ==================== หน้า 2 ====================
  drawField(page2, font, stringValue(formData, 'medicalHistory'), 204, 662.7, 332, 18, textColor);
  drawField(page2, font, stringValue(formData, 'accidentHistory'), 215, 643.8, 321, 18, textColor);
  drawField(page2, font, stringValue(formData, 'currentCare'), 162, 625, 374, 18, textColor);

  // 5. ข้อมูลและประวัติแวดล้อม (Psychosocial Background)
  drawField(page2, font, stringValue(formData, 'familyBackground'), 78, 534, 458, 38, textColor, 19, 148);
  drawField(page2, font, stringValue(formData, 'educationBackground'), 78, 496.2, 458, 38, textColor, 19, 152);
  drawField(page2, font, stringValue(formData, 'peerTeacherRelations'), 78, 458.5, 458, 38, textColor, 19, 204);
  drawField(page2, font, stringValue(formData, 'interestsAndAbilities'), 78, 420.8, 458, 38, textColor, 19, 212);

  // 6. สรุปปัญหาและวางเป้าหมายร่วมกัน
  drawField(page2, font, stringValue(formData, 'psychologyProblems'), 78, 337.8, 458, 19, textColor, 19, 156);
  drawField(page2, font, stringValue(formData, 'otProblems'), 78, 318.9, 458, 19, textColor, 19, 170);
  drawField(page2, font, stringValue(formData, 'specialEducationProblems'), 78, 300.1, 458, 19, textColor, 19, 178);
  drawField(page2, font, stringValue(formData, 'otherProblems'), 78, 281.2, 458, 19, textColor, 19, 126);
  drawField(page2, font, stringValue(formData, 'shortTermGoals'), 222, 243.4, 314, 19, textColor, 19);
  drawField(page2, font, stringValue(formData, 'longTermGoals'), 218, 224.5, 318, 19, textColor, 19);
  drawField(page2, font, stringValue(formData, 'otherGoals'), 139, 205.6, 397, 19, textColor, 19);

  // 7. แผนการดูแลภายในโรงเรียน
  drawField(page2, font, stringValue(formData, 'otFrequency'), 194, 122, 56, 18, textColor);
  drawField(page2, font, stringValue(formData, 'otFocus'), 340, 122, 160, 18, textColor);
  drawField(page2, font, stringValue(formData, 'psychologyFrequency'), 342, 103.1, 20, 18, textColor);
  drawField(page2, font, stringValue(formData, 'psychologyFocus'), 447, 103.1, 56, 18, textColor);
  drawField(page2, font, stringValue(formData, 'specialEducationFrequency'), 188, 84.2, 34, 18, textColor);
  drawField(page2, font, stringValue(formData, 'specialEducationFocus'), 308, 84.2, 220, 18, textColor);

  // ==================== หน้า 3 ====================
  drawField(page3, font, stringValue(formData, 'additionalPlanDetails'), 78, 662.7, 458, 40, textColor, 19.5, 140);
  drawField(page3, font, stringValue(formData, 'externalSupportPlan'), 78, 606, 458, 38, textColor, 19, 206);

  drawChecklist(
    page3,
    font,
    arrayValue(formData, 'externalReferrals'),
    ['แพทย์เวชศาสตร์ฟื้นฟู', 'จิตแพทย์เด็กและวัยรุ่น', 'นักแก้ไขการพูด (ST)', 'อื่น'],
    [{ x: 182.55, y: 586.6 }, { x: 281.01, y: 586.6 }, { x: 459.54, y: 586.6 }, { x: 487.48, y: 586.6 }],
    textColor,
  );
  drawOtherField(page3, font, formData, 'externalReferrals', 514, 588.3, 22, textColor);

  drawField(page3, font, stringValue(formData, 'parentTeacherRecommendations'), 78, 568, 458, 38, textColor, 18.2, 232);

  // 8. สถานะการดูแลปัจจุบันและผู้บันทึก
  drawChecklist(
    page3,
    font,
    arrayValue(formData, 'supportStatuses'),
    ['กำลังรวบรวมข้อมูล', 'ประเมินเพิ่มเติม', 'อยู่ในระหว่างการดูแลอย่างต่อเนื่อง', 'ติดตามผล', 'ส่งต่อผู้เชี่ยวชาญภายนอก', 'ดำเนินการช่วยเหลือเสร็จสิ้น'],
    [
      { x: 72, y: 500.68 },
      { x: 216.02, y: 500.68 },
      { x: 360.04, y: 500.68 },
      { x: 72, y: 470.68 },
      { x: 216.02, y: 470.68 },
      { x: 360.04, y: 470.68 },
    ],
    textColor,
  );

  drawField(page3, font, stringValue(formData, 'recordedBy'), 108, 418.6, 108, 18, textColor);
  drawField(page3, font, displayDate(stringValue(formData, 'recordedAt')), 241, 418.6, 120, 18, textColor);

  const savedBytes = await pdfDoc.save();
  return new Blob([new Uint8Array(savedBytes)], { type: 'application/pdf' });
}