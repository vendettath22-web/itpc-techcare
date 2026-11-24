import type { CaseServiceType } from '@/lib/case-services';

export type CaseServiceFormValue = string | string[];
export type CaseServiceFormData = Record<string, CaseServiceFormValue>;
export type CaseServiceFormField = {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'time' | 'number' | 'select' | 'checkboxes' | 'caretaker';
  options?: readonly string[];
};
export type CaseServiceFormSection = {
  title: string;
  fields: readonly CaseServiceFormField[];
};

export const CASE_SERVICE_FORM_TITLES: Record<CaseServiceType, string> = {
  parent_consultation: 'แบบบันทึกการให้คำปรึกษาผู้ปกครอง',
  student_consultation: 'แบบบันทึกการให้คำปรึกษานักเรียน',
  behavior_observation: 'แบบบันทึกการสังเกตพฤติกรรมนักเรียน',
  ot_assessment: 'แบบบันทึกการประเมินทางกิจกรรมบำบัด',
  psychological_assessment: 'แบบบันทึกการประเมินทางจิตวิทยา',
  ot_skill_activity: 'แบบบันทึกการทำกิจกรรมส่งเสริมทักษะนักเรียน (OT)',
  psychology_skill_activity: 'แบบบันทึกการทำกิจกรรมส่งเสริมทักษะนักเรียน (Psycho)',
};

const field = (
  id: string,
  label: string,
  type: CaseServiceFormField['type'] = 'textarea',
  options?: readonly string[],
): CaseServiceFormField => ({ id, label, type, ...(options ? { options } : {}) });

const referralOptions = ['นักเรียนขอรับบริการ', 'คุณครูส่งต่อ', 'ผู้ปกครองส่งต่อ', 'อื่น ๆ'] as const;
const groupOptions = ['รายบุคคล', 'กลุ่มย่อย', 'อื่น ๆ'] as const;
const otPsychSkills = [
  'ทักษะด้านอารมณ์',
  'ทักษะด้านควบคุมตนเอง',
  'ทักษะทางสังคม',
  'ทักษะการทำงานร่วมกัน',
  'ทักษะการสื่อสาร',
  'ทักษะการแก้ปัญหา',
  'ทักษะการให้ความร่วมมือ',
  'ทักษะด้านการเรียนรู้',
  'อื่น ๆ',
] as const;
const assessmentAreas = [
  'Fine motor',
  'Gross motor',
  'การเคลื่อนไหว',
  'การบูรณาการประสาทสัมผัส (SI)',
  'Social skill',
  'Emotional',
  'ADL / Play or Leisure / Productive activity',
  'Perception and cognition',
  'Attention',
  'Hyperactive',
  'การเรียน',
  'สติปัญญา',
  'การอ่าน/เขียน',
  'Visual perception',
  'Eye hand coordination',
  'อื่น ๆ',
] as const;

const serviceInfo = (
  placeLabel: string,
  providerLabel = 'ผู้ให้บริการ / ผู้ประเมิน',
): CaseServiceFormSection => ({
  title: 'ข้อมูลการให้บริการ',
  fields: [
    field('serviceDate', 'วันที่เข้ารับบริการ', 'date'),
    field('serviceTime', 'เวลา', 'time'),
    field('location', placeLabel, 'text'),
    field('sessionNumber', 'เข้ารับบริการครั้งที่', 'number'),
    field('referralType', 'ประเภทการส่งต่อ', 'select', referralOptions),
    field('serviceFormat', 'รูปแบบ', 'select', groupOptions),
    field('provider', providerLabel, 'caretaker'),
  ],
});

