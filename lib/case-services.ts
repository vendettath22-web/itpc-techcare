export const CASE_SERVICES = [
  {
    value: 'parent_consultation',
    label: 'ให้คำปรึกษาผู้ปกครอง',
    description: 'ให้คำปรึกษาและพูดคุยกับผู้ปกครอง',
  },
  {
    value: 'student_consultation',
    label: 'ให้คำปรึกษานักเรียน',
    description: 'ให้คำปรึกษานักเรียน',
  },
  {
    value: 'behavior_observation',
    label: 'สังเกตพฤติกรรมนักเรียน',
    description: 'สังเกตพฤติกรรมของนักเรียน',
  },
  {
    value: 'ot_assessment',
    label: 'ประเมินทางกิจกรรมบำบัด (OT)',
    description: 'ประเมินด้านกิจกรรมบำบัด',
  },
  {
    value: 'psychological_assessment',
    label: 'ประเมินทางจิตวิทยา',
    description: 'ประเมินด้านจิตวิทยา',
  },
  {
    value: 'ot_skill_activity',
    label: 'ทำกิจกรรมส่งเสริมทักษะนักเรียน (OT)',
    description: 'ส่งเสริมทักษะนักเรียนด้วยกิจกรรมบำบัด',
  },
  {
    value: 'psychology_skill_activity',
    label: 'ทำกิจกรรมส่งเสริมทักษะนักเรียน (Psycho)',
    description: 'ส่งเสริมทักษะนักเรียนด้วยกิจกรรมทางจิตวิทยา',
  },
] as const;

export type CaseServiceType = (typeof CASE_SERVICES)[number]['value'];

export function isCaseServiceType(value: string): value is CaseServiceType {
  return CASE_SERVICES.some((service) => service.value === value);
}

export function caseServiceName(serviceType: CaseServiceType | null | undefined): string | null {
  return CASE_SERVICES.find((service) => service.value === serviceType)?.label ?? null;
}
