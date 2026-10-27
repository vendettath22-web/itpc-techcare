'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, UsersRound } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { fetchCases, studentName } from '@/lib/cases';
import { useSessionCaretaker } from '@/lib/session';
import { requestApi } from '@/lib/api';
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
};

const DEFAULT_ACADEMIC_YEAR = '2569';

export default function StudentsPage() {
  const router = useRouter();
  const user = useSessionCaretaker();
  const [students, setStudents] = useState<Student[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [academicYears, setAcademicYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [search, setSearch] = useState('');
  const [grade, setGrade] = useState('');
  const [room, setRoom] = useState('');
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [studentForm, setStudentForm] = useState<StudentForm>({
    studentId: '',
    firstNameTh: '',
    lastNameTh: '',
    nicknameTh: '',
    grade: '',
    room: '',
    gender: '',
    academicYear: DEFAULT_ACADEMIC_YEAR,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
      setError(`โหลดข้อมูลนักเรียนไม่สำเร็จ: ${loadError instanceof Error ? loadError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
    } finally {
      setLoading(false);
    }
  }, []);

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

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await requestApi('createStudent', studentForm);
      setSelectedYear(studentForm.academicYear);
      setGrade('');
      setRoom('');
      setStudentForm({ ...studentForm, studentId: '', firstNameTh: '', lastNameTh: '', nicknameTh: '', room: '' });
      setShowStudentForm(false);
      setNotice(`เพิ่มข้อมูลนักเรียนปีการศึกษา ${studentForm.academicYear} แล้ว`);
      await loadData(studentForm.academicYear);
    } catch (saveError) {
      setError(`เพิ่มนักเรียนไม่สำเร็จ: ${saveError instanceof Error ? saveError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
    } finally {
      setSaving(false);
    }
  }

  async function deactivateStudent(student: Student) {
    if (!window.confirm(`ยืนยันปิดข้อมูล ${studentName(student)}? ข้อมูลจะไม่ถูกโหลดในระบบ แต่ยังเก็บไว้ในฐานข้อมูล`)) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await requestApi('deactivateStudent', { id: student.id });
      setNotice('ปิดข้อมูลนักเรียนแล้ว');
      await loadData(selectedYear);
    } catch (saveError) {
      setError(`ปิดข้อมูลนักเรียนไม่สำเร็จ: ${saveError instanceof Error ? saveError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <div className="grid min-h-screen place-items-center text-gray-500">กำลังตรวจสอบการเข้าสู่ระบบ...</div>;

  return <main className="min-h-screen bg-[#faf9fb]">
    <Navbar />
    <section className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-medium text-primary">ข้อมูลนักเรียน</p><h1 className="mt-1 text-2xl font-bold text-gray-800 sm:text-3xl">รายชื่อนักเรียน</h1><p className="mt-1 text-sm text-gray-500">ปีการศึกษา {selectedYear} · นักเรียน {students.length} คน</p></div>
        {user.role === 'admin' && <button onClick={() => { setStudentForm({ ...studentForm, academicYear: selectedYear || DEFAULT_ACADEMIC_YEAR }); setShowStudentForm(true); }} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"><UserPlus size={17} />เพิ่มนักเรียน</button>}
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} <button onClick={() => { setLoading(true); void loadData(selectedYear); }} className="underline">ลองอีกครั้ง</button></p>}
      {notice && <p role="status" className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
      <div className="mb-5 grid gap-3 rounded-2xl border border-[#eee9ef] bg-white p-4 sm:grid-cols-[1fr_180px_140px_160px]">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3"><Search size={17} className="text-gray-400" /><input aria-label="ค้นหานักเรียน" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ / รหัส / ชื่อเล่น" className="w-full py-2.5 text-sm outline-none" /></div>
        <select aria-label="ปีการศึกษา" value={selectedYear || DEFAULT_ACADEMIC_YEAR} onChange={(event) => { setSelectedYear(event.target.value); setGrade(''); setRoom(''); setLoading(true); void loadData(event.target.value); }} className="rounded-xl border border-gray-200 px-3 py-2 text-sm"><option value={DEFAULT_ACADEMIC_YEAR}>{DEFAULT_ACADEMIC_YEAR} (ปีปัจจุบัน)</option>{academicYears.filter((year) => year !== DEFAULT_ACADEMIC_YEAR).map((year) => <option key={year} value={year}>{year}</option>)}</select>
        <select aria-label="กรองระดับชั้น" value={grade} onChange={(event) => { setGrade(event.target.value); setRoom(''); }} className="rounded-xl border border-gray-200 px-3 py-2 text-sm"><option value="">ทุกระดับชั้น</option>{grades.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select aria-label="กรองห้อง" value={room} onChange={(event) => setRoom(event.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm"><option value="">ทุกห้อง</option>{rooms.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      </div>
      {loading ? <p className="py-12 text-center text-gray-500">กำลังโหลดรายชื่อนักเรียน...</p> : filteredStudents.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredStudents.map((student) => <article key={student.id} className="rounded-2xl border border-[#eee9ef] bg-white p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pastel-sky text-primary"><UsersRound size={22} /></span>
            <Link href={`/students/${encodeURIComponent(student.id)}`} className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-gray-800 hover:text-primary">{studentName(student)}</span><span className="mt-1 block truncate text-xs text-gray-500">{student.nickname_th ? `ชื่อเล่น ${student.nickname_th} · ` : ''}{student.student_id || 'ไม่มีรหัส'} · {student.grade ?? '-'} / {student.room ?? '-'}</span>
            </Link>
            <span className="shrink-0 text-right"><span className="block text-lg font-bold text-primary">{caseCounts.get(student.id) ?? 0}</span><span className="text-[11px] text-gray-400">เคส</span></span>
          </div>
          {user.role === 'admin' && <button disabled={saving} onClick={() => void deactivateStudent(student)} className="mt-3 w-full rounded-lg border border-red-200 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60">ปิดข้อมูลนักเรียน</button>}
        </article>)}
      </div> : <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-14 text-center text-sm text-gray-500">{students.length ? 'ไม่พบนักเรียนที่ตรงกับตัวกรอง' : `ยังไม่มีข้อมูลนักเรียนปีการศึกษา ${selectedYear}`}</div>}
    </section>

    {showStudentForm && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
      <form onSubmit={addStudent} className="my-auto w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <h2 className="text-xl font-bold text-gray-800">เพิ่มข้อมูลนักเรียน</h2>
        <p className="mt-1 text-sm text-gray-500">เพิ่มได้เฉพาะ admin และข้อมูลจะแยกตามปีการศึกษา</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-gray-600">ปีการศึกษา
            <input required pattern="[0-9]{4}" maxLength={4} value={studentForm.academicYear} onChange={(event) => setStudentForm({ ...studentForm, academicYear: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
          </label>
          <label className="text-sm text-gray-600">รหัสนักเรียน
            <input value={studentForm.studentId} onChange={(event) => setStudentForm({ ...studentForm, studentId: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
          </label>
          <label className="text-sm text-gray-600">ชื่อ
            <input value={studentForm.firstNameTh} onChange={(event) => setStudentForm({ ...studentForm, firstNameTh: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
          </label>
          <label className="text-sm text-gray-600">นามสกุล
            <input value={studentForm.lastNameTh} onChange={(event) => setStudentForm({ ...studentForm, lastNameTh: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
          </label>
          <label className="text-sm text-gray-600">ชื่อเล่น
            <input value={studentForm.nicknameTh} onChange={(event) => setStudentForm({ ...studentForm, nicknameTh: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
          </label>
          <label className="text-sm text-gray-600">ระดับชั้น
            <input value={studentForm.grade} onChange={(event) => setStudentForm({ ...studentForm, grade: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
          </label>
          <label className="text-sm text-gray-600">ห้อง
            <input type="number" min={1} value={studentForm.room} onChange={(event) => setStudentForm({ ...studentForm, room: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
          </label>
          <label className="text-sm text-gray-600">เพศ
            <input value={studentForm.gender} onChange={(event) => setStudentForm({ ...studentForm, gender: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setShowStudentForm(false)} className="rounded-lg px-4 py-2 text-sm text-gray-600">ยกเลิก</button>
          <button disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'กำลังบันทึก...' : 'บันทึกนักเรียน'}</button>
        </div>
      </form>
    </div>}
  </main>;
}
