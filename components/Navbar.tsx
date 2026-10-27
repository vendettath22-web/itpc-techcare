'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Headset, Languages, LogOut, NotebookTabs, Shield, UsersRound } from 'lucide-react';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import ImagePreview from '@/components/ImagePreview';
import AdminContactDialog from '@/components/AdminContactDialog';
import { useLanguage } from '@/lib/language';
import { clearSession, notifySessionChange, SESSION_KEY, useSessionCaretaker } from '@/lib/session';
import { requestApi } from '@/lib/api';
import { prepareProfilePhoto } from '@/lib/profile-image';

export default function Navbar() {
  const caretaker = useSessionCaretaker();
  const pathname = usePathname();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(caretaker?.name ?? '');
  const [profilePhone, setProfilePhone] = useState(caretaker?.phone ?? '');
  const [profileAge, setProfileAge] = useState(caretaker?.age ? String(caretaker.age) : '');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [profileError, setProfileError] = useState('');
  const [showAdminContact, setShowAdminContact] = useState(false);
  const { confirm, dialog } = useConfirmDialog();
  const { language, setLanguage, t } = useLanguage();

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

  async function openProfile() {
    try {
      const current = await requestApi<Pick<NonNullable<typeof caretaker>, 'id' | 'name' | 'role' | 'phone' | 'age'>>('getSession');
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(current));
      notifySessionChange();
      setProfileName(current.name);
      setProfilePhone(current.phone ?? '');
      setProfileAge(current.age ? String(current.age) : '');
      setProfilePhoto('');
      setProfileError('');
      setEditingProfile(true);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'โหลดข้อมูลโปรไฟล์ไม่สำเร็จ');
      setEditingProfile(true);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!await confirm({
      title: 'บันทึกการแก้ไขโปรไฟล์?',
      description: 'ชื่อ เบอร์โทร อายุ และรูปโปรไฟล์จะถูกอัปเดต',
      confirmLabel: 'บันทึก',
    })) return;
    setProfileError('');
    try {
      const updated = await requestApi<Pick<NonNullable<typeof caretaker>, 'id' | 'name' | 'role' | 'phone' | 'age'>>(
        'updateCaretakerProfile',
        {
          name: profileName,
          phone: profilePhone,
          age: profileAge,
          photoDataUrl: profilePhoto || null,
        },
      );
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
      notifySessionChange();
      setEditingProfile(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'บันทึกข้อมูลส่วนตัวไม่สำเร็จ');
    }
  }

  const navItems = [
    { href: '/', label: t('ปฏิทินเคส'), icon: NotebookTabs },
    { href: '/students', label: t('จัดการนักเรียน'), icon: UsersRound },
    ...(caretaker?.role === 'admin' ? [{ href: '/admin', label: t('ผู้ดูแลระบบ'), icon: Shield }] : []),
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-[#eee8f0] bg-white/90 shadow-[0_4px_18px_rgba(49,31,59,0.04)] backdrop-blur-xl">
      {dialog}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Image
            src="/takecare/itpc-takecare-logo-v2.png"
            alt="ITPC Takecare ระบบช่วยเหลือดูแลนักเรียน"
            width={145}
            height={55}
            priority
            className="h-auto w-[125px] sm:w-[145px]"
          />
        </Link>
        <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto sm:gap-1.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  active ? 'bg-primary-light text-primary' : 'text-gray-600 hover:bg-[#f8f5fa] hover:text-[#4b315a]'
                }`}
              >
                <Icon size={17} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <span className="hidden max-w-44 truncate rounded-full bg-[#f7f3f9] px-3 py-2 text-xs font-medium text-[#594563] lg:inline">
            {caretaker?.name ?? ''}
            {caretaker?.role === 'admin' ? ' · admin' : ''}
          </span>
          <button type="button" aria-label="Change language" onClick={() => setLanguage(language === 'th' ? 'en' : 'th')} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-[#d8c6e1] hover:bg-[#fbf9fc] sm:text-sm">
            <Languages size={15} />{language === 'th' ? 'EN' : 'ไทย'}
          </button>
          <button type="button" aria-label={t('ติดต่อแอดมิน')} onClick={() => setShowAdminContact(true)} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-[#d8c6e1] hover:bg-[#fbf9fc] sm:text-sm">
            <Headset size={15} /><span className="hidden sm:inline">{t('ติดต่อแอดมิน')}</span>
          </button>
          <button type="button" onClick={() => void openProfile()} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-[#d8c6e1] hover:bg-[#fbf9fc] sm:text-sm">{t('แก้ไขโปรไฟล์')}</button>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 sm:text-sm"
          >
            <LogOut size={16} />
            {t('ออกจากระบบ')}
          </button>
        </div>
      </div>
      {logoutError && <p role="alert" className="mx-auto max-w-7xl px-4 pb-2 text-sm text-red-600">{logoutError}</p>}
      <AdminContactDialog open={showAdminContact} onClose={() => setShowAdminContact(false)} />
      {editingProfile && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
        <form onSubmit={saveProfile} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
          <h2 className="text-lg font-bold text-gray-800">{t('แก้ไขข้อมูลส่วนตัว')}</h2>
          <label className="mt-4 block text-sm text-gray-600">{t('ชื่อที่แสดง')}
            <input required value={profileName} onChange={(event) => setProfileName(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-gray-800" />
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-gray-600">{t('เบอร์มือถือ')}
              <input type="tel" inputMode="tel" pattern="[0-9+() -]{8,20}" value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-gray-800" />
            </label>
            <label className="block text-sm text-gray-600">{t('อายุ')}
              <input type="number" min={18} max={120} value={profileAge} onChange={(event) => setProfileAge(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-gray-800" />
            </label>
          </div>
          <label className="mt-3 block text-sm text-gray-600">{t('รูปโปรไฟล์')}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void prepareProfilePhoto(file).then(setProfilePhoto).catch((photoError: unknown) => setProfileError(photoError instanceof Error ? photoError.message : 'เตรียมรูปภาพไม่สำเร็จ'));
            }} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
          </label>
          {profilePhoto && <ImagePreview src={profilePhoto} alt="ตัวอย่างรูปโปรไฟล์" width={64} height={64} className="mt-3 h-16 w-16" />}
          <p className="mt-2 text-xs text-gray-500">{t('หากต้องการเปลี่ยน PIN กรุณาติดต่อ admin')}</p>
          {profileError && <p role="alert" className="mt-3 text-sm text-red-600">{profileError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setEditingProfile(false)} className="rounded-lg px-3 py-2 text-sm text-gray-600">{t('ยกเลิก')}</button>
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">{t('บันทึก')}</button>
          </div>
        </form>
      </div>}
    </header>
  );
}
