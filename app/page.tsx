'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, addMonths, endOfMonth, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import CaseFormModal from '@/components/CaseFormModal';
import CaseDetailModal from '@/components/CaseDetailModal';
import { fetchCases, caseTypeName } from '@/lib/cases';
import { useCurrentDateKey, useSessionCaretaker } from '@/lib/session';
import type { Case } from '@/types/database';

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function Home() {
  const router = useRouter();
  const user = useSessionCaretaker();
  const todayKey = useCurrentDateKey();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [monthOverride, setMonthOverride] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const monthKey = monthOverride ?? todayKey.slice(0, 7);
  const month = parseISO(`${monthKey}-01`);

  const loadCases = useCallback(async () => {
    try {
      const result = await fetchCases();
      setError('');
      setCases(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'โหลดเคสไม่สำเร็จ');
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
    void Promise.resolve().then(loadCases);
  }, [loadCases, router, user]);

  const visibleCases = useMemo(() => {
    if (showAll || !user) return cases;
    return cases.filter((item) => item.caretakers?.some((caretaker) => caretaker.id === user.id));
  }, [cases, showAll, user]);

  const calendarDays = useMemo(() => {
    const first = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const last = endOfMonth(month);
    const count = Math.ceil((Math.ceil((last.getTime() - first.getTime()) / 86400000) + 1) / 7) * 7;
    return Array.from({ length: count }, (_, index) => addDays(first, index));
  }, [month]);

  if (!user) return <div className="grid min-h-screen place-items-center text-gray-500">กำลังตรวจสอบการเข้าสู่ระบบ...</div>;

  return (
    <main className="min-h-screen bg-[#faf9fb]">
      <Navbar />
      <section className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-medium text-primary">ภาพรวมการดูแลนักเรียน</p><h1 className="mt-1 text-2xl font-bold text-gray-800 sm:text-3xl">ปฏิทินเคส</h1><p className="mt-1 text-sm text-gray-500">ผู้ดูแล {user?.name}</p></div>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
            <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} className="accent-primary" />
            เคสทั้งหมด
          </label>
        </div>
        <div className="rounded-3xl border border-[#eee9ef] bg-white p-3 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><button aria-label="เดือนก่อนหน้า" onClick={() => setMonthOverride(format(addMonths(month, -1), 'yyyy-MM'))} className="rounded-xl p-2 hover:bg-gray-100"><ChevronLeft size={19} /></button><h2 className="min-w-36 text-center text-lg font-bold text-gray-800">{new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(month)}</h2><button aria-label="เดือนถัดไป" onClick={() => setMonthOverride(format(addMonths(month, 1), 'yyyy-MM'))} className="rounded-xl p-2 hover:bg-gray-100"><ChevronRight size={19} /></button></div>
            <button onClick={() => setMonthOverride(todayKey.slice(0, 7))} className="hidden rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 sm:block">วันนี้</button>
          </div>
          <div className="grid grid-cols-7 border-b border-gray-100 pb-2 text-center text-xs font-semibold text-gray-500 sm:text-sm">
            {['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'].map((day) => <div key={day}>{day}</div>)}
          </div>
          {error && <p role="alert" className="my-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} <button onClick={() => { setLoading(true); void loadCases(); }} className="ml-2 underline">ลองอีกครั้ง</button></p>}
          {loading && <p className="py-2 text-center text-xs text-gray-400">กำลังโหลดเคส...</p>}
          <div className="grid grid-cols-7">
            {calendarDays.map((date) => {
              const daysCases = visibleCases.filter((item) => dayKey(new Date(item.scheduled_at)) === dayKey(date));
              return <div key={dayKey(date)} className={`min-h-20 border-b border-r border-gray-100 p-1 sm:min-h-24 sm:p-1.5 ${!isSameMonth(date, month) ? 'bg-gray-50/70' : ''}`}>
                <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${dayKey(date) === todayKey ? 'bg-primary text-white' : isSameMonth(date, month) ? 'text-gray-700' : 'text-gray-300'}`}>{format(date, 'd')}</span>
                <div className="mt-1 space-y-1">
                  {daysCases.slice(0, 3).map((item) => <button key={item.id} onClick={() => setSelectedCase(item)} title={`${caseTypeName(item)} - ${(item.students ?? []).map((student) => student.first_name_th).join(', ')}`} className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[10px] leading-tight sm:text-xs ${item.status === 'done' ? 'bg-pastel-mint text-[#38583c]' : 'bg-pastel-peach text-[#80533b]'}`}>
                    {format(new Date(item.scheduled_at), 'HH:mm')} {caseTypeName(item)}
                  </button>)}
                  {daysCases.length > 3 && <p className="pl-1 text-[10px] text-gray-500">อีก {daysCases.length - 3} เคส</p>}
                </div>
              </div>;
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-pastel-peach" />นัดหมายแล้ว</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-pastel-mint" />เสร็จสิ้น</span><span className="ml-auto">{visibleCases.length} เคส</span></div>
        </div>
      </section>
      <button aria-label="สร้างเคสใหม่" onClick={() => setShowForm(true)} className="fixed bottom-6 right-6 z-30 grid h-14 w-14 place-items-center rounded-full bg-primary text-white shadow-lg transition hover:scale-105 hover:bg-primary-hover"><Plus size={27} /></button>
      {showForm && <CaseFormModal onClose={() => setShowForm(false)} onCreated={() => void loadCases()} />}
      {selectedCase && <CaseDetailModal caseItem={selectedCase} onClose={() => setSelectedCase(null)} onUpdated={() => void loadCases()} />}
    </main>
  );
}
