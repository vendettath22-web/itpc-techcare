'use client';

import { useEffect, useRef, useState, type PointerEvent, type FormEvent } from 'react';
import Image from 'next/image';
import { Download, Eraser, X } from 'lucide-react';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { useLanguage } from '@/lib/language';
import { requestApi } from '@/lib/api';
import { caseTypeName, formatThaiDate, studentName } from '@/lib/cases';
import { escapeHtml, useSessionCaretaker } from '@/lib/session';
import { downloadThaiPdf } from '@/lib/pdf';
import type { Case, CaseSignature, CaseUpdate } from '@/types/database';

type Props = { caseItem: Case; onClose: () => void; onUpdated: () => void };

export default function CaseDetailModal({ caseItem, onClose, onUpdated }: Props) {
  const [updates, setUpdates] = useState<CaseUpdate[]>([]);
  const [signatures, setSignatures] = useState<CaseSignature[]>([]);
  const [caretakerNames, setCaretakerNames] = useState<Record<string, string>>({});
  const [status, setStatus] = useState(caseItem.status);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [activityNote, setActivityNote] = useState('');
  const [resultNote, setResultNote] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [markDone, setMarkDone] = useState(false);
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('');
  const [savingSignature, setSavingSignature] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [canSign, setCanSign] = useState(false);
  const user = useSessionCaretaker();
  const { confirm, dialog } = useConfirmDialog();
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const relatedCaretakerIds = (caseItem.caretakers ?? []).map((caretaker) => caretaker.id);
  const isAssigned = Boolean(user && relatedCaretakerIds.includes(user.id));

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      try {
        const result = await requestApi<{
          updates: CaseUpdate[];
          signatures: CaseSignature[];
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
    setCanSign(true);
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
      const data = await requestApi<CaseUpdate[]>('listCaseUpdates', { caseId: caseItem.id });
      setUpdates(data.map((item) => ({ ...item, caretaker_name: caretakerNames[item.caretaker_id] ?? t('ผู้ดูแล') })));
    } catch (reloadError) {
      setError(`${t('บันทึกสำเร็จ แต่โหลดประวัติใหม่ไม่สำเร็จ')}: ${reloadError instanceof Error ? reloadError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    }
  }

  async function saveSignature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || !canSign || !signerName.trim()) {
      setError(t('กรุณาระบุชื่อและวาดลายเซ็นก่อนบันทึก'));
      return;
    }
    if (!await confirm({
      title: t('บันทึกลายเซ็น?'),
      description: `${t('ยืนยันลายเซ็นของ')} ${signerName.trim()}`,
      confirmLabel: t('บันทึกลายเซ็น'),
    })) return;
    setSavingSignature(true);
    setError('');
    let savedSignature: CaseSignature;
    try {
      savedSignature = await requestApi<CaseSignature>('saveSignature', {
        caseId: caseItem.id,
        signerName: signerName.trim(),
        signerRole: signerRole.trim() || t('ผู้รับทราบ'),
        signatureData: canvas.toDataURL('image/png'),
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
    clearCanvas();
  }

  async function exportCase() {
    setExporting(true);
    setError('');
    const html = `<p class="pdf-muted">${escapeHtml(t('จัดทำเมื่อ'))} ${escapeHtml(formatThaiDate(new Date().toISOString()))}</p>
      <h2>${escapeHtml(t('รายละเอียดเคส'))}</h2><div class="pdf-card">
      <p><b>${escapeHtml(t('ประเภท:'))}</b> ${escapeHtml(t(caseTypeName(caseItem)))}</p>
      <p><b>${escapeHtml(t('สถานะ:'))}</b> <span class="pdf-status ${status === 'done' ? 'pdf-status-done' : 'pdf-status-planned'}">${escapeHtml(t(status === 'done' ? 'เสร็จสิ้น' : 'นัดหมายแล้ว'))}</span></p>
      <p><b>${escapeHtml(t('วันนัดหมาย:'))}</b> ${escapeHtml(formatThaiDate(caseItem.scheduled_at))}</p>
      <p><b>${escapeHtml(t('ผู้สร้าง:'))}</b> ${escapeHtml(caretakerNames[caseItem.created_by] ?? t('ผู้ดูแล'))}</p>
      <p><b>${escapeHtml(t('รายละเอียด:'))}</b> ${escapeHtml(caseItem.details || '-')}</p></div>
      <h2>${escapeHtml(t('นักเรียน'))} (${(caseItem.students ?? []).length} ${escapeHtml(t('คน'))})</h2>${(caseItem.students ?? []).map((student) => `<div class="pdf-card"><p><b>${escapeHtml(t('ชื่อ:'))}</b> ${escapeHtml(studentName(student))}</p><p><b>${escapeHtml(t('ระดับชั้น:'))}</b> ${escapeHtml(student.grade ?? '-')}</p><p><b>${escapeHtml(t('ห้อง:'))}</b> ${escapeHtml(String(student.room ?? '-'))}</p></div>`).join('') || `<p>${escapeHtml(t('ไม่มีข้อมูลนักเรียน'))}</p>`}
      <h2>${escapeHtml(t('ผู้ดูแลที่เกี่ยวข้อง'))} (${(caseItem.caretakers ?? []).length} ${escapeHtml(t('คน'))})</h2>${(caseItem.caretakers ?? []).map((caretaker) => `<div class="pdf-card"><p><b>${escapeHtml(t('ชื่อ:'))}</b> ${escapeHtml(caretaker.name)}</p></div>`).join('') || `<p>${escapeHtml(t('ไม่มีผู้ดูแลที่เกี่ยวข้อง'))}</p>`}
      <h2>${escapeHtml(t('ประวัติการอัปเดต'))} (${updates.length} ${escapeHtml(t('รายการ'))})</h2>${updates.map((item) => `<div class="pdf-record"><p><b>${escapeHtml(t('ผู้บันทึก:'))}</b> ${escapeHtml(item.caretaker_name ?? t('ผู้ดูแล'))}</p><p><b>${escapeHtml(t('วันเวลาที่บันทึก:'))}</b> ${escapeHtml(formatThaiDate(item.created_at))}</p><p><b>${escapeHtml(t('กิจกรรม:'))}</b> ${escapeHtml(item.activity_note)}</p><p><b>${escapeHtml(t('ผลลัพธ์:'))}</b> ${escapeHtml(item.result_note || '-')}</p><p><b>${escapeHtml(t('ขั้นตอนถัดไป:'))}</b> ${escapeHtml(item.next_step || '-')}</p></div>`).join('') || `<p>${escapeHtml(t('ยังไม่มีประวัติ'))}</p>`}
      <h2>${escapeHtml(t('ลายเซ็น'))} (${signatures.length} ${escapeHtml(t('รายการ'))})</h2>${signatures.map((item) => `<div class="pdf-card pdf-signature-card"><div><p><b>${escapeHtml(t('ผู้ลงนาม:'))}</b> ${escapeHtml(item.signer_name)}</p><p><b>${escapeHtml(t('บทบาท:'))}</b> ${escapeHtml(item.signer_role)}</p><p><b>${escapeHtml(t('วันเวลาที่ลงนาม:'))}</b> ${escapeHtml(formatThaiDate(item.signed_at))}</p></div><img class="pdf-signature" src="${escapeHtml(item.signature_data)}" alt="${escapeHtml(t('ลายเซ็น'))} ${escapeHtml(item.signer_name)}"></div>`).join('') || `<p>${escapeHtml(t('ยังไม่มีลายเซ็น'))}</p>`}`;
    try {
      await downloadThaiPdf(
        t('รายงานรายละเอียดเคส'),
        html,
        `itpctakecare-case-${caseItem.id.slice(0, 8)}`,
      );
    } catch (exportError) {
      setError(`${t('ส่งออกรายงานไม่สำเร็จ')}: ${exportError instanceof Error ? exportError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {dialog}
      <section role="dialog" aria-modal="true" aria-labelledby="case-detail-title" className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="max-h-[92vh] overflow-y-auto p-5 sm:p-7">
        <div className="mb-5 flex items-start justify-between">
          <div><p className="text-sm font-medium text-primary">{t('รายละเอียดและบันทึกติดตาม')}</p><h2 id="case-detail-title" className="text-xl font-bold">{t(caseTypeName(caseItem))}</h2></div>
          <button type="button" onClick={onClose} aria-label={t('ปิด')} className="rounded-full p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
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
                <div className="overflow-hidden rounded-xl border border-dashed border-gray-300 bg-white"><canvas ref={canvasRef} width={700} height={180} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const canvas = event.currentTarget; const rect = canvas.getBoundingClientRect(); const context = canvas.getContext('2d'); if (context) { context.beginPath(); context.moveTo((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height); } }} onPointerMove={draw} className="h-36 w-full touch-none" /><p className="border-t border-gray-100 px-3 py-1 text-xs text-gray-400">{t('วาดลายเซ็นในพื้นที่นี้')}</p></div>
                <div className="flex justify-end gap-2"><button type="button" onClick={clearCanvas} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-600"><Eraser size={15} />{t('ล้าง')}</button><button disabled={savingSignature} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60">{savingSignature ? t('กำลังบันทึก...') : t('บันทึกลายเซ็น')}</button></div>
              </form>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{signatures.map((signature) => <div key={signature.id} className="rounded-xl border border-gray-100 p-3"><p className="text-sm font-medium">{signature.signer_name} · {signature.signer_role}</p><p className="text-xs text-gray-400">{formatThaiDate(signature.signed_at)}</p><Image src={signature.signature_data} alt={`ลายเซ็น ${signature.signer_name}`} width={520} height={130} unoptimized className="mt-2 h-16 max-w-full object-contain" /></div>)}</div>
            </div>
          </>
        )}
        <div className="mt-6 flex justify-end border-t border-gray-100 pt-4"><button type="button" disabled={loading || exporting} onClick={() => void exportCase()} className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"><Download size={16} />{exporting ? t('กำลังสร้าง PDF...') : t('ดาวน์โหลด PDF')}</button></div>
        </div>
      </section>
    </div>
  );
}