export const CASE_SERVICE_FORM_SECTIONS: Record<CaseServiceType, readonly CaseServiceFormSection[]> = {
  parent_consultation: [
    {
      ...serviceInfo('สถานที่ให้คำปรึกษา'),
      fields: [
        ...serviceInfo('สถานที่ให้คำปรึกษา').fields,
        field('studentAge', 'อายุ (ปี)', 'number'),
        field('providerPosition', 'ตำแหน่ง', 'text'),
        field('consultee', 'ผู้รับคำปรึกษา', 'text'),
        field('relationship', 'เกี่ยวข้องกับนักเรียนในฐานะ', 'text'),
        field('channel', 'ช่องทาง', 'checkboxes', ['พบด้วยตนเอง', 'โทรศัพท์', 'ออนไลน์', 'อื่น ๆ']),
        field('consultationType', 'ลักษณะบริการ', 'checkboxes', ['ปรึกษาครั้งแรก', 'ติดตามต่อเนื่อง', 'ประชุมร่วมหลายฝ่าย', 'อื่น ๆ']),
      ],
    },
    {
      title: 'เหตุผลและเป้าหมายการปรึกษา',
      fields: [
        field('initiator', 'ผู้ริเริ่มขอรับคำปรึกษา', 'select', ['ผู้ปกครอง', 'คุณครู', 'ฝ่ายส่งเสริมพัฒนาการฯ', 'อื่น ๆ']),
        field('mainConcern', 'ประเด็นที่นำมาปรึกษา / ข้อกังวลหลัก'),
        field('expectedOutcome', 'ความต้องการหรือผลลัพธ์ที่คาดหวัง'),
      ],
    },
    {
      title: 'ข้อมูลสำคัญที่ได้รับ',
      fields: [
        field('symptoms', 'อาการ / ปัญหาสำคัญ'),
        field('impact', 'ผลกระทบต่อการเรียน อารมณ์ พฤติกรรม หรือความสัมพันธ์'),
        field('previousSupport', 'วิธีช่วยเหลือที่เคยใช้และผลที่สังเกตได้'),
        field('strengths', 'จุดแข็งของนักเรียน / ปัจจัยสนับสนุน'),
      ],
    },
    {
      title: 'กระบวนการให้คำปรึกษาและแผนร่วมกัน',
      fields: [
        field('guidance', 'ข้อมูลหรือแนวทางที่ให้คำปรึกษา'),
        field('response', 'ความคิดเห็น การตอบสนอง หรือข้อจำกัด'),
        field('sharedGoals', 'เป้าหมายที่ตกลงร่วมกัน'),
        field('homePlan', 'แนวทางที่บ้าน'),
        field('schoolPlan', 'แนวทางที่โรงเรียน'),
        field('evaluationPlan', 'วิธีประเมินผลและช่วงเวลาติดตาม'),
      ],
    },
    {
      title: 'สรุปผลและการติดตาม',
      fields: [
        field('summary', 'สรุปประเด็นสำคัญ / ประเด็นที่ยังต้องติดตาม'),
        field('coordination', 'การประสานงาน', 'checkboxes', ['ไม่จำเป็น', 'ครู', 'ผู้ปกครอง', 'ฝ่ายส่งเสริมพัฒนาการฯ', 'ผู้เชี่ยวชาญภายนอก']),
        field('followUpDate', 'นัดติดตามวันที่', 'date'),
        field('serviceEnded', 'สถานะการติดตาม', 'select', ['ยังไม่กำหนด', 'ยุติการให้บริการครั้งนี้']),
        field('referral', 'การส่งต่อ (ถ้ามี)'),
        field('recordDate', 'วันที่บันทึก', 'date'),
      ],
    },
  ],
  student_consultation: [
    {
      ...serviceInfo('สถานที่ให้คำปรึกษา'),
      fields: [
        ...serviceInfo('สถานที่ให้คำปรึกษา').fields,
        field('studentAge', 'อายุ (ปี)', 'number'),
        field('providerPosition', 'ตำแหน่ง', 'text'),
      ],
    },
    {
      title: 'เป้าหมายและสรุปประเด็นการให้คำปรึกษา',
      fields: [
        field('generalBehavior', 'ลักษณะทั่วไป / พฤติกรรมที่สังเกตได้'),
        field('chiefComplaint', 'ประเด็นปัญหาสำคัญ'),
        field('developmentGoal', 'เป้าหมายการพัฒนา'),
        field('consultationSummary', 'สรุปเนื้อหาการให้คำปรึกษาโดยสังเขป'),
        field('protectiveFactors', 'ปัจจัยปกป้องและจุดแข็ง'),
        field('riskFactors', 'ปัจจัยเสี่ยง'),
      ],
    },
    {
      title: 'การช่วยเหลือและผลการให้คำปรึกษา',
      fields: [
        field('techniques', 'เทคนิคที่ใช้', 'checkboxes', ['รับฟังและสะท้อนความรู้สึก', 'ช่วยระบุอารมณ์', 'ฝึกทักษะการแก้ปัญหา', 'ฝึกทักษะกำกับอารมณ์', 'ใช้สื่อ / กิจกรรม / การเล่น', 'ฝึกทักษะทางสังคม', 'อื่น ๆ']),
        field('techniquesDetails', 'รายละเอียดเพิ่มเติม'),
        field('progress', 'ความคืบหน้าเทียบกับเป้าหมาย', 'select', ['ก้าวหน้า', 'คงเดิม', 'ยังประเมินไม่ได้']),
        field('progressDetails', 'รายละเอียดความคืบหน้า'),
        field('followUpConcerns', 'รายละเอียดประเด็นที่ควรติดตามเพิ่มเติม'),
        field('nextPlan', 'การวางแผนสำหรับครั้งถัดไป'),
        field('psychologistAssessment', 'การประเมินโดยนักจิตวิทย'),
        field('riskLevel', 'ระดับความเสี่ยง', 'select', ['ต่ำ', 'ปานกลาง', 'สูง']),
        field('referral', 'การส่งต่อ (ถ้ามี)'),
        field('recordDate', 'วันที่บันทึก', 'date'),
      ],
    },
  ],
  behavior_observation: [
    {
      title: 'ข้อมูลการสังเกต',
      fields: [
        field('observationDate', 'วันที่เข้าสังเกต', 'date'),
        field('observationTime', 'เวลา', 'time'),
        field('locationActivity', 'สถานที่ / รายวิชา / กิจกรรม', 'text'),
        field('activityFormat', 'รูปแบบกิจกรรม', 'select', ['ทั้งชั้น', 'กลุ่มย่อย', 'รายบุคคล', 'อื่น ๆ']),
        field('observers', 'ผู้เข้าสังเกตการณ์', 'text'),
        field('observerPosition', 'ตำแหน่งผู้เข้าสังเกตการณ์', 'text'),
        field('studentAge', 'อายุ (ปี)', 'number'),
        field('homeroomTeacher', 'ครูประจำชั้น', 'text'),
        field('referralReason', 'อาการ / เหตุผลการนำส่ง', 'text'),
        field('referralSource', 'ผู้นำส่ง', 'select', ['ครูประจำชั้น', 'ผู้ปกครอง', 'ฝ่ายส่งเสริมพัฒนาการฯ', 'อื่น ๆ']),
      ],
    },
    {
      title: 'บริบทการสังเกต',
      fields: [
        field('generalCharacteristics', 'ลักษณะทั่วไป'),
        field('observationContext', 'ลักษณะงาน คำสั่ง กิจกรรม สภาพแวดล้อม และบุคคลที่เกี่ยวข้อง'),
        field('targetBehaviors', 'พฤติกรรมหลักที่ต้องการเก็บข้อมูล', 'checkboxes', assessmentAreas),
        field('otherTargetBehavior', 'พฤติกรรมอื่น ๆ'),
      ],
    },
    {
      title: 'ผลการสังเกตและแนวทางช่วยเหลือ',
      fields: [
        field('observedBehaviors', 'สิ่งที่สังเกตได้'),
        field('identifiedConcerns', 'สรุปประเด็นปัญหาที่พบ'),
        field('strengths', 'จุดแข็งและเงื่อนไขที่ช่วยให้นักเรียนทำได้ดี'),
        field('supportStrategies', 'แนวทางช่วยเหลือและติดตาม', 'checkboxes', ['ปรับวิธีการสื่อสารหรือให้คำสั่ง', 'ปรับกิจกรรมหรือสภาพแวดล้อมการเรียนรู้', 'ใช้การเสริมแรงทางบวก', 'ให้ความช่วยเหลือด้านการจัดการอารมณ์', 'ให้คำปรึกษาหรือช่วยเหลือรายบุคคล', 'ประสานความร่วมมือกับครูและผู้ปกครอง', 'วางแผนการเข้าสังเกตการณ์ซ้ำ', 'ประเมินโดยใช้แบบประเมินหรือแบบคัดกรองเพิ่มเติม', 'อื่น ๆ']),
        field('recommendations', 'ข้อเสนอแนะ'),
        field('followUpDate', 'กำหนดติดตามครั้งถัดไป', 'date'),
        field('responsiblePerson', 'ผู้รับผิดชอบ', 'text'),
        field('recordDate', 'วันที่บันทึก', 'date'),
      ],
    },
  ],
  ot_assessment: [
    {
      ...serviceInfo('สถานที่ประเมิน', 'ผู้ประเมินคนที่ 1'),
      fields: [
        ...serviceInfo('สถานที่ประเมิน', 'ผู้ประเมินคนที่ 1').fields,
        field('studentAge', 'อายุ (ปี)', 'number'),
        field('providerPosition', 'ตำแหน่งผู้ประเมินคนที่ 1', 'text'),
      ],
    },
    {
      title: 'เครื่องมือและหัวข้อการประเมิน',
      fields: [
        field('provider2', 'ผู้ประเมินคนที่ 2', 'caretaker'),
        field('provider2Position', 'ตำแหน่งผู้ประเมินคนที่ 2', 'text'),
        field('assessmentTools', 'เครื่องมือและแบบประเมินที่ใช้', 'checkboxes', ['Standardized Test', 'Clinical Observation', 'Interview ผู้ปกครอง / ครูประจำชั้น / นักเรียน', 'อื่น ๆ']),
        field('assessmentToolsDetails', 'รายละเอียดเครื่องมือ / แบบประเมิน'),
        field('assessmentAreas', 'หัวข้อการประเมิน', 'checkboxes', assessmentAreas),
        field('assessmentDetails', 'รายละเอียดการประเมินเพิ่มเติม'),
        field('otProblems', 'ปัญหาทางกิจกรรมบำบัดที่พบ (OT Diagnosis / Problem List)'),
      ],
    },
    {
      title: 'การวิเคราะห์และการตั้งเป้าหมาย',
      fields: [
        field('shortTermGoals', 'เป้าหมายระยะสั้น (ภายใน 1-6 สัปดาห์)'),
        field('longTermGoals', 'เป้าหมายระยะยาว (ภายใน 1 เทอม)'),
        field('referral', 'การส่งต่อ (ถ้ามี)'),
        field('recordDate', 'วันที่บันทึก', 'date'),
      ],
    },
  ],
  psychological_assessment: [
    {
      ...serviceInfo('สถานที่ประเมิน', 'ผู้ประเมิน'),
      fields: [
        ...serviceInfo('สถานที่ประเมิน', 'ผู้ประเมิน').fields,
        field('studentAge', 'อายุ (ปี)', 'number'),
        field('providerPosition', 'ตำแหน่งผู้ประเมิน', 'text'),
      ],
    },
    {
      title: 'เครื่องมือและหัวข้อการประเมิน',
      fields: [
        field('assessmentTools', 'เครื่องมือและแบบประเมินที่ใช้', 'checkboxes', ['Standardized Test', 'Screening Test', 'Clinical Interviewing ผู้ปกครอง / ครูประจำชั้น / นักเรียน', 'อื่น ๆ']),
        field('assessmentToolsDetails', 'รายละเอียดเครื่องมือ / แบบประเมิน'),
        field('assessmentAreas', 'หัวข้อการประเมิน', 'checkboxes', ['ประเมินเชาวน์ปัญญา', 'ประเมินความฉลาดทางอารมณ์', 'ประเมินผลสัมฤทธิ์ทางการเรียน', 'ประเมินทักษะทางสังคม', 'ประเมินภาวะซึมเศร้า', 'ประเมินความเครียด', 'อื่น ๆ']),
        field('assessmentDetails', 'รายละเอียดการประเมินเพิ่มเติม'),
        field('preliminaryResults', 'ผลการประเมินเบื้องต้น'),
        field('recommendations', 'ข้อเสนอแนะ'),
        field('referral', 'การส่งต่อ (ถ้ามี)'),
        field('recordDate', 'วันที่บันทึก', 'date'),
      ],
    },
  ],
  ot_skill_activity: [
    {
      ...serviceInfo('สถานที่', 'ผู้ดำเนินกิจกรรม'),
      fields: [
        ...serviceInfo('สถานที่', 'ผู้ดำเนินกิจกรรม').fields,
        field('studentAge', 'อายุ (ปี)', 'number'),
        field('providerPosition', 'ตำแหน่ง', 'text'),
      ],
    },
    {
      title: 'เป้าหมายการทำกิจกรรม',
      fields: [
        field('targetSkills', 'ทักษะเป้าหมาย', 'checkboxes', otPsychSkills),
      ],
    },
    {
      title: 'บันทึกกิจกรรมบำบัด (SOAP Note)',
      fields: [
        field('subjective', '[S] สภาพอารมณ์ / ความพร้อม', 'checkboxes', ['พร้อมร่วมมือดี', 'อ่อนเพลีย / ง่วงนอน', 'วอกแวก / สมาธิสั้น', 'ต่อต้าน / งอแง']),
        field('subjectiveDetails', 'รายละเอียดสภาพอารมณ์ / ความพร้อม'),
        field('activity', '[O] กิจกรรมบำบัด / เทคนิคที่ใช้'),
        field('assistanceLevel', 'ระดับการช่วยเหลือ', 'select', ['Independent (ทำได้เอง)', 'Min Prompt', 'Mod Prompt', 'Max Prompt']),
        field('promptType', 'Prompt type', 'checkboxes', ['Physical', 'Verbal', 'Visual']),
        field('assessment', '[A] ผลการทำกิจกรรมและความก้าวหน้าเทียบกับเป้าหมาย'),
        field('plan', '[P] แผนการดูแลหรือให้กิจกรรมครั้งต่อไป'),
        field('followUpDate', 'วันนัดหมายครั้งถัดไป', 'date'),
        field('referral', 'การส่งต่อ (ถ้ามี)'),
        field('recordDate', 'วันที่บันทึก', 'date'),
      ],
    },
  ],
  psychology_skill_activity: [
    {
      ...serviceInfo('สถานที่', 'ผู้ดำเนินกิจกรรม'),
      fields: [
        ...serviceInfo('สถานที่', 'ผู้ดำเนินกิจกรรม').fields,
        field('studentAge', 'อายุ (ปี)', 'number'),
        field('providerPosition', 'ตำแหน่ง', 'text'),
      ],
    },
    {
      title: 'เป้าหมายและตัวชี้วัดทักษะ',
      fields: [
        field('targetSkills', 'ทักษะเป้าหมาย', 'checkboxes', otPsychSkills),
        field('behavioralObjective', 'วัตถุประสงค์เชิงพฤติกรรม'),
        field('successCriteria', 'ตัวชี้วัด / เกณฑ์ความสำเร็จ'),
      ],
    },
    {
      title: 'รายละเอียดและผลการทำกิจกรรม',
      fields: [
        field('activitySteps', 'ขั้นตอน / วิธีดำเนินกิจกรรม'),
        field('materials', 'สื่อ / อุปกรณ์ (ถ้ามี)'),
        field('activityAdjustments', 'การปรับกิจกรรมตามความต้องการของนักเรียน (ถ้ามี)'),
        field('participation', 'การมีส่วนร่วมโดยรวม', 'select', ['มาก', 'ปานกลาง', 'น้อย', 'อื่น ๆ']),
        field('observedBehaviors', 'ลักษณะทั่วไป / พฤติกรรมที่สังเกตได้'),
        field('strengthsProgress', 'จุดแข็งและความก้าวหน้าที่พบ'),
        field('barriers', 'อุปสรรคหรือข้อจำกัด และการตอบสนองต่อการช่วยเหลือ'),
      ],
    },
    {
      title: 'การประเมินผลและแผนดำเนินการต่อ',
      fields: [
        field('evidence', 'หลักฐานที่ใช้', 'checkboxes', ['การสังเกต', 'ชิ้นงาน', 'แบบประเมิน', 'ข้อมูลสะท้อนจากนักเรียน', 'อื่น ๆ']),
        field('outcome', 'ผลตามตัวชี้วัด', 'select', ['บรรลุวัตถุประสงค์', 'บรรลุบางส่วน', 'ยังไม่บรรลุ', 'ข้อมูลไม่เพียงพอ']),
        field('outcomeDetails', 'รายละเอียดผลตามตัวชี้วัด'),
        field('comparison', 'รายละเอียดเทียบกับครั้งก่อน', 'select', ['ดีขึ้น', 'ใกล้เคียงเดิม', 'ต้องการความช่วยเหลือเพิ่ม', 'ไม่ได้เปรียบเทียบ']),
        field('additionalSkills', 'ทักษะที่ควรฝึกฝนเพิ่มเติม'),
        field('generalization', 'แนวทางนำทักษะไปใช้ในห้องเรียนหรือชีวิตประจำวัน'),
        field('nextPlan', 'การวางแผนสำหรับครั้งถัดไป'),
        field('referral', 'การส่งต่อ (ถ้ามี)'),
        field('followUpDate', 'วันนัดหมายครั้งถัดไป', 'date'),
        field('recordDate', 'วันที่บันทึก', 'date'),
      ],
    },
  ],
};

export function createInitialCaseServiceFormData(
  serviceType: CaseServiceType,
  scheduledAt: string,
): CaseServiceFormData {
  const date = new Date(scheduledAt);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  const dateValue = localDate.toISOString().slice(0, 10);
  const timeValue = localDate.toISOString().slice(11, 16);
  const now = new Date();
  const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return {
    serviceDate: dateValue,
    observationDate: dateValue,
    serviceTime: timeValue,
    observationTime: timeValue,
    ...(['behavior_observation', 'parent_consultation', 'student_consultation', 'ot_assessment', 'psychological_assessment', 'ot_skill_activity', 'psychology_skill_activity'].includes(serviceType) ? { recordDate: localToday } : {}),
  };
}
