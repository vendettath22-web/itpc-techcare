'use client';

import {
  CASE_SERVICE_FORM_SECTIONS,
  CASE_SERVICE_FORM_TITLES,
  type CaseServiceFormData,
  type CaseServiceFormField,
  type CaseServiceFormValue,
} from '@/lib/case-service-forms';
import type { CaseServiceType } from '@/lib/case-services';
import { useLanguage } from '@/lib/language';
import type { CaseServiceFormOutcome } from '@/components/CaseServiceForm';

type PrintStudent = {
  name: string;
  grade: string;
  room: string;
};

type Props = {
  serviceType: CaseServiceType;
  formData: CaseServiceFormData;
  students: PrintStudent[];
  outcome: CaseServiceFormOutcome;
  nextAppointmentAt?: string;
};

function getDisplayValue(field: CaseServiceFormField, value: CaseServiceFormValue | undefined): string {
  if (typeof value !== 'string' || !value) return '';
  if (field.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00`);
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (field.type === 'time' && /^\d{2}:\d{2}$/.test(value)) return `${value} น.`;
  return value;
}

function formatNextAppointment(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' });
}

function PrintField({
  field,
  formData,
  translate,
}: {
  field: CaseServiceFormField;
  formData: CaseServiceFormData;
  translate: (text: string) => string;
}) {
  const value = formData[field.id];
  const otherValue = formData[`${field.id}Other`];

  if (field.type === 'checkboxes') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="case-service-print-field">
        <strong>{translate(field.label)}:</strong>
        <div className="case-service-print-choices">
          {field.options?.map((option) => (
            <span key={option}>{selected.includes(option) ? '☑' : '☐'} {translate(option)}</span>
          ))}
        </div>
        {typeof otherValue === 'string' && otherValue.trim() && (
          <div className="case-service-print-other"><strong>{translate('ระบุรายละเอียดอื่น ๆ')}:</strong> {otherValue}</div>
        )}
      </div>
    );
  }

  const displayValue = getDisplayValue(field, value);
  if (field.type === 'textarea') {
    return (
      <div className="case-service-print-field case-service-print-long-field">
        <strong>{translate(field.label)}</strong>
        <p className="case-service-print-paragraph">{displayValue || '\u00a0'}</p>
        {typeof otherValue === 'string' && otherValue.trim() && (
          <p className="case-service-print-paragraph"><strong>{translate('ระบุรายละเอียดอื่น ๆ')}:</strong> {otherValue}</p>
        )}
      </div>
    );
  }

  return (
    <div className="case-service-print-short-field">
      <strong>{translate(field.label)}:</strong>
      <span className="case-service-print-value">{displayValue || '\u00a0'}</span>
    </div>
  );
}

const outcomes: readonly [CaseServiceFormOutcome, string][] = [
  ['draft', 'บันทึกแบบร่าง'],
  ['completed', 'เรียบร้อยแล้ว'],
  ['next_appointment', 'นัดครั้งต่อไป'],
];

export default function CaseServicePrintTemplate({
  serviceType,
  formData,
  students,
  outcome,
  nextAppointmentAt,
}: Props) {
  const { t } = useLanguage();

  return (
    <div className="case-service-print-root">
      <table className="case-service-print-document">
        <thead>
          <tr>
            <td>
              <header className="case-service-print-header">
                <strong className="case-service-print-code">CMUDS-ITPC</strong>
                <p>{t('ฝ่ายส่งเสริมพัฒนาการและกิจการนักเรียน')}</p>
                <p>{t('โรงเรียนสาธิตมหาวิทยาลัยเชียงใหม่ ระดับอนุบาลและประถมศึกษา')}</p>
                <h1>{t(CASE_SERVICE_FORM_TITLES[serviceType])}</h1>
              </header>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <section className="case-service-print-section">
                <h2>{t('ข้อมูลนักเรียน')}</h2>
                {students.length ? students.map((student, index) => (
                  <div className="case-service-print-student" key={`${student.name}-${index}`}>
                    <div className="case-service-print-short-field">
                      <strong>{t('ชื่อ-นามสกุล')}:</strong>
                      <span className="case-service-print-value">{student.name || '\u00a0'}</span>
                    </div>
                    <div className="case-service-print-short-field">
                      <strong>{t('ชั้น')}:</strong>
                      <span className="case-service-print-value">{student.grade || '\u00a0'}</span>
                      <strong>{t('ห้อง')}:</strong>
                      <span className="case-service-print-value">{student.room || '\u00a0'}</span>
                    </div>
                  </div>
                )) : <p className="case-service-print-paragraph">{t('ไม่ระบุ')}</p>}
              </section>
            </td>
          </tr>
        </tbody>
        {CASE_SERVICE_FORM_SECTIONS[serviceType].map((section) => (
          <tbody key={section.title}>
            <tr className="case-service-print-section-heading-row">
              <td><h2>{t(section.title)}</h2></td>
            </tr>
            {section.fields.map((field) => (
              <tr
                key={field.id}
                className={field.type === 'textarea' ? 'case-service-print-long-field-row' : 'case-service-print-field-row'}
              >
                <td><PrintField field={field} formData={formData} translate={t} /></td>
              </tr>
            ))}
          </tbody>
        ))}
        <tbody>
          <tr>
            <td>
              <section className="case-service-print-section">
                <h2>{t('สรุปผลเคส')}</h2>
                <div className="case-service-print-choices">
                  {outcomes.map(([value, label]) => (
                    <span key={value}>{outcome === value ? '☑' : '☐'} {t(label)}</span>
                  ))}
                </div>
                {outcome === 'next_appointment' && nextAppointmentAt && (
                  <div className="case-service-print-short-field">
                    <strong>{t('วันและเวลานัดครั้งต่อไป')}:</strong>
                    <span className="case-service-print-value">{formatNextAppointment(nextAppointmentAt)}</span>
                  </div>
                )}
              </section>
              <div className="case-service-print-signature">
                <p>ลงชื่อ ................................................ ผู้บันทึก</p>
                <p>(........................................................)</p>
                <p>วันที่ ......../......../........</p>
              </div>
              <footer className="case-service-print-footer">
                <p>{t('ฝ่ายส่งเสริมพัฒนาการและกิจการนักเรียน')}</p>
                <p>{t('โรงเรียนสาธิตมหาวิทยาลัยเชียงใหม่ ระดับอนุบาลและประถมศึกษา')}</p>
                <p>239 ถ.ห้วยแก้ว ต.สุเทพ อ.เมืองเชียงใหม่ เชียงใหม่ 50200 โทร.053-941237-11</p>
              </footer>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
