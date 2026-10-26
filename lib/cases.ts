import { supabase } from '@/lib/supabase';
import type { Case, Caretaker, Student } from '@/types/database';

type CaseStudentRow = { case_id: string; student_id: string };
type CaseCaretakerRow = { case_id: string; caretaker_id: string };

export async function fetchCases(): Promise<Case[]> {
  const [caseResult, studentLinks, caretakerLinks, studentResult, caretakerResult] =
    await Promise.all([
      supabase.from('cases').select('*').order('scheduled_at', { ascending: false }),
      supabase.from('case_students').select('case_id, student_id'),
      supabase.from('case_caretakers').select('case_id, caretaker_id'),
      supabase.from('students').select('*'),
      supabase.from('caretakers').select('*'),
    ]);

  const error =
    caseResult.error ??
    studentLinks.error ??
    caretakerLinks.error ??
    studentResult.error ??
    caretakerResult.error;
  if (error) throw new Error(`โหลดข้อมูลเคสไม่สำเร็จ: ${error.message}`);

  const studentsById = new Map<string, Student>(
    (studentResult.data ?? []).map((student) => [student.id, student as Student]),
  );
  const caretakersById = new Map<string, Caretaker>(
    (caretakerResult.data ?? []).map((caretaker) => [caretaker.id, caretaker as Caretaker]),
  );
  const studentsByCase = new Map<string, Student[]>();
  const caretakersByCase = new Map<string, Caretaker[]>();

  for (const row of (studentLinks.data ?? []) as CaseStudentRow[]) {
    const student = studentsById.get(row.student_id);
    if (!student) continue;
    studentsByCase.set(row.case_id, [...(studentsByCase.get(row.case_id) ?? []), student]);
  }
  for (const row of (caretakerLinks.data ?? []) as CaseCaretakerRow[]) {
    const caretaker = caretakersById.get(row.caretaker_id);
    if (!caretaker) continue;
    caretakersByCase.set(row.case_id, [
      ...(caretakersByCase.get(row.case_id) ?? []),
      caretaker,
    ]);
  }

  return ((caseResult.data ?? []) as Case[]).map((caseItem) => ({
    ...caseItem,
    students: studentsByCase.get(caseItem.id) ?? [],
    caretakers: caretakersByCase.get(caseItem.id) ?? [],
  }));
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
