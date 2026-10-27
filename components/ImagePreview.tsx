'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X } from 'lucide-react';
import { useLanguage } from '@/lib/language';

type Props = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
};

export default function ImagePreview({ src, alt, width = 48, height = 48, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${t('แสดงรูปภาพ')}: ${alt}`} className={`shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-primary ${className}`}>
        <Image src={src} alt={alt} width={width} height={height} unoptimized className="h-full w-full rounded-full object-cover" />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/75 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section role="dialog" aria-modal="true" aria-label={`รูปภาพ ${alt}`} className="relative max-h-[90vh] max-w-[90vw]">
            <button type="button" aria-label={t('ปิดรูปภาพ')} onClick={() => setOpen(false)} className="absolute -right-3 -top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white text-gray-700 shadow-lg">
              <X size={19} />
            </button>
            <Image src={src} alt={alt} width={900} height={900} unoptimized className="max-h-[85vh] w-auto max-w-[88vw] rounded-2xl object-contain shadow-2xl" />
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
