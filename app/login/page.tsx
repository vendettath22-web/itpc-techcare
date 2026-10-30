'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff, Headset, LockKeyhole, UserRound } from 'lucide-react';
import AdminContactDialog from '@/components/AdminContactDialog';
import { requestApi } from '@/lib/api';
import { notifySessionChange, SESSION_KEY } from '@/lib/session';
import { useLanguage } from '@/lib/language';
import type { Caretaker } from '@/types/database';

export default function LoginPage() {
  const [caretakers, setCaretakers] = useState<Pick<Caretaker, 'id' | 'name'>[]>([]);
  const [selectedCaretakerId, setSelectedCaretakerId] = useState('');
  const [loadingCaretakers, setLoadingCaretakers] = useState(true);
  const [caretakerListAttempt, setCaretakerListAttempt] = useState(0);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAdminContact, setShowAdminContact] = useState(false);
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();

  useEffect(() => {
    let active = true;
    async function loadCaretakers() {
      try {
        const data = await requestApi<Pick<Caretaker, 'id' | 'name'>[]>('listLoginCaretakers');
        if (!active) return;
        setCaretakers(data);
        setError('');
      } catch (loadError) {
        if (!active) return;
        setError(`โหลดรายชื่อครูไม่สำเร็จ: ${loadError instanceof Error ? loadError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
      } finally {
        if (active) setLoadingCaretakers(false);
      }
    }
    void loadCaretakers();
    return () => { active = false; };
  }, [caretakerListAttempt]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCaretakerId) {
      setError('กรุณาเลือกครูก่อน');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const caretaker = await requestApi<Pick<Caretaker, 'id' | 'name' | 'role'>>(
        'verifyCaretakerPin',
        { caretakerId: selectedCaretakerId, pin },
      );
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(caretaker));
      notifySessionChange();
      router.replace('/');
    } catch (loginError) {
      setError(`เข้าสู่ระบบไม่สำเร็จ: ${loginError instanceof Error ? loginError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#faf8fc] px-4 py-8 sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#efe5f5] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -right-36 h-96 w-96 rounded-full bg-[#f1e9f5] blur-3xl" />
      <section className="relative w-full max-w-[440px] rounded-[1.75rem] border border-white bg-white px-6 py-8 shadow-[0_24px_70px_rgba(63,35,78,0.12)] sm:px-10 sm:py-10">
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={() => setLanguage(language === 'th' ? 'en' : 'th')} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600">{language === 'th' ? 'EN' : 'ไทย'}</button>
        </div>
        <div className="mx-auto w-full max-w-[270px]">
          <Image
            src="/itpc-takecare-logo-v2.png"
            alt="ITPC Takecare ระบบช่วยเหลือดูแลนักเรียน"
            width={824}
            height={311}
            priority
            className="h-auto w-full"
          />
        </div>
        <div className="mt-8 text-center">
          <p className="text-base font-medium text-primary">{t('ยินดีต้อนรับ')}</p>
          <h1 className="mt-1 text-base font-semibold tracking-tight text-[#2b2132]">{t('เข้าสู่ระบบ')}</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">{t('เลือกชื่อของคุณ แล้วกรอกรหัส PIN เพื่อเริ่มใช้งาน')}</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="caretaker">{t('ครูผู้ดูแล')}</label>
              <div className="relative">
                <UserRound size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  id="caretaker"
                  value={selectedCaretakerId}
                  onChange={(event) => {
                    setSelectedCaretakerId(event.target.value);
                    setError('');
                  }}
                  className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-3.5 pl-11 pr-4 text-sm transition hover:border-[#c5acd2] focus:border-primary"
                  required
                  disabled={loadingCaretakers || caretakers.length === 0}
                >
                  <option value="" disabled>{loadingCaretakers ? t('กำลังโหลดรายชื่อครู...') : t('เลือกชื่อครู')}</option>
                  {caretakers.map((caretaker) => (
                    <option key={caretaker.id} value={caretaker.id}>{caretaker.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="pin">{t('รหัส PIN')}</label>
              <div className="flex items-center rounded-xl border border-gray-200 bg-white transition focus-within:border-primary focus-within:ring-4 focus-within:ring-[#70418a]/10">
                <LockKeyhole size={18} aria-hidden="true" className="ml-4 shrink-0 text-gray-400" />
                <input
                  id="pin"
                  autoComplete="current-password"
                  inputMode="numeric"
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  placeholder={t('กรอกรหัส PIN')}
                  className="min-w-0 flex-1 bg-transparent px-3 py-3.5 text-sm outline-none"
                  required
                  disabled={!selectedCaretakerId || loadingCaretakers}
                />
                <button
                  type="button"
                  aria-label={t(showPin ? 'ซ่อนรหัส PIN' : 'แสดงรหัส PIN')}
                  onClick={() => setShowPin((visible) => !visible)}
                  disabled={!selectedCaretakerId || loadingCaretakers}
                  className="mr-2 grid h-9 w-9 place-items-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                >
                  {showPin ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {!loadingCaretakers && caretakers.length === 0 && !error && (
              <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('ไม่พบรายชื่อครูที่ใช้งานอยู่')}</p>
            )}
            {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            {!loadingCaretakers && caretakers.length === 0 && error && (
              <button
                type="button"
                onClick={() => {
                  setLoadingCaretakers(true);
                  setError('');
                  setCaretakerListAttempt((attempt) => attempt + 1);
                }}
                className="text-sm font-semibold text-primary underline underline-offset-4"
              >
                {t('ลองโหลดรายชื่ออีกครั้ง')}
              </button>
            )}
            <button
              type="submit"
              disabled={loading || loadingCaretakers || caretakers.length === 0 || !selectedCaretakerId}
              className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(112,65,138,0.2)] transition hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-[0_12px_24px_rgba(112,65,138,0.25)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? t('กำลังตรวจสอบ...') : t('เข้าสู่ระบบ')}
            </button>
        </form>
        <div className="mt-6 flex flex-col items-center gap-2 text-center">
          <p className="text-xs text-gray-400">{t('หากเข้าใช้งานไม่ได้ กรุณาติดต่อผู้ดูแลระบบ')}</p>
          <button type="button" onClick={() => setShowAdminContact(true)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary-light">
            <Headset size={16} />{t('ติดต่อแอดมิน')}
          </button>
        </div>
      </section>
      <AdminContactDialog open={showAdminContact} onClose={() => setShowAdminContact(false)} />
    </main>
  );
}
