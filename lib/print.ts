export function printThaiDocument(title: string, content: string): boolean {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  const safeTitle = title.replace(/[&<>"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  })[character] ?? character);
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html lang="th"><head><meta charset="utf-8"><title>${safeTitle}</title>
    <style>
      @page { size: A4; margin: 18mm; }
      body { color: #29242d; font: 14px Tahoma, "Leelawadee UI", "Noto Sans Thai", sans-serif; line-height: 1.65; }
      h1 { color: #6f4d80; font-size: 22px; margin: 0 0 4px; }
      h2 { color: #6f4d80; font-size: 17px; margin: 22px 0 8px; border-bottom: 1px solid #e8e0eb; padding-bottom: 4px; }
      p { margin: 5px 0; } .muted { color: #6d6670; } .card { border: 1px solid #e8e0eb; border-radius: 8px; padding: 12px; margin: 8px 0; break-inside: avoid; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; } .signature { max-width: 260px; max-height: 90px; object-fit: contain; }
      @media print { a { color: inherit; text-decoration: none; } }
    </style></head><body>${content}
    <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
    </body></html>`);
  printWindow.document.close();
  return true;
}
