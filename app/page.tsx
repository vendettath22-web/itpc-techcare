'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, addMonths, endOfMonth, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileSpreadsheet, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import Navbar from '@/components/Navbar';
import CaseFormModal from '@/components/CaseFormModal';
import CaseDetailModal from '@/components/CaseDetailModal';
import { fetchCases, caseTypeName } from '@/lib/cases';
import { useCurrentDateKey, useSessionCaretaker } from '@/lib/session';
import { useLanguage } from '@/lib/language';
import type { Case } from '@/types/database';

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function Home() {
  const router = useRouter();
  const user = useSessionCaretaker();
  const { language, t } = useLanguage();
  const todayKey = useCurrentDateKey();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [monthOverride, setMonthOverride] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [exporting, setExporting] = useState(false);
  const monthKey = monthOverride ?? todayKey.slice(0, 7);
  const month = parseISO(`${monthKey}-01`);

  const loadCases = useCallback(async () => {
    try {
      const result = await fetchCases();
      setError('');
      setCases(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('โหลดเคสไม่สำเร็จ'));
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
    void Promise.resolve().then(loadCases);
  }, [loadCases, router, user]);

  const visibleCases = useMemo(() => {
    if (showAll || !user) return cases;
    return cases.filter((item) => item.caretakers?.some((caretaker) => caretaker.id === user.id));
  }, [cases, showAll, user]);

  const monthCases = useMemo(
    () => visibleCases.filter((item) => format(new Date(item.scheduled_at), 'yyyy-MM') === monthKey),
    [monthKey, visibleCases],
  );

  function exportCalendarExcel() {
    setExporting(true);
    setError('');
    try {
      const workbook = XLSX.utils.book_new();
      const createdAt = format(new Date(), 'dd/MM/yyyy HH:mm');
      const summary = XLSX.utils.aoa_to_sheet([
        [t('ปฏิทินเคส ITPC Takecare')],
        [t('เดือนที่แสดง'), new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-US', { month: 'long', year: 'numeric' }).format(month)],
        [t('ผู้ส่งออก'), user?.name ?? '-'],
        [t('ขอบเขตข้อมูล'), t(showAll ? 'เคสทั้งหมดที่มีสิทธิ์เข้าถึง' : 'เคสที่ผู้ดูแลรับผิดชอบ')],
        [t('จำนวนเคสในเดือน'), monthCases.length],
        [t('นัดหมายแล้ว'), monthCases.filter((item) => item.status !== 'done').length],
        [t('เสร็จสิ้น'), monthCases.filter((item) => item.status === 'done').length],
        [t('จัดทำเมื่อ'), createdAt],
      ]);
      const caseRows = monthCases.map((item) => ({
        [t('วันนัดหมาย')]: format(new Date(item.scheduled_at), 'dd/MM/yyyy'),
        [t('เวลา')]: format(new Date(item.scheduled_at), 'HH:mm'),
        [t('ประเภทเคส')]: t(caseTypeName(item)),
        [t('สถานะ')]: t(item.status === 'done' ? 'เสร็จสิ้น' : 'นัดหมายแล้ว'),
        [t('รายละเอียด')]: item.details || '',
        [t('นักเรียน')]: item.students?.map((student) => `${student.first_name_th ?? ''} ${student.last_name_th ?? ''}`.trim() || t('ไม่ระบุชื่อ')).join(', ') || '-',
        [t('รหัสนักเรียน')]: item.students?.map((student) => student.student_id || '-').join(', ') || '-',
        [t('ชั้น / ห้อง')]: item.students?.map((student) => `${student.grade ?? '-'} / ${student.room ?? '-'}`).join(', ') || '-',
        [t('ผู้ดูแล')]: item.caretakers?.map((caretaker) => caretaker.name).join(', ') || '-',
        [t('ผู้สร้าง')]: item.created_by_name || item.caretakers?.find((caretaker) => caretaker.id === item.created_by)?.name || '-',
        [t('สร้างเมื่อ')]: format(new Date(item.created_at), 'dd/MM/yyyy HH:mm'),
      }));
      const studentRows = monthCases.flatMap((item) => (item.students ?? []).map((student) => ({
        [t('วันนัดหมาย')]: format(new Date(item.scheduled_at), 'dd/MM/yyyy'),
        [t('เวลา')]: format(new Date(item.scheduled_at), 'HH:mm'),
        [t('ประเภทเคส')]: t(caseTypeName(item)),
        [t('ชื่อนักเรียน')]: [student.first_name_th, student.last_name_th].filter(Boolean).join(' ') || t('ไม่ระบุชื่อ'),
        [t('ชื่อเล่น')]: student.nickname_th || '-',
        [t('รหัสนักเรียน')]: student.student_id || '-',
        [t('ระดับชั้น')]: student.grade || '-',
        [t('ห้อง')]: student.room ?? '-',
        [t('ปีการศึกษา')]: student.academic_year,
        [t('สถานะเคส')]: t(item.status === 'done' ? 'เสร็จสิ้น' : 'นัดหมายแล้ว'),
      })));

      const summarySheet = summary;
      const casesSheet = XLSX.utils.json_to_sheet(caseRows);
      const studentsSheet = XLSX.utils.json_to_sheet(studentRows);
      summarySheet['!cols'] = [{ wch: 26 }, { wch: 42 }];
      summarySheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
      casesSheet['!cols'] = [
        { wch: 16 }, { wch: 10 }, { wch: 25 }, { wch: 16 }, { wch: 44 },
        { wch: 34 }, { wch: 22 }, { wch: 16 }, { wch: 30 }, { wch: 24 }, { wch: 20 },
      ];
      studentsSheet['!cols'] = [
        { wch: 16 }, { wch: 10 }, { wch: 25 }, { wch: 30 }, { wch: 20 },
        { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 18 },
      ];
      if (caseRows.length) casesSheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: caseRows.length, c: 10 } }) };
      if (studentRows.length) studentsSheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: studentRows.length, c: 9 } }) };
      XLSX.utils.book_append_sheet(workbook, summarySheet, t('สรุป'));
      XLSX.utils.book_append_sheet(workbook, casesSheet, t('รายการเคส'));
      XLSX.utils.book_append_sheet(workbook, studentsSheet, t('นักเรียน'));
      XLSX.writeFile(workbook, `itpctakecare-calendar-${monthKey}.xlsx`);
    } catch (exportError) {
      setError(`${t('ส่งออกปฏิทินไม่สำเร็จ')}: ${exportError instanceof Error ? exportError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    } finally {
      setExporting(false);
    }
  }

  const calendarDays = useMemo(() => {
    const first = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const last = endOfMonth(month);
    const count = Math.ceil((Math.ceil((last.getTime() - first.getTime()) / 86400000) + 1) / 7) * 7;
    return Array.from({ length: count }, (_, index) => addDays(first, index));
  }, [month]);

  if (!user) return <div className="grid min-h-screen place-items-center text-gray-500">{t('กำลังตรวจสอบการเข้าสู่ระบบ...')}</div>;

  return (
    <main className="min-h-screen bg-[#faf8fc] transition-[padding] duration-300 ease-in-out lg:pl-[var(--sidebar-width,18rem)]">
      <Navbar />
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-9">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{t('ภาพรวมการดูแลนักเรียน')}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#2b2132] sm:text-3xl">{t('ปฏิทินเคส')}</h1>
            <p className="mt-1.5 text-sm text-gray-500">{t('สวัสดี')}, {user?.name} · {t('ติดตามการนัดหมายและความคืบหน้า')}</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[#ebe4ef] bg-white px-4 py-2.5 text-sm font-medium text-gray-600 shadow-sm transition hover:border-[#d6c3e0]">
            <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} className="h-4 w-4 accent-primary" />
            {t('แสดงเคสทั้งหมด')}
          </label>
        </div>
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: t('เคสที่แสดง'), value: visibleCases.length, icon: CalendarDays, color: 'bg-[#f2eaf7] text-primary' },
            { label: t('นัดหมายแล้ว'), value: visibleCases.filter((item) => item.status !== 'done').length, icon: Clock3, color: 'bg-[#fff1e8] text-[#b5673d]' },
            { label: t('เสร็จสิ้น'), value: visibleCases.filter((item) => item.status === 'done').length, icon: CheckCircle2, color: 'bg-[#eaf4e8] text-[#4d8053]' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center gap-3 rounded-2xl border border-[#eee8f1] bg-white px-4 py-3.5 shadow-[0_4px_14px_rgba(49,31,59,0.035)]">
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}><Icon size={19} /></span>
              <span><span className="block text-xs font-medium text-gray-500">{label}</span><span className="mt-0.5 block text-xl font-bold text-[#35223f]">{value}</span></span>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-3xl border border-[#eee8f1] bg-white p-3 shadow-[0_12px_36px_rgba(49,31,59,0.055)] sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button aria-label={language === 'th' ? 'เดือนก่อนหน้า' : 'Previous month'} onClick={() => setMonthOverride(format(addMonths(month, -1), 'yyyy-MM'))} className="grid h-10 w-10 place-items-center rounded-xl border border-gray-100 text-gray-600 transition hover:border-[#e2d4e9] hover:bg-[#f8f4fa] hover:text-primary"><ChevronLeft size={19} /></button>
              <h2 className="min-w-36 text-center text-lg font-bold text-[#35223f]">{new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-US', { month: 'long', year: 'numeric' }).format(month)}</h2>
              <button aria-label={language === 'th' ? 'เดือนถัดไป' : 'Next month'} onClick={() => setMonthOverride(format(addMonths(month, 1), 'yyyy-MM'))} className="grid h-10 w-10 place-items-center rounded-xl border border-gray-100 text-gray-600 transition hover:border-[#e2d4e9] hover:bg-[#f8f4fa] hover:text-primary"><ChevronRight size={19} /></button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setMonthOverride(todayKey.slice(0, 7))} className="rounded-xl border border-[#e7dceb] px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary-light">{t('วันนี้')}</button>
              <button type="button" onClick={exportCalendarExcel} disabled={loading || exporting} className="flex items-center gap-2 rounded-xl bg-[#287b53] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#216746] disabled:cursor-not-allowed disabled:opacity-50">
                <FileSpreadsheet size={16} />{exporting ? t('กำลังส่งออก...') : t('ดาวน์โหลด Excel')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 rounded-t-xl border-y border-[#eee8f1] bg-[#faf8fc] py-3 text-center text-[11px] font-bold text-gray-500 sm:text-sm">
            {(language === 'th' ? ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).map((day) => <div key={day}>{day}</div>)}
          </div>
          {error && <p role="alert" className="my-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} <button onClick={() => { setLoading(true); void loadCases(); }} className="ml-2 underline">{t('ลองอีกครั้ง')}</button></p>}
          {loading && <p className="py-2 text-center text-xs text-gray-400">{t('กำลังโหลดเคส...')}</p>}
          <div className="grid grid-cols-7">
            {calendarDays.map((date) => {
              const daysCases = visibleCases.filter((item) => dayKey(new Date(item.scheduled_at)) === dayKey(date));
              return <div key={dayKey(date)} className={`min-h-20 border-b border-r border-[#f0edf2] p-1.5 transition-colors hover:bg-[#fcfaff] sm:min-h-28 sm:p-2 ${!isSameMonth(date, month) ? 'bg-[#faf9fb]' : ''}`}>
                <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${dayKey(date) === todayKey ? 'bg-primary text-white shadow-sm' : isSameMonth(date, month) ? 'text-gray-700' : 'text-gray-300'}`}>{format(date, 'd')}</span>
                <div className="mt-1.5 space-y-1">
                  {daysCases.slice(0, 3).map((item) => <button key={item.id} onClick={() => setSelectedCase(item)} title={`${caseTypeName(item)} - ${(item.students ?? []).map((student) => student.first_name_th).join(', ')}`} className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[10px] leading-tight sm:text-xs ${item.status === 'done' ? 'bg-pastel-mint text-[#38583c]' : 'bg-pastel-peach text-[#80533b]'}`}>
                    {format(new Date(item.scheduled_at), 'HH:mm')} {caseTypeName(item)}
                  </button>)}
                  {daysCases.length > 3 && <p className="pl-1 text-[10px] text-gray-500">{language === 'th' ? `อีก ${daysCases.length - 3} เคส` : `${daysCases.length - 3} more`}</p>}
                </div>
              </div>;
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-gray-500"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-pastel-peach" />{t('นัดหมายแล้ว')}</span><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-pastel-mint" />{t('เสร็จสิ้น')}</span><span className="ml-auto rounded-full bg-[#f7f3f9] px-3 py-1 font-semibold text-[#594563]">{visibleCases.length} {language === 'th' ? 'เคส' : 'cases'}</span></div>
        </div>
      </section>
      <button aria-label={t('สร้างเคสใหม่')} onClick={() => setShowForm(true)} className="fixed bottom-6 right-6 z-30 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-white shadow-[0_10px_26px_rgba(112,65,138,0.35)] transition hover:-translate-y-1 hover:bg-primary-hover sm:bottom-8 sm:right-8"><Plus size={27} /></button>
      {showForm && <CaseFormModal onClose={() => setShowForm(false)} onCreated={() => void loadCases()} />}
      {selectedCase && <CaseDetailModal caseItem={selectedCase} onClose={() => setSelectedCase(null)} onUpdated={() => void loadCases()} />}
    </main>
  );
}
