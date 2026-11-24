'use client';

import { useEffect, useState } from 'react';
import {
  createBehaviorObservationPdfBlob,
  type BehaviorObservationStudent,
} from '@/lib/behavior-observation-pdf';
import type { CaseServiceFormData } from '@/lib/case-service-forms';

const TARGET_BEHAVIORS = [
  'Fine motor',
  'Gross motor',
  'การเคลื่อนไหว',
  'การบูรณาการประสาทสัมผัส (SI)',
  'Social skill',
  'Emotional',
  'ADL / Play or Leisure / Productive activity',
  'Perception and cognition',
  'Attention',
  'Hyperactive',
  'การเรียน',
  'สติปัญญา',
  'การอ่าน/เขียน',
  'Visual perception',
  'Eye hand coordination',
  'อื่น ๆ',
];

const SUPPORT_STRATEGIES = [
  'ปรับวิธีการสื่อสารหรือให้คำสั่ง',
  'ปรับกิจกรรมหรือสภาพแวดล้อมการเรียนรู้',
  'ใช้การเสริมแรงทางบวก',
  'ให้ความช่วยเหลือด้านการจัดการอารมณ์',
  'ให้คำปรึกษาหรือช่วยเหลือรายบุคคล',
  'ประสานความร่วมมือกับครูและผู้ปกครอง',
  'วางแผนการเข้าสังเกตการณ์ซ้ำ',
  'ประเมินโดยใช้แบบประเมินหรือแบบคัดกรองเพิ่มเติม',
  'อื่น ๆ',
];

const MOCK_FORM_DATA: CaseServiceFormData = {
  observationDate: '2026-11-23',
  observationTime: '13:29',
  locationActivity: 'ห้องเรียน กิจกรรมกลุ่ม',
  activityFormat: 'ทั้งชั้น',
  activityFormatOther: 'กิจกรรมเสริม',
  observers: 'นางสาวผู้สังเกต ทดสอบ',
  observerPosition: 'นักจิตวิทยา',
  studentAge: '8',
  homeroomTeacher: 'ครูสมมติ',
  referralReason: 'ต้องการสังเกตสมาธิและการมีส่วนร่วม',
  referralSource: 'ครูประจำชั้น',
  referralSourceOther: 'ผู้ปกครอง',
  generalCharacteristics: 'นักเรียนแต่งกายเรียบร้อย สุขภาพทั่วไปปกติ',
  observationContext: 'สังเกตระหว่างทำกิจกรรมกลุ่มในห้องเรียน โดยมีครูประจำชั้นร่วมกิจกรรม',
  targetBehaviors: TARGET_BEHAVIORS,
  otherTargetBehavior: 'การทำงานร่วมกับเพื่อน',
  observedBehaviors: 'นักเรียนทำกิจกรรมได้ต่อเนื่องและตอบสนองต่อคำแนะนำ',
  identifiedConcerns: 'บางช่วงมีการวอกแวกเมื่อมีสิ่งเร้ารอบข้าง',
  strengths: 'ทำตามขั้นตอนได้ดีเมื่อได้รับคำแนะนำที่ชัดเจน',
  supportStrategies: SUPPORT_STRATEGIES,
  supportStrategiesOther: 'จัดช่วงพักสั้นระหว่างกิจกรรม',
  recommendations: 'ติดตามพฤติกรรมในกิจกรรมกลุ่มอย่างต่อเนื่อง',
  followUpDate: '2026-12-07',
  responsiblePerson: 'ครูประจำชั้น',
  recordDate: '2026-11-23',
};

const MOCK_STUDENTS: BehaviorObservationStudent[] = [
  {
    name: 'เด็กชายตัวอย่าง ทดสอบระบบ',
    nickname: 'ตัวอย่าง',
    grade: 'ป.2',
    room: '1',
  },
];

export default function PdfPreviewPage() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [watchError, setWatchError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function createPreview() {
      setPdfUrl(null);
      setError('');

      try {
        const [templateResponse, fontResponse] = await Promise.all([
          fetch('/case-service-templates/behavior-observation.pdf', { cache: 'no-store' }),
          fetch('/fonts/Sarabun-Regular.ttf', { cache: 'no-store' }),
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
          MOCK_FORM_DATA,
          MOCK_STUDENTS,
        );

        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (previewError) {
        if (!cancelled) {
          setError(
            previewError instanceof Error
              ? previewError.message
              : 'สร้าง PDF ตัวอย่างไม่สำเร็จ',
          );
        }
      }
    }

    void createPreview();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    let active = true;
    let checking = false;
    let reloading = false;
    let currentRevision: string | null = null;

    async function checkForChanges() {
      if (!active || checking || reloading) return;
      checking = true;

      try {
        const response = await fetch('/api/pdf-preview/version', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`ตรวจสอบไฟล์สำหรับรีเฟรชไม่สำเร็จ (${response.status})`);
        }

        const result = await response.json();
        if (typeof result.revision !== 'string') {
          throw new Error('เซิร์ฟเวอร์ส่งข้อมูลเวอร์ชันไฟล์ไม่ถูกต้อง');
        }

        if (currentRevision !== null && currentRevision !== result.revision) {
          reloading = true;
          window.location.reload();
          return;
        }

        currentRevision = result.revision;
        setWatchError('');
      } catch (watchError) {
        if (active) {
          setWatchError(
            watchError instanceof Error
              ? watchError.message
              : 'ตรวจสอบการเปลี่ยนแปลงไฟล์ไม่สำเร็จ',
          );
        }
      } finally {
        checking = false;
      }
    }

    void checkForChanges();
    const intervalId = window.setInterval(() => void checkForChanges(), 1000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <main style={{ position: 'fixed', inset: 0, background: '#fff', zoom: 1.25 }}>
      {pdfUrl ? (
        <iframe
          title="ตัวอย่าง PDF แบบบันทึกการสังเกตพฤติกรรมนักเรียน"
          src={pdfUrl}
          width="100%"
          height="100%"
          style={{ width: '100%', height: '100vh', border: 0 }}
        />
      ) : (
        <p role={error ? 'alert' : 'status'} style={{ padding: 16 }}>
          {error || 'กำลังสร้าง PDF ตัวอย่าง...'}
        </p>
      )}
      {watchError && (
        <p
          role="alert"
          style={{
            position: 'fixed',
            top: 8,
            left: 8,
            zIndex: 1,
            margin: 0,
            padding: '8px 12px',
            background: '#fff',
            color: '#b91c1c',
          }}
        >
          {watchError}
        </p>
      )}
    </main>
  );
}
