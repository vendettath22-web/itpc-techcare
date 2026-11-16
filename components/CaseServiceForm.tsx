'use client';

import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import { Save } from 'lucide-react';
import { CASE_SERVICE_FORM_SECTIONS, CASE_SERVICE_FORM_TITLES, createInitialCaseServiceFormData, type CaseServiceFormData } from '@/lib/case-service-forms';
import type { CaseServiceType } from '@/lib/case-services';
import { useLanguage } from '@/lib/language';
import type { itpc_takecare_caretakers } from '@/types/database';

type Props = {
  serviceType: CaseServiceType;
  scheduledAt: string;
  initialData: CaseServiceFormData | null;
  caretakers: itpc_takecare_caretakers[];
  saving: boolean;
  onSave: (formData: CaseServiceFormData) => void;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export default function CaseServiceForm({
  serviceType,
  scheduledAt,
  initialData,
  caretakers,
  saving,
  onSave,
}: Props) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<CaseServiceFormData>(() => ({
    ...createInitialCaseServiceFormData(serviceType, scheduledAt),
    ...initialData,
  }));
  const sections = CASE_SERVICE_FORM_SECTIONS[serviceType];

  function setValue(id: string, value: string | string[]) {
    setFormData((current) => ({ ...current, [id]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(formData);
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-5 rounded-2xl border border-primary/20 bg-white p-4 sm:p-6">
      <header className="border-b border-gray-200 pb-5 text-center">
        <Image
          src="/cmu-itpc-logo.png"
          alt="CMU-ITPC"
          width={129}
          height={135}
          className="mx-auto h-16 w-16 object-contain"
        />
        <p className="mt-3 text-sm text-gray-700">{t('ฝ่ายส่งเสริมพัฒนาการและกิจการนักเรียน')}</p>
        <p className="text-sm text-gray-700">{t('โรงเรียนสาธิตมหาวิทยาลัยเชียงใหม่ ระดับอนุบาลและประถมศึกษา')}</p>
        <h4 className="mt-2 text-lg font-bold text-gray-900">{t(CASE_SERVICE_FORM_TITLES[serviceType])}</h4>
      </header>
      {sections.map((section, sectionIndex) => (
        <fieldset key={section.title} className="border-t border-gray-100 pt-4">
          <legend className="px-1 text-sm font-bold text-primary">
            <span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-lg bg-primary-light text-sm text-primary">{sectionIndex + 1}</span>
            {t(section.title)}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {section.fields.map((item) => {
              const value = formData[item.id];
              const isWide = item.type === 'textarea' || item.type === 'checkboxes';
              const otherSelected = item.type === 'select'
                ? value === 'อื่น ๆ'
                : isStringArray(value) && value.includes('อื่น ๆ');
              return (
                <div key={item.id} className={isWide ? 'sm:col-span-2' : ''}>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">{t(item.label)}</label>
                  {item.type === 'textarea' ? (
                    <textarea
                      rows={3}
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) => setValue(item.id, event.target.value)}
                      className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                    />
                  ) : item.type === 'checkboxes' ? (
                    <div className="grid gap-2 rounded-xl border border-gray-100 bg-[#fcfbfd] p-3 sm:grid-cols-2">
                      {item.options?.map((option) => (
                        <label key={option} className="flex items-start gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={isStringArray(value) && value.includes(option)}
                            onChange={(event) => {
                              const current = isStringArray(value) ? value : [];
                              setValue(item.id, event.target.checked
                                ? [...current, option]
                                : current.filter((selected) => selected !== option));
                            }}
                            className="mt-0.5 accent-primary"
                          />
                          {t(option)}
                        </label>
                      ))}
                    </div>
                  ) : item.type === 'select' ? (
                    <select
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) => setValue(item.id, event.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="">{t('เลือกข้อมูล')}</option>
                      {item.options?.map((option) => <option key={option} value={option}>{t(option)}</option>)}
                    </select>
                  ) : item.type === 'caretaker' ? (
                    caretakers.length ? (
                      <select
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) => setValue(item.id, event.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                      >
                        <option value="">{t('เลือกผู้ให้บริการ')}</option>
                        {caretakers.map((caretaker) => <option key={caretaker.id} value={caretaker.name}>{caretaker.name}</option>)}
                      </select>
                    ) : (
                      <input
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) => setValue(item.id, event.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                      />
                    )
                  ) : (
                    <input
                      type={item.type}
                      min={item.type === 'number' ? 1 : undefined}
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) => setValue(item.id, event.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                    />
                  )}
                  {otherSelected && (
                    <input
                      aria-label={t('ระบุรายละเอียดอื่น ๆ')}
                      value={typeof formData[`${item.id}Other`] === 'string' ? formData[`${item.id}Other`] : ''}
                      onChange={(event) => setValue(`${item.id}Other`, event.target.value)}
                      placeholder={t('ระบุรายละเอียดอื่น ๆ')}
                      className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="flex justify-end border-t border-gray-100 pt-3">
        <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
          <Save size={16} />{saving ? t('กำลังบันทึก...') : t('บันทึกแบบฟอร์มบริการ')}
        </button>
      </div>
    </form>
  );
}
