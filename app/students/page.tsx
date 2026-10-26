'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, UsersRound } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { fetchCases, studentName } from '@/lib/cases';
import { useSessionCaretaker } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { Case, Student } from '@/types/database';

export default function StudentsPage() {
  const router = useRouter();
  const user = useSessionCaretaker();
  const [students, setStudents] = useState<Student[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [search, setSearch] = useState('');
  const [grade, setGrade] = useState('');
  const [room, setRoom] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    const [studentResult, caseResult] = await Promise.all([
      supabase.from('students').select('*').order('first_name_th'),
      fetchCases().then((result) => ({ data: result, error: null })).catch((loadError: unknown) => ({ data: null, error: loadError })),
    ]);
    const loadError = studentResult.error ?? caseResult.error;
    if (loadError) setError(`โหลดข้อมูลนักเรียนไม่สำเร็จ: ${loadError instanceof Error ? loadError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
    else {
      setError('');
      setStudents((studentResult.data ?? []) as Student[]);
      setCases(caseResult.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user === undefined) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    void Promise.resolve().then(loadData);
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

  if (!user) return <div className="grid min-h-screen place-items-center text-gray-500">กำลังตรวจสอบการเข้าสู่ระบบ...</div>;

  return <main className="min-h-screen bg-[#faf9fb]">
    <Navbar />
    <section className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-medium text-primary">ข้อมูลนักเรียน</p><h1 className="mt-1 text-2xl font-bold text-gray-800 sm:text-3xl">จัดการนักเรียน</h1><p className="mt-1 text-sm text-gray-500">นักเรียนทั้งหมด {students.length} คน</p></div>
      </div>
      <div className="mb-5 grid gap-3 rounded-2xl border border-[#eee9ef] bg-white p-4 sm:grid-cols-[1fr_180px_140px]">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3"><Search size={17} className="text-gray-400" /><input aria-label="ค้นหานักเรียน" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ / รหัส / ชื่อเล่น" className="w-full py-2.5 text-sm outline-none" /></div>
        <select aria-label="กรองระดับชั้น" value={grade} onChange={(event) => { setGrade(event.target.value); setRoom(''); }} className="rounded-xl border border-gray-200 px-3 py-2 text-sm"><option value="">ทุกระดับชั้น</option>{grades.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select aria-label="กรองห้อง" value={room} onChange={(event) => setRoom(event.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm"><option value="">ทุกห้อง</option>{rooms.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} <button onClick={() => { setLoading(true); void loadData(); }} className="underline">ลองอีกครั้ง</button></p>}
      {loading ? <p className="py-12 text-center text-gray-500">กำลังโหลดรายชื่อนักเรียน...</p> : filteredStudents.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredStudents.map((student) => <Link key={student.id} href={`/students/${encodeURIComponent(student.id)}`} className="group flex items-center gap-4 rounded-2xl border border-[#eee9ef] bg-white p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pastel-sky text-primary"><UsersRound size={22} /></span>
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-gray-800 group-hover:text-primary">{studentName(student)}</span><span className="mt-1 block truncate text-xs text-gray-500">{student.nickname_th ? `ชื่อเล่น ${student.nickname_th} · ` : ''}{student.student_id || 'ไม่มีรหัส'} · {student.grade ?? '-'} / {student.room ?? '-'}</span></span>
          <span className="shrink-0 text-right"><span className="block text-lg font-bold text-primary">{caseCounts.get(student.id) ?? 0}</span><span className="text-[11px] text-gray-400">เคส</span></span>
        </Link>)}
      </div> : <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-14 text-center text-sm text-gray-500">{students.length ? 'ไม่พบนักเรียนที่ตรงกับตัวกรอง' : 'ยังไม่มีข้อมูลนักเรียน'}</div>}
    </section>
  </main>;
}
