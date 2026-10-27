'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { LogOut, NotebookTabs, Shield, UsersRound } from 'lucide-react';
import { clearSession, notifySessionChange, SESSION_KEY, useSessionCaretaker } from '@/lib/session';
import { requestApi } from '@/lib/api';

export default function Navbar() {
  const caretaker = useSessionCaretaker();
  const pathname = usePathname();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(caretaker?.name ?? '');
  const [profileError, setProfileError] = useState('');

  async function logout() {
    try {
      await requestApi<null>('logout');
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'ออกจากระบบไม่สำเร็จ');
      return;
    }
    clearSession();
    router.replace('/login');
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError('');
    try {
      const updated = await requestApi<Pick<NonNullable<typeof caretaker>, 'id' | 'name' | 'role'>>(
        'updateCaretakerProfile',
        { name: profileName },
      );
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
      notifySessionChange();
      setEditingProfile(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'บันทึกข้อมูลส่วนตัวไม่สำเร็จ');
    }
  }

  const navItems = [
    { href: '/', label: 'ปฏิทินเคส', icon: NotebookTabs },
    { href: '/students', label: 'จัดการนักเรียน', icon: UsersRound },
    ...(caretaker?.role === 'admin' ? [{ href: '/admin', label: 'ผู้ดูแลระบบ', icon: Shield }] : []),
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-[#eee9ef] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/takecare/logo.svg" alt="" width={42} height={42} priority />
          <span>
            <span className="block font-bold leading-tight text-[#44394b]">itpctakecare</span>
            <span className="text-xs text-gray-500">ระบบดูแลช่วยเหลือนักเรียน</span>
          </span>
        </Link>
        <nav className="order-3 flex w-full gap-2 sm:order-none sm:w-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  active ? 'bg-primary-light text-primary' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon size={17} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-gray-600 sm:inline">
            {caretaker?.name ?? ''}
            {caretaker?.role === 'admin' ? ' · admin' : ''}
          </span>
          <button type="button" onClick={() => { setProfileName(caretaker?.name ?? ''); setEditingProfile(true); }} className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">แก้ไขโปรไฟล์</button>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <LogOut size={16} />
            ออกจากระบบ
          </button>
        </div>
      </div>
      {logoutError && <p role="alert" className="mx-auto max-w-7xl px-4 pb-2 text-sm text-red-600">{logoutError}</p>}
      {editingProfile && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
        <form onSubmit={saveProfile} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
          <h2 className="text-lg font-bold text-gray-800">แก้ไขข้อมูลส่วนตัว</h2>
          <label className="mt-4 block text-sm text-gray-600">ชื่อที่แสดง
            <input required value={profileName} onChange={(event) => setProfileName(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-gray-800" />
          </label>
          {profileError && <p role="alert" className="mt-3 text-sm text-red-600">{profileError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setEditingProfile(false)} className="rounded-lg px-3 py-2 text-sm text-gray-600">ยกเลิก</button>
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">บันทึก</button>
          </div>
        </form>
      </div>}
    </header>
  );
}
