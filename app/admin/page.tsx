'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, RefreshCw, UserPlus, UsersRound } from 'lucide-react';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import ImagePreview from '@/components/ImagePreview';
import Navbar from '@/components/Navbar';
import { requestApi } from '@/lib/api';
import { prepareProfilePhoto } from '@/lib/profile-image';
import { useLanguage } from '@/lib/language';
import { useSessionCaretaker } from '@/lib/session';
import type { AppUsageLog, Caretaker } from '@/types/database';

type CaretakerForm = {
  name: string;
  role: 'admin' | 'caretaker';
  pin: string;
  phone: string;
  age: string;
  photoDataUrl: string;
};

const emptyForm: CaretakerForm = { name: '', role: 'caretaker', pin: '', phone: '', age: '', photoDataUrl: '' };

const usageActionLabels: Record<string, string> = {
  login: 'เข้าสู่ระบบ',
  logout: 'ออกจากระบบ',
  update_profile: 'แก้ไขโปรไฟล์',
  create_caretaker: 'เพิ่มบัญชีผู้ดูแล',
  update_caretaker: 'แก้ไขบัญชีผู้ดูแล',
  deactivate_caretaker: 'ปิดบัญชีผู้ดูแล',
  create_student: 'เพิ่มข้อมูลนักเรียน',
  import_students: 'นำเข้ารายชื่อนักเรียน',
  update_student: 'แก้ไขข้อมูลนักเรียน',
  deactivate_student: 'ปิดข้อมูลนักเรียน',
  create_case: 'สร้างเคส',
  add_case_update: 'บันทึกติดตามเคส',
  update_case_status: 'เปลี่ยนสถานะเคส',
  save_signature: 'บันทึกลายเซ็น',
};

