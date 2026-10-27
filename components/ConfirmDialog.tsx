'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check } from 'lucide-react';
import { useLanguage } from '@/lib/language';

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
};

type PendingConfirmation = ConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

export function useConfirmDialog(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const { t } = useLanguage();

  const finish = useCallback((confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setPending({ ...options, resolve });
  }), []);

  useEffect(() => {
    if (!pending) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') finish(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finish, pending]);

  const dialog = mounted && pending ? createPortal((
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) finish(false);
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={pending.description ? 'confirm-dialog-description' : undefined}
        className="w-full max-w-sm rounded-2xl border border-white/80 bg-white p-5 shadow-[0_24px_80px_rgba(29,18,38,0.2)]"
      >
        <div className={`mb-4 grid h-11 w-11 place-items-center rounded-xl ${
          pending.tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-[#f3edf7] text-primary'
        }`}>
          {pending.tone === 'danger' ? <AlertTriangle size={21} /> : <Check size={21} />}
        </div>
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-gray-900">{t(pending.title)}</h2>
        {pending.description && (
          <p id="confirm-dialog-description" className="mt-2 text-sm leading-6 text-gray-500">{t(pending.description)}</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => finish(false)}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            {t('ยกเลิก')}
          </button>
          <button
            type="button"
            onClick={() => finish(true)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${
              pending.tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-hover'
            }`}
          >
            {t(pending.confirmLabel ?? 'ยืนยัน')}
          </button>
        </div>
      </section>
    </div>
  ), document.body) : null;

  return { confirm, dialog };
}
