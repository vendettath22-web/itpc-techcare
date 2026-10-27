'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, UsersRound } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { requestApi } from '@/lib/api';
import { useSessionCaretaker } from '@/lib/session';
import type { Caretaker } from '@/types/database';

type CaretakerForm = { name: string; role: 'admin' | 'caretaker'; pin: string };

const emptyForm: CaretakerForm = { name: '', role: 'caretaker', pin: '' };

export default function AdminPage() {
  const router = useRouter();
  const user = useSessionCaretaker();
  const [caretakers, setCaretakers] = useState<Caretaker[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CaretakerForm>>({});
  const [newCaretaker, setNewCaretaker] = useState<CaretakerForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCaretakers = useCallback(async () => {
    try {
      const data = await requestApi<Caretaker[]>('adminListCaretakers');
      setCaretakers(data);
      setDrafts(Object.fromEntries(data.map((caretaker) => [caretaker.id, {
        name: caretaker.name,
        role: caretaker.role,
        pin: '',
      }])));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'โหลดบัญชีผู้ดูแลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user === undefined) return;
    if (!user || user.role !== 'admin') {
      router.replace(user ? '/' : '/login');
      return;
    }
    void Promise.resolve().then(loadCaretakers);
  }, [loadCaretakers, router, user]);

  async function createCaretaker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await requestApi('createCaretaker', newCaretaker);
      setNewCaretaker(emptyForm);
      setNotice('เพิ่มบัญชีผู้ดูแลแล้ว');
      await loadCaretakers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'เพิ่มบัญชีไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function updateCaretaker(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await requestApi('updateCaretaker', { id, ...draft });
      setNotice('บันทึกบัญชีแล้ว');
      await loadCaretakers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'แก้ไขบัญชีไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function deactivateCaretaker(caretaker: Caretaker) {
    if (!window.confirm(`ยืนยันปิดบัญชี ${caretaker.name}? บัญชีจะเข้าสู่ระบบไม่ได้ แต่ข้อมูลเดิมยังอยู่`)) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await requestApi('deactivateCaretaker', { id: caretaker.id });
      setNotice('ปิดบัญชีแล้ว');
      await loadCaretakers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'ปิดบัญชีไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  if (!user || user.role !== 'admin') {
    return <div className="grid min-h-screen place-items-center text-gray-500">กำลังตรวจสอบสิทธิ์ admin...</div>;
  }

  return (
    <main className="min-h-screen bg-[#faf9fb]">
      <Navbar />
      <section className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
        <div className="mb-6">
          <p className="text-sm font-medium text-primary">ตั้งค่าระบบ</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-800 sm:text-3xl">จัดการบัญชีผู้ดูแล</h1>
          <p className="mt-2 text-sm text-gray-500">ผู้ดูแลระบบเพิ่ม แก้ไขบทบาท เปลี่ยน PIN และปิดบัญชีได้</p>
        </div>

        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</p>}

        <form onSubmit={createCaretaker} className="mb-7 rounded-2xl border border-[#eee9ef] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 font-semibold text-gray-800"><UserPlus size={19} className="text-primary" />เพิ่มบัญชี</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-gray-600">ชื่อผู้ดูแล
              <input required value={newCaretaker.name} onChange={(event) => setNewCaretaker({ ...newCaretaker, name: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
            </label>
            <label className="text-sm text-gray-600">PIN (4-12 หลัก)
              <input required minLength={4} maxLength={12} pattern="[0-9]{4,12}" inputMode="numeric" value={newCaretaker.pin} onChange={(event) => setNewCaretaker({ ...newCaretaker, pin: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5" />
            </label>
            <label className="text-sm text-gray-600">บทบาท
              <select value={newCaretaker.role} onChange={(event) => setNewCaretaker({ ...newCaretaker, role: event.target.value as CaretakerForm['role'] })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5">
                <option value="caretaker">ผู้ดูแล</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <button disabled={saving} className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">{saving ? 'กำลังบันทึก...' : 'เพิ่มบัญชี'}</button>
        </form>

        <div className="mb-3 flex items-center gap-2"><UsersRound size={18} className="text-primary" /><h2 className="font-bold text-gray-800">บัญชีทั้งหมด ({caretakers.length})</h2></div>
        {loading ? <p className="py-12 text-center text-gray-500">กำลังโหลดบัญชี...</p> : (
          <div className="space-y-3">
            {caretakers.map((caretaker) => {
              const draft = drafts[caretaker.id] ?? { name: caretaker.name, role: caretaker.role, pin: '' };
              return (
                <article key={caretaker.id} className={`rounded-2xl border bg-white p-4 sm:p-5 ${caretaker.deactivated_at ? 'border-gray-200 opacity-70' : 'border-[#eee9ef]'}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-gray-800">{caretaker.name}<span className={`ml-2 rounded-full px-2 py-1 text-xs ${caretaker.role === 'admin' ? 'bg-primary-light text-primary' : 'bg-gray-100 text-gray-600'}`}>{caretaker.role === 'admin' ? 'Admin' : 'ผู้ดูแล'}</span></p>
                    <p className="text-xs text-gray-500">{caretaker.deactivated_at ? `ปิดบัญชี ${new Date(caretaker.deactivated_at).toLocaleString('th-TH')}` : 'ใช้งานอยู่'}</p>
                  </div>
                  {!caretaker.deactivated_at && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-[1fr_180px_1fr]">
                        <label className="text-xs text-gray-500">ชื่อ
                          <input value={draft.name} onChange={(event) => setDrafts({ ...drafts, [caretaker.id]: { ...draft, name: event.target.value } })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800" />
                        </label>
                        <label className="text-xs text-gray-500">บทบาท
                          <select value={draft.role} onChange={(event) => setDrafts({ ...drafts, [caretaker.id]: { ...draft, role: event.target.value as CaretakerForm['role'] } })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800">
                            <option value="caretaker">ผู้ดูแล</option>
                            <option value="admin">Admin</option>
                          </select>
                        </label>
                        <label className="text-xs text-gray-500">ตั้ง PIN ใหม่ (เว้นว่างถ้าไม่เปลี่ยน)
                          <input minLength={4} maxLength={12} pattern="[0-9]{4,12}" inputMode="numeric" value={draft.pin} onChange={(event) => setDrafts({ ...drafts, [caretaker.id]: { ...draft, pin: event.target.value } })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800" />
                        </label>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button disabled={saving || caretaker.id === user.id} onClick={() => void deactivateCaretaker(caretaker)} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40">ปิดบัญชี</button>
                        <button disabled={saving} onClick={() => void updateCaretaker(caretaker.id)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60">บันทึก</button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
            {!caretakers.length && <p className="rounded-2xl border border-dashed border-gray-300 bg-white py-12 text-center text-gray-500">ยังไม่มีบัญชีผู้ดูแล</p>}
          </div>
        )}
      </section>
    </main>
  );
}