export default function AdminPage() {
  const router = useRouter();
  const user = useSessionCaretaker();
  const { language, t } = useLanguage();
  const [caretakers, setCaretakers] = useState<Caretaker[]>([]);
  const [usageLogs, setUsageLogs] = useState<AppUsageLog[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CaretakerForm>>({});
  const [newCaretaker, setNewCaretaker] = useState<CaretakerForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [usageLogError, setUsageLogError] = useState('');
  const [usageLogsLoading, setUsageLogsLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const { confirm, dialog } = useConfirmDialog();

  const loadCaretakers = useCallback(async () => {
    try {
      const data = await requestApi<Caretaker[]>('adminListCaretakers');
      setCaretakers(data);
      setDrafts(Object.fromEntries(data.map((caretaker) => [caretaker.id, {
        name: caretaker.name,
        role: caretaker.role,
        pin: '',
        phone: caretaker.phone ?? '',
        age: caretaker.age === null || caretaker.age === undefined ? '' : String(caretaker.age),
        photoDataUrl: '',
      }])));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('โหลดบัญชีผู้ดูแลไม่สำเร็จ'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadUsageLogs = useCallback(async () => {
    setUsageLogsLoading(true);
    setUsageLogError('');
    try {
      const data = await requestApi<AppUsageLog[]>('adminListUsageLogs');
      setUsageLogs(data);
    } catch (loadError) {
      setUsageLogError(loadError instanceof Error ? loadError.message : t('โหลดบันทึกการใช้งานไม่สำเร็จ'));
    } finally {
      setUsageLogsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (user === undefined) return;
    if (!user || user.role !== 'admin') {
      router.replace(user ? '/' : '/login');
      return;
    }
    void Promise.resolve().then(() => {
      void loadCaretakers();
      void loadUsageLogs();
    });
  }, [loadCaretakers, loadUsageLogs, router, user]);

  async function createCaretaker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!await confirm({
      title: `${t('เพิ่มบัญชี')} ${newCaretaker.name}?`,
      description: t('ตรวจสอบชื่อและข้อมูลบัญชีก่อนยืนยันการเพิ่ม'),
      confirmLabel: t('เพิ่มบัญชี'),
    })) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await requestApi('createCaretaker', newCaretaker);
      setNewCaretaker(emptyForm);
      setNotice(t('เพิ่มบัญชีผู้ดูแลแล้ว'));
      await loadCaretakers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('เพิ่มบัญชีไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  }

  async function updateCaretaker(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    const caretaker = caretakers.find((item) => item.id === id);
    if (!await confirm({
      title: t('บันทึกการแก้ไขบัญชี?'),
      description: `${t('ข้อมูลบัญชี')} ${caretaker?.name ?? ''} ${t('จะถูกเปลี่ยนตามรายการที่แก้ไข')}`,
      confirmLabel: t('บันทึกการแก้ไข'),
    })) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await requestApi('updateCaretaker', { id, ...draft });
      setNotice(t('บันทึกบัญชีแล้ว'));
      await loadCaretakers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('แก้ไขบัญชีไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  }

  async function deactivateCaretaker(caretaker: Caretaker) {
    if (!await confirm({
      title: `${t('ปิดบัญชี')} ${caretaker.name}?`,
      description: t('บัญชีนี้จะเข้าสู่ระบบไม่ได้ แต่ข้อมูลเดิมจะยังถูกเก็บไว้'),
      confirmLabel: t('ปิดบัญชี'),
      tone: 'danger',
    })) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await requestApi('deactivateCaretaker', { id: caretaker.id });
      setNotice(t('ปิดบัญชีแล้ว'));
      await loadCaretakers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('ปิดบัญชีไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  }

  if (!user || user.role !== 'admin') {
    return <div className="grid min-h-screen place-items-center text-gray-500">{t('กำลังตรวจสอบสิทธิ์ admin...')}</div>;
  }

  return (
    <main className="min-h-screen bg-[#faf9fb] transition-[padding] duration-300 ease-in-out lg:pl-[var(--sidebar-width,18rem)]">
      {dialog}
      <Navbar />
      <section className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
        <div className="mb-6">
          <p className="text-sm font-medium text-primary">{t('ตั้งค่าระบบ')}</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-800 sm:text-3xl">{t('จัดการบัญชีผู้ดูแล')}</h1>
          <p className="mt-2 text-sm text-gray-500">{t('ผู้ดูแลระบบเพิ่ม แก้ไขบทบาท เปลี่ยน PIN และปิดบัญชีได้')}</p>
        </div>

        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
        {caretakers.some((caretaker) => caretaker.profile_photo_error) && (
          <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            {t('โหลดบัญชีได้แล้ว แต่แสดงรูปโปรไฟล์ไม่ได้:')} {caretakers.find((caretaker) => caretaker.profile_photo_error)?.profile_photo_error}
          </p>
        )}

        <form onSubmit={createCaretaker} className="mb-7 rounded-2xl border border-[#eee9ef] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 font-semibold text-gray-800"><UserPlus size={19} className="text-primary" />{t('เพิ่มบัญชี')}</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-gray-600">{t('ชื่อผู้ดูแล')}
              <input required value={newCaretaker.name} onChange={(event) => setNewCaretaker({ ...newCaretaker, name: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
            </label>
            <label className="text-sm text-gray-600">{t('PIN (4-12 หลัก)')}
              <input required minLength={4} maxLength={12} pattern="[0-9]{4,12}" inputMode="numeric" value={newCaretaker.pin} onChange={(event) => setNewCaretaker({ ...newCaretaker, pin: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
            </label>
            <label className="text-sm text-gray-600">{t('บทบาท')}
              <select value={newCaretaker.role} onChange={(event) => setNewCaretaker({ ...newCaretaker, role: event.target.value as CaretakerForm['role'] })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5">
                <option value="caretaker">{t('ผู้ดูแล')}</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="text-sm text-gray-600">{t('เบอร์มือถือ')}
              <input type="tel" inputMode="tel" pattern="[0-9+() -]{8,20}" value={newCaretaker.phone} onChange={(event) => setNewCaretaker({ ...newCaretaker, phone: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" placeholder="เช่น 08X-XXX-XXXX" />
            </label>
            <label className="text-sm text-gray-600">{t('อายุ')}
              <input type="number" min={18} max={120} value={newCaretaker.age} onChange={(event) => setNewCaretaker({ ...newCaretaker, age: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" placeholder="ปี" />
            </label>
            <label className="text-sm text-gray-600 sm:col-span-2">{t('รูปโปรไฟล์')}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void prepareProfilePhoto(file).then((photoDataUrl) => setNewCaretaker((current) => ({ ...current, photoDataUrl }))).catch((photoError: unknown) => setError(photoError instanceof Error ? photoError.message : t('เตรียมรูปภาพไม่สำเร็จ')));
              }} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              {newCaretaker.photoDataUrl && <ImagePreview src={newCaretaker.photoDataUrl} alt="ตัวอย่างรูปโปรไฟล์" width={64} height={64} className="mt-2 h-16 w-16" />}
            </label>
          </div>
          <button disabled={saving} className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">{saving ? t('กำลังบันทึก...') : t('เพิ่มบัญชี')}</button>
        </form>

        <div className="mb-3 flex items-center gap-2"><UsersRound size={18} className="text-primary" /><h2 className="font-bold text-gray-800">{t('บัญชีทั้งหมด')} ({caretakers.length})</h2></div>
        {loading ? <p className="py-12 text-center text-gray-500">{t('กำลังโหลดบัญชี...')}</p> : (
          <div className="space-y-3">
            {caretakers.map((caretaker) => {
              const draft = drafts[caretaker.id] ?? {
                name: caretaker.name,
                role: caretaker.role,
                pin: '',
                phone: caretaker.phone ?? '',
                age: caretaker.age === null || caretaker.age === undefined ? '' : String(caretaker.age),
                photoDataUrl: '',
              };
              return (
                <article key={caretaker.id} className={`rounded-2xl border bg-white p-4 sm:p-5 ${caretaker.deactivated_at ? 'border-gray-200 opacity-70' : 'border-[#eee9ef]'}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {(draft.photoDataUrl || caretaker.profile_photo_url) && <ImagePreview src={draft.photoDataUrl || caretaker.profile_photo_url || ''} alt={`รูปโปรไฟล์ ${caretaker.name}`} width={44} height={44} className="h-11 w-11" />}
                      <p className="font-semibold text-gray-800">{caretaker.name}<span className={`ml-2 rounded-full px-2 py-1 text-xs ${caretaker.role === 'admin' ? 'bg-primary-light text-primary' : 'bg-gray-100 text-gray-600'}`}>{caretaker.role === 'admin' ? t('Admin') : t('ผู้ดูแล')}</span></p>
                    </div>
                    <p className="text-xs text-gray-500">{caretaker.deactivated_at ? `${t('ปิดบัญชี')} ${new Date(caretaker.deactivated_at).toLocaleString()}` : t('ใช้งานอยู่')}</p>
                  </div>
                  {!caretaker.deactivated_at && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-[1fr_180px_1fr]">
                        <label className="text-xs text-gray-500">{t('ชื่อ')}
                          <input value={draft.name} onChange={(event) => setDrafts({ ...drafts, [caretaker.id]: { ...draft, name: event.target.value } })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800" />
                        </label>
                        <label className="text-xs text-gray-500">{t('บทบาท')}
                          <select value={draft.role} onChange={(event) => setDrafts({ ...drafts, [caretaker.id]: { ...draft, role: event.target.value as CaretakerForm['role'] } })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800">
                            <option value="caretaker">{t('ผู้ดูแล')}</option>
                            <option value="admin">Admin</option>
                          </select>
                        </label>
                        <label className="text-xs text-gray-500">{t('ตั้ง PIN ใหม่ (เว้นว่างถ้าไม่เปลี่ยน)')}
                          <input minLength={4} maxLength={12} pattern="[0-9]{4,12}" inputMode="numeric" value={draft.pin} onChange={(event) => setDrafts({ ...drafts, [caretaker.id]: { ...draft, pin: event.target.value } })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800" />
                        </label>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="text-xs text-gray-500">{t('เบอร์มือถือ')}
                          <input type="tel" inputMode="tel" pattern="[0-9+() -]{8,20}" value={draft.phone} onChange={(event) => setDrafts({ ...drafts, [caretaker.id]: { ...draft, phone: event.target.value } })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800" />
                        </label>
                        <label className="text-xs text-gray-500">{t('อายุ')}
                          <input type="number" min={18} max={120} value={draft.age} onChange={(event) => setDrafts({ ...drafts, [caretaker.id]: { ...draft, age: event.target.value } })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800" />
                        </label>
                        <label className="text-xs text-gray-500">{t('เปลี่ยนรูปโปรไฟล์')}
                          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void prepareProfilePhoto(file).then((photoDataUrl) => setDrafts((current) => ({ ...current, [caretaker.id]: { ...draft, photoDataUrl } }))).catch((photoError: unknown) => setError(photoError instanceof Error ? photoError.message : t('เตรียมรูปภาพไม่สำเร็จ')));
                          }} className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800" />
                        </label>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button disabled={saving || caretaker.id === user.id} onClick={() => void deactivateCaretaker(caretaker)} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40">{t('ปิดบัญชี')}</button>
                        <button disabled={saving} onClick={() => void updateCaretaker(caretaker.id)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">{t('บันทึก')}</button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
            {!caretakers.length && <p className="rounded-2xl border border-dashed border-gray-300 bg-white py-12 text-center text-gray-500">ยังไม่มีบัญชีผู้ดูแล</p>}
          </div>
        )}

        <section className="mt-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardList size={18} className="text-primary" />
              <h2 className="font-bold text-gray-800">{t('บันทึกการใช้งาน')}</h2>
            </div>
            <button
              type="button"
              onClick={() => void loadUsageLogs()}
              disabled={usageLogsLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCw size={15} className={usageLogsLoading ? 'animate-spin' : ''} />
              {t('รีเฟรช')}
            </button>
          </div>
          <p className="mb-3 text-sm text-gray-500">{t('แสดงกิจกรรมล่าสุดไม่เกิน 500 รายการ โดยไม่เก็บ PIN เนื้อหาบันทึก หรือลายเซ็น')}</p>
          {usageLogError && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{usageLogError}</p>}
          <div className="overflow-x-auto rounded-2xl border border-[#eee9ef] bg-white shadow-sm">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[#f7f3f9] text-gray-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('วัน-เวลา')}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('ชื่อผู้ใช้')}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('บทบาท')}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('เหตุการณ์')}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('รายละเอียด')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usageLogsLoading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">{t('กำลังโหลดบันทึกการใช้งาน...')}</td></tr>
                ) : usageLogs.length ? usageLogs.map((log) => (
                  <tr key={log.id} className="text-gray-700">
                    <td className="whitespace-nowrap px-4 py-3">
                      {new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: 'Asia/Bangkok',
                      }).format(new Date(log.used_at))}
                    </td>
                    <td className="px-4 py-3 font-medium">{log.caretaker_name}</td>
                    <td className="px-4 py-3">{log.caretaker_role === 'admin' ? t('Admin') : t('ผู้ดูแล')}</td>
                    <td className="px-4 py-3">{t(usageActionLabels[log.action] ?? log.action)}</td>
                    <td className="max-w-sm px-4 py-3 text-gray-500">{log.details || '-'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">{t('ยังไม่มีบันทึกการใช้งาน')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
