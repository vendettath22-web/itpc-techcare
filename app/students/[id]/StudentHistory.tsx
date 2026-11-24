'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, FileSpreadsheet, FileText, X } from 'lucide-react';
import ImagePreview from '@/components/ImagePreview';
import * as XLSX from 'xlsx';
import Navbar from '@/components/Navbar';
import { appointmentStatusName, caseDisplayName, caseServiceTypeName, fetchCases, formatThaiDate, studentName } from '@/lib/cases';
import { useSessionCaretaker } from '@/lib/session';
import { requestApi } from '@/lib/api';
import { useLanguage } from '@/lib/language';
import { CASE_SERVICE_FORM_SECTIONS } from '@/lib/case-service-forms';
import { createStudentRecordPdfBlob } from '@/lib/student-record-pdf';
import type { CaseServiceFormData } from '@/lib/case-service-forms';
import type { StudentIntakeFormData } from '@/lib/student-intake-form';
import type { itpc_takecare_cases, itpc_takecare_case_service_forms, itpc_takecare_case_signatures, itpc_takecare_case_updates, itpc_takecare_students } from '@/types/database';

function serviceFormSections(serviceType: NonNullable<itpc_takecare_cases['service_type']>, formData: CaseServiceFormData) {
  return CASE_SERVICE_FORM_SECTIONS[serviceType]
    .map((section) => ({
      title: section.title,
      fields: section.fields
        .flatMap((field) => {
          const value = formData[field.id];
          const otherValue = formData[`${field.id}Other`];
          const entries = [{
            label: field.label,
            value: Array.isArray(value) ? value.join(', ') : value ?? '',
          }];
          if (typeof otherValue === 'string' && otherValue.trim()) {
            entries.push({ label: 'ระบุรายละเอียดอื่น ๆ', value: otherValue });
          }
          return entries;
        })
        .filter((field) => field.value.trim()),
    }))
    .filter((section) => section.fields.length);
}

