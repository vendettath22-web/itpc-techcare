import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const LOGO_PATH = '/takecare/itpc-takecare-logo-v2.png';

function safeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '-');
}

export async function downloadThaiPdf(title: string, content: string, filename: string): Promise<void> {
  const report = document.createElement('div');
  report.style.cssText = 'position:fixed;left:0;top:0;width:794px;background:#ffffff;opacity:0;pointer-events:none;z-index:-1;';
  report.innerHTML = `
    <style>
      .pdf-report { box-sizing:border-box; width:794px; padding:38px 44px; color:#302638; background:#fff; font:16px/1.65 Tahoma,"Leelawadee UI","Noto Sans Thai",sans-serif; }
      .pdf-report * { box-sizing:border-box; }
      .pdf-brand { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:0 0 20px; border-bottom:3px solid #70418a; }
      .pdf-brand img { display:block; width:210px; height:auto; }
      .pdf-brand-note { color:#785d85; font-size:13px; font-weight:600; }
      .pdf-report h1 { margin:25px 0 6px; color:#432753; font-size:26px; line-height:1.35; }
      .pdf-report h2 { margin:25px 0 11px; padding:10px 14px; border-left:5px solid #9a6bb0; border-radius:0 9px 9px 0; background:#f3edf7; color:#57356b; font-size:19px; line-height:1.4; }
      .pdf-report h3 { margin:16px 0 8px; color:#654579; font-size:16px; }
      .pdf-report p { margin:6px 0; overflow-wrap:anywhere; }
      .pdf-muted { color:#756b7b; font-size:13px; }
      .pdf-card { margin:12px 0; padding:16px 18px; border:1px solid #e8dfed; border-radius:12px; background:#fff; }
      .pdf-card:nth-of-type(even) { background:#fcfaff; }
      .pdf-record { margin:10px 0; padding:12px 16px; border-left:3px solid #c9afd8; border-radius:0 8px 8px 0; background:#faf7fc; }
      .pdf-report b { color:#4e395a; }
      .pdf-status { display:inline-block; padding:3px 10px; border-radius:999px; font-size:13px; font-weight:700; }
      .pdf-status-done { color:#276749; background:#e4f4e9; }
      .pdf-status-planned { color:#985b20; background:#fff0d9; }
      .pdf-signature-card { display:flex; align-items:center; justify-content:space-between; gap:20px; break-inside:avoid; }
      .pdf-signature { max-width:220px; max-height:90px; object-fit:contain; }
      .pdf-student-profile { display:flex; align-items:center; gap:20px; margin:22px 0 18px; padding:20px; border:1px solid #e8dfed; border-radius:16px; background:linear-gradient(120deg,#faf7fc,#fff); }
      .pdf-student-photo { display:block; width:82px; height:82px; flex:none; padding:3px; border:1px solid #e8dfed; border-radius:14px; background:#fff; object-fit:contain; object-position:center; }
      .pdf-student-heading { min-width:0; flex:1; }
      .pdf-student-kicker { margin:0 0 4px!important; color:#806691; font-size:12px; font-weight:700; letter-spacing:.04em; }
      .pdf-report h2.pdf-student-name { margin:0!important; padding:0; border:0; border-radius:0; background:none; color:#35223f; font-size:24px; line-height:1.35; }
      .pdf-student-subtitle { margin:6px 0 0!important; color:#756b7b; font-size:13px; }
      .pdf-student-count { min-width:78px; padding:10px 12px; border-radius:12px; background:#f0e8f5; color:#70418a; text-align:center; }
      .pdf-student-count strong { display:block; font-size:24px; line-height:1.2; }
      .pdf-student-count span { display:block; margin-top:3px; font-size:11px; font-weight:600; }
      .pdf-report h2.pdf-section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:25px 0 11px; padding:10px 14px; border-left:5px solid #9a6bb0; border-radius:0 9px 9px 0; background:#f3edf7; color:#57356b; font-size:18px; line-height:1.4; }
      .pdf-info-grid { display:flex; flex-wrap:wrap; gap:1px; overflow:hidden; border:1px solid #e8dfed; border-radius:12px; background:#e8dfed; }
      .pdf-info-item { width:calc(50% - .5px); min-height:56px; flex-grow:1; padding:10px 14px; background:#fff; }
      .pdf-info-item span { display:block; margin-bottom:3px; color:#756b7b; font-size:11px; }
      .pdf-info-item strong { display:block; color:#35223f; font-size:14px; font-weight:600; overflow-wrap:anywhere; }
      .pdf-case-card { margin:12px 0; padding:16px 18px; border:1px solid #e8dfed; border-radius:13px; background:#fff; }
      .pdf-case-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding-bottom:11px; border-bottom:1px solid #eee8f1; }
      .pdf-report h3.pdf-case-title { margin:0!important; color:#432753; font-size:17px; }
      .pdf-case-date { margin:4px 0 0!important; color:#756b7b; font-size:12px; }
      .pdf-case-details { display:flex; flex-wrap:wrap; column-gap:18px; row-gap:7px; padding:10px 0; }
      .pdf-case-details p { width:calc(50% - 9px); }
      .pdf-case-details p.pdf-full-width { width:100%; }
      .pdf-case-details p { margin:0; font-size:13px; }
      .pdf-case-description { margin:0!important; padding:10px 12px; border-radius:8px; background:#faf8fc; white-space:pre-wrap; font-size:13px; }
      .pdf-case-section-title { margin:14px 0 7px!important; color:#654579; font-size:14px!important; }
      .pdf-update { margin:8px 0; padding:10px 13px; border-left:3px solid #c9afd8; border-radius:0 8px 8px 0; background:#faf7fc; }
      .pdf-update p { margin:3px 0; font-size:12px; }
      .pdf-empty { margin:12px 0; padding:16px; border:1px dashed #d9cbe1; border-radius:10px; background:#fcfaff; color:#756b7b; text-align:center; font-size:13px; }
      .pdf-count-badge { flex:none; padding:3px 9px; border-radius:999px; background:#fff; color:#70418a; font-size:12px; }
      @media print { .pdf-card,.pdf-record { break-inside:avoid; } }
    </style>
    <article class="pdf-report">
      <header class="pdf-brand">
        <img src="${LOGO_PATH}" alt="ITPC Takecare">
        <span class="pdf-brand-note">ระบบช่วยเหลือดูแลนักเรียน</span>
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
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    const pagePixelHeight = Math.floor((canvas.width * pageHeight) / pageWidth);
    const context = pageCanvas.getContext('2d');
    if (!context) throw new Error('ไม่สามารถจัดหน้า PDF ได้');

    for (let offsetY = 0; offsetY < canvas.height; offsetY += pagePixelHeight) {
      const sliceHeight = Math.min(pagePixelHeight, canvas.height - offsetY);
      pageCanvas.height = sliceHeight;
      context.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(
        canvas,
        0,
        offsetY,
        canvas.width,
        sliceHeight,
        0,
        0,
        pageCanvas.width,
        sliceHeight,
      );
      if (offsetY > 0) pdf.addPage();
      pdf.addImage(
        pageCanvas.toDataURL('image/jpeg', 0.94),
        'JPEG',
        0,
        0,
        pageWidth,
        (sliceHeight / canvas.width) * pageWidth,
      );
    }
    pdf.save(`${safeFilename(filename)}.pdf`);
  } finally {
    report.remove();
  }
}
