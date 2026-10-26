'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { HeartHandshake, LockKeyhole, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { notifySessionChange, SESSION_KEY } from '@/lib/session';
import type { Caretaker } from '@/types/database';

export default function LoginPage() {
  const [caretakers, setCaretakers] = useState<Pick<Caretaker, 'id' | 'name'>[]>([]);
  const [selectedCaretakerId, setSelectedCaretakerId] = useState('');
  const [loadingCaretakers, setLoadingCaretakers] = useState(true);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function loadCaretakers() {
      const { data, error: loadError } = await supabase
        .from('caretakers')
        .select('id, name')
        .order('name');

      if (!active) return;
      if (loadError) {
        setError(`โหลดรายชื่ออาจารย์ไม่สำเร็จ: ${loadError.message}`);
      } else {
        setCaretakers(data ?? []);
      }
      setLoadingCaretakers(false);
    }

    void Promise.resolve().then(loadCaretakers).catch((loadError: unknown) => {
      if (!active) return;
      setError(`โหลดรายชื่ออาจารย์ไม่สำเร็จ: ${loadError instanceof Error ? loadError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
      setLoadingCaretakers(false);
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCaretakerId) {
      setError('กรุณาเลือกอาจารย์ก่อน');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const { data, error: rpcError } = await supabase.rpc('verify_caretaker_pin', {
        p_pin: pin,
      });

      if (rpcError) {
        setError(`เข้าสู่ระบบไม่สำเร็จ: ${rpcError.message}`);
        return;
      }

      const result: unknown = Array.isArray(data) ? data[0] : data;
      const caretaker = result as Pick<Caretaker, 'id' | 'name'> | null;
      if (
        !caretaker?.id ||
        !caretaker.name ||
        caretaker.id !== selectedCaretakerId
      ) {
        setError('รหัส PIN ไม่ถูกต้องสำหรับอาจารย์ที่เลือก');
        return;
      }

      window.localStorage.setItem(SESSION_KEY, JSON.stringify(caretaker));
      document.cookie = `itpc_user_id=${encodeURIComponent(caretaker.id)}; path=/; max-age=604800; samesite=lax`;
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
          <HeartHandshake size={32} />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold tracking-wide text-primary">ITPC TECHCARE</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-800">เข้าสู่ระบบผู้ดูแล</h1>
          <p className="mt-2 text-sm text-gray-500">เลือกอาจารย์และกรอกรหัส PIN เพื่อเข้าใช้งาน</p>
        </div>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-gray-700" htmlFor="caretaker">
            อาจารย์
          </label>
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 focus-within:border-primary">
            <UserRound size={18} className="shrink-0 text-gray-400" />
            <select
              id="caretaker"
              value={selectedCaretakerId}
              onChange={(event) => {
                setSelectedCaretakerId(event.target.value);
                setError('');
              }}
              className="w-full bg-transparent py-3 outline-none"
              required
              disabled={loadingCaretakers || caretakers.length === 0}
            >
              <option value="" disabled>
                {loadingCaretakers ? 'กำลังโหลดรายชื่ออาจารย์...' : 'เลือกอาจารย์'}
              </option>
              {caretakers.map((caretaker) => (
                <option key={caretaker.id} value={caretaker.id}>
                  {caretaker.name}
                </option>
              ))}
            </select>
          </div>
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
              disabled={!selectedCaretakerId || loadingCaretakers}
              required
            />
          </div>
          {!loadingCaretakers && caretakers.length === 0 && !error && (
            <p role="alert" className="text-sm text-red-600">ไม่พบรายชื่ออาจารย์ในระบบ</p>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || loadingCaretakers || caretakers.length === 0 || !selectedCaretakerId}
            className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </section>
    </main>
  );
}
