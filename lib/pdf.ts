import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const LOGO_PATH = '/itpc-takecare-logo-v2.png';

function safeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '-');
}

export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename(filename)}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function createThaiPdfBlob(title: string, content: string): Promise<Blob> {
  const report = document.createElement('div');
  report.style.cssText = 'position:fixed;left:0;top:0;width:794px;background:#ffffff;opacity:0;pointer-events:none;z-index:-1;';
  report.innerHTML = `
    <style>
      .pdf-report { box-sizing:border-box; display:flex; min-height:1060px; flex-direction:column; width:794px; padding:4px 26px 18px; color:#302638; background:#fff; font:12.5px/1.35 Tahoma,"Leelawadee UI","Noto Sans Thai",sans-serif; }
      .pdf-report * { box-sizing:border-box; }
      .pdf-brand { display:flex; align-items:center; justify-content:space-between; gap:18px; padding:0 0 5px; border-bottom:2px solid #70418a; }
      .pdf-brand img { display:block; width:165px; height:auto; }
      .pdf-report h1 { margin:7px 0 2px; color:#432753; font-size:21px; font-weight:700; line-height:1.3; }
      .pdf-report h2 { margin:8px 0 5px; padding:6px 9px; border-left:4px solid #9a6bb0; border-radius:0 7px 7px 0; background:#f3edf7; color:#57356b; font-size:15px; font-weight:700; line-height:1.35; }
      .pdf-report h3 { margin:5px 0 3px; color:#654579; font-size:14px; font-weight:700; }
      .pdf-report p { margin:3px 0; overflow-wrap:anywhere; }
      .pdf-muted { color:#756b7b; font-size:10px; }
      .pdf-card { margin:6px 0; padding:7px 9px; border:1px solid #e8dfed; border-radius:8px; background:#fff; }
      .pdf-card:nth-of-type(even) { background:#fcfaff; }
      .pdf-record { margin:10px 0; padding:12px 16px; border-left:3px solid #c9afd8; border-radius:0 8px 8px 0; background:#faf7fc; }
      .pdf-report b { color:#4e395a; }
      .pdf-status { display:inline-block; padding:2px 7px; border-radius:999px; font-size:10px; font-weight:700; }
      .pdf-status-done { color:#276749; background:#e4f4e9; }
      .pdf-status-planned { color:#985b20; background:#fff0d9; }
      .pdf-signature-card { display:flex; justify-content:flex-end; margin:6px 0; padding:8px 10px; break-inside:avoid; page-break-inside:avoid; }
      .pdf-signature-block { display:flex; width:270px; min-height:130px; flex-direction:column; align-items:center; justify-content:flex-end; text-align:center; }
      .pdf-signature { display:block; width:210px; height:64px; max-width:100%; margin:0 auto -4px; object-fit:contain; object-position:center bottom; }
      .pdf-signature-name { width:100%; padding-top:5px; border-top:1px solid #6c6470; font-size:12px; overflow-wrap:anywhere; }
      .pdf-signature-role,.pdf-signature-date { color:#756b7b; font-size:11px; overflow-wrap:anywhere; }
      .pdf-student-profile { display:flex; align-items:center; gap:14px; margin:6px 0 7px; padding:7px 9px; border:1px solid #e8dfed; border-radius:9px; background:linear-gradient(120deg,#faf7fc,#fff); }
      .pdf-student-photo { display:block; width:66px; height:66px; flex:none; padding:3px; border:1px solid #e8dfed; border-radius:8px; background:#fff; object-fit:contain; object-position:center; }
      .pdf-student-heading { min-width:0; flex:1; }
      .pdf-student-kicker { margin:0 0 3px!important; color:#806691; font-size:15px; font-weight:700; letter-spacing:.03em; }
      .pdf-student-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); overflow:hidden; border:1px solid #e8dfed; border-radius:6px; background:#e8dfed; gap:1px; }
      .pdf-info-item { min-width:0; padding:4px 6px; background:#fff; }
      .pdf-info-item-wide { grid-column:span 2; }
      .pdf-info-item span { display:block; color:#756b7b; font-size:9px; line-height:1.25; }
      .pdf-info-item strong { display:block; color:#35223f; font-size:12px; font-weight:600; line-height:1.3; overflow-wrap:anywhere; }
      .pdf-report h2.pdf-section-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:8px 0 5px; padding:6px 9px; border-left:4px solid #9a6bb0; border-radius:0 7px 7px 0; background:#f3edf7; color:#57356b; font-size:15px; font-weight:700; line-height:1.35; }
      .pdf-case-card { display:flex; flex:1 0 auto; flex-direction:column; justify-content:space-between; margin:4px 0; padding:6px 8px; border:1px solid #e8dfed; border-radius:8px; background:#fff; }
      .pdf-case-header { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding-bottom:4px; border-bottom:1px solid #eee8f1; }
      .pdf-report h3.pdf-case-title { margin:0!important; color:#432753; font-size:13px; font-weight:700; }
      .pdf-case-date { margin:2px 0 0!important; color:#756b7b; font-size:11px; }
      .pdf-case-details { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:2px 12px; padding:4px 0; }
      .pdf-case-details p { min-width:0; }
      .pdf-case-details p.pdf-full-width { grid-column:1 / -1; }
      .pdf-case-details p { margin:0; font-size:12px; }
      .pdf-case-description { margin:0!important; padding:4px 6px; border-radius:6px; background:#faf8fc; white-space:pre-wrap; font-size:12px; }
      .pdf-case-section-title { margin:4px 0 2px!important; color:#654579; font-size:14px!important; font-weight:700; }
      .pdf-update { margin:3px 0; padding:4px 6px; border-left:2px solid #c9afd8; border-radius:0 6px 6px 0; background:#faf7fc; }
      .pdf-update p { margin:1px 0; font-size:12px; }
      .pdf-empty { margin:6px 0; padding:8px; border:1px dashed #d9cbe1; border-radius:7px; background:#fcfaff; color:#756b7b; text-align:center; font-size:12px; }
      @media print { .pdf-card,.pdf-record { break-inside:avoid; } }
    </style>
    <article class="pdf-report">
      <header class="pdf-brand">
        <img src="${LOGO_PATH}" alt="ITPC Takecare">
      </header>
      <h1>${title}</h1>
      ${content}
    </article>`;
  document.body.append(report);

  try {
    await Promise.all(
      Array.from(report.querySelectorAll('img'), (image) => image.decode()),
    );
    const canvas = await html2canvas(report, {
      windowWidth: 794,
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      onclone: (_document, clonedReport) => {
        clonedReport.style.opacity = '1';
        clonedReport.style.position = 'static';
        clonedReport.style.left = '0';
        clonedReport.style.top = '0';
        clonedReport.style.zIndex = 'auto';
      },
    });
    if (!canvas.width || !canvas.height) throw new Error('ไม่สามารถสร้างภาพรายงานได้');
    const pageWidth = 210;
    const pageHeight = 297;
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });
    const fitScale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const imageWidth = canvas.width * fitScale;
    const imageHeight = canvas.height * fitScale;
    pdf.addImage(
      canvas.toDataURL('image/jpeg', 0.94),
      'JPEG',
      (pageWidth - imageWidth) / 2,
      8,
      imageWidth,
      imageHeight,
    );
    return pdf.output('blob');
  } finally {
    report.remove();
  }
}

export async function downloadThaiPdf(title: string, content: string, filename: string): Promise<void> {
  downloadPdfBlob(await createThaiPdfBlob(title, content), filename);
}
