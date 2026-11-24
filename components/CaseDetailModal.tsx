'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { useLanguage } from '@/lib/language';
import { requestApi } from '@/lib/api';
import { appointmentStatusName, caseDisplayName, caseServiceTypeName, formatThaiDate, studentName } from '@/lib/cases';
import CaseServiceForm, { type CaseServiceFormOutcome } from '@/components/CaseServiceForm';
import type { CaseServiceFormData } from '@/lib/case-service-forms';
import { createBehaviorObservationPdfBlob } from '@/lib/behavior-observation-pdf';
import { createOtAssessmentPdfBlob } from '@/lib/ot-assessment-pdf';
import { createOtSkillActivityPdfBlob } from '@/lib/ot-skill-activity-pdf';
import { createParentConsultationPdfBlob } from '@/lib/parent-consultation-pdf';
import { createPsychologicalAssessmentPdfBlob } from '@/lib/psychological-assessment-pdf';
import { createPsychologySkillActivityPdfBlob } from '@/lib/psychology-skill-activity-pdf';
import { createStudentConsultationPdfBlob } from '@/lib/student-consultation-pdf';
import { useSessionCaretaker } from '@/lib/session';
import CaseFormModal from '@/components/CaseFormModal';
import CaseServicePrintTemplate from '@/components/CaseServicePrintTemplate';
import type { AppointmentStatus, itpc_takecare_cases, itpc_takecare_case_service_forms, itpc_takecare_case_updates } from '@/types/database';

type Props = { caseItem: itpc_takecare_cases; onClose: () => void; onUpdated: () => void };

