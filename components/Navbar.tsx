'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Headset, Languages, LogOut, Menu, NotebookTabs, Shield, UserRound, UsersRound, X } from 'lucide-react';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profilePhotoError, setProfilePhotoError] = useState('');
  const { confirm, dialog } = useConfirmDialog();
  const { language, setLanguage, t } = useLanguage();

  useEffect(() => {
    if (!caretaker?.id) return;
    let active = true;
    void requestApi<Pick<NonNullable<typeof caretaker>, 'id' | 'name' | 'role' | 'phone' | 'age' | 'profile_photo_url'>>('getSession')
      .then((current) => {
        if (!active) return;
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(current));
        notifySessionChange();
        setProfilePhotoError('');
      })
      .catch((error: unknown) => {
        if (active) setProfilePhotoError(error instanceof Error ? error.message : 'โหลดรูปโปรไฟล์ไม่สำเร็จ');
      });
    return () => { active = false; };
  }, [caretaker?.id]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const syncSidebar = () => setSidebarOpen(desktop.matches);
    syncSidebar();
    desktop.addEventListener('change', syncSidebar);
    return () => desktop.removeEventListener('change', syncSidebar);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', sidebarOpen ? '18rem' : '0rem');
  }, [sidebarOpen]);

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
      const current = await requestApi<Pick<NonNullable<typeof caretaker>, 'id' | 'name' | 'role' | 'phone' | 'age' | 'profile_photo_url'>>('getSession');
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
      const updated = await requestApi<Pick<NonNullable<typeof caretaker>, 'id' | 'name' | 'role' | 'phone' | 'age' | 'profile_photo_url'>>(
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

  const actionButtonClass = 'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#e2d9ed] transition hover:bg-white/10 hover:text-white';
  const activeNavClass = 'bg-[#624278] text-white shadow-[inset_3px_0_0_#d8b7ee]';

  function renderNavItems() {
    return navItems.map(({ href, label, icon: Icon }) => {
      const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
      return (
        <Link
          key={href}
          href={href}
          aria-current={active ? 'page' : undefined}
          onClick={() => {
            if (window.matchMedia('(max-width: 1023px)').matches) setSidebarOpen(false);
          }}
          className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition duration-200 ${
            active ? activeNavClass : 'text-[#d4c8df] hover:bg-white/10 hover:text-white'
          } w-full`}
        >
          <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
          {label}
        </Link>
      );
    });
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[#eee8f0] bg-white/95 shadow-[0_4px_18px_rgba(49,31,59,0.04)] backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <button
            type="button"
            aria-label={sidebarOpen ? t('ปิดเมนู') : t('เปิดเมนู')}
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#392747] transition hover:bg-[#f2eaf7]"
          >
            <Menu size={21} />
          </button>
          <Link href="/" className="flex min-w-0 flex-1 items-center justify-center">
            <Image
              src="/takecare/itpc-takecare-logo-v2.png"
              alt="ITPC Takecare ระบบช่วยเหลือดูแลนักเรียน"
              width={145}
              height={55}
              priority
              className="h-auto w-[124px]"
            />
          </Link>
          <span aria-hidden="true" className="h-10 w-10 shrink-0" />
        </div>
      </header>

      {sidebarOpen && <button
        type="button"
        aria-label={t('ปิดเมนู')}
        onClick={() => setSidebarOpen(false)}
        className="fixed inset-0 z-40 bg-[#160d20]/50 backdrop-blur-[2px] lg:hidden"
      />}
      <aside
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col overflow-y-auto border-r border-white/10 bg-gradient-to-b from-[#30203e] via-[#291a36] to-[#21152c] px-4 py-4 shadow-[12px_0_36px_rgba(20,10,30,0.3)] transition-transform duration-300 ease-in-out lg:z-40 lg:w-72 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-5 flex items-center gap-2 rounded-2xl bg-white px-3 py-3">
          <Link href="/" className="flex min-w-0 flex-1 items-center justify-center">
          <Image
            src="/takecare/itpc-takecare-logo-v2.png"
            alt="ITPC Takecare ระบบช่วยเหลือดูแลนักเรียน"
            width={174}
            height={66}
            priority
            className="h-auto w-[174px]"
          />
          </Link>
          <button
            type="button"
            aria-label={t('ปิดเมนู')}
            onClick={() => setSidebarOpen(false)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#392747] transition hover:bg-[#f2eaf7] lg:hidden"
          >
            <X size={19} />
          </button>
          <button
            type="button"
            aria-label={t('ซ่อนเมนู')}
            onClick={() => setSidebarOpen(false)}
            className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg text-[#392747] transition hover:bg-[#f2eaf7] lg:grid"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#ad9cba]">{t('เมนูหลัก')}</div>
        <nav aria-label={t('เมนูหลัก')} className="flex flex-col gap-1">
          {renderNavItems()}
        </nav>
        <div className="mt-8">
          <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3.5">
            <div className="flex items-center gap-3">
              {caretaker?.profile_photo_url ? (
                <Image
                  src={caretaker.profile_photo_url}
                  alt={`${t('รูปโปรไฟล์')} ${caretaker.name}`}
                  width={44}
                  height={44}
                  unoptimized
                  className="h-11 w-11 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#76598a] text-sm font-bold text-white">
                  {caretaker?.name?.trim().charAt(0) || 'U'}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{caretaker?.name ?? ''}</p>
                <p className="mt-0.5 text-xs text-[#c8bad4]">{caretaker?.role === 'admin' ? 'Admin' : t('ผู้ดูแล')}</p>
              </div>
            </div>
          </div>
          {profilePhotoError && <p role="alert" className="mb-2 px-2 text-xs text-red-300">{profilePhotoError}</p>}
          <div className="grid grid-cols-1 gap-1">
            <button type="button" aria-label="Change language" onClick={() => setLanguage(language === 'th' ? 'en' : 'th')} className={actionButtonClass}>
              <Languages size={17} />{language === 'th' ? 'EN' : 'ไทย'}
            </button>
            <button type="button" onClick={() => void openProfile()} className={actionButtonClass}>
              <UserRound size={17} />{t('แก้ไขโปรไฟล์')}
            </button>
            <button type="button" onClick={() => setShowAdminContact(true)} className={actionButtonClass}>
              <Headset size={17} />{t('ติดต่อแอดมิน')}
            </button>
            <button type="button" onClick={() => void logout()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#e2d9ed] transition hover:bg-red-500/15 hover:text-red-200">
              <LogOut size={17} />{t('ออกจากระบบ')}
            </button>
          </div>
          {logoutError && <p role="alert" className="mt-3 px-2 text-sm text-red-300">{logoutError}</p>}
        </div>
      </aside>

      {!sidebarOpen && <button
        type="button"
        aria-label={t('เปิดเมนู')}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen(true)}
        className="fixed left-4 top-4 z-40 hidden h-10 w-10 place-items-center rounded-xl bg-[#30203e] text-white shadow-lg transition hover:bg-[#422c54] lg:grid"
      >
        <Menu size={20} />
      </button>}
      {logoutError && <p role="alert" className="fixed left-4 top-16 z-50 hidden rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 lg:block">{logoutError}</p>}
      {dialog}
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
    </>
  );
}
