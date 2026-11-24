import { requestApi } from '@/lib/api';
import { caseServiceName, type CaseServiceType } from '@/lib/case-services';
import type { AppointmentStatus } from '@/types/database';
import type { itpc_takecare_cases, itpc_takecare_students } from '@/types/database';

export async function fetchCases(): Promise<itpc_takecare_cases[]> {
  try {
    return await requestApi<itpc_takecare_cases[]>('fetchCases');
  } catch (error) {
    throw new Error(`โหลดข้อมูลเคสไม่สำเร็จ: ${error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
  }
}

export function studentName(student: itpc_takecare_students): string {
  return [student.first_name_th, student.last_name_th].filter(Boolean).join(' ') || 'ไม่ระบุชื่อ';
}

export function studentGradeRoom(grade: string | null, room: number | null): string {
  const gradeParts = (grade ?? '').replace(/\$/g, '').trim().replace(/\s*\/\s*/g, '/').split('/').filter(Boolean);
  const roomText = room === null ? '' : String(room);

  while (roomText && gradeParts.length > 2 && gradeParts.at(-1) === roomText && gradeParts.at(-2) === roomText) {
    gradeParts.pop();
  }
  if (!roomText || gradeParts.at(-1) === roomText) return gradeParts.join('/') || '-';
  return [...gradeParts, roomText].join('/') || roomText;
}

export function caseTypeName(caseItem: Pick<itpc_takecare_cases, 'case_type' | 'other_text'>): string {
  if (caseItem.case_type === 'low_confidence') return 'ขาดความมั่นใจ';
  if (caseItem.case_type === 'feel_not_smart') return 'รู้สึกว่าตนเองไม่เก่ง';
  return caseItem.other_text || 'อื่น ๆ';
}

export function caseDisplayName(
  caseItem: Pick<itpc_takecare_cases, 'case_type' | 'other_text' | 'service_type'>,
): string {
  return caseItem.service_type ? caseServiceTypeName(caseItem.service_type) : caseTypeName(caseItem);
}

export function caseServiceTypeName(serviceType: CaseServiceType | null | undefined): string {
  return caseServiceName(serviceType) ?? 'ยังไม่ระบุบริการ';
}

export function appointmentStatusName(status: AppointmentStatus): string {
  switch (status) {
    case 'attended': return 'มาตามนัด';
    case 'no_show': return 'ไม่มาตามนัด';
    case 'rescheduled': return 'เลื่อนนัด';
    case 'scheduled': return 'นัดหมายแล้ว';
  }
}

export function formatThaiDate(value: string, withTime = true): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
  }).format(date);
}
