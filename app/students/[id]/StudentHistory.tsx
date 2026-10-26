'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import Navbar from '@/components/Navbar';
import { caseTypeName, fetchCases, formatThaiDate, studentName } from '@/lib/cases';
import { escapeHtml, useSessionCaretaker } from '@/lib/session';
import { printThaiDocument } from '@/lib/print';
import { supabase } from '@/lib/supabase';
import type { Case, Student } from '@/types/database';

export default function StudentHistory({ id }: { id: string }) {
  const router = useRouter();
  const user = useSessionCaretaker();
  const [student, setStudent] = useState<Student | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    const [studentResult, allCases] = await Promise.all([
      supabase.from('students').select('*').eq('id', id).maybeSingle(),
      fetchCases().then((data) => ({ data, error: null })).catch((loadError: unknown) => ({ data: null, error: loadError })),
    ]);
    const loadError = studentResult.error ?? allCases.error;
    if (loadError) setError(`โหลดประวัตินักเรียนไม่สำเร็จ: ${loadError instanceof Error ? loadError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
    else {
      setError('');
      setStudent(studentResult.data as Student | null);
      setCases((allCases.data ?? []).filter((caseItem) => caseItem.students?.some((item) => item.id === id)));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (user === undefined) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    void Promise.resolve().then(loadHistory);
  }, [loadHistory, router, user]);

  const orderedCases = useMemo(() => [...cases].sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()), [cases]);

  function exportPdf() {
    if (!student) return;
    const html = `<h1>รายงานประวัติการดูแลนักเรียน</h1>
      <p class="muted">จัดทำเมื่อ ${escapeHtml(formatThaiDate(new Date().toISOString()))}</p>
      <h2>ข้อมูลนักเรียน</h2><div class="card meta">
      <p><b>ชื่อ:</b> ${escapeHtml(studentName(student))}</p>
      <p><b>รหัสนักเรียน:</b> ${escapeHtml(student.student_id || '-')}</p>
      <p><b>ชื่อเล่น:</b> ${escapeHtml(student.nickname_th || '-')}</p>
      <p><b>ระดับชั้น / ห้อง:</b> ${escapeHtml(student.grade || '-')} / ${student.room ?? '-'}</p>
      </div><h2>ประวัติเคส (${orderedCases.length} เคส)</h2>
      ${orderedCases.map((item) => `<div class="card"><p><b>${escapeHtml(caseTypeName(item))}</b> · ${item.status === 'done' ? 'เสร็จสิ้น' : 'นัดหมายแล้ว'}</p>
        <p class="muted">วันนัดหมาย ${escapeHtml(formatThaiDate(item.scheduled_at))}</p>
        <p><b>รายละเอียด:</b> ${escapeHtml(item.details || '-')}</p>
        <p><b>ผู้ดูแล:</b> ${escapeHtml(item.caretakers?.map((caretaker) => caretaker.name).join(', ') || '-')}</p></div>`).join('') || '<p>ยังไม่มีประวัติเคส</p>'}`;
    if (!printThaiDocument(`ประวัตินักเรียน ${studentName(student)}`, html)) setError('เปิดหน้าสำหรับพิมพ์ไม่ได้ กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง');
  }

  function exportExcel() {
    if (!student) return;
    const rows = orderedCases.map((item) => ({
      'วันที่นัดหมาย': formatThaiDate(item.scheduled_at),
      'ประเภทเคส': caseTypeName(item),
      'สถานะ': item.status === 'done' ? 'เสร็จสิ้น' : 'นัดหมายแล้ว',
      'รายละเอียด': item.details ?? '',
      'ผู้ดูแล': item.caretakers?.map((caretaker) => caretaker.name).join(', ') ?? '',
      'นักเรียน': studentName(student),
    }));
    const workbook = XLSX.utils.book_new();
    const summary = XLSX.utils.aoa_to_sheet([
      ['รายงานประวัติการดูแลนักเรียน'],
      ['ชื่อ', studentName(student)],
      ['รหัสนักเรียน', student.student_id ?? '-'],
      ['ชั้น / ห้อง', `${student.grade ?? '-'} / ${student.room ?? '-'}`],
      ['จำนวนเคส', orderedCases.length],
    ]);
    const history = XLSX.utils.json_to_sheet(rows);
    summary['!cols'] = [{ wch: 24 }, { wch: 36 }];
    history['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 15 }, { wch: 48 }, { wch: 30 }, { wch: 26 }];
    XLSX.utils.book_append_sheet(workbook, summary, 'ข้อมูลนักเรียน');
    XLSX.utils.book_append_sheet(workbook, history, 'ประวัติเคส');
    const safeName = (student.student_id || student.id).replace(/[<>:"/\\|?*]/g, '_');
    XLSX.writeFile(workbook, `ITPC-Techcare-${safeName}.xlsx`);
  }

  if (!user) return <div className="grid min-h-screen place-items-center text-gray-500">กำลังตรวจสอบการเข้าสู่ระบบ...</div>;

  return <main className="min-h-screen bg-[#faf9fb]">
    <Navbar />
    <section className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
      <Link href="/students" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-primary"><ArrowLeft size={17} />กลับไปหน้ารายชื่อนักเรียน</Link>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} <button onClick={() => { setLoading(true); void loadHistory(); }} className="underline">ลองอีกครั้ง</button></p>}
      {loading ? <p className="py-16 text-center text-gray-500">กำลังโหลดประวัติ...</p> : !student ? <div className="rounded-2xl bg-white p-10 text-center text-gray-500">ไม่พบข้อมูลนักเรียน</div> : <>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-[#eee9ef] bg-white p-5 sm:p-7">
          <div><p className="text-sm font-medium text-primary">ประวัติรายบุคคล</p><h1 className="mt-1 text-2xl font-bold text-gray-800">{studentName(student)}</h1><p className="mt-2 text-sm text-gray-500">รหัส {student.student_id || '-'} · ชื่อเล่น {student.nickname_th || '-'} · ชั้น {student.grade ?? '-'} ห้อง {student.room ?? '-'}</p><p className="mt-3 text-sm font-medium text-gray-700">มีประวัติทั้งหมด {orderedCases.length} เคส</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={exportPdf} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"><FileText size={16} />Export PDF</button><button onClick={exportExcel} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover"><FileSpreadsheet size={16} />Export Excel</button></div>
        </div>
        <div className="mb-3 flex items-center gap-2"><Download size={17} className="text-primary" /><h2 className="font-bold text-gray-800">ประวัติทุกเคส</h2></div>
        {orderedCases.length ? <div className="space-y-3">{orderedCases.map((item) => <article key={item.id} className="rounded-2xl border border-[#eee9ef] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-gray-800">{caseTypeName(item)}</h3><p className="mt-1 text-sm text-gray-500">{formatThaiDate(item.scheduled_at)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${item.status === 'done' ? 'bg-pastel-mint text-[#38583c]' : 'bg-pastel-peach text-[#80533b]'}`}>{item.status === 'done' ? 'เสร็จสิ้น' : 'นัดหมายแล้ว'}</span></div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{item.details || 'ไม่มีรายละเอียด'}</p><p className="mt-3 text-xs text-gray-400">ผู้ดูแล: {item.caretakers?.map((caretaker) => caretaker.name).join(', ') || '-'}</p>
        </article>)}</div> : <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500">ยังไม่มีประวัติเคสสำหรับนักเรียนคนนี้</div>}
      </>}
    </section>
  </main>;
}
