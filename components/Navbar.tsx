'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, NotebookTabs, UsersRound } from 'lucide-react';
import { clearSession, useSessionCaretaker } from '@/lib/session';

export default function Navbar() {
  const caretaker = useSessionCaretaker();
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearSession();
    router.replace('/login');
  }

  const navItems = [
    { href: '/', label: 'ปฏิทินเคส', icon: NotebookTabs },
    { href: '/students', label: 'จัดการนักเรียน', icon: UsersRound },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-[#eee9ef] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-lg font-bold text-white">
            IT
          </span>
          <span>
            <span className="block font-bold leading-tight text-[#44394b]">ITPC Techcare</span>
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
          </span>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <LogOut size={16} />
            ออกจากระบบ
          </button>
        </div>
      </div>
    </header>
  );
}
