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
import { requestApi } from '@/lib/api';
import type { Case, CaseSignature, CaseUpdate, Student } from '@/types/database';

export default function StudentHistory({ id }: { id: string }) {
  const router = useRouter();
  const user = useSessionCaretaker();
  const [student, setStudent] = useState<Student | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    const [studentResult, allCases] = await Promise.all([
      requestApi<Student | null>('getStudent', { id }).then((data) => ({ data, error: null })).catch((loadError: unknown) => ({ data: null, error: loadError })),
      fetchCases().then((data) => ({ data, error: null })).catch((loadError: unknown) => ({ data: null, error: loadError })),
    ]);
    const loadError = studentResult.error ?? allCases.error;
    if (loadError) setError(`โหลดประวัตินักเรียนไม่สำเร็จ: ${loadError instanceof Error ? loadError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
    else {
      setError('');
      setStudent(studentResult.data);
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

  async function loadExportDetails() {
    return Promise.all(orderedCases.map(async (caseItem) => ({
      caseItem,
      details: await requestApi<{
        updates: CaseUpdate[];
        signatures: CaseSignature[];
        caretakers: { id: string; name: string }[];
      }>('caseDetails', { caseId: caseItem.id }),
    })));
  }

  async function exportPdf() {
    if (!student) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('เปิดหน้าสำหรับพิมพ์ไม่ได้ กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง');
      return;
    }
    setExporting(true);
    setError('');
    try {
      const history = await loadExportDetails();
      const html = `<h1>รายงานประวัติการดูแลนักเรียน</h1>
        <p class="muted">itpctakecare · จัดทำเมื่อ ${escapeHtml(formatThaiDate(new Date().toISOString()))}</p>
        <h2>ข้อมูลนักเรียน</h2><div class="card meta">
        <p><b>ชื่อ:</b> ${escapeHtml(studentName(student))}</p>
        <p><b>รหัสนักเรียน:</b> ${escapeHtml(student.student_id || '-')}</p>
        <p><b>ชื่อเล่น:</b> ${escapeHtml(student.nickname_th || '-')}</p>
        <p><b>ระดับชั้น / ห้อง:</b> ${escapeHtml(student.grade || '-')} / ${student.room ?? '-'}</p>
        <p><b>ปีการศึกษา:</b> ${escapeHtml(student.academic_year)}</p>
        <p><b>เพศ:</b> ${escapeHtml(student.gender || '-')}</p>
        </div><h2>ประวัติเคส (${orderedCases.length} เคส)</h2>
        ${history.map(({ caseItem, details }) => {
          const namesById = Object.fromEntries(details.caretakers.map((caretaker) => [caretaker.id, caretaker.name]));
          return `<div class="card"><p><b>${escapeHtml(caseTypeName(caseItem))}</b> · ${caseItem.status === 'done' ? 'เสร็จสิ้น' : 'นัดหมายแล้ว'}</p>
            <p class="muted">วันนัดหมาย ${escapeHtml(formatThaiDate(caseItem.scheduled_at))} · สร้างเมื่อ ${escapeHtml(formatThaiDate(caseItem.created_at))}</p>
            <p><b>รายละเอียด:</b> ${escapeHtml(caseItem.details || '-')}</p>
            <p><b>ผู้สร้าง:</b> ${escapeHtml(namesById[caseItem.created_by] || '-')}</p>
            <p><b>ผู้ดูแล:</b> ${escapeHtml(caseItem.caretakers?.map((caretaker) => caretaker.name).join(', ') || '-')}</p>
            <h3>บันทึกติดตาม</h3>${details.updates.map((update) => `<p><b>${escapeHtml(namesById[update.caretaker_id] || 'ผู้ดูแล')} · ${escapeHtml(formatThaiDate(update.created_at))}</b><br/>
              กิจกรรม: ${escapeHtml(update.activity_note)}<br/>ผลลัพธ์: ${escapeHtml(update.result_note || '-')}<br/>ขั้นตอนถัดไป: ${escapeHtml(update.next_step || '-')}</p>`).join('') || '<p>ยังไม่มีบันทึกติดตาม</p>'}
            <h3>ลายเซ็น</h3>${details.signatures.map((signature) => `<p>${escapeHtml(signature.signer_name)} (${escapeHtml(signature.signer_role)}) · ${escapeHtml(formatThaiDate(signature.signed_at))}<br/>
              <img class="signature" src="${escapeHtml(signature.signature_data)}" alt="ลายเซ็น ${escapeHtml(signature.signer_name)}"></p>`).join('') || '<p>ยังไม่มีลายเซ็น</p>'}
          </div>`;
        }).join('') || '<p>ยังไม่มีประวัติเคส</p>'}`;
      printThaiDocument(`ประวัตินักเรียน ${studentName(student)}`, html, printWindow);
    } catch (exportError) {
      printWindow.close();
      setError(`ส่งออกรายงานไม่สำเร็จ: ${exportError instanceof Error ? exportError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
    } finally {
      setExporting(false);
    }
  }

  async function exportExcel() {
    if (!student) return;
    setExporting(true);
    setError('');
    try {
      const history = await loadExportDetails();
      const workbook = XLSX.utils.book_new();
      const summary = XLSX.utils.aoa_to_sheet([
        ['รายงานประวัติการดูแลนักเรียน', 'itpctakecare'],
        ['ชื่อ', studentName(student)],
        ['รหัสนักเรียน', student.student_id ?? '-'],
        ['ชื่อเล่น', student.nickname_th ?? '-'],
        ['ระดับชั้น', student.grade ?? '-'],
        ['ห้อง', student.room ?? '-'],
        ['ปีการศึกษา', student.academic_year],
        ['เพศ', student.gender ?? '-'],
        ['จำนวนเคส', orderedCases.length],
        ['จัดทำเมื่อ', formatThaiDate(new Date().toISOString())],
      ]);
      const caseRows = history.map(({ caseItem, details }) => ({
        'รหัสเคส': caseItem.id,
        'วันที่นัดหมาย': formatThaiDate(caseItem.scheduled_at),
        'วันที่สร้าง': formatThaiDate(caseItem.created_at),
        'ประเภทเคส': caseTypeName(caseItem),
        'สถานะ': caseItem.status === 'done' ? 'เสร็จสิ้น' : 'นัดหมายแล้ว',
        'รายละเอียด': caseItem.details ?? '',
        'ผู้สร้าง': details.caretakers.find((caretaker) => caretaker.id === caseItem.created_by)?.name ?? '',
        'ผู้ดูแล': caseItem.caretakers?.map((caretaker) => caretaker.name).join(', ') ?? '',
        'นักเรียน': studentName(student),
      }));
      const updateRows = history.flatMap(({ caseItem, details }) => details.updates.map((update) => ({
        'รหัสเคส': caseItem.id,
        'วันที่บันทึก': formatThaiDate(update.created_at),
        'ผู้ดูแล': details.caretakers.find((caretaker) => caretaker.id === update.caretaker_id)?.name ?? '',
        'กิจกรรม': update.activity_note,
        'ผลลัพธ์': update.result_note ?? '',
        'ขั้นตอนถัดไป': update.next_step ?? '',
      })));
      const signatureRows = history.flatMap(({ caseItem, details }) => details.signatures.map((signature) => ({
        'รหัสเคส': caseItem.id,
        'วันที่ลงนาม': formatThaiDate(signature.signed_at),
        'ชื่อผู้ลงนาม': signature.signer_name,
        'บทบาท': signature.signer_role,
        'ข้อมูลลายเซ็น': signature.signature_data,
      })));
      const casesSheet = XLSX.utils.json_to_sheet(caseRows);
      const updatesSheet = XLSX.utils.json_to_sheet(updateRows);
      const signaturesSheet = XLSX.utils.json_to_sheet(signatureRows);
      summary['!cols'] = [{ wch: 24 }, { wch: 40 }];
      casesSheet['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 22 }, { wch: 26 }, { wch: 16 }, { wch: 48 }, { wch: 24 }, { wch: 32 }, { wch: 28 }];
      updatesSheet['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 24 }, { wch: 42 }, { wch: 42 }, { wch: 42 }];
      signaturesSheet['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 28 }, { wch: 24 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(workbook, summary, 'ข้อมูลนักเรียน');
      XLSX.utils.book_append_sheet(workbook, casesSheet, 'ประวัติเคส');
      XLSX.utils.book_append_sheet(workbook, updatesSheet, 'บันทึกติดตาม');
      XLSX.utils.book_append_sheet(workbook, signaturesSheet, 'ลายเซ็น');
      const safeName = (student.student_id || student.id).replace(/[<>:"/\\|?*]/g, '_');
      XLSX.writeFile(workbook, `itpctakecare-${safeName}.xlsx`);
    } catch (exportError) {
      setError(`ส่งออกรายงานไม่สำเร็จ: ${exportError instanceof Error ? exportError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
    } finally {
      setExporting(false);
    }
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
          <div className="flex flex-wrap gap-2"><button disabled={exporting} onClick={() => void exportPdf()} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"><FileText size={16} />{exporting ? 'กำลังจัดทำ...' : 'Export PDF'}</button><button disabled={exporting} onClick={() => void exportExcel()} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"><FileSpreadsheet size={16} />{exporting ? 'กำลังจัดทำ...' : 'Export Excel'}</button></div>
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
