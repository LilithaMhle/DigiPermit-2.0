import { PERMIT_TYPE_LABELS, type PermitRecord } from "./permits-firestore";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmt(d?: string) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function barcodeSvg(value: string): string {
  const bars = value.split("").flatMap((c, i) => {
    const n = c.charCodeAt(0);
    return [
      { w: (n % 3) + 1, dark: true },
      { w: ((n >> 1) % 3) + 1, dark: false },
      { w: ((n >> 2) % 2) + 1, dark: true },
    ];
  });
  let x = 0;
  const height = 70;
  const rects = bars
    .map((b) => {
      const w = b.w * 2;
      const rect = b.dark ? `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#0b0b0b"/>` : "";
      x += w;
      return rect;
    })
    .join("");
  return `<svg width="${x}" height="${height}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

export function buildPermitHtml(p: PermitRecord): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Permit ${esc(p.permitNumber)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0b0b0b; margin: 0; padding: 24px; }
  .doc { max-width: 760px; margin: 0 auto; border: 2px solid #0b0b0b; padding: 28px 32px; position: relative; }
  .seal { position: absolute; top: 24px; right: 32px; width: 90px; height: 90px; border: 2px solid #0b3d2e; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; color: #0b3d2e; font-weight: 700; text-align: center; font-size: 10px; line-height: 1.1; }
  header { border-bottom: 2px solid #0b0b0b; padding-bottom: 16px; margin-bottom: 20px; }
  .flag { display: inline-flex; height: 22px; width: 36px; border: 1px solid #999; vertical-align: middle; margin-right: 10px; overflow: hidden; }
  .flag span { flex: 1; }
  h1 { font-size: 18px; margin: 4px 0 2px; letter-spacing: 0.5px; }
  h2 { font-size: 13px; margin: 0; color: #444; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; }
  .ptype { margin-top: 12px; font-size: 22px; font-weight: 700; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; margin-top: 16px; }
  .field { border-bottom: 1px dotted #888; padding-bottom: 4px; }
  .field .label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #666; }
  .field .value { font-size: 13px; font-weight: 600; margin-top: 2px; }
  .full { grid-column: 1 / -1; }
  .barcode { margin-top: 22px; padding: 14px; border: 1px solid #ccc; text-align: center; }
  .barcode .num { font-family: 'Courier New', monospace; font-size: 14px; letter-spacing: 4px; margin-top: 6px; }
  footer { margin-top: 24px; display: flex; justify-content: space-between; gap: 20px; font-size: 11px; color: #333; }
  .sigline { border-top: 1px solid #0b0b0b; padding-top: 4px; width: 220px; text-align: center; }
  .notice { margin-top: 18px; font-size: 10px; color: #555; border-top: 1px dashed #999; padding-top: 8px; }
  @media print {
    body { padding: 0; }
    .doc { border: 2px solid #0b0b0b; }
    .no-print { display: none !important; }
  }
  .toolbar { max-width: 760px; margin: 0 auto 12px; display: flex; justify-content: flex-end; gap: 8px; }
  .toolbar button { padding: 8px 14px; border: 1px solid #0b0b0b; background: #0b0b0b; color: #fff; cursor: pointer; border-radius: 4px; font-size: 13px; }
  .toolbar button.secondary { background: #fff; color: #0b0b0b; }
</style>
</head>
<body>
<div class="toolbar no-print">
  <button class="secondary" onclick="window.close()">Close</button>
  <button onclick="window.print()">Print / Save as PDF</button>
</div>
<div class="doc">
  <div class="seal">REPUBLIC OF<br/>SOUTH AFRICA<br/>DHA</div>
  <header>
    <div>
      <span class="flag">
        <span style="background:#007a4d"></span>
        <span style="background:#ffffff"></span>
        <span style="background:#001489"></span>
        <span style="background:#ffb612"></span>
        <span style="background:#de3831"></span>
        <span style="background:#000000"></span>
      </span>
      <strong>Republic of South Africa</strong>
    </div>
    <h1>Department of Home Affairs</h1>
    <h2>Official Permit / Visa Document</h2>
    <div class="ptype">${esc(PERMIT_TYPE_LABELS[p.permitType])}</div>
  </header>

  <div class="grid">
    <div class="field"><div class="label">Permit number</div><div class="value">${esc(p.permitNumber)}</div></div>
    <div class="field"><div class="label">Status</div><div class="value" style="text-transform:capitalize">${esc(p.status)}</div></div>
    <div class="field"><div class="label">Surname</div><div class="value">${esc(p.surname)}</div></div>
    <div class="field"><div class="label">Given names</div><div class="value">${esc(p.givenNames)}</div></div>
    <div class="field"><div class="label">Passport number</div><div class="value">${esc(p.passport)}</div></div>
    <div class="field"><div class="label">Nationality</div><div class="value">${esc(p.nationality)}</div></div>
    <div class="field"><div class="label">Date of birth</div><div class="value">${esc(fmt(p.dateOfBirth))}</div></div>
    <div class="field"><div class="label">Gender</div><div class="value" style="text-transform:capitalize">${esc(p.gender)}</div></div>
    <div class="field"><div class="label">Issue date</div><div class="value">${esc(fmt(p.issueDate))}</div></div>
    <div class="field"><div class="label">Expiry date</div><div class="value">${esc(fmt(p.expiryDate))}</div></div>
    <div class="field full"><div class="label">Port / place of issue</div><div class="value">${esc(p.portOfIssue)}</div></div>
    ${p.employer ? `<div class="field"><div class="label">Employer</div><div class="value">${esc(p.employer)}</div></div>` : ""}
    ${p.occupation ? `<div class="field"><div class="label">Occupation</div><div class="value">${esc(p.occupation)}</div></div>` : ""}
    ${p.institution ? `<div class="field full"><div class="label">Institution</div><div class="value">${esc(p.institution)}</div></div>` : ""}
    ${p.conditions ? `<div class="field full"><div class="label">Conditions / endorsements</div><div class="value" style="font-weight:500">${esc(p.conditions)}</div></div>` : ""}
  </div>

  <div class="barcode">
    ${barcodeSvg(p.barcode)}
    <div class="num">${esc(p.barcode)}</div>
  </div>

  <footer>
    <div>
      <div class="sigline">Holder signature</div>
    </div>
    <div>
      <div class="sigline">${esc(p.issuedBy)}<br/><span style="font-size:10px;color:#666">Issuing officer</span></div>
    </div>
  </footer>

  <div class="notice">
    This document is issued by the Department of Home Affairs of the Republic of South Africa. Any alteration, defacement or fraudulent use is a criminal offence under the Immigration Act 13 of 2002. Verify authenticity by scanning the barcode at any Port of Entry.
  </div>
</div>
<script>setTimeout(function(){ try { window.focus(); } catch(e){} }, 100);</script>
</body>
</html>`;
}

export function printPermit(p: PermitRecord): void {
  const html = buildPermitHtml(p);
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    alert("Please allow pop-ups to print the permit.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