export default function StudentHistory({ id }: { id: string }) {
  const router = useRouter();
  const user = useSessionCaretaker();
  const { t } = useLanguage();
  const [student, setStudent] = useState<itpc_takecare_students | null>(null);
  const [studentIntake, setStudentIntake] = useState<StudentIntakeFormData | null>(null);
  const [cases, setCases] = useState<itpc_takecare_cases[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
  const [pdfPreviewReady, setPdfPreviewReady] = useState(false);
  const pdfPreviewFrame = useRef<HTMLIFrameElement>(null);

  const loadHistory = useCallback(async () => {
    const [studentResult, allCases, intakeResult] = await Promise.all([
      requestApi<itpc_takecare_students | null>('getStudent', { id }).then((data) => ({ data, error: null })).catch((loadError: unknown) => ({ data: null, error: loadError })),
      fetchCases().then((data) => ({ data, error: null })).catch((loadError: unknown) => ({ data: null, error: loadError })),
      user?.role === 'admin'
        ? requestApi<StudentIntakeFormData>('getStudentIntakeForm', { id }).then((data) => ({ data, error: null })).catch((loadError: unknown) => ({ data: null, error: loadError }))
        : Promise.resolve({ data: null, error: null }),
    ]);
    const loadError = studentResult.error ?? allCases.error ?? intakeResult.error;
    if (loadError) setError(`${t('โหลดประวัตินักเรียนไม่สำเร็จ')}: ${loadError instanceof Error ? loadError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    else {
      setError('');
      setStudent(studentResult.data);
      setStudentIntake(intakeResult.data);
      setCases((allCases.data ?? []).filter((caseItem) => caseItem.students?.some((item) => item.id === id)));
    }
    setLoading(false);
  }, [id, t, user?.role]);

  useEffect(() => {
    if (user === undefined) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    void Promise.resolve().then(loadHistory);
  }, [loadHistory, router, user]);

  const orderedCases = useMemo(() => [...cases].sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()), [cases]);

  useEffect(() => {
    if (!pdfPreviewUrl) return;
    return () => URL.revokeObjectURL(pdfPreviewUrl);
  }, [pdfPreviewUrl]);

  async function loadExportDetails() {
    return Promise.all(orderedCases.map(async (caseItem) => ({
      caseItem,
      details: await requestApi<{
        updates: itpc_takecare_case_updates[];
        signatures: itpc_takecare_case_signatures[];
        caretakers: { id: string; name: string }[];
        serviceForm: itpc_takecare_case_service_forms | null;
      }>('caseDetails', { caseId: caseItem.id }),
    })));
  }

  async function exportPdf() {
    if (!student) return;
    setExporting(true);
    setError('');
    try {
      const [templateResponse, fontResponse] = await Promise.all([
        fetch('/case-service-templates/00แบบบันทึกข้อมูลนักเรียน.pdf'),
        fetch('/fonts/Sarabun-Regular.ttf'),
      ]);
      if (!templateResponse.ok) throw new Error(`โหลดแบบฟอร์มต้นฉบับไม่สำเร็จ (${templateResponse.status})`);
      if (!fontResponse.ok) throw new Error(`โหลดฟอนต์ภาษาไทยไม่สำเร็จ (${fontResponse.status})`);
      const [templateBytes, fontBytes] = await Promise.all([
        templateResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
        fontResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
      ]);
      const blob = await createStudentRecordPdfBlob(
        templateBytes,
        fontBytes,
        studentIntake ?? {},
        {
          name: studentName(student),
          nickname: student.nickname_th ?? '',
          studentId: student.student_id ?? '',
          grade: student.grade ?? '',
          room: student.room === null ? '' : String(student.room),
          phone: student.phone ?? '',
          photoUrl: student.profile_photo_url,
        },
      );
      const previewUrl = URL.createObjectURL(blob);
      setPdfPreviewReady(false);
      setPdfPreviewUrl(previewUrl);
    } catch (exportError) {
      setError(`${t('ส่งออกรายงานไม่สำเร็จ')}: ${exportError instanceof Error ? exportError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    } finally {
      setExporting(false);
    }
  }

  function printPdf() {
    const reportWindow = pdfPreviewFrame.current?.contentWindow;
    if (!reportWindow || !pdfPreviewReady) {
      setError(t('ไม่สามารถเปิดรายงานเพื่อพิมพ์ได้ กรุณาลองอีกครั้ง'));
      return;
    }
    reportWindow.focus();
    reportWindow.print();
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
        [t('สถานที่นัดหมาย')]: caseItem.location ?? '',
        [t('วันที่สร้าง')]: formatThaiDate(caseItem.created_at),
        [t('แบบฟอร์มบริการ')]: t(caseDisplayName(caseItem)),
        [t('สถานะนัดหมาย')]: t(appointmentStatusName(caseItem.appointment_status)),
        [t('สถานะเคส')]: t(caseItem.status === 'done' ? 'เสร็จสิ้น' : 'ยังไม่เสร็จสิ้น'),
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
      const serviceFormRows = history.flatMap(({ caseItem, details }) => {
        const serviceForm = details.serviceForm;
        if (!serviceForm) return [];
        return serviceFormSections(serviceForm.service_type, serviceForm.form_data)
          .flatMap((section) => section.fields.map((field) => ({
            [t('รหัสเคส')]: caseItem.id,
            [t('วันที่นัดหมาย')]: formatThaiDate(caseItem.scheduled_at),
            [t('บริการ')]: t(caseServiceTypeName(serviceForm.service_type)),
            [t('หัวข้อ')]: t(section.title),
            [t('รายการ')]: t(field.label),
            [t('ข้อมูล')]: field.value,
          })));
      });
      const signatureRows = history.flatMap(({ caseItem, details }) => details.signatures.map((signature) => ({
        [t('รหัสเคส')]: caseItem.id,
        [t('วันที่ลงนาม')]: formatThaiDate(signature.signed_at),
        [t('ชื่อผู้ลงนาม')]: signature.signer_name,
        [t('บทบาท')]: signature.signer_role,
        [t('ข้อมูลลายเซ็น')]: signature.signature_data,
      })));
      const casesSheet = XLSX.utils.json_to_sheet(caseRows);
      const updatesSheet = XLSX.utils.json_to_sheet(updateRows);
      const serviceFormsSheet = serviceFormRows.length
        ? XLSX.utils.json_to_sheet(serviceFormRows)
        : XLSX.utils.aoa_to_sheet([[
          t('รหัสเคส'),
          t('วันที่นัดหมาย'),
          t('บริการ'),
          t('หัวข้อ'),
          t('รายการ'),
          t('ข้อมูล'),
        ]]);
      const signaturesSheet = XLSX.utils.json_to_sheet(signatureRows);
      summary['!cols'] = [{ wch: 24 }, { wch: 40 }];
      casesSheet['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 22 }, { wch: 26 }, { wch: 16 }, { wch: 48 }, { wch: 24 }, { wch: 32 }, { wch: 28 }];
      updatesSheet['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 24 }, { wch: 42 }, { wch: 42 }, { wch: 42 }];
      serviceFormsSheet['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 38 }, { wch: 36 }, { wch: 44 }, { wch: 60 }];
      signaturesSheet['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 28 }, { wch: 24 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(workbook, summary, t('ข้อมูลนักเรียน'));
      XLSX.utils.book_append_sheet(workbook, casesSheet, t('ประวัติเคส'));
      XLSX.utils.book_append_sheet(workbook, updatesSheet, t('บันทึกติดตาม'));
      XLSX.utils.book_append_sheet(workbook, serviceFormsSheet, t('แบบฟอร์มบริการ'));
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
          <div className="flex flex-wrap gap-2"><button disabled={exporting} onClick={() => void exportPdf()} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"><FileText size={16} />{exporting ? t('กำลังจัดทำ...') : t('ดูตัวอย่าง PDF')}</button><button disabled={exporting} onClick={() => void exportExcel()} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"><FileSpreadsheet size={16} />{exporting ? t('กำลังจัดทำ...') : t('ดาวน์โหลด Excel')}</button></div>
        </div>
        {user.role === 'admin' && <section className="mb-6 grid gap-3 rounded-2xl border border-[#eee9ef] bg-white p-4 sm:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">{t('ข้อมูลติดต่อ')}</h2>
            <p className="mt-1 text-sm text-gray-600">{t('เบอร์โทรนักเรียน')}: {student.phone || '-'}</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-700">{t('เอกสารสุขภาพ')}</h2>
            {typeof studentIntake?.medicalCertificateUrl === 'string'
              ? <a href={studentIntake.medicalCertificateUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-primary underline">{typeof studentIntake.medicalCertificateName === 'string' ? studentIntake.medicalCertificateName : t('เปิดใบรับรองแพทย์')}</a>
              : <p className="mt-1 text-sm text-gray-500">{t('ยังไม่มีใบรับรองแพทย์')}</p>}
          </div>
        </section>}
        <div className="mb-3 flex items-center gap-2"><Download size={17} className="text-primary" /><h2 className="font-bold text-gray-800">{t('ประวัติทุกเคส')}</h2></div>
        {orderedCases.length ? <div className="space-y-3">{orderedCases.map((item) => <article key={item.id} className="rounded-2xl border border-[#eee9ef] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-gray-800">{t(caseDisplayName(item))}</h3><p className="mt-1 text-sm text-gray-500">{formatThaiDate(item.scheduled_at)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${item.appointment_status === 'attended' ? 'bg-pastel-mint text-[#38583c]' : item.appointment_status === 'no_show' ? 'bg-[#fde8e8] text-[#8e3636]' : item.appointment_status === 'rescheduled' ? 'bg-[#e8f0fd] text-[#345d94]' : 'bg-pastel-peach text-[#80533b]'}`}>{t(appointmentStatusName(item.appointment_status))}</span></div>
          <p className="mt-2 text-sm text-gray-600">{t('สถานที่นัดหมาย')}: {item.location || '-'}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{item.details || t('ไม่มีรายละเอียด')}</p><p className="mt-3 text-xs text-gray-400">{t('ผู้ดูแล:')} {item.caretakers?.map((caretaker) => caretaker.name).join(', ') || '-'}</p>
        </article>)}</div> : <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500">{t('ยังไม่มีประวัติเคสสำหรับนักเรียนคนนี้')}</div>}
      </>}
    </section>
    {pdfPreviewUrl && <div className="fixed inset-0 z-[60] flex flex-col bg-black/70 p-3 sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="student-pdf-preview-title" className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
          <h2 id="student-pdf-preview-title" className="font-semibold text-gray-800">{t('ตัวอย่างรายงาน PDF')}</h2>
          <div className="flex items-center gap-2">
            <button type="button" disabled={!pdfPreviewReady} onClick={printPdf} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"><Download size={16} />{t('พิมพ์ / บันทึก PDF')}</button>
            <button type="button" onClick={() => { setPdfPreviewUrl(''); setPdfPreviewReady(false); }} aria-label={t('ปิด')} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X size={19} /></button>
          </div>
        </header>
        <iframe ref={pdfPreviewFrame} title={t('ตัวอย่างรายงาน PDF')} src={pdfPreviewUrl} onLoad={() => setPdfPreviewReady(true)} className="min-h-0 w-full flex-1 bg-gray-100" />
      </section>
    </div>}
  </main>;
}
