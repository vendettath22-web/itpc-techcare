'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LockKeyhole } from 'lucide-react';
import { requestApi } from '@/lib/api';
import { notifySessionChange, SESSION_KEY } from '@/lib/session';
import type { Caretaker } from '@/types/database';

export default function LoginPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const caretaker = await requestApi<Pick<Caretaker, 'id' | 'name' | 'role'>>('verifyCaretakerPin', { pin });
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
    <main className="flex min-h-screen items-center justify-center bg-[#f7f6f3] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-[0_20px_70px_rgba(79,54,93,0.12)] sm:p-10">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-primary-light text-primary">
          <Image src="/takecare/logo.svg" alt="" width={56} height={56} priority />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold tracking-wide text-primary">itpctakecare</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-800">เข้าสู่ระบบผู้ดูแล</h1>
          <p className="mt-2 text-sm text-gray-500">กรอกรหัส PIN เพื่อเข้าใช้งานระบบ</p>
        </div>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-gray-700" htmlFor="pin">
            รหัส PIN
          </label>
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 focus-within:border-primary">
            <LockKeyhole size={18} className="text-gray-400" />
            <input
              id="pin"
              autoComplete="current-password"
              inputMode="numeric"
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              className="w-full py-3 outline-none"
              required
            />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </section>
    </main>
  );
}
