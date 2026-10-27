'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Search, UserPlus, UsersRound } from 'lucide-react';
import ImagePreview from '@/components/ImagePreview';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import Navbar from '@/components/Navbar';
import { fetchCases, studentName } from '@/lib/cases';
import { useSessionCaretaker } from '@/lib/session';
import { requestApi } from '@/lib/api';
import { prepareProfilePhoto } from '@/lib/profile-image';
import { useLanguage } from '@/lib/language';
import type { Case, Student } from '@/types/database';

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
};

const DEFAULT_ACADEMIC_YEAR = '2569';

export default function StudentsPage() {
  const router = useRouter();
  const user = useSessionCaretaker();
  const { t } = useLanguage();
  const [students, setStudents] = useState<Student[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [academicYears, setAcademicYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [search, setSearch] = useState('');
  const [grade, setGrade] = useState('');
  const [room, setRoom] = useState('');
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentForm, setStudentForm] = useState<StudentForm>({
    studentId: '',
    firstNameTh: '',
    lastNameTh: '',
    nicknameTh: '',
    grade: '',
    room: '',
    gender: '',
    academicYear: DEFAULT_ACADEMIC_YEAR,
    photoDataUrl: '',
  });
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
        requestApi<Student[]>('listStudents', { academicYear: targetYear }),
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

  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        await requestApi('updateStudent', { id: editingStudent.id, ...studentForm });
      } else {
        await requestApi('createStudent', studentForm);
      }
      setSelectedYear(studentForm.academicYear);
      setGrade('');
      setRoom('');
      setStudentForm({ ...studentForm, studentId: '', firstNameTh: '', lastNameTh: '', nicknameTh: '', room: '', photoDataUrl: '' });
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

  function editStudent(student: Student) {
    setEditingStudent(student);
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
    });
    setError('');
    setShowStudentForm(true);
  }

  async function deactivateStudent(student: Student) {
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

  if (!user) return <div className="grid min-h-screen place-items-center text-gray-500">{t('กำลังตรวจสอบการเข้าสู่ระบบ...')}</div>;

  return <main className="min-h-screen bg-[#faf9fb]">
    {dialog}
    <Navbar />
    <section className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-medium text-primary">{t('ข้อมูลนักเรียน')}</p><h1 className="mt-1 text-2xl font-bold text-gray-800 sm:text-3xl">{t('รายชื่อนักเรียน')}</h1><p className="mt-1 text-sm text-gray-500">{t('ปีการศึกษา')} {selectedYear} · {students.length} {t('นักเรียน')}</p></div>
        {user.role === 'admin' && <button onClick={() => { setEditingStudent(null); setStudentForm({ studentId: '', firstNameTh: '', lastNameTh: '', nicknameTh: '', grade: '', room: '', gender: '', academicYear: selectedYear || DEFAULT_ACADEMIC_YEAR, photoDataUrl: '' }); setShowStudentForm(true); }} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"><UserPlus size={17} />{t('เพิ่มนักเรียน')}</button>}
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
            <button disabled={saving} onClick={() => editStudent(student)} className="flex items-center justify-center gap-2 rounded-lg border border-primary/30 py-2 text-xs font-medium text-primary hover:bg-primary-light disabled:opacity-60"><Pencil size={14} />{t('แก้ไขข้อมูล')}</button>
            <button disabled={saving} onClick={() => void deactivateStudent(student)} className="rounded-lg border border-red-200 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60">{t('ปิดข้อมูลนักเรียน')}</button>
          </div>}
        </article>)}
      </div> : <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-14 text-center text-sm text-gray-500">{students.length ? t('ไม่พบนักเรียนที่ตรงกับตัวกรอง') : `${t('ยังไม่มีข้อมูลนักเรียนปีการศึกษา')} ${selectedYear}`}</div>}
    </section>

    {showStudentForm && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
      <form onSubmit={saveStudent} className="my-auto w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <h2 className="text-xl font-bold text-gray-800">{t(editingStudent ? 'แก้ไขข้อมูลนักเรียน' : 'เพิ่มข้อมูลนักเรียน')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t(editingStudent ? 'แก้ไขได้เฉพาะ admin และข้อมูลยังแยกตามปีการศึกษา' : 'เพิ่มได้เฉพาะ admin และข้อมูลจะแยกตามปีการศึกษา')}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
          <label className="text-sm text-gray-600">{t('ระดับชั้น')}
            <input value={studentForm.grade} onChange={(event) => setStudentForm({ ...studentForm, grade: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
          </label>
          <label className="text-sm text-gray-600">{t('ห้อง')}
            <input type="number" min={1} value={studentForm.room} onChange={(event) => setStudentForm({ ...studentForm, room: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
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
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => { setShowStudentForm(false); setEditingStudent(null); }} className="rounded-lg px-4 py-2 text-sm text-gray-600">{t('ยกเลิก')}</button>
          <button disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? t('กำลังบันทึก...') : t(editingStudent ? 'บันทึกการแก้ไข' : 'บันทึกนักเรียน')}</button>
        </div>
      </form>
    </div>}
  </main>;
}
