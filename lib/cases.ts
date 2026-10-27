import { requestApi } from '@/lib/api';
import type { Case, Student } from '@/types/database';

export async function fetchCases(): Promise<Case[]> {
  try {
    return await requestApi<Case[]>('fetchCases');
  } catch (error) {
    throw new Error(`โหลดข้อมูลเคสไม่สำเร็จ: ${error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
  }
}

export function studentName(student: Student): string {
  return [student.first_name_th, student.last_name_th].filter(Boolean).join(' ') || 'ไม่ระบุชื่อ';
}

export function caseTypeName(caseItem: Pick<Case, 'case_type' | 'other_text'>): string {
  if (caseItem.case_type === 'low_confidence') return 'ขาดความมั่นใจ';
  if (caseItem.case_type === 'feel_not_smart') return 'รู้สึกว่าตนเองไม่เก่ง';
  return caseItem.other_text || 'อื่น ๆ';
}

export function formatThaiDate(value: string, withTime = true): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
  }).format(date);
}
