'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, FileSpreadsheet, Pencil, Search, Upload, UserPlus, UsersRound } from 'lucide-react';
import * as XLSX from 'xlsx';
import ImagePreview from '@/components/ImagePreview';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import Navbar from '@/components/Navbar';
import { fetchCases, studentName } from '@/lib/cases';
import { useSessionCaretaker } from '@/lib/session';
import { requestApi } from '@/lib/api';
import { prepareProfilePhoto } from '@/lib/profile-image';
import { calculateStudentAge, createEmptyStudentIntakeFormData, STUDENT_CLASSROOM_OPTIONS, STUDENT_INTAKE_SECTIONS, type StudentIntakeFormData } from '@/lib/student-intake-form';
import { useLanguage } from '@/lib/language';
import type { itpc_takecare_cases, itpc_takecare_students } from '@/types/database';

type StudentForm = {
  studentId: string;
  firstNameTh: string;
  lastNameTh: string;
  nicknameTh: string;
  grade: string;
  room: string;
  gender: string;
  academicYear: string;
  photoDataUrl: string;
  intakeFormData: StudentIntakeFormData;
};

type StudentImportRow = {
  studentId: string;
  firstNameTh: string;
  lastNameTh: string;
  nicknameTh: string;
  grade: string;
  room: string;
  gender: string;
};

const DEFAULT_ACADEMIC_YEAR = '2569';
function createEmptyStudentForm(academicYear = DEFAULT_ACADEMIC_YEAR): StudentForm {
  return {
    studentId: '',
    firstNameTh: '',
    lastNameTh: '',
    nicknameTh: '',
    grade: '',
    room: '',
    gender: '',
    academicYear,
    photoDataUrl: '',
    intakeFormData: createEmptyStudentIntakeFormData(),
  };
}

const STUDENT_IMPORT_HEADERS = [
  'student_id',
  'first_name_th',
  'last_name_th',
  'nickname_th',
  'grade',
  'room',
  'gender',
] as const;

function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

