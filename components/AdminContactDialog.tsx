'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, Shield, X } from 'lucide-react';
import ImagePreview from '@/components/ImagePreview';
import { requestApi } from '@/lib/api';
import { useLanguage } from '@/lib/language';

type AdminContact = {
  id: string;
  name: string;
  phone: string | null;
  profile_photo_url: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function AdminContactDialog({ open, onClose }: Props) {
  const [contacts, setContacts] = useState<AdminContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      setError('');
      try {
        const data = await requestApi<AdminContact[]>('listAdminContacts');
        if (active) setContacts(data);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : t('โหลดข้อมูลติดต่อไม่สำเร็จ'));
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [open, t]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="admin-contact-title" className="my-auto w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-light text-primary"><Shield size={22} /></span>
            <div>
              <h2 id="admin-contact-title" className="text-lg font-bold text-gray-800">{t('ติดต่อแอดมิน')}</h2>
              <p className="mt-1 text-sm text-gray-500">{t('ติดต่อผู้ดูแลระบบหากพบปัญหาการใช้งาน')}</p>
            </div>
          </div>
          <button type="button" aria-label={t('ปิด')} onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-gray-500 hover:bg-gray-100"><X size={19} /></button>
        </div>

        {loading ? <p className="py-10 text-center text-sm text-gray-500">{t('กำลังโหลดข้อมูลติดต่อ...')}</p>
          : error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
            : contacts.length ? <div className="mt-5 space-y-3">
              {contacts.map((contact) => <article key={contact.id} className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-[#fcfbfd] p-4">
                {contact.profile_photo_url
                  ? <ImagePreview src={contact.profile_photo_url} alt={`${t('รูปโปรไฟล์')} ${contact.name}`} width={60} height={60} className="h-[60px] w-[60px] shrink-0 rounded-full" />
                  : <span className="grid h-[60px] w-[60px] shrink-0 place-items-center rounded-full bg-primary-light text-primary"><Shield size={25} /></span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-800">{contact.name}</p>
                  <p className="mt-1 text-xs text-gray-500">{t('ผู้ดูแลระบบ')}</p>
                </div>
                {contact.phone
                  ? <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-hover"><Phone size={15} />{contact.phone}</a>
                  : <span className="text-xs text-gray-400">{t('ยังไม่มีเบอร์โทร')}</span>}
              </article>)}
            </div> : <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{t('ยังไม่มีข้อมูลติดต่อแอดมิน กรุณาติดต่อผู้ดูแลระบบผ่านช่องทางที่โรงเรียนกำหนด')}</p>}
      </section>
    </div>,
    document.body,
  );
}