export default function CaseDetailModal({ caseItem, onClose, onUpdated }: Props) {
  const [updates, setUpdates] = useState<itpc_takecare_case_updates[]>([]);
  const [caretakerNames, setCaretakerNames] = useState<Record<string, string>>({});
  const [status, setStatus] = useState(caseItem.status);
  const [appointmentStatus, setAppointmentStatus] = useState<AppointmentStatus>(caseItem.appointment_status);
  const [appointmentDate, setAppointmentDate] = useState(caseItem.scheduled_at);
  const [rescheduledAt, setRescheduledAt] = useState(() => {
    const date = new Date(caseItem.scheduled_at);
    date.setTime(date.getTime() - date.getTimezoneOffset() * 60000);
    return date.toISOString().slice(0, 16);
  });
  const [serviceFormData, setServiceFormData] = useState<CaseServiceFormData | null>(null);
  const [studentDefaults, setStudentDefaults] = useState<{ studentAge: string; homeroomTeacher: string }[]>([]);
  const [serviceFormPrintData, setServiceFormPrintData] = useState<{
    formData: CaseServiceFormData;
    outcome: CaseServiceFormOutcome;
    nextAppointmentAt?: string;
  } | null>(null);
  const [printPending, setPrintPending] = useState(false);
  const [serviceFormLoaded, setServiceFormLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showCaseEditor, setShowCaseEditor] = useState(false);
  const [activityNote, setActivityNote] = useState('');
  const [resultNote, setResultNote] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [markDone, setMarkDone] = useState(false);
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [savingServiceForm, setSavingServiceForm] = useState(false);
  const [serviceFormFeedback, setServiceFormFeedback] = useState<{ message: string; tone: 'error' | 'success' } | null>(null);
  const [deletingCase, setDeletingCase] = useState(false);
  const [exporting, setExporting] = useState(false);
  const user = useSessionCaretaker();
  const { confirm, dialog } = useConfirmDialog();
  const { t } = useLanguage();
  const relatedCaretakerIds = (caseItem.caretakers ?? []).map((caretaker) => caretaker.id);
  const isAssigned = Boolean(user && relatedCaretakerIds.includes(user.id));

  useEffect(() => {
    if (!printPending || !serviceFormPrintData) return;
    let cancelled = false;
    let printFrame: number | null = null;

    const finishPrint = () => {
      setPrintPending(false);
      setServiceFormPrintData(null);
      setExporting(false);
    };
    const failPrint = (printError: unknown) => {
      const message = `${t('เปิดหน้าต่างพิมพ์ไม่สำเร็จ')}: ${printError instanceof Error ? printError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`;
      setError(message);
      setServiceFormFeedback({ message, tone: 'error' });
      finishPrint();
    };

    window.addEventListener('afterprint', finishPrint, { once: true });
    try {
      void document.fonts.load('14pt "Sarabun"').then(() => {
        if (cancelled) return;
        printFrame = window.requestAnimationFrame(() => {
          try {
            window.print();
          } catch (printError) {
            failPrint(printError);
          }
        });
      }).catch(failPrint);
    } catch (printError) {
      failPrint(printError);
    }

    return () => {
      cancelled = true;
      if (printFrame !== null) window.cancelAnimationFrame(printFrame);
      window.removeEventListener('afterprint', finishPrint);
    };
  }, [printPending, serviceFormPrintData, t]);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      try {
        const result = await requestApi<{
          updates: itpc_takecare_case_updates[];
          caretakers: { id: string; name: string }[];
          serviceForm: itpc_takecare_case_service_forms | null;
          studentDefaults: { studentAge: string; homeroomTeacher: string }[];
        }>('caseDetails', { caseId: caseItem.id });
        if (!active) return;
        const names = Object.fromEntries(result.caretakers.map((caretaker) => [caretaker.id, caretaker.name]));
        setCaretakerNames(names);
        setUpdates(result.updates.map((item) => ({
          ...item,
          caretaker_name: names[item.caretaker_id] ?? t('ผู้ดูแล'),
        })));
        setServiceFormData(result.serviceForm?.form_data ?? null);
        setStudentDefaults(result.studentDefaults);
        setServiceFormLoaded(true);
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

  async function saveAppointmentOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || (!isAssigned && user.role !== 'admin')) return;
    if (appointmentStatus === 'rescheduled' && !rescheduledAt) {
      setError(t('กรุณาระบุวันและเวลาใหม่'));
      return;
    }
    setSavingAppointment(true);
    setError('');
    try {
      await requestApi<null>('updateAppointmentOutcome', {
        caseId: caseItem.id,
        appointmentStatus,
        ...(appointmentStatus === 'rescheduled' ? { scheduledAt: new Date(rescheduledAt).toISOString() } : {}),
      });
      if (appointmentStatus === 'rescheduled') {
        const newDate = new Date(rescheduledAt);
        setAppointmentDate(newDate.toISOString());
      }
      onUpdated();
    } catch (saveError) {
      setError(`${t('อัปเดตสถานะนัดหมายไม่สำเร็จ')}: ${saveError instanceof Error ? saveError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
    } finally {
      setSavingAppointment(false);
    }
  }

  async function saveServiceForm(
    formData: CaseServiceFormData,
    outcome: CaseServiceFormOutcome,
    nextAppointmentAt?: string,
  ) {
    setSavingServiceForm(true);
    setError('');
    setServiceFormFeedback(null);
    try {
      await requestApi<null>('saveCaseServiceFormWithOutcome', {
        caseId: caseItem.id,
        formData,
        outcome,
        ...(nextAppointmentAt ? { nextAppointmentAt: new Date(nextAppointmentAt).toISOString() } : {}),
      });
      setServiceFormData(formData);
      if (outcome === 'completed') {
        setStatus('done');
        setAppointmentStatus('attended');
      } else if (outcome === 'next_appointment' && nextAppointmentAt) {
        setStatus('planned');
        setAppointmentStatus('rescheduled');
        setAppointmentDate(new Date(nextAppointmentAt).toISOString());
      }
      setServiceFormFeedback({ message: t('บันทึกแบบฟอร์มแล้ว'), tone: 'success' });
      onUpdated();
    } catch (saveError) {
      const message = `${t('บันทึกแบบฟอร์มบริการไม่สำเร็จ')}: ${saveError instanceof Error ? saveError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`;
      setError(message);
      setServiceFormFeedback({ message, tone: 'error' });
    } finally {
      setSavingServiceForm(false);
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

  async function deleteCase() {
    if (user?.role !== 'admin') return;
    if (!await confirm({
      title: 'ลบเคสนี้?',
      description: 'การลบจะลบแบบฟอร์มบริการ บันทึกติดตาม และลายเซ็นที่เกี่ยวข้องด้วย และไม่สามารถกู้คืนได้',
      confirmLabel: 'ลบเคส',
      tone: 'danger',
    })) return;

    setDeletingCase(true);
    setError('');
    try {
      await requestApi<null>('deleteCase', { caseId: caseItem.id });
      onUpdated();
      onClose();
    } catch (deleteError) {
      setError(`${t('ลบเคสไม่สำเร็จ')}: ${deleteError instanceof Error ? deleteError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`);
      setDeletingCase(false);
    }
  }

  function exportServiceForm(
    formData: CaseServiceFormData,
    outcome: CaseServiceFormOutcome,
    nextAppointmentAt?: string,
  ) {
    if (!caseItem.service_type) return;
    if (caseItem.service_type === 'behavior_observation') {
      const pdfWindow = window.open('about:blank', '_blank');
      if (!pdfWindow) {
        const message = t('อนุญาตให้เปิดแท็บใหม่เพื่อดู PDF แล้วลองอีกครั้ง');
        setError(message);
        setServiceFormFeedback({ message, tone: 'error' });
        return;
      }

      pdfWindow.opener = null;
      setExporting(true);
      setError('');
      setServiceFormFeedback(null);
      void (async () => {
        try {
          const [templateResponse, fontResponse] = await Promise.all([
            fetch('/case-service-templates/behavior-observation.pdf'),
            fetch('/fonts/Sarabun-Regular.ttf'),
          ]);
          if (!templateResponse.ok) {
            throw new Error(`โหลดแบบฟอร์มต้นฉบับไม่สำเร็จ (${templateResponse.status})`);
          }
          if (!fontResponse.ok) {
            throw new Error(`โหลดฟอนต์ภาษาไทยไม่สำเร็จ (${fontResponse.status})`);
          }

          const [templateBytes, fontBytes] = await Promise.all([
            templateResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
            fontResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
          ]);
          const blob = await createBehaviorObservationPdfBlob(
            templateBytes,
            fontBytes,
            formData,
            (caseItem.students ?? []).map((student) => ({
              name: studentName(student),
              nickname: student.nickname_th ?? '',
              grade: student.grade ?? '',
              room: student.room == null ? '' : String(student.room),
            })),
          );
          const blobUrl = URL.createObjectURL(blob);
          pdfWindow.location.replace(blobUrl);
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
          setServiceFormFeedback({ message: t('เปิดไฟล์ PDF ในแท็บใหม่แล้ว'), tone: 'success' });
        } catch (exportError) {
          pdfWindow.close();
          const message = `${t('ส่งออกแบบฟอร์มบริการไม่สำเร็จ')}: ${exportError instanceof Error ? exportError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`;
          setError(message);
          setServiceFormFeedback({ message, tone: 'error' });
        } finally {
          setExporting(false);
        }
      })();
      return;
    }
    if (caseItem.service_type === 'parent_consultation') {
      const pdfWindow = window.open('about:blank', '_blank');
      if (!pdfWindow) {
        const message = t('อนุญาตให้เปิดแท็บใหม่เพื่อดู PDF แล้วลองอีกครั้ง');
        setError(message);
        setServiceFormFeedback({ message, tone: 'error' });
        return;
      }

      pdfWindow.opener = null;
      setExporting(true);
      setError('');
      setServiceFormFeedback(null);
      void (async () => {
        try {
          const [templateResponse, fontResponse] = await Promise.all([
            fetch('/case-service-templates/parent-consultation.pdf'),
            fetch('/fonts/Sarabun-Regular.ttf'),
          ]);
          if (!templateResponse.ok) {
            throw new Error(`โหลดแบบฟอร์มต้นฉบับไม่สำเร็จ (${templateResponse.status})`);
          }
          if (!fontResponse.ok) {
            throw new Error(`โหลดฟอนต์ภาษาไทยไม่สำเร็จ (${fontResponse.status})`);
          }

          const [templateBytes, fontBytes] = await Promise.all([
            templateResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
            fontResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
          ]);
          const blob = await createParentConsultationPdfBlob(
            templateBytes,
            fontBytes,
            formData,
            (caseItem.students ?? []).map((student) => ({
              name: studentName(student),
              nickname: student.nickname_th ?? '',
              grade: student.grade ?? '',
              room: student.room == null ? '' : String(student.room),
            })),
            user?.name ?? caseItem.created_by_name ?? '',
          );
          const blobUrl = URL.createObjectURL(blob);
          pdfWindow.location.replace(blobUrl);
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
          setServiceFormFeedback({ message: t('เปิดไฟล์ PDF ในแท็บใหม่แล้ว'), tone: 'success' });
        } catch (exportError) {
          pdfWindow.close();
          const message = `${t('ส่งออกแบบฟอร์มบริการไม่สำเร็จ')}: ${exportError instanceof Error ? exportError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`;
          setError(message);
          setServiceFormFeedback({ message, tone: 'error' });
        } finally {
          setExporting(false);
        }
      })();
      return;
    }
    if (caseItem.service_type === 'student_consultation') {
      const pdfWindow = window.open('about:blank', '_blank');
      if (!pdfWindow) {
        const message = t('อนุญาตให้เปิดแท็บใหม่เพื่อดู PDF แล้วลองอีกครั้ง');
        setError(message);
        setServiceFormFeedback({ message, tone: 'error' });
        return;
      }

      pdfWindow.opener = null;
      setExporting(true);
      setError('');
      setServiceFormFeedback(null);
      void (async () => {
        try {
          const [templateResponse, fontResponse] = await Promise.all([
            fetch('/case-service-templates/02แบบบันทึกการให้คำปรึกษานักเรียน.pdf'),
            fetch('/fonts/Sarabun-Regular.ttf'),
          ]);
          if (!templateResponse.ok) {
            throw new Error(`โหลดแบบฟอร์มต้นฉบับไม่สำเร็จ (${templateResponse.status})`);
          }
          if (!fontResponse.ok) {
            throw new Error(`โหลดฟอนต์ภาษาไทยไม่สำเร็จ (${fontResponse.status})`);
          }

          const [templateBytes, fontBytes] = await Promise.all([
            templateResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
            fontResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
          ]);
          const blob = await createStudentConsultationPdfBlob(
            templateBytes,
            fontBytes,
            formData,
            (caseItem.students ?? []).map((student) => ({
              name: studentName(student),
              nickname: student.nickname_th ?? '',
              grade: student.grade ?? '',
              room: student.room == null ? '' : String(student.room),
            })),
            user?.name ?? caseItem.created_by_name ?? '',
          );
          const blobUrl = URL.createObjectURL(blob);
          pdfWindow.location.replace(blobUrl);
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
          setServiceFormFeedback({ message: t('เปิดไฟล์ PDF ในแท็บใหม่แล้ว'), tone: 'success' });
        } catch (exportError) {
          pdfWindow.close();
          const message = `${t('ส่งออกแบบฟอร์มบริการไม่สำเร็จ')}: ${exportError instanceof Error ? exportError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`;
          setError(message);
          setServiceFormFeedback({ message, tone: 'error' });
        } finally {
          setExporting(false);
        }
      })();
      return;
    }
    if (caseItem.service_type === 'ot_assessment') {
      const pdfWindow = window.open('about:blank', '_blank');
      if (!pdfWindow) {
        const message = t('อนุญาตให้เปิดแท็บใหม่เพื่อดู PDF แล้วลองอีกครั้ง');
        setError(message);
        setServiceFormFeedback({ message, tone: 'error' });
        return;
      }

      pdfWindow.opener = null;
      setExporting(true);
      setError('');
      setServiceFormFeedback(null);
      void (async () => {
        try {
          const [templateResponse, fontResponse] = await Promise.all([
            fetch('/case-service-templates/04แบบบันทึกการประเมินทางกิจกรรมบำบัด.pdf'),
            fetch('/fonts/Sarabun-Regular.ttf'),
          ]);
          if (!templateResponse.ok) {
            throw new Error(`โหลดแบบฟอร์มต้นฉบับไม่สำเร็จ (${templateResponse.status})`);
          }
          if (!fontResponse.ok) {
            throw new Error(`โหลดฟอนต์ภาษาไทยไม่สำเร็จ (${fontResponse.status})`);
          }

          const [templateBytes, fontBytes] = await Promise.all([
            templateResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
            fontResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
          ]);
          const blob = await createOtAssessmentPdfBlob(
            templateBytes,
            fontBytes,
            formData,
            (caseItem.students ?? []).map((student) => ({
              name: studentName(student),
              nickname: student.nickname_th ?? '',
              grade: student.grade ?? '',
              room: student.room == null ? '' : String(student.room),
            })),
            user?.name ?? caseItem.created_by_name ?? '',
          );
          const blobUrl = URL.createObjectURL(blob);
          pdfWindow.location.replace(blobUrl);
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
          setServiceFormFeedback({ message: t('เปิดไฟล์ PDF ในแท็บใหม่แล้ว'), tone: 'success' });
        } catch (exportError) {
          pdfWindow.close();
          const message = `${t('ส่งออกแบบฟอร์มบริการไม่สำเร็จ')}: ${exportError instanceof Error ? exportError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`;
          setError(message);
          setServiceFormFeedback({ message, tone: 'error' });
        } finally {
          setExporting(false);
        }
      })();
      return;
    }
    if (caseItem.service_type === 'psychological_assessment') {
      const pdfWindow = window.open('about:blank', '_blank');
      if (!pdfWindow) {
        const message = t('อนุญาตให้เปิดแท็บใหม่เพื่อดู PDF แล้วลองอีกครั้ง');
        setError(message);
        setServiceFormFeedback({ message, tone: 'error' });
        return;
      }

      pdfWindow.opener = null;
      setExporting(true);
      setError('');
      setServiceFormFeedback(null);
      void (async () => {
        try {
          const [templateResponse, fontResponse] = await Promise.all([
            fetch('/case-service-templates/05แบบบันทึกการประเมินทางจิตวิทยา.pdf'),
            fetch('/fonts/Sarabun-Regular.ttf'),
          ]);
          if (!templateResponse.ok) {
            throw new Error(`โหลดแบบฟอร์มต้นฉบับไม่สำเร็จ (${templateResponse.status})`);
          }
          if (!fontResponse.ok) {
            throw new Error(`โหลดฟอนต์ภาษาไทยไม่สำเร็จ (${fontResponse.status})`);
          }

          const [templateBytes, fontBytes] = await Promise.all([
            templateResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
            fontResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
          ]);
          const blob = await createPsychologicalAssessmentPdfBlob(
            templateBytes,
            fontBytes,
            formData,
            (caseItem.students ?? []).map((student) => ({
              name: studentName(student),
              nickname: student.nickname_th ?? '',
              grade: student.grade ?? '',
              room: student.room == null ? '' : String(student.room),
            })),
            user?.name ?? caseItem.created_by_name ?? '',
          );
          const blobUrl = URL.createObjectURL(blob);
          pdfWindow.location.replace(blobUrl);
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
          setServiceFormFeedback({ message: t('เปิดไฟล์ PDF ในแท็บใหม่แล้ว'), tone: 'success' });
        } catch (exportError) {
          pdfWindow.close();
          const message = `${t('ส่งออกแบบฟอร์มบริการไม่สำเร็จ')}: ${exportError instanceof Error ? exportError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`;
          setError(message);
          setServiceFormFeedback({ message, tone: 'error' });
        } finally {
          setExporting(false);
        }
      })();
      return;
    }
    if (caseItem.service_type === 'ot_skill_activity') {
      const pdfWindow = window.open('about:blank', '_blank');
      if (!pdfWindow) {
        const message = t('อนุญาตให้เปิดแท็บใหม่เพื่อดู PDF แล้วลองอีกครั้ง');
        setError(message);
        setServiceFormFeedback({ message, tone: 'error' });
        return;
      }

      pdfWindow.opener = null;
      setExporting(true);
      setError('');
      setServiceFormFeedback(null);
      void (async () => {
        try {
          const [templateResponse, fontResponse] = await Promise.all([
            fetch('/case-service-templates/06แบบบันทึกการทำกิจกรรมส่งเสริมทักษะนักเรียน(OT).pdf'),
            fetch('/fonts/Sarabun-Regular.ttf'),
          ]);
          if (!templateResponse.ok) {
            throw new Error(`โหลดแบบฟอร์มต้นฉบับไม่สำเร็จ (${templateResponse.status})`);
          }
          if (!fontResponse.ok) {
            throw new Error(`โหลดฟอนต์ภาษาไทยไม่สำเร็จ (${fontResponse.status})`);
          }

          const [templateBytes, fontBytes] = await Promise.all([
            templateResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
            fontResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
          ]);
          const blob = await createOtSkillActivityPdfBlob(
            templateBytes,
            fontBytes,
            formData,
            (caseItem.students ?? []).map((student) => ({
              name: studentName(student),
              nickname: student.nickname_th ?? '',
              grade: student.grade ?? '',
              room: student.room == null ? '' : String(student.room),
            })),
            user?.name ?? caseItem.created_by_name ?? '',
          );
          const blobUrl = URL.createObjectURL(blob);
          pdfWindow.location.replace(blobUrl);
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
          setServiceFormFeedback({ message: t('เปิดไฟล์ PDF ในแท็บใหม่แล้ว'), tone: 'success' });
        } catch (exportError) {
          pdfWindow.close();
          const message = `${t('ส่งออกแบบฟอร์มบริการไม่สำเร็จ')}: ${exportError instanceof Error ? exportError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`;
          setError(message);
          setServiceFormFeedback({ message, tone: 'error' });
        } finally {
          setExporting(false);
        }
      })();
      return;
    }
    if (caseItem.service_type === 'psychology_skill_activity') {
      const pdfWindow = window.open('about:blank', '_blank');
      if (!pdfWindow) {
        const message = t('อนุญาตให้เปิดแท็บใหม่เพื่อดู PDF แล้วลองอีกครั้ง');
        setError(message);
        setServiceFormFeedback({ message, tone: 'error' });
        return;
      }

      pdfWindow.opener = null;
      setExporting(true);
      setError('');
      setServiceFormFeedback(null);
      void (async () => {
        try {
          const [templateResponse, fontResponse] = await Promise.all([
            fetch('/case-service-templates/07แบบบันทึกการทำกิจกรรมส่งเสริมทักษะนักเรียน(Psycho).pdf'),
            fetch('/fonts/Sarabun-Regular.ttf'),
          ]);
          if (!templateResponse.ok) {
            throw new Error(`โหลดแบบฟอร์มต้นฉบับไม่สำเร็จ (${templateResponse.status})`);
          }
          if (!fontResponse.ok) {
            throw new Error(`โหลดฟอนต์ภาษาไทยไม่สำเร็จ (${fontResponse.status})`);
          }

          const [templateBytes, fontBytes] = await Promise.all([
            templateResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
            fontResponse.arrayBuffer().then((bytes) => new Uint8Array(bytes)),
          ]);
          const blob = await createPsychologySkillActivityPdfBlob(
            templateBytes,
            fontBytes,
            formData,
            (caseItem.students ?? []).map((student) => ({
              name: studentName(student),
              nickname: student.nickname_th ?? '',
              grade: student.grade ?? '',
              room: student.room == null ? '' : String(student.room),
            })),
            user?.name ?? caseItem.created_by_name ?? '',
          );
          const blobUrl = URL.createObjectURL(blob);
          pdfWindow.location.replace(blobUrl);
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
          setServiceFormFeedback({ message: t('เปิดไฟล์ PDF ในแท็บใหม่แล้ว'), tone: 'success' });
        } catch (exportError) {
          pdfWindow.close();
          const message = `${t('ส่งออกแบบฟอร์มบริการไม่สำเร็จ')}: ${exportError instanceof Error ? exportError.message : t('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')}`;
          setError(message);
          setServiceFormFeedback({ message, tone: 'error' });
        } finally {
          setExporting(false);
        }
      })();
      return;
    }

    setExporting(true);
    setError('');
    setServiceFormFeedback(null);
    setServiceFormPrintData({ formData, outcome, nextAppointmentAt });
    setPrintPending(true);
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {dialog}
      <section role="dialog" aria-modal="true" aria-labelledby="case-detail-title" className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="max-h-[92vh] overflow-y-auto p-5 sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div><p className="text-sm font-medium text-primary">{t('รายละเอียดและบันทึกติดตาม')}</p><h2 id="case-detail-title" className="text-xl font-bold">{t(caseDisplayName(caseItem))}</h2></div>
          <div className="flex items-center gap-1">
            {user?.role === 'admin' && <button type="button" disabled={deletingCase} onClick={() => void deleteCase()} className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"><Trash2 size={15} />{deletingCase ? t('กำลังลบ...') : t('ลบเคส')}</button>}
            {user?.role === 'admin' && <button type="button" onClick={() => setShowCaseEditor(true)} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><Pencil size={15} />{t('แก้ไขเคส')}</button>}
            <button type="button" onClick={onClose} aria-label={t('ปิด')} className="rounded-full p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
          </div>
        </div>
        <div className="grid gap-3 rounded-2xl bg-[#faf8fb] p-4 sm:grid-cols-2">
          <p><b>{t('สถานะนัดหมาย')}:</b> {t(appointmentStatusName(appointmentStatus))}</p>
          <p><b>{t('นัดหมาย')}:</b> {formatThaiDate(appointmentDate)}</p>
          <p><b>{t('สถานที่นัดหมาย')}:</b> {caseItem.location || '-'}</p>
          <p><b>{t('สถานะเคส')}:</b> {t(status === 'done' ? 'เสร็จสิ้น' : 'ยังไม่เสร็จสิ้น')}</p>
          <p className="sm:col-span-2"><b>{t('รายละเอียด')}:</b> {caseItem.details || t('ไม่มีรายละเอียด')}</p>
          <p className="sm:col-span-2"><b>{t('นักเรียน')}:</b> {(caseItem.students ?? []).map(studentName).join(', ') || t('ไม่ระบุ')}</p>
          <p className="sm:col-span-2"><b>{t('ผู้ดูแล')}:</b> {(caseItem.caretakers ?? []).map((caretaker) => caretaker.name).join(', ') || t('ไม่ระบุ')}</p>
          <p className="sm:col-span-2 text-xs text-gray-500">{t('สถานะเคสหมายถึงงานดูแลเสร็จหรือยัง ส่วนสถานะนัดหมายหมายถึงมาตามนัดหรือไม่')}</p>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {(isAssigned || user?.role === 'admin') && <form onSubmit={saveAppointmentOutcome} className="mt-4 rounded-2xl border border-[#eee8f1] bg-white p-4">
          <h3 className="text-sm font-bold text-gray-800">{t('อัปเดตผลการนัดหมาย')}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block text-xs font-semibold text-gray-600">{t('สถานะนัดหมาย')}
              <select value={appointmentStatus} onChange={(event) => setAppointmentStatus(event.target.value as AppointmentStatus)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800">
                {(['scheduled', 'attended', 'no_show', 'rescheduled'] as const).map((value) => <option key={value} value={value}>{t(appointmentStatusName(value))}</option>)}
              </select>
            </label>
            {appointmentStatus === 'rescheduled' && <label className="block text-xs font-semibold text-gray-600">{t('วันและเวลาใหม่')}
              <input type="datetime-local" required value={rescheduledAt} onChange={(event) => setRescheduledAt(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
            </label>}
            <button type="submit" disabled={savingAppointment} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
              {savingAppointment ? t('กำลังบันทึก...') : t('บันทึกสถานะนัดหมาย')}
            </button>
          </div>
        </form>}
        {caseItem.service_type && (isAssigned || user?.role === 'admin') && serviceFormLoaded && <section className="mt-5">
          <h3 className="font-bold text-gray-800">{t('แบบฟอร์มบริการ')} · {t(caseServiceTypeName(caseItem.service_type))}</h3>
          <p className="mt-1 text-xs text-gray-500">{t('บันทึกเป็นร่างได้ก่อนนัด และอัปเดตได้หลังการให้บริการ ข้อมูลเชื่อมโยงจากเคสนี้')}</p>
          <CaseServiceForm
            key={`${caseItem.id}:${caseItem.service_type}`}
            serviceType={caseItem.service_type}
            scheduledAt={appointmentDate}
            caseStatus={status}
            location={caseItem.location}
            studentDefaults={studentDefaults[0] ?? { studentAge: '', homeroomTeacher: '' }}
            initialData={serviceFormData}
            caretakers={caseItem.caretakers ?? []}
            saving={savingServiceForm}
            exporting={exporting}
            feedback={serviceFormFeedback}
            onSave={(formData, outcome, nextAppointmentAt) => void saveServiceForm(formData, outcome, nextAppointmentAt)}
            onExport={(formData, outcome, nextAppointmentAt) => exportServiceForm(formData, outcome, nextAppointmentAt)}
            onDirty={() => setServiceFormFeedback(null)}
          />
        </section>}
        {appointmentStatus === 'attended' && !caseItem.service_type && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t('เคสนี้ยังไม่ได้ระบุบริการ จึงยังเปิดแบบฟอร์มบริการไม่ได้')}</p>}
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
          </>
        )}
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
    </div>
    {caseItem.service_type && serviceFormPrintData && (
      <CaseServicePrintTemplate
        serviceType={caseItem.service_type}
        formData={serviceFormPrintData.formData}
        outcome={serviceFormPrintData.outcome}
        nextAppointmentAt={serviceFormPrintData.nextAppointmentAt}
        students={(caseItem.students ?? []).map((student) => ({
          name: studentName(student),
          grade: student.grade ?? '',
          room: student.room == null ? '' : String(student.room),
        }))}
      />
    )}
    </>
  );
}
