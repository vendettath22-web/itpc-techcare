'use client';

import { useEffect, useRef, useState, type PointerEvent, type FormEvent } from 'react';
import Image from 'next/image';
import { Download, Eraser, FileText, Pencil, Trash2, Upload, X } from 'lucide-react';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { useLanguage } from '@/lib/language';
import { requestApi } from '@/lib/api';
import { caseTypeName, formatThaiDate, studentName } from '@/lib/cases';
import { escapeHtml, useSessionCaretaker } from '@/lib/session';
import { prepareProfilePhoto } from '@/lib/profile-image';
import { createStudentReportDocument } from '@/lib/student-report';
import CaseFormModal from '@/components/CaseFormModal';
import type { itpc_takecare_cases, itpc_takecare_case_signatures, itpc_takecare_case_updates } from '@/types/database';

type Props = { caseItem: itpc_takecare_cases; onClose: () => void; onUpdated: () => void };

export default function CaseDetailModal({ caseItem, onClose, onUpdated }: Props) {
  const [updates, setUpdates] = useState<itpc_takecare_case_updates[]>([]);
  const [signatures, setSignatures] = useState<itpc_takecare_case_signatures[]>([]);
  const [caretakerNames, setCaretakerNames] = useState<Record<string, string>>({});
  const [status, setStatus] = useState(caseItem.status);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showCaseEditor, setShowCaseEditor] = useState(false);
  const [activityNote, setActivityNote] = useState('');
  const [resultNote, setResultNote] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [markDone, setMarkDone] = useState(false);
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('');
  const [signatureImage, setSignatureImage] = useState('');
  const [savingSignature, setSavingSignature] = useState(false);
  const [deletingSignatureId, setDeletingSignatureId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
  const [pdfPreviewReady, setPdfPreviewReady] = useState(false);
  const [canSign, setCanSign] = useState(false);
  const user = useSessionCaretaker();
  const { confirm, dialog } = useConfirmDialog();
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signatureFileRef = useRef<HTMLInputElement>(null);
  const pdfPreviewFrame = useRef<HTMLIFrameElement>(null);
  const relatedCaretakerIds = (caseItem.caretakers ?? []).map((caretaker) => caretaker.id);
  const isAssigned = Boolean(user && relatedCaretakerIds.includes(user.id));

  useEffect(() => {
    if (!pdfPreviewUrl) return;
    return () => URL.revokeObjectURL(pdfPreviewUrl);
  }, [pdfPreviewUrl]);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      try {
        const result = await requestApi<{
          updates: itpc_takecare_case_updates[];
          signatures: itpc_takecare_case_signatures[];
          caretakers: { id: string; name: string }[];
        }>('caseDetails', { caseId: caseItem.id });
        if (!active) return;
        const names = Object.fromEntries(result.caretakers.map((caretaker) => [caretaker.id, caretaker.name]));
        setCaretakerNames(names);
        setUpdates(result.updates.map((item) => ({
          ...item,
          caretaker_name: names[item.caretaker_id] ?? t('ผู้ดูแล'),
        })));
        setSignatures(result.signatures);
      } catch (loadError) {
        if (!active) return;
        setError(`${t('โหลดประวัติเคสไม่สำเร็จ')}: ${loadError instanceof Error ? loadError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadHistory();
    return () => { active = false; };
  }, [caseItem.id, t]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setCanSign(false);
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (event.buttons !== 1) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.strokeStyle = '#34283a';
    context.lineTo((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height);
    context.stroke();
    context.beginPath();
    context.moveTo((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height);
    setSignatureImage('');
    setCanSign(true);
  }

  async function selectSignatureImage(file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      const image = await prepareProfilePhoto(file);
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      setCanSign(false);
      setSignatureImage(image);
    } catch (imageError) {
      setError(`${t('เลือกรูปลายเซ็นไม่สำเร็จ')}: ${imageError instanceof Error ? imageError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    } finally {
      if (signatureFileRef.current) signatureFileRef.current.value = '';
    }
  }

  async function saveUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !isAssigned) return;
    if (!await confirm({
      title: `${t('บันทึกประวัติการติดตาม')}${markDone ? ` ${t('และปิดเคส')}` : ''}?`,
      description: t('โปรดตรวจสอบรายละเอียดก่อนบันทึก'),
      confirmLabel: t('ยืนยันบันทึก'),
    })) return;
    setSavingUpdate(true);
    setError('');
    try {
      await requestApi<null>('insertCaseUpdate', {
        caseId: caseItem.id,
        caretakerId: user.id,
        activityNote: activityNote.trim(),
        resultNote: resultNote.trim() || null,
        nextStep: nextStep.trim() || null,
      });
    } catch (saveError) {
      setError(`${t('บันทึกการอัปเดตไม่สำเร็จ')}: ${saveError instanceof Error ? saveError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
      setSavingUpdate(false);
      return;
    } finally {
      setSavingUpdate(false);
    }
    try {
      await requestApi<null>('updateCaseStatus', {
        caseId: caseItem.id,
        status: markDone ? 'done' : status,
      });
    } catch (caseError) {
      setError(`${t('บันทึกประวัติแล้ว แต่เปลี่ยนสถานะเคสไม่สำเร็จ')}: ${caseError instanceof Error ? caseError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
      setActivityNote('');
      setResultNote('');
      setNextStep('');
      setShowUpdateForm(false);
      onUpdated();
      return;
    }
    if (markDone) setStatus('done');
    setActivityNote('');
    setResultNote('');
    setNextStep('');
    setShowUpdateForm(false);
    onUpdated();
    try {
      const data = await requestApi<itpc_takecare_case_updates[]>('listCaseUpdates', { caseId: caseItem.id });
      setUpdates(data.map((item) => ({ ...item, caretaker_name: caretakerNames[item.caretaker_id] ?? t('ผู้ดูแล') })));
    } catch (reloadError) {
      setError(`${t('บันทึกสำเร็จ แต่โหลดประวัติใหม่ไม่สำเร็จ')}: ${reloadError instanceof Error ? reloadError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    }
  }

  async function saveSignature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || (!canSign && !signatureImage) || !signerName.trim()) {
      setError(t('กรุณาระบุชื่อและวาดลายเซ็นหรือเลือกรูปภาพก่อนบันทึก'));
      return;
    }
    if (!await confirm({
      title: t('บันทึกลายเซ็น?'),
      description: `${t('ยืนยันลายเซ็นของ')} ${signerName.trim()}`,
      confirmLabel: t('บันทึกลายเซ็น'),
    })) return;
    setSavingSignature(true);
    setError('');
    let savedSignature: itpc_takecare_case_signatures;
    try {
      savedSignature = await requestApi<itpc_takecare_case_signatures>('saveSignature', {
        caseId: caseItem.id,
        signerName: signerName.trim(),
        signerRole: signerRole.trim() || t('ผู้รับทราบ'),
        signatureData: signatureImage || canvas.toDataURL('image/png'),
      });
    } catch (saveError) {
      setError(`${t('บันทึกลายเซ็นไม่สำเร็จ')}: ${saveError instanceof Error ? saveError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
      setSavingSignature(false);
      return;
    } finally {
      setSavingSignature(false);
    }
    setSignatures((current) => [savedSignature, ...current]);
    setSignerName('');
    setSignerRole('');
    setSignatureImage('');
    if (signatureFileRef.current) signatureFileRef.current.value = '';
    clearCanvas();
  }

  async function deleteSignature(signature: itpc_takecare_case_signatures) {
    if (!await confirm({
      title: 'ลบลายเซ็น?',
      description: `${t('ยืนยันลายเซ็นของ')} ${signature.signer_name}`,
      confirmLabel: 'ลบลายเซ็น',
      tone: 'danger',
    })) return;

    setDeletingSignatureId(signature.id);
    setError('');
    try {
      await requestApi<null>('deleteSignature', { signatureId: signature.id });
      setSignatures((current) => current.filter((item) => item.id !== signature.id));
    } catch (deleteError) {
      setError(`${t('ลบลายเซ็นไม่สำเร็จ')}: ${deleteError instanceof Error ? deleteError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    } finally {
      setDeletingSignatureId(null);
    }
  }

  async function exportCase() {
    setExporting(true);
    setError('');
    try {
      const html = `<p class="pdf-muted">${escapeHtml(t('จัดทำเมื่อ'))} ${escapeHtml(formatThaiDate(new Date().toISOString()))}</p>
      <h2 class="pdf-section-heading">${escapeHtml(t('รายละเอียดเคส'))}</h2><div class="pdf-card">
      <p><b>${escapeHtml(t('ประเภท:'))}</b> ${escapeHtml(t(caseTypeName(caseItem)))}</p>
      <p><b>${escapeHtml(t('สถานะ:'))}</b> <span class="pdf-status ${status === 'done' ? 'pdf-status-done' : 'pdf-status-planned'}">${escapeHtml(t(status === 'done' ? 'เสร็จสิ้น' : 'นัดหมายแล้ว'))}</span></p>
      <p><b>${escapeHtml(t('วันนัดหมาย:'))}</b> ${escapeHtml(formatThaiDate(caseItem.scheduled_at))}</p>
      <p><b>${escapeHtml(t('ผู้สร้าง:'))}</b> ${escapeHtml(caretakerNames[caseItem.created_by] ?? t('ผู้ดูแล'))}</p>
      <p><b>${escapeHtml(t('รายละเอียด:'))}</b> ${escapeHtml(caseItem.details || '-')}</p></div>
      <h2 class="pdf-section-heading">${escapeHtml(t('นักเรียน'))} (${(caseItem.students ?? []).length} ${escapeHtml(t('คน'))})</h2>${(caseItem.students ?? []).map((student) => `<div class="pdf-card"><p><b>${escapeHtml(t('ชื่อ:'))}</b> ${escapeHtml(studentName(student))}</p><p><b>${escapeHtml(t('ระดับชั้น:'))}</b> ${escapeHtml(student.grade ?? '-')}</p><p><b>${escapeHtml(t('ห้อง:'))}</b> ${escapeHtml(String(student.room ?? '-'))}</p></div>`).join('') || `<p class="pdf-empty">${escapeHtml(t('ไม่มีข้อมูลนักเรียน'))}</p>`}
      <h2 class="pdf-section-heading">${escapeHtml(t('ผู้ดูแลที่เกี่ยวข้อง'))} (${(caseItem.caretakers ?? []).length} ${escapeHtml(t('คน'))})</h2>${(caseItem.caretakers ?? []).map((caretaker) => `<div class="pdf-card"><p><b>${escapeHtml(t('ชื่อ:'))}</b> ${escapeHtml(caretaker.name)}</p></div>`).join('') || `<p class="pdf-empty">${escapeHtml(t('ไม่มีผู้ดูแลที่เกี่ยวข้อง'))}</p>`}
      <h2 class="pdf-section-heading">${escapeHtml(t('ประวัติการอัปเดต'))} (${updates.length} ${escapeHtml(t('รายการ'))})</h2>${updates.map((item) => `<div class="pdf-update"><p><b>${escapeHtml(t('ผู้บันทึก:'))}</b> ${escapeHtml(item.caretaker_name ?? t('ผู้ดูแล'))} · <b>${escapeHtml(t('วันเวลาที่บันทึก:'))}</b> ${escapeHtml(formatThaiDate(item.created_at))}</p><p><b>${escapeHtml(t('กิจกรรม:'))}</b> ${escapeHtml(item.activity_note)}</p><p><b>${escapeHtml(t('ผลลัพธ์:'))}</b> ${escapeHtml(item.result_note || '-')}</p><p><b>${escapeHtml(t('ขั้นตอนถัดไป:'))}</b> ${escapeHtml(item.next_step || '-')}</p></div>`).join('') || `<p class="pdf-empty">${escapeHtml(t('ยังไม่มีประวัติ'))}</p>`}
      <section class="pdf-signatures"><h2 class="pdf-section-heading">${escapeHtml(t('ลายเซ็น'))} (${signatures.length} ${escapeHtml(t('รายการ'))})</h2><div class="pdf-signature-list">${signatures.map((item) => `<div class="pdf-card pdf-signature-card"><div class="pdf-signature-block"><p><b>${escapeHtml(t('ผู้ลงนาม:'))}</b> ${escapeHtml(item.signer_name)}</p><p><b>${escapeHtml(t('บทบาท:'))}</b> ${escapeHtml(item.signer_role)}</p><img class="pdf-signature" src="${escapeHtml(item.signature_data)}" alt="${escapeHtml(t('ลายเซ็น'))} ${escapeHtml(item.signer_name)}"><p class="pdf-signature-date">${escapeHtml(formatThaiDate(item.signed_at))}</p></div></div>`).join('') || `<p class="pdf-empty">${escapeHtml(t('ยังไม่มีลายเซ็น'))}</p>`}</div></section>`;
      const title = t('รายงานรายละเอียดเคส');
      const logoUrl = new URL('/itpc-takecare-logo-v2.png', window.location.origin).href;
      const blob = new Blob([createStudentReportDocument(title, html, logoUrl)], { type: 'text/html' });
      setPdfPreviewReady(false);
      setPdfPreviewUrl(URL.createObjectURL(blob));
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {dialog}
      <section role="dialog" aria-modal="true" aria-labelledby="case-detail-title" className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="max-h-[92vh] overflow-y-auto p-5 sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div><p className="text-sm font-medium text-primary">{t('รายละเอียดและบันทึกติดตาม')}</p><h2 id="case-detail-title" className="text-xl font-bold">{t(caseTypeName(caseItem))}</h2></div>
          <div className="flex items-center gap-1">
            {user?.role === 'admin' && <button type="button" onClick={() => setShowCaseEditor(true)} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><Pencil size={15} />{t('แก้ไขเคส')}</button>}
            <button type="button" onClick={onClose} aria-label={t('ปิด')} className="rounded-full p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
          </div>
        </div>
        <div className="grid gap-3 rounded-2xl bg-[#faf8fb] p-4 sm:grid-cols-2">
          <p><b>{t('สถานะ')}:</b> {t(status === 'done' ? 'เสร็จสิ้น' : 'นัดหมายแล้ว')}</p>
          <p><b>{t('นัดหมาย')}:</b> {formatThaiDate(caseItem.scheduled_at)}</p>
          <p className="sm:col-span-2"><b>{t('รายละเอียด')}:</b> {caseItem.details || t('ไม่มีรายละเอียด')}</p>
          <p className="sm:col-span-2"><b>{t('นักเรียน')}:</b> {(caseItem.students ?? []).map(studentName).join(', ') || t('ไม่ระบุ')}</p>
          <p className="sm:col-span-2"><b>{t('ผู้ดูแล')}:</b> {(caseItem.caretakers ?? []).map((caretaker) => caretaker.name).join(', ') || t('ไม่ระบุ')}</p>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {loading ? <p className="py-8 text-center text-gray-500">{t('กำลังโหลดประวัติ...')}</p> : (
          <>
            <div className="mt-6 flex items-center justify-between gap-3"><h3 className="font-bold">{t('ประวัติการอัปเดต')}</h3>{isAssigned && !showUpdateForm && <button onClick={() => setShowUpdateForm(true)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">{t('อัปเดตเคส')}</button>}</div>
            {showUpdateForm && <form onSubmit={saveUpdate} className="mt-3 space-y-3 rounded-2xl border border-primary/20 p-4">
              <label className="block text-sm font-medium">{t('กิจกรรมที่ดำเนินการ')} <span className="text-red-500">*</span><textarea required rows={2} value={activityNote} onChange={(event) => setActivityNote(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3" /></label>
              <label className="block text-sm font-medium">{t('ผลลัพธ์')}<textarea rows={2} value={resultNote} onChange={(event) => setResultNote(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3" /></label>
              <label className="block text-sm font-medium">{t('ขั้นตอนถัดไป')}<textarea rows={2} value={nextStep} onChange={(event) => setNextStep(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3" /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={markDone} onChange={(event) => setMarkDone(event.target.checked)} className="accent-primary" />{t('เปลี่ยนสถานะเป็นเสร็จสิ้น')}</label>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowUpdateForm(false)} className="rounded-lg px-3 py-2 text-sm">{t('ยกเลิก')}</button><button disabled={savingUpdate} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60">{savingUpdate ? t('กำลังบันทึก...') : t('บันทึกการอัปเดต')}</button></div>
            </form>}
            <div className="mt-3 space-y-3">{updates.map((item) => <article key={item.id} className="border-l-2 border-primary/30 pl-4">
              <p className="text-xs text-gray-500">{item.caretaker_name} · {formatThaiDate(item.created_at)}</p><p className="mt-1 text-sm"><b>{t('กิจกรรม:')}</b> {item.activity_note}</p>{item.result_note && <p className="text-sm"><b>{t('ผลลัพธ์:')}</b> {item.result_note}</p>}{item.next_step && <p className="text-sm"><b>{t('ขั้นตอนถัดไป:')}</b> {item.next_step}</p>}
            </article>)}{!updates.length && <p className="text-sm text-gray-400">{t('ยังไม่มีประวัติการอัปเดต')}</p>}</div>
            <div className="mt-7 border-t border-gray-100 pt-5">
              <h3 className="font-bold">{t('ลายเซ็นผู้รับทราบ')}</h3>
              <form onSubmit={saveSignature} className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2"><input required value={signerName} onChange={(event) => setSignerName(event.target.value)} placeholder={t('ชื่อผู้ลงนาม')} className="rounded-xl border border-gray-200 px-3 py-2.5" /><input value={signerRole} onChange={(event) => setSignerRole(event.target.value)} placeholder={t('บทบาท เช่น ผู้ปกครอง')} className="rounded-xl border border-gray-200 px-3 py-2.5" /></div>
                <div className="overflow-hidden rounded-xl border border-dashed border-gray-300 bg-white">
                  <canvas ref={canvasRef} width={700} height={180} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const canvas = event.currentTarget; const rect = canvas.getBoundingClientRect(); const context = canvas.getContext('2d'); if (context) { context.beginPath(); context.moveTo((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height); } }} onPointerMove={draw} className="h-36 w-full touch-none" />
                  <p className="border-t border-gray-100 px-3 py-1 text-xs text-gray-400">{t('วาดลายเซ็นในพื้นที่นี้')}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <Upload size={15} />{t('เลือกรูปลายเซ็น')}
                    <input ref={signatureFileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void selectSignatureImage(event.target.files?.[0])} className="sr-only" />
                  </label>
                  {signatureImage && <Image src={signatureImage} alt={t('ตัวอย่างรูปลายเซ็น')} width={350} height={90} unoptimized className="h-16 max-w-48 object-contain" />}
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={() => { clearCanvas(); setSignatureImage(''); if (signatureFileRef.current) signatureFileRef.current.value = ''; }} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-600"><Eraser size={15} />{t('ล้าง')}</button>
                    <button disabled={savingSignature} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60">{savingSignature ? t('กำลังบันทึก...') : t('บันทึกลายเซ็น')}</button>
                  </div>
                </div>
              </form>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{signatures.map((signature) => <div key={signature.id} className="rounded-xl border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-sm font-medium">{signature.signer_name} · {signature.signer_role}</p><p className="text-xs text-gray-400">{formatThaiDate(signature.signed_at)}</p></div>
                  {(isAssigned || user?.role === 'admin') && <button type="button" disabled={deletingSignatureId !== null} onClick={() => void deleteSignature(signature)} aria-label={`${t('ลบลายเซ็น')} ${signature.signer_name}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 size={16} /></button>}
                </div>
                <Image src={signature.signature_data} alt={`ลายเซ็น ${signature.signer_name}`} width={520} height={130} unoptimized className="mt-2 h-16 max-w-full object-contain" />
              </div>)}</div>
            </div>
          </>
        )}
        <div className="mt-6 flex justify-end border-t border-gray-100 pt-4"><button type="button" disabled={loading || exporting} onClick={() => void exportCase()} className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"><FileText size={16} />{exporting ? t('กำลังสร้าง PDF...') : t('ดูตัวอย่าง PDF')}</button></div>
        </div>
      </section>
      {showCaseEditor && <CaseFormModal
        caseToEdit={caseItem}
        onClose={() => setShowCaseEditor(false)}
        onSaved={() => {
          setShowCaseEditor(false);
          onUpdated();
          onClose();
        }}
      />}
      {pdfPreviewUrl && <div className="fixed inset-0 z-[60] flex flex-col bg-black/70 p-3 sm:p-6">
        <section role="dialog" aria-modal="true" aria-labelledby="case-pdf-preview-title" className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
            <h2 id="case-pdf-preview-title" className="font-semibold text-gray-800">{t('ตัวอย่างรายงาน PDF')}</h2>
            <div className="flex items-center gap-2">
              <button type="button" disabled={!pdfPreviewReady} onClick={printPdf} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"><Download size={16} />{t('พิมพ์ / บันทึก PDF')}</button>
              <button type="button" onClick={() => { setPdfPreviewUrl(''); setPdfPreviewReady(false); }} aria-label={t('ปิด')} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X size={19} /></button>
            </div>
          </header>
          <iframe ref={pdfPreviewFrame} title={t('ตัวอย่างรายงาน PDF')} src={pdfPreviewUrl} onLoad={() => setPdfPreviewReady(true)} className="min-h-0 w-full flex-1 bg-gray-100" />
        </section>
      </div>}
    </div>
  );
}
