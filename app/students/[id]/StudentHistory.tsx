'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, FileSpreadsheet, FileText } from 'lucide-react';
import ImagePreview from '@/components/ImagePreview';
import * as XLSX from 'xlsx';
import Navbar from '@/components/Navbar';
import { caseTypeName, fetchCases, formatThaiDate, studentName } from '@/lib/cases';
import { escapeHtml, useSessionCaretaker } from '@/lib/session';
import { downloadThaiPdf } from '@/lib/pdf';
import { requestApi } from '@/lib/api';
import { useLanguage } from '@/lib/language';
import type { Case, CaseSignature, CaseUpdate, Student } from '@/types/database';

export default function StudentHistory({ id }: { id: string }) {
  const router = useRouter();
  const user = useSessionCaretaker();
  const { t } = useLanguage();
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
    if (loadError) setError(`${t('โหลดประวัตินักเรียนไม่สำเร็จ')}: ${loadError instanceof Error ? loadError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    else {
      setError('');
      setStudent(studentResult.data);
      setCases((allCases.data ?? []).filter((caseItem) => caseItem.students?.some((item) => item.id === id)));
    }
    setLoading(false);
  }, [id, t]);

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
    setExporting(true);
    setError('');
    try {
      const history = await loadExportDetails();
      const html = `<p class="pdf-muted">${escapeHtml(t('จัดทำเมื่อ'))} ${escapeHtml(formatThaiDate(new Date().toISOString()))}</p>
        <section class="pdf-student-profile">
          ${student.profile_photo_url ? `<img class="pdf-student-photo" src="${escapeHtml(student.profile_photo_url)}" alt="${escapeHtml(t('รูปนักเรียน'))}">` : ''}
          <div class="pdf-student-heading">
            <p class="pdf-student-kicker">${escapeHtml(t('ประวัติรายบุคคล'))}</p>
            <h2 class="pdf-student-name">${escapeHtml(studentName(student))}</h2>
            <p class="pdf-student-subtitle">${escapeHtml(t('รหัสนักเรียน'))}: ${escapeHtml(student.student_id || '-')} · ${escapeHtml(t('ปีการศึกษา'))} ${escapeHtml(student.academic_year)}</p>
          </div>
          <div class="pdf-student-count"><strong>${orderedCases.length}</strong><span>${escapeHtml(t('เคส'))}</span></div>
        </section>
        <h2 class="pdf-section-heading">${escapeHtml(t('ข้อมูลนักเรียน'))}</h2>
        <div class="pdf-info-grid">
          <div class="pdf-info-item"><span>${escapeHtml(t('ชื่อเล่น'))}</span><strong>${escapeHtml(student.nickname_th || '-')}</strong></div>
          <div class="pdf-info-item"><span>${escapeHtml(t('ระดับชั้น'))}</span><strong>${escapeHtml(student.grade || '-')}</strong></div>
          <div class="pdf-info-item"><span>${escapeHtml(t('ห้อง'))}</span><strong>${escapeHtml(String(student.room ?? '-'))}</strong></div>
          <div class="pdf-info-item"><span>${escapeHtml(t('เพศ'))}</span><strong>${escapeHtml(student.gender || '-')}</strong></div>
        </div>
        <h2 class="pdf-section-heading">${escapeHtml(t('ประวัติเคส'))}<span class="pdf-count-badge">${orderedCases.length} ${escapeHtml(t('เคส'))}</span></h2>
        ${history.map(({ caseItem, details }) => {
          const namesById = Object.fromEntries(details.caretakers.map((caretaker) => [caretaker.id, caretaker.name]));
          return `<article class="pdf-case-card">
            <header class="pdf-case-header">
              <div><h3 class="pdf-case-title">${escapeHtml(t(caseTypeName(caseItem)))}</h3><p class="pdf-case-date">${escapeHtml(t('วันนัดหมาย:'))} ${escapeHtml(formatThaiDate(caseItem.scheduled_at))}</p></div>
              <span class="pdf-status ${caseItem.status === 'done' ? 'pdf-status-done' : 'pdf-status-planned'}">${escapeHtml(t(caseItem.status === 'done' ? 'เสร็จสิ้น' : 'นัดหมายแล้ว'))}</span>
            </header>
            <div class="pdf-case-details">
              <p><b>${escapeHtml(t('วันที่สร้างเคส:'))}</b> ${escapeHtml(formatThaiDate(caseItem.created_at))}</p>
              <p><b>${escapeHtml(t('ผู้สร้าง:'))}</b> ${escapeHtml(namesById[caseItem.created_by] || '-')}</p>
              <p class="pdf-full-width"><b>${escapeHtml(t('ผู้ดูแล:'))}</b> ${escapeHtml(caseItem.caretakers?.map((caretaker) => caretaker.name).join(', ') || '-')}</p>
            </div>
            <p class="pdf-case-description"><b>${escapeHtml(t('รายละเอียด:'))}</b> ${escapeHtml(caseItem.details || '-')}</p>
            <h3 class="pdf-case-section-title">${escapeHtml(t('บันทึกติดตาม'))} (${details.updates.length} ${escapeHtml(t('รายการ'))})</h3>
            ${details.updates.map((update) => `<div class="pdf-update">
              <p><b>${escapeHtml(t('ผู้บันทึก:'))}</b> ${escapeHtml(namesById[update.caretaker_id] || t('ผู้ดูแล'))} · <b>${escapeHtml(t('วันเวลาที่บันทึก:'))}</b> ${escapeHtml(formatThaiDate(update.created_at))}</p>
              <p><b>${escapeHtml(t('กิจกรรม:'))}</b> ${escapeHtml(update.activity_note)}</p>
              ${update.result_note ? `<p><b>${escapeHtml(t('ผลลัพธ์:'))}</b> ${escapeHtml(update.result_note)}</p>` : ''}
              ${update.next_step ? `<p><b>${escapeHtml(t('ขั้นตอนถัดไป:'))}</b> ${escapeHtml(update.next_step)}</p>` : ''}
            </div>`).join('') || `<p class="pdf-empty">${escapeHtml(t('ยังไม่มีบันทึกติดตาม'))}</p>`}
            <h3 class="pdf-case-section-title">${escapeHtml(t('ลายเซ็น'))} (${details.signatures.length} ${escapeHtml(t('รายการ'))})</h3>
            ${details.signatures.map((signature) => `<div class="pdf-card pdf-signature-card">
              <div><p><b>${escapeHtml(t('ผู้ลงนาม:'))}</b> ${escapeHtml(signature.signer_name)}</p>
              <p><b>${escapeHtml(t('บทบาท:'))}</b> ${escapeHtml(signature.signer_role)}</p>
              <p><b>${escapeHtml(t('วันเวลาที่ลงนาม:'))}</b> ${escapeHtml(formatThaiDate(signature.signed_at))}</p></div>
              <img class="pdf-signature" src="${escapeHtml(signature.signature_data)}" alt="ลายเซ็น ${escapeHtml(signature.signer_name)}">
            </div>`).join('') || `<p class="pdf-empty">${escapeHtml(t('ยังไม่มีลายเซ็น'))}</p>`}
          </article>`;
        }).join('') || `<p class="pdf-empty">${escapeHtml(t('ยังไม่มีประวัติเคส'))}</p>`}`;
      const safeName = (student.student_id || student.id).replace(/[<>:"/\\|?*]/g, '_');
      await downloadThaiPdf(
        t('รายงานประวัติการดูแลนักเรียน'),
        html,
        `itpctakecare-history-${safeName}`,
      );
    } catch (exportError) {
      setError(`${t('ส่งออกรายงานไม่สำเร็จ')}: ${exportError instanceof Error ? exportError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
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
        [t('รายงานประวัติการดูแลนักเรียน'), 'itpctakecare'],
        [t('ชื่อ'), studentName(student)],
        [t('รหัสนักเรียน'), student.student_id ?? '-'],
        [t('ชื่อเล่น'), student.nickname_th ?? '-'],
        [t('ระดับชั้น'), student.grade ?? '-'],
        [t('ห้อง'), student.room ?? '-'],
        [t('ปีการศึกษา'), student.academic_year],
        [t('เพศ'), student.gender ?? '-'],
        [t('จำนวนเคส'), orderedCases.length],
        [t('จัดทำเมื่อ'), formatThaiDate(new Date().toISOString())],
      ]);
      const caseRows = history.map(({ caseItem, details }) => ({
        [t('รหัสเคส')]: caseItem.id,
        [t('วันที่นัดหมาย')]: formatThaiDate(caseItem.scheduled_at),
        [t('วันที่สร้าง')]: formatThaiDate(caseItem.created_at),
        [t('ประเภทเคส')]: t(caseTypeName(caseItem)),
        [t('สถานะ')]: t(caseItem.status === 'done' ? 'เสร็จสิ้น' : 'นัดหมายแล้ว'),
        [t('รายละเอียด')]: caseItem.details ?? '',
        [t('ผู้สร้าง')]: details.caretakers.find((caretaker) => caretaker.id === caseItem.created_by)?.name ?? '',
        [t('ผู้ดูแล')]: caseItem.caretakers?.map((caretaker) => caretaker.name).join(', ') ?? '',
        [t('นักเรียน')]: studentName(student),
      }));
      const updateRows = history.flatMap(({ caseItem, details }) => details.updates.map((update) => ({
        [t('รหัสเคส')]: caseItem.id,
        [t('วันที่บันทึก')]: formatThaiDate(update.created_at),
        [t('ผู้ดูแล')]: details.caretakers.find((caretaker) => caretaker.id === update.caretaker_id)?.name ?? '',
        [t('กิจกรรม')]: update.activity_note,
        [t('ผลลัพธ์')]: update.result_note ?? '',
        [t('ขั้นตอนถัดไป')]: update.next_step ?? '',
      })));
      const signatureRows = history.flatMap(({ caseItem, details }) => details.signatures.map((signature) => ({
        [t('รหัสเคส')]: caseItem.id,
        [t('วันที่ลงนาม')]: formatThaiDate(signature.signed_at),
        [t('ชื่อผู้ลงนาม')]: signature.signer_name,
        [t('บทบาท')]: signature.signer_role,
        [t('ข้อมูลลายเซ็น')]: signature.signature_data,
      })));
      const casesSheet = XLSX.utils.json_to_sheet(caseRows);
      const updatesSheet = XLSX.utils.json_to_sheet(updateRows);
      const signaturesSheet = XLSX.utils.json_to_sheet(signatureRows);
      summary['!cols'] = [{ wch: 24 }, { wch: 40 }];
      casesSheet['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 22 }, { wch: 26 }, { wch: 16 }, { wch: 48 }, { wch: 24 }, { wch: 32 }, { wch: 28 }];
      updatesSheet['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 24 }, { wch: 42 }, { wch: 42 }, { wch: 42 }];
      signaturesSheet['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 28 }, { wch: 24 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(workbook, summary, t('ข้อมูลนักเรียน'));
      XLSX.utils.book_append_sheet(workbook, casesSheet, t('ประวัติเคส'));
      XLSX.utils.book_append_sheet(workbook, updatesSheet, t('บันทึกติดตาม'));
      XLSX.utils.book_append_sheet(workbook, signaturesSheet, t('ลายเซ็น'));
      const safeName = (student.student_id || student.id).replace(/[<>:"/\\|?*]/g, '_');
      XLSX.writeFile(workbook, `itpctakecare-${safeName}.xlsx`);
    } catch (exportError) {
      setError(`${t('ส่งออกรายงานไม่สำเร็จ')}: ${exportError instanceof Error ? exportError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    } finally {
      setExporting(false);
    }
  }

  if (!user) return <div className="grid min-h-screen place-items-center text-gray-500">{t('กำลังตรวจสอบการเข้าสู่ระบบ...')}</div>;

  return <main className="min-h-screen bg-[#faf9fb] transition-[padding] duration-300 ease-in-out lg:pl-[var(--sidebar-width,18rem)]">
    <Navbar />
    <section className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
      <Link href="/students" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-primary"><ArrowLeft size={17} />{t('กลับไปหน้ารายชื่อนักเรียน')}</Link>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} <button onClick={() => { setLoading(true); void loadHistory(); }} className="underline">{t('ลองอีกครั้ง')}</button></p>}
      {loading ? <p className="py-16 text-center text-gray-500">{t('กำลังโหลดประวัติ...')}</p> : !student ? <div className="rounded-2xl bg-white p-10 text-center text-gray-500">{t('ไม่มีข้อมูลนักเรียน')}</div> : <>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-[#eee9ef] bg-white p-5 sm:p-7">
          <div className="flex items-center gap-4">
            {student.profile_photo_url && <ImagePreview src={student.profile_photo_url} alt={`รูปนักเรียน ${studentName(student)}`} width={76} height={76} className="h-[76px] w-[76px] rounded-2xl" />}
            <div><p className="text-sm font-medium text-primary">{t('ประวัติรายบุคคล')}</p><h1 className="mt-1 text-2xl font-bold text-gray-800">{studentName(student)}</h1><p className="mt-2 text-sm text-gray-500">{t('รหัส')} {student.student_id || '-'} · {t('ชื่อเล่น')} {student.nickname_th || '-'} · {t('ชั้น')} {student.grade ?? '-'} {t('ห้อง')} {student.room ?? '-'}</p><p className="mt-3 text-sm font-medium text-gray-700">{t('มีประวัติทั้งหมด')} {orderedCases.length} {t('เคส')}</p></div>
          </div>
          <div className="flex flex-wrap gap-2"><button disabled={exporting} onClick={() => void exportPdf()} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"><FileText size={16} />{exporting ? t('กำลังจัดทำ...') : t('ดาวน์โหลด PDF')}</button><button disabled={exporting} onClick={() => void exportExcel()} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"><FileSpreadsheet size={16} />{exporting ? t('กำลังจัดทำ...') : t('ดาวน์โหลด Excel')}</button></div>
        </div>
        <div className="mb-3 flex items-center gap-2"><Download size={17} className="text-primary" /><h2 className="font-bold text-gray-800">{t('ประวัติทุกเคส')}</h2></div>
        {orderedCases.length ? <div className="space-y-3">{orderedCases.map((item) => <article key={item.id} className="rounded-2xl border border-[#eee9ef] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-gray-800">{t(caseTypeName(item))}</h3><p className="mt-1 text-sm text-gray-500">{formatThaiDate(item.scheduled_at)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${item.status === 'done' ? 'bg-pastel-mint text-[#38583c]' : 'bg-pastel-peach text-[#80533b]'}`}>{t(item.status === 'done' ? 'เสร็จสิ้น' : 'นัดหมายแล้ว')}</span></div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{item.details || t('ไม่มีรายละเอียด')}</p><p className="mt-3 text-xs text-gray-400">{t('ผู้ดูแล:')} {item.caretakers?.map((caretaker) => caretaker.name).join(', ') || '-'}</p>
        </article>)}</div> : <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500">{t('ยังไม่มีประวัติเคสสำหรับนักเรียนคนนี้')}</div>}
      </>}
    </section>
  </main>;
}
