export type StudentIntakeFormValue = string | string[];
export type StudentIntakeFormData = Record<string, StudentIntakeFormValue>;

export type StudentIntakeField = {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'number' | 'textarea' | 'checkboxes';
  options?: readonly string[];
};

export type StudentIntakeSection = {
  title: string;
  fields: readonly StudentIntakeField[];
};

export const STUDENT_CLASSROOM_OPTIONS: readonly { grade: string; room: string }[] = [
  ...['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5'].flatMap((grade) =>
    ['1', '2', '3'].map((room) => ({ grade, room })),
  ),
  ...['1', '2'].map((room) => ({ grade: 'ป.6', room })),
  { grade: 'ป.7', room: '1' },
  ...['อ.1', 'อ.2', 'อ.3'].flatMap((grade) =>
    ['1', '2', '3', '4'].map((room) => ({ grade, room })),
  ),
];

export const STUDENT_INTAKE_SECTIONS: readonly StudentIntakeSection[] = [
  {
    title: 'ข้อมูลประจำตัวนักเรียน',
    fields: [
      { key: 'schoolLevels', label: 'ระดับการศึกษา', type: 'checkboxes', options: ['อนุบาล', 'ประถมศึกษา'] },
      { key: 'dateOfBirth', label: 'วันเดือนปีเกิด', type: 'date' },
      { key: 'ageYears', label: 'อายุ (ปี)', type: 'number' },
      { key: 'ageMonths', label: 'อายุ (เดือน)', type: 'number' },
      { key: 'homeroomTeacher', label: 'ครูประจำชั้น' },
      { key: 'caregiverName', label: 'ชื่อผู้ดูแลหลัก' },
      { key: 'caregiverRelation', label: 'ความสัมพันธ์กับนักเรียน' },
      { key: 'caregiverContact', label: 'ช่องทางติดต่อที่จำเป็น' },
    ],
  },
  {
    title: 'ข้อมูลการส่งต่อและการรับบริการ',
    fields: [
      { key: 'referrer', label: 'ผู้แจ้งหรือผู้ส่งต่อ' },
      { key: 'referrerRelationPosition', label: 'ความสัมพันธ์/ตำแหน่ง' },
      {
        key: 'parentNotification',
        label: 'การแจ้งผู้ปกครอง',
        type: 'checkboxes',
        options: ['แจ้งแล้ว', 'อยู่ระหว่างดำเนินการ', 'ยังไม่เกี่ยวข้อง/ระบุเหตุผล'],
      },
      { key: 'parentNotificationReason', label: 'เหตุผลหรือรายละเอียดการแจ้งผู้ปกครอง', type: 'textarea' },
      { key: 'referralReason', label: 'เหตุผลในการส่งต่อและความคาดหวังของผู้ส่งต่อ/ผู้ปกครอง', type: 'textarea' },
      {
        key: 'concernAreas',
        label: 'อาการและปัญหาที่พบในปัจจุบัน',
        type: 'checkboxes',
        options: ['ด้านการเรียนรู้และวิชาการ', 'ด้านพฤติกรรม อารมณ์ และสังคม', 'ด้านพัฒนาการ การเคลื่อนไหว กล้ามเนื้อ และการรับความรู้สึก', 'อื่น ๆ'],
      },
      { key: 'problemDescription', label: 'อธิบายลักษณะปัญหาที่พบ', type: 'textarea' },
    ],
  },
  {
    title: 'ประวัติการรักษา ประวัติพัฒนาการ และสุขภาพที่เกี่ยวข้อง',
    fields: [
      {
        key: 'dataSources',
        label: 'แหล่งข้อมูล',
        type: 'checkboxes',
        options: ['ผู้ปกครอง', 'ครู', 'เอกสารเดิม', 'อื่น ๆ'],
      },
      { key: 'developmentHealthHistory', label: 'ประวัติพัฒนาการ การสื่อสาร การช่วยเหลือตนเอง และสุขภาพที่จำเป็นต่อการช่วยเหลือ', type: 'textarea' },
      {
        key: 'expertServiceStatus',
        label: 'เคยประเมินหรือรับบริการจากผู้เชี่ยวชาญ',
        type: 'checkboxes',
        options: ['เคย', 'ไม่เคย', 'ไม่ทราบ'],
      },
      { key: 'expertServiceDetails', label: 'รายละเอียดการประเมินหรือรับบริการจากผู้เชี่ยวชาญ', type: 'textarea' },
      { key: 'treatmentDiagnosisHistory', label: 'ประวัติการรักษาและการวินิจฉัย', type: 'textarea' },
      { key: 'currentMedications', label: 'ยาที่รับประทานในปัจจุบัน', type: 'textarea' },
    ],
  },
  {
    title: 'ประวัติและข้อมูลการดูแลปัจจุบัน',
    fields: [
      { key: 'medicalHistory', label: 'ประวัติการเจ็บป่วย โรคประจำตัว', type: 'textarea' },
      { key: 'accidentHistory', label: 'ประวัติการผ่าตัดหรืออุบัติเหตุสำคัญ', type: 'textarea' },
      { key: 'currentCare', label: 'ข้อมูลการดูแลปัจจุบัน', type: 'textarea' },
    ],
  },
  {
    title: 'ข้อมูลและประวัติแวดล้อม (Psychosocial Background)',
    fields: [
      { key: 'familyBackground', label: 'ประวัติครอบครัว', type: 'textarea' },
      { key: 'educationBackground', label: 'ข้อมูลด้านการเรียน', type: 'textarea' },
      { key: 'peerTeacherRelations', label: 'ความสัมพันธ์กับเพื่อนและคุณครู', type: 'textarea' },
      { key: 'interestsAndAbilities', label: 'ความสนใจและความสามารถพิเศษ', type: 'textarea' },
    ],
  },
  {
    title: 'สรุปปัญหาและวางเป้าหมายร่วมกัน',
    fields: [
      { key: 'psychologyProblems', label: 'ปัญหาด้านจิตวิทยา', type: 'textarea' },
      { key: 'otProblems', label: 'ปัญหาด้านกิจกรรมบำบัด', type: 'textarea' },
      { key: 'specialEducationProblems', label: 'ปัญหาด้านการศึกษาพิเศษ', type: 'textarea' },
      { key: 'otherProblems', label: 'ปัญหาอื่นๆ', type: 'textarea' },
      { key: 'shortTermGoals', label: 'เป้าหมายระยะสั้น (ภายใน 1-6 เดือน)', type: 'textarea' },
      { key: 'longTermGoals', label: 'เป้าหมายระยะยาว (1 ปีการศึกษา)', type: 'textarea' },
      { key: 'otherGoals', label: 'เป้าหมายอื่น ๆ', type: 'textarea' },
    ],
  },
  {
    title: 'แผนการดูแลภายในโรงเรียน',
    fields: [
      { key: 'otFrequency', label: 'กิจกรรมบำบัด: ความถี่ (ครั้ง/สัปดาห์)' },
      { key: 'otFocus', label: 'กิจกรรมบำบัด: เน้นด้าน', type: 'textarea' },
      { key: 'psychologyFrequency', label: 'การให้คำปรึกษา/ปรับพฤติกรรม: ความถี่ (ครั้ง/สัปดาห์)' },
      { key: 'psychologyFocus', label: 'การให้คำปรึกษา/ปรับพฤติกรรม: เน้นด้าน', type: 'textarea' },
      { key: 'specialEducationFrequency', label: 'การศึกษาพิเศษ: ความถี่ (ครั้ง/สัปดาห์)' },
      { key: 'specialEducationFocus', label: 'การศึกษาพิเศษ: เน้นด้าน', type: 'textarea' },
      { key: 'additionalPlanDetails', label: 'อธิบายเพิ่มเติม', type: 'textarea' },
      { key: 'externalSupportPlan', label: 'แผนการดูแลภายนอกโรงเรียน', type: 'textarea' },
      {
        key: 'externalReferrals',
        label: 'การส่งต่อ/ปรึกษาเพิ่มเติม',
        type: 'checkboxes',
        options: ['แพทย์เวชศาสตร์ฟื้นฟู', 'จิตแพทย์เด็กและวัยรุ่น', 'นักแก้ไขการพูด (ST)', 'อื่น'],
      },
      { key: 'parentTeacherRecommendations', label: 'คำแนะนำเบื้องต้นสำหรับผู้ปกครองและครู', type: 'textarea' },
    ],
  },
  {
    title: 'สถานะการดูแลปัจจุบันและผู้บันทึก',
    fields: [
      {
        key: 'supportStatuses',
        label: 'สถานะการดูแล',
        type: 'checkboxes',
        options: ['กำลังรวบรวมข้อมูล', 'ประเมินเพิ่มเติม', 'อยู่ในระหว่างการดูแลอย่างต่อเนื่อง', 'ติดตามผล', 'ส่งต่อผู้เชี่ยวชาญภายนอก', 'ดำเนินการช่วยเหลือเสร็จสิ้น'],
      },
      { key: 'recordedBy', label: 'ผู้บันทึก' },
      { key: 'recordedAt', label: 'วันที่บันทึก', type: 'date' },
    ],
  },
];

export function createEmptyStudentIntakeFormData(): StudentIntakeFormData {
  return Object.fromEntries(
    STUDENT_INTAKE_SECTIONS.flatMap((section) => section.fields.map((field) => [
      field.key,
      field.type === 'checkboxes' ? [] : '',
    ])),
  );
}

export function calculateStudentAge(
  dateOfBirth: string,
  today = new Date(),
): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const birthYear = Number(yearText);
  const birthMonth = Number(monthText);
  const birthDay = Number(dayText);
  const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
  if (
    birthDate.getFullYear() !== birthYear ||
    birthDate.getMonth() !== birthMonth - 1 ||
    birthDate.getDate() !== birthDay
  ) return null;

  const birthdayHasPassed = today.getMonth() + 1 > birthMonth ||
    (today.getMonth() + 1 === birthMonth && today.getDate() >= birthDay);
  const years = today.getFullYear() - birthYear - (birthdayHasPassed ? 0 : 1);
  if (years < 0) return null;

  return years;
}