export default function StudentsPage() {
  const router = useRouter();
  const user = useSessionCaretaker();
  const { t } = useLanguage();
  const [students, setStudents] = useState<itpc_takecare_students[]>([]);
  const [cases, setCases] = useState<itpc_takecare_cases[]>([]);
  const [academicYears, setAcademicYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [search, setSearch] = useState('');
  const [grade, setGrade] = useState('');
  const [room, setRoom] = useState('');
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importRows, setImportRows] = useState<StudentImportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importAcademicYear, setImportAcademicYear] = useState(DEFAULT_ACADEMIC_YEAR);
  const [importError, setImportError] = useState('');
  const [editingStudent, setEditingStudent] = useState<itpc_takecare_students | null>(null);
  const [studentForm, setStudentForm] = useState<StudentForm>(() => createEmptyStudentForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { confirm, dialog } = useConfirmDialog();

  const loadData = useCallback(async (year?: string) => {
    try {
      const years = await requestApi<string[]>('listAcademicYears');
      const targetYear = year || years[0] || DEFAULT_ACADEMIC_YEAR;
      const [studentData, caseData] = await Promise.all([
        requestApi<itpc_takecare_students[]>('listStudents', { academicYear: targetYear }),
        fetchCases(),
      ]);
      setAcademicYears(years);
      setSelectedYear(targetYear);
      setStudents(studentData);
      setCases(caseData);
      setError('');
    } catch (loadError) {
      setError(`${t('โหลดข้อมูลนักเรียนไม่สำเร็จ')}: ${loadError instanceof Error ? loadError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (user === undefined) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    void Promise.resolve().then(() => loadData());
  }, [loadData, router, user]);

  const grades = [...new Set(students.map((student) => student.grade).filter((value): value is string => Boolean(value)))].sort();
  const rooms = [...new Set(students.filter((student) => !grade || student.grade === grade).map((student) => student.room).filter((value): value is number => value !== null))].sort((a, b) => a - b);
  const caseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    cases.forEach((caseItem) => caseItem.students?.forEach((student) => counts.set(student.id, (counts.get(student.id) ?? 0) + 1)));
    return counts;
  }, [cases]);
  const filteredStudents = students.filter((student) => {
    const content = [student.student_id, student.first_name_th, student.last_name_th, student.nickname_th].filter(Boolean).join(' ').toLocaleLowerCase('th');
    return content.includes(search.toLocaleLowerCase('th')) && (!grade || student.grade === grade) && (!room || String(student.room) === room);
  });
  const selectedClassroom = studentForm.grade && studentForm.room
    ? `${studentForm.grade}/${studentForm.room}`
    : '';
  const hasSelectedClassroom = STUDENT_CLASSROOM_OPTIONS.some(
    ({ grade: optionGrade, room: optionRoom }) => `${optionGrade}/${optionRoom}` === selectedClassroom,
  );
  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const intakeFormData = { ...studentForm.intakeFormData };
    const age = typeof intakeFormData.dateOfBirth === 'string'
      ? calculateStudentAge(intakeFormData.dateOfBirth)
      : null;
    if (intakeFormData.dateOfBirth && !age) {
      setError(t('วันเกิดไม่ถูกต้อง'));
      return;
    }
    intakeFormData.ageYears = age === null ? '' : String(age);
    delete intakeFormData.ageMonths;
    const studentFormWithAge = { ...studentForm, intakeFormData };
    const displayName = [studentForm.firstNameTh, studentForm.lastNameTh].filter(Boolean).join(' ') || studentForm.studentId || t('นักเรียน');
    if (editingStudent) {
      if (!await confirm({
        title: t('บันทึกการแก้ไขข้อมูลนักเรียน?'),
        description: `${t('ข้อมูลนักเรียน')} ${displayName} ${t('จะถูกอัปเดตในปีการศึกษา')} ${studentForm.academicYear}`,
        confirmLabel: t('บันทึกการแก้ไข'),
      })) return;
    } else if (!await confirm({
      title: `${t('เพิ่มข้อมูล')} ${displayName}?`,
      description: `${t('ข้อมูลจะถูกบันทึกในปีการศึกษา')} ${studentForm.academicYear}`,
      confirmLabel: t('เพิ่มนักเรียน'),
    })) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editingStudent) {
        await requestApi('updateStudent', { id: editingStudent.id, ...studentFormWithAge });
      } else {
        await requestApi('createStudent', studentFormWithAge);
      }
      setSelectedYear(studentForm.academicYear);
      setGrade('');
      setRoom('');
      setStudentForm(createEmptyStudentForm(studentForm.academicYear));
      setEditingStudent(null);
      setShowStudentForm(false);
      setNotice(editingStudent
        ? `${t('บันทึกการแก้ไขนักเรียนแล้ว')} ${studentForm.academicYear}`
        : `${t('เพิ่มข้อมูลนักเรียนปีการศึกษา')} ${studentForm.academicYear}`);
      await loadData(studentForm.academicYear);
    } catch (saveError) {
      setError(`${editingStudent ? t('แก้ไขนักเรียนไม่สำเร็จ') : t('เพิ่มนักเรียนไม่สำเร็จ')}: ${saveError instanceof Error ? saveError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    } finally {
      setSaving(false);
    }
  }

  async function editStudent(student: itpc_takecare_students) {
    setSaving(true);
    setError('');
    try {
      const intakeFormData = await requestApi<StudentIntakeFormData>('getStudentIntakeForm', { id: student.id });
      setEditingStudent(student);
      const savedIntakeFormData = { ...createEmptyStudentIntakeFormData(), ...intakeFormData };
      const age = typeof savedIntakeFormData.dateOfBirth === 'string'
        ? calculateStudentAge(savedIntakeFormData.dateOfBirth)
        : null;
      savedIntakeFormData.ageYears = age === null ? '' : String(age);
      delete savedIntakeFormData.ageMonths;
      setStudentForm({
        studentId: student.student_id ?? '',
        firstNameTh: student.first_name_th ?? '',
        lastNameTh: student.last_name_th ?? '',
        nicknameTh: student.nickname_th ?? '',
        grade: student.grade ?? '',
        room: student.room === null ? '' : String(student.room),
        gender: student.gender ?? '',
        academicYear: student.academic_year,
        photoDataUrl: '',
        intakeFormData: savedIntakeFormData,
      });
      setShowStudentForm(true);
    } catch (loadError) {
      setError(`${t('โหลดแบบบันทึกนักเรียนไม่สำเร็จ')}: ${loadError instanceof Error ? loadError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    } finally {
      setSaving(false);
    }
  }

  async function archiveAllStudents() {
    if (!await confirm({
      title: t('เก็บข้อมูลนักเรียนทั้งหมดเข้าคลัง?'),
      description: t('ข้อมูลนักเรียนที่ใช้งานอยู่ทุกปีการศึกษาจะถูกซ่อนจากรายชื่อ แต่ข้อมูลและประวัติเคสจะยังคงอยู่'),
      confirmLabel: t('เก็บเข้าคลัง'),
      tone: 'danger',
    })) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await requestApi<{ archived: number }>('archiveAllStudents');
      setNotice(`${t('เก็บข้อมูลนักเรียนเข้าคลังแล้ว')} ${result.archived} ${t('รายการ')}`);
      setGrade('');
      setRoom('');
      await loadData(DEFAULT_ACADEMIC_YEAR);
    } catch (archiveError) {
      setError(`${t('เก็บข้อมูลนักเรียนเข้าคลังไม่สำเร็จ')}: ${archiveError instanceof Error ? archiveError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    } finally {
      setSaving(false);
    }
  }

  function updateIntakeField(key: string, value: string | string[]) {
    setStudentForm((current) => ({
      ...current,
      intakeFormData: { ...current.intakeFormData, [key]: value },
    }));
  }

  async function deactivateStudent(student: itpc_takecare_students) {
    if (!await confirm({
      title: `${t('ปิดข้อมูล')} ${studentName(student)}?`,
      description: t('ข้อมูลนี้จะไม่แสดงในการใช้งานปกติ แต่ยังคงเก็บอยู่ในฐานข้อมูล'),
      confirmLabel: t('ปิดข้อมูล'),
      tone: 'danger',
    })) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await requestApi('deactivateStudent', { id: student.id });
      setNotice(t('ปิดข้อมูลนักเรียนแล้ว'));
      await loadData(selectedYear);
    } catch (saveError) {
      setError(`${t('ปิดข้อมูลนักเรียนไม่สำเร็จ')}: ${saveError instanceof Error ? saveError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    } finally {
      setSaving(false);
    }
  }

  async function readStudentWorkbook(file: File) {
    setImportError('');
    setImportRows([]);
    setImportFileName('');
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!sheet) throw new Error(t('ไม่พบแผ่นงานในไฟล์ Excel'));

      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
      const headers = (matrix[0] ?? []).map(cellText);
      const missingHeaders = STUDENT_IMPORT_HEADERS.filter((header) => !headers.includes(header));
      if (missingHeaders.length) {
        throw new Error(`${t('หัวตารางไม่ตรงรูปแบบที่รองรับ')}: ${missingHeaders.join(', ')}`);
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
      if (!rows.length || rows.length > 2000) throw new Error(t('ไฟล์ต้องมีข้อมูลนักเรียน 1 ถึง 2,000 รายการ'));
      const importedRows = rows.map((row, index): StudentImportRow => {
        const student = {
          studentId: cellText(row.student_id),
          firstNameTh: cellText(row.first_name_th),
          lastNameTh: cellText(row.last_name_th),
          nicknameTh: cellText(row.nickname_th),
          grade: cellText(row.grade),
          room: cellText(row.room),
          gender: cellText(row.gender),
        };
        if (!student.studentId || !student.firstNameTh || !student.lastNameTh || !student.grade ||
            !/^\d+$/.test(student.room) || Number(student.room) < 1) {
          throw new Error(`${t('ตรวจพบข้อมูลไม่ครบหรือห้องไม่ถูกต้องในแถว')} ${index + 2}`);
        }
        return student;
      });

      setImportRows(importedRows);
      setImportFileName(file.name);
      setImportAcademicYear(selectedYear || DEFAULT_ACADEMIC_YEAR);
    } catch (readError) {
      setImportError(readError instanceof Error ? readError.message : t('อ่านไฟล์ Excel ไม่สำเร็จ'));
    }
  }

  async function importStudents() {
    if (!importRows.length || !/^\d{4}$/.test(importAcademicYear)) return;
    if (!await confirm({
      title: `${t('นำเข้านักเรียน')} ${importRows.length} ${t('รายการ')}?`,
      description: `${t('ปีการศึกษา')} ${importAcademicYear} · ${importFileName} · ${t('รหัสที่มีอยู่แล้วจะไม่ถูกเขียนทับ')}`,
      confirmLabel: t('ยืนยันนำเข้า'),
    })) return;

    setSaving(true);
    setImportError('');
    try {
      const result = await requestApi<{ inserted: number; skipped: number }>('importStudents', {
        academicYear: importAcademicYear,
        students: importRows,
      });
      setShowImportDialog(false);
      setImportRows([]);
      setImportFileName('');
      setSelectedYear(importAcademicYear);
      setNotice(`${t('นำเข้าข้อมูลแล้ว')} ${result.inserted} ${t('รายการ')} · ${t('ข้ามข้อมูลซ้ำ')} ${result.skipped} ${t('รายการ')}`);
      await loadData(importAcademicYear);
    } catch (importErrorResult) {
      setImportError(importErrorResult instanceof Error ? importErrorResult.message : t('นำเข้าข้อมูลไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <div className="grid min-h-screen place-items-center text-gray-500">{t('กำลังตรวจสอบการเข้าสู่ระบบ...')}</div>;

  return <main className="min-h-screen bg-[#faf9fb] transition-[padding] duration-300 ease-in-out lg:pl-[var(--sidebar-width,18rem)]">
    {dialog}
    <Navbar />
    <section className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-medium text-primary">{t('ข้อมูลนักเรียน')}</p><h1 className="mt-1 text-2xl font-bold text-gray-800 sm:text-3xl">{t('รายชื่อนักเรียน')}</h1><p className="mt-1 text-sm text-gray-500">{t('ปีการศึกษา')} {selectedYear} · {students.length} {t('นักเรียน')}</p></div>
        {user.role === 'admin' && <div className="flex flex-wrap gap-2">
          <button onClick={() => { setEditingStudent(null); setStudentForm(createEmptyStudentForm(selectedYear || DEFAULT_ACADEMIC_YEAR)); setShowStudentForm(true); }} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"><UserPlus size={17} />{t('เพิ่มนักเรียน')}</button>
          <button onClick={() => { setImportAcademicYear(selectedYear || DEFAULT_ACADEMIC_YEAR); setImportError(''); setShowImportDialog(true); }} className="flex items-center gap-2 rounded-xl border border-primary/30 bg-white px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary-light"><FileSpreadsheet size={17} />{t('นำเข้า Excel')}</button>
          <button disabled={saving} onClick={() => void archiveAllStudents()} className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"><Archive size={17} />{t('เก็บนักเรียนทั้งหมดเข้าคลัง')}</button>
        </div>}
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} <button onClick={() => { setLoading(true); void loadData(selectedYear); }} className="underline">{t('ลองอีกครั้ง')}</button></p>}
      {notice && <p role="status" className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
      <div className="mb-5 grid gap-3 rounded-2xl border border-[#eee9ef] bg-white p-4 sm:grid-cols-[1fr_180px_140px_160px]">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3"><Search size={17} className="text-gray-400" /><input aria-label={t('ค้นหาชื่อ / รหัส / ชื่อเล่น')} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('ค้นหาชื่อ / รหัส / ชื่อเล่น')} className="w-full py-2.5 text-sm outline-none" /></div>
        <select aria-label={t('ปีการศึกษา')} value={selectedYear || DEFAULT_ACADEMIC_YEAR} onChange={(event) => { setSelectedYear(event.target.value); setGrade(''); setRoom(''); setLoading(true); void loadData(event.target.value); }} className="rounded-xl border border-gray-200 px-3 py-2 text-sm"><option value={DEFAULT_ACADEMIC_YEAR}>{DEFAULT_ACADEMIC_YEAR} ({t('ปีปัจจุบัน')})</option>{academicYears.filter((year) => year !== DEFAULT_ACADEMIC_YEAR).map((year) => <option key={year} value={year}>{year}</option>)}</select>
        <select aria-label={t('ระดับชั้น')} value={grade} onChange={(event) => { setGrade(event.target.value); setRoom(''); }} className="rounded-xl border border-gray-200 px-3 py-2 text-sm"><option value="">{t('ทุกระดับชั้น')}</option>{grades.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select aria-label={t('ห้อง')} value={room} onChange={(event) => setRoom(event.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm"><option value="">{t('ทุกห้อง')}</option>{rooms.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      </div>
      {loading ? <p className="py-12 text-center text-gray-500">{t('กำลังโหลดรายชื่อนักเรียน...')}</p> : filteredStudents.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredStudents.map((student) => <article key={student.id} className="rounded-2xl border border-[#eee9ef] bg-white p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
          <div className="flex items-center gap-4">
            {student.profile_photo_url
              ? <ImagePreview src={student.profile_photo_url} alt={`รูปนักเรียน ${studentName(student)}`} width={48} height={48} className="h-12 w-12 rounded-2xl" />
              : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pastel-sky text-primary"><UsersRound size={22} /></span>}
            <Link href={`/students/${encodeURIComponent(student.id)}`} className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-gray-800 hover:text-primary">{studentName(student)}</span><span className="mt-1 block truncate text-xs text-gray-500">{student.nickname_th ? `${t('ชื่อเล่น')} ${student.nickname_th} · ` : ''}{student.student_id || t('ไม่มีรหัส')} · {student.grade ?? '-'} / {student.room ?? '-'}</span>
            </Link>
            <span className="shrink-0 text-right"><span className="block text-lg font-bold text-primary">{caseCounts.get(student.id) ?? 0}</span><span className="text-[11px] text-gray-400">{t('เคส')}</span></span>
          </div>
          {user.role === 'admin' && <div className="mt-3 grid grid-cols-2 gap-2">
            <button disabled={saving} onClick={() => void editStudent(student)} className="flex items-center justify-center gap-2 rounded-lg border border-primary/30 py-2 text-xs font-medium text-primary hover:bg-primary-light disabled:opacity-60"><Pencil size={14} />{t('แก้ไขข้อมูล')}</button>
            <button disabled={saving} onClick={() => void deactivateStudent(student)} className="rounded-lg border border-red-200 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60">{t('ปิดข้อมูลนักเรียน')}</button>
          </div>}
        </article>)}
      </div> : <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-14 text-center text-sm text-gray-500">{students.length ? t('ไม่พบนักเรียนที่ตรงกับตัวกรอง') : `${t('ยังไม่มีข้อมูลนักเรียนปีการศึกษา')} ${selectedYear}`}</div>}
    </section>

    {showStudentForm && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
      <form onSubmit={saveStudent} className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <header className="border-b border-gray-200 pb-5 text-center">
          <Image
            src="/cmu-itpc-logo.png"
            alt="CMU-ITPC"
            width={129}
            height={135}
            className="mx-auto h-16 w-16 object-contain"
            priority
          />
          <p className="mt-3 text-sm text-gray-700">{t('ฝ่ายส่งเสริมพัฒนาการและกิจการนักเรียน')}</p>
          <p className="text-sm text-gray-700">{t('โรงเรียนสาธิตมหาวิทยาลัยเชียงใหม่ ระดับอนุบาลและประถมศึกษา')}</p>
          <h2 className="mt-2 text-xl font-bold text-gray-900">{t('แบบบันทึกข้อมูลนักเรียน')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t(editingStudent ? 'แก้ไขได้เฉพาะ admin และข้อมูลยังแยกตามปีการศึกษา' : 'เพิ่มได้เฉพาะ admin และข้อมูลจะแยกตามปีการศึกษา')}</p>
        </header>
        {STUDENT_INTAKE_SECTIONS.map((section, sectionIndex) => <fieldset key={section.title} className="mt-6 border-t border-gray-100 pt-4">
          <legend className="px-1 text-base font-semibold text-gray-800">
            <span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-lg bg-primary-light text-sm text-primary">{sectionIndex + 1}</span>
            {t(section.title)}
          </legend>
          {section === STUDENT_INTAKE_SECTIONS[0] && <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-600">{t('ปีการศึกษา')}
              <input required pattern="[0-9]{4}" maxLength={4} value={studentForm.academicYear} onChange={(event) => setStudentForm({ ...studentForm, academicYear: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
            </label>
            <label className="text-sm text-gray-600">{t('รหัสนักเรียน')}
              <input value={studentForm.studentId} onChange={(event) => setStudentForm({ ...studentForm, studentId: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
            </label>
            <label className="text-sm text-gray-600">{t('ชื่อ')}
              <input value={studentForm.firstNameTh} onChange={(event) => setStudentForm({ ...studentForm, firstNameTh: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
            </label>
            <label className="text-sm text-gray-600">{t('นามสกุล')}
              <input value={studentForm.lastNameTh} onChange={(event) => setStudentForm({ ...studentForm, lastNameTh: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
            </label>
            <label className="text-sm text-gray-600">{t('ชื่อเล่น')}
              <input value={studentForm.nicknameTh} onChange={(event) => setStudentForm({ ...studentForm, nicknameTh: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
            </label>
            <label className="text-sm text-gray-600">{t('ชั้นเรียน / ห้อง')}
              <select
                required
                value={selectedClassroom}
                onChange={(event) => {
                  const classroom = event.target.value;
                  const separator = classroom.lastIndexOf('/');
                  setStudentForm((current) => ({
                    ...current,
                    grade: classroom.slice(0, separator),
                    room: classroom.slice(separator + 1),
                  }));
                }}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"
              >
                <option value="" disabled>{t('เลือกชั้นเรียน / ห้อง')}</option>
                {!hasSelectedClassroom && selectedClassroom && <option value={selectedClassroom}>{selectedClassroom}</option>}
                {STUDENT_CLASSROOM_OPTIONS.map(({ grade: optionGrade, room: optionRoom }) => {
                  const classroom = `${optionGrade}/${optionRoom}`;
                  return <option key={classroom} value={classroom}>{classroom}</option>;
                })}
              </select>
            </label>
            <label className="text-sm text-gray-600">{t('เพศ')}
              <input value={studentForm.gender} onChange={(event) => setStudentForm({ ...studentForm, gender: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
            </label>
            <label className="text-sm text-gray-600 sm:col-span-2">{t('รูปนักเรียน')}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void prepareProfilePhoto(file).then((photoDataUrl) => setStudentForm((current) => ({ ...current, photoDataUrl }))).catch((photoError: unknown) => setError(photoError instanceof Error ? photoError.message : t('เตรียมรูปภาพไม่สำเร็จ')));
              }} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              {(studentForm.photoDataUrl || editingStudent?.profile_photo_url) && <ImagePreview src={studentForm.photoDataUrl || editingStudent?.profile_photo_url || ''} alt="ตัวอย่างรูปนักเรียน" width={72} height={72} className="mt-2 h-[72px] w-[72px] rounded-2xl" />}
            </label>
          </div>}
          <div className="grid gap-3 sm:grid-cols-2">
            {section.fields.map((field) => {
              const currentValue = studentForm.intakeFormData[field.key];
              const selectedValues = Array.isArray(currentValue)
                ? currentValue.filter((value): value is string => typeof value === 'string')
                : [];
              const textValue = typeof currentValue === 'string' ? currentValue : '';
              if (field.type === 'checkboxes') {
                return <fieldset key={field.key} className="rounded-xl border border-gray-100 p-3 text-sm text-gray-600 sm:col-span-2">
                  <legend className="px-1">{t(field.label)}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {field.options?.map((option) => <label key={option} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selectedValues.includes(option)}
                        onChange={(event) => updateIntakeField(
                          field.key,
                          event.target.checked
                            ? [...selectedValues, option]
                            : selectedValues.filter((value) => value !== option),
                        )}
                        className="mt-1 accent-primary"
                      />
                      <span>{t(option)}</span>
                    </label>)}
                  </div>
                </fieldset>;
              }
              return <label key={field.key} className={`text-sm text-gray-600 ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                {t(field.label)}
                {field.type === 'textarea'
                  ? <textarea
                    value={textValue}
                    onChange={(event) => updateIntakeField(field.key, event.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5"
                  />
                  : <input
                    type={field.type === 'date' || field.type === 'number' ? field.type : 'text'}
                    min={field.type === 'number' ? 0 : undefined}
                    readOnly={field.key === 'ageYears'}
                    value={textValue}
                    onChange={(event) => {
                      if (field.key === 'dateOfBirth') {
                        const age = calculateStudentAge(event.target.value);
                        setStudentForm((current) => ({
                          ...current,
                          intakeFormData: {
                            ...current.intakeFormData,
                            dateOfBirth: event.target.value,
                            ageYears: age === null ? '' : String(age),
                          },
                        }));
                      } else {
                        updateIntakeField(field.key, event.target.value);
                      }
                    }}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5"
                  />}
              </label>;
            })}
          </div>
        </fieldset>)}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => { setShowStudentForm(false); setEditingStudent(null); }} className="rounded-lg px-4 py-2 text-sm text-gray-600">{t('ยกเลิก')}</button>
          <button disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? t('กำลังบันทึก...') : t(editingStudent ? 'บันทึกการแก้ไข' : 'บันทึกนักเรียน')}</button>
        </div>
      </form>
    </div>}
    {showImportDialog && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="student-import-title" className="my-auto w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <h2 id="student-import-title" className="text-xl font-bold text-gray-800">{t('นำเข้านักเรียนจาก Excel')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('รองรับคอลัมน์')} student_id, first_name_th, last_name_th, nickname_th, grade, room, gender</p>
        <label className="mt-5 block text-sm text-gray-600">{t('ปีการศึกษา')}
          <input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={importAcademicYear} onChange={(event) => setImportAcademicYear(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
        </label>
        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 px-4 py-5 text-sm font-medium text-primary hover:bg-primary-light">
          <Upload size={17} />{t(importFileName || 'เลือกไฟล์ Excel')}
          <input type="file" accept=".xlsx,.xls" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readStudentWorkbook(file);
            event.currentTarget.value = '';
          }} className="sr-only" />
        </label>
        {importRows.length > 0 && <p className="mt-3 rounded-xl bg-primary-light p-3 text-sm text-primary">{t('ตรวจสอบแล้ว')} {importRows.length} {t('รายการ')} · {t('รายการซ้ำในไฟล์')} {importRows.length - new Set(importRows.map((row) => row.studentId)).size} {t('รายการ')}</p>}
        {importError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{importError}</p>}
        <p className="mt-3 text-xs text-gray-500">{t('หากมีรหัสนักเรียนในปีการศึกษานี้อยู่แล้ว ระบบจะข้ามรายการนั้นและไม่เขียนทับข้อมูล')}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={() => setShowImportDialog(false)} className="rounded-lg px-4 py-2 text-sm text-gray-600 disabled:opacity-60">{t('ยกเลิก')}</button>
          <button type="button" disabled={saving || !importRows.length || !/^\d{4}$/.test(importAcademicYear)} onClick={() => void importStudents()} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? t('กำลังนำเข้า...') : <><Upload size={15} />{t('ยืนยันนำเข้า')}</>}</button>
        </div>
      </section>
    </div>}
  </main>;
}
