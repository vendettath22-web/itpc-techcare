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
      { key: 'referralReason', label: 'เหตุผลในการส่งต่อและความคาดหวัง', type: 'textarea' },
      { key: 'previousSchoolSupport', label: 'การช่วยเหลือที่โรงเรียนเคยดำเนินการ', type: 'textarea' },
    ],
  },
  {
    title: 'การประเมินและประเด็นที่ต้องการรับความช่วยเหลือ',
    fields: [
      {
        key: 'concernAreas',
        label: 'ประเด็นที่ต้องการรับความช่วยเหลือ',
        type: 'checkboxes',
        options: ['ด้านการเรียนรู้และวิชาการ', 'ด้านพฤติกรรม อารมณ์ และสังคม', 'ด้านพัฒนาการ การเคลื่อนไหว กล้ามเนื้อ และการรับความรู้สึก', 'อื่น ๆ'],
      },
      { key: 'identifiedNeeds', label: 'สรุปรายละเอียดประเด็นที่พบ', type: 'textarea' },
    ],
  },
  {
    title: 'ประวัติการรักษา พัฒนาการ และสุขภาพ',
    fields: [
      { key: 'medicalHistory', label: 'ประวัติโรคประจำตัวหรือการเจ็บป่วย', type: 'textarea' },
      { key: 'accidentHistory', label: 'ประวัติการบาดเจ็บหรืออุบัติเหตุสำคัญ', type: 'textarea' },
      { key: 'developmentHistory', label: 'ประวัติพัฒนาการ', type: 'textarea' },
      { key: 'currentCare', label: 'ข้อมูลการดูแลในปัจจุบัน', type: 'textarea' },
    ],
  },
  {
    title: 'ข้อมูลและประวัติแวดล้อม (จิตสังคม)',
    fields: [
      { key: 'familyBackground', label: 'ประวัติครอบครัว', type: 'textarea' },
      { key: 'educationBackground', label: 'ข้อมูลด้านการเรียน', type: 'textarea' },
      { key: 'peerTeacherRelations', label: 'ความสัมพันธ์กับเพื่อนและครู', type: 'textarea' },
      { key: 'interestsAndAbilities', label: 'ความสนใจและความสามารถพิเศษ', type: 'textarea' },
    ],
  },
  {
    title: 'สรุปประเด็นและวางเป้าหมายร่วมกัน',
    fields: [
      { key: 'studentStrengths', label: 'จุดเด่นของนักเรียน', type: 'textarea' },
      { key: 'familyStrengths', label: 'จุดเด่นหรือความร่วมมือของครอบครัว', type: 'textarea' },
      { key: 'learningDevelopmentNeeds', label: 'ประเด็นด้านการเรียนรู้และพัฒนาการ', type: 'textarea' },
      { key: 'otherNeeds', label: 'ประเด็นอื่น ๆ', type: 'textarea' },
    ],
  },
  {
    title: 'แผนการดูแลช่วยเหลือ',
    fields: [
      { key: 'supportDuration', label: 'ระยะเวลาการดูแลและเป้าหมาย', type: 'textarea' },
      { key: 'schoolSupportPlan', label: 'แผนการดูแลช่วยเหลือภายในโรงเรียน', type: 'textarea' },
      { key: 'psychologySupportFrequency', label: 'การดูแลทางจิตวิทยา (ครั้งต่อสัปดาห์)' },
      { key: 'occupationalTherapyFrequency', label: 'กิจกรรมบำบัด (ครั้งต่อสัปดาห์)' },
      { key: 'otherSupportFrequency', label: 'การช่วยเหลือด้านอื่น ๆ (ครั้งต่อสัปดาห์)' },
    ],
  },
  {
    title: 'การดูแลภายนอกโรงเรียนและข้อเสนอแนะ',
    fields: [
      { key: 'externalSupportPlan', label: 'แผนการดูแลภายนอกโรงเรียน', type: 'textarea' },
      { key: 'parentTeacherRecommendations', label: 'คำแนะนำเบื้องต้นสำหรับผู้ปกครองและครู', type: 'textarea' },
      { key: 'additionalInformation', label: 'อธิบายเพิ่มเติม', type: 'textarea' },
    ],
  },
  {
    title: 'สถานะการดูแลปัจจุบันและผู้บันทึก',
    fields: [
      {
        key: 'supportStatuses',
        label: 'สถานะการดูแล',
        type: 'checkboxes',
        options: ['กำลังรวบรวมข้อมูล', 'ประเมินเพิ่มเติม', 'อยู่ในระหว่างการดูแลอย่างต่อเนื่อง', 'ติดตามผล', 'ส่งต่อผู้เชี่ยวชาญภายนอก', 'ดำเนินการช่วยเหลือเร่งด่วน'],
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
