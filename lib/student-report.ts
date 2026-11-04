import { escapeHtml } from '@/lib/session';

export function createStudentReportDocument(title: string, content: string, logoUrl: string): string {
  const safeTitle = escapeHtml(title);
  const safeLogoUrl = escapeHtml(logoUrl);

  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: light; font-family: Arial, "Leelawadee UI", Tahoma, sans-serif; color: #302638; background: #f4f1f7; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 28px 16px; }
      .report { width: min(100%, 850px); min-height: 1100px; margin: 0 auto; padding: 42px 48px; background: #fff; box-shadow: 0 12px 40px #3924481a; }
      .brand { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 16px; border-bottom: 2px solid #70418a; }
      .brand img { display: block; width: 154px; height: auto; }
      .brand-label { color: #806691; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-align: right; }
      h1 { margin: 22px 0 4px; color: #432753; font-size: 25px; line-height: 1.35; }
      .report-date { margin: 0 0 18px; color: #756b7b; font-size: 12px; }
      .pdf-student-profile { display: flex; align-items: center; gap: 16px; margin: 0 0 22px; padding: 14px; border: 1px solid #e8dfed; border-radius: 12px; background: linear-gradient(120deg, #faf7fc, #fff); }
      .pdf-student-photo { display: block; width: 76px; height: 76px; flex: none; border: 1px solid #e8dfed; border-radius: 10px; background: #fff; object-fit: cover; }
      .pdf-student-heading { min-width: 0; flex: 1; }
      .pdf-student-kicker { margin: 0 0 8px; color: #70418a; font-size: 14px; font-weight: 700; }
      .pdf-student-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; overflow: hidden; border: 1px solid #e8dfed; border-radius: 7px; background: #e8dfed; }
      .pdf-info-item { min-width: 0; padding: 7px 8px; background: #fff; }
      .pdf-info-item-wide { grid-column: span 2; }
      .pdf-info-item span { display: block; margin-bottom: 3px; color: #756b7b; font-size: 10px; }
      .pdf-info-item strong { display: block; color: #35223f; font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
      .pdf-muted { margin: 0 0 14px; color: #756b7b; font-size: 12px; }
      .pdf-card { margin: 8px 0; padding: 11px 13px; border: 1px solid #e8dfed; border-radius: 9px; background: #fff; break-inside: avoid; }
      .pdf-card p { margin: 3px 0; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
      .pdf-section-heading { margin: 20px 0 10px; padding: 9px 12px; border-left: 4px solid #9a6bb0; border-radius: 0 8px 8px 0; background: #f3edf7; color: #57356b; font-size: 17px; }
      .pdf-case-card { margin: 10px 0; padding: 13px 15px; border: 1px solid #e8dfed; border-radius: 12px; background: #fff; }
      .pdf-case-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 9px; border-bottom: 1px solid #eee8f1; break-inside: avoid; }
      .pdf-case-title { margin: 0; color: #432753; font-size: 15px; }
      .pdf-case-date { margin: 4px 0 0; color: #756b7b; font-size: 12px; }
      .pdf-status { display: inline-block; flex: none; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
      .pdf-status-done { color: #276749; background: #e4f4e9; }
      .pdf-status-planned { color: #985b20; background: #fff0d9; }
      .pdf-case-details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 16px; padding: 10px 0; }
      .pdf-case-details p, .pdf-case-description, .pdf-update p { margin: 0; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
      .pdf-full-width { grid-column: 1 / -1; }
      .pdf-case-description { margin: 0 0 10px; padding: 9px 11px; border-radius: 8px; background: #faf8fc; white-space: pre-wrap; }
      .pdf-case-section-title { margin: 12px 0 6px; color: #654579; font-size: 14px; }
      .pdf-update { margin: 6px 0; padding: 8px 10px; border-left: 3px solid #c9afd8; border-radius: 0 8px 8px 0; background: #faf7fc; break-inside: avoid; }
      .pdf-update p + p { margin-top: 3px; }
      .pdf-empty { margin: 8px 0; padding: 10px; border: 1px dashed #d9cbe1; border-radius: 8px; color: #756b7b; text-align: center; font-size: 12px; }
      .pdf-signatures { margin-top: 4px; }
      .pdf-signature-list { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
      .pdf-signature-card { display: flex; width: min(100%, 240px); justify-content: center; margin: 0; padding: 10px; border: 1px solid #e8dfed; border-radius: 9px; break-inside: avoid; }
      .pdf-signature-block { display: flex; width: 100%; flex-direction: column; align-items: center; text-align: center; }
      .pdf-signature { display: block; width: 180px; height: 68px; max-width: 100%; object-fit: contain; }
      .pdf-signature-name { width: 100%; padding-top: 5px; border-top: 1px solid #6c6470; font-size: 12px; overflow-wrap: anywhere; }
      .pdf-signature-role, .pdf-signature-date { color: #756b7b; font-size: 11px; overflow-wrap: anywhere; }
      .report-footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e8dfed; color: #8a7f90; font-size: 10px; text-align: center; }
      @media (max-width: 640px) {
        body { padding: 0; }
        .report { min-height: 100vh; padding: 24px 18px; }
        .pdf-student-profile { align-items: flex-start; }
        .pdf-student-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @page { size: A4 portrait; margin: 14mm 13mm 16mm; }
      @media print {
        :root { background: #fff; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        body { padding: 0; }
        .report { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
        .pdf-case-card { border-radius: 8px; }
        .pdf-section-heading, .pdf-case-section-title { break-after: avoid; }
        .pdf-update, .pdf-signature-card { break-inside: avoid; }
        .report-footer { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main class="report">
      <header class="brand">
        <img src="${safeLogoUrl}" alt="ITPC Takecare">
        <div class="brand-label">STUDENT CARE RECORD</div>
      </header>
      <h1>${safeTitle}</h1>
      ${content}
      <footer class="report-footer">ITPC Takecare · ${safeTitle}</footer>
    </main>
  </body>
</html>`;
}
