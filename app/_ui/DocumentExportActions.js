"use client";

import { fmtDateTime } from "@/lib/format";

function PrintIcon() {
  return (
    <svg className="documentActionIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M7 8V3h10v5" />
      <path d="M7 17H5a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-2" />
      <path d="M7 14h10v7H7z" />
      <path d="M17 12h.01" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="documentActionIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textValue(value) {
  return String(value ?? "").trim() || "-";
}

function metaToRows(meta = []) {
  return meta
    .filter(Boolean)
    .map((item) => Array.isArray(item) ? { label: item[0], value: item[1] } : item)
    .filter((item) => item.label);
}

function safeFileName(value) {
  return String(value || "dokument")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "dokument";
}

function buildPrintableHtml({ title, subtitle, meta = [], columns = [], rows = [], totals = [], toolbar = false, autoPrint = false }) {
  const metaRows = metaToRows(meta);
  const totalRows = metaToRows(totals);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#111;margin:24px;background:#fff}
    h1{font-size:22px;margin:0 0 4px}
    .subtitle{font-size:12px;color:#555;margin-bottom:14px}
    .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 18px;margin:10px 0 16px;font-size:12px}
    .meta div{border-bottom:1px solid #ddd;padding-bottom:4px}
    .meta b{display:block;font-size:10px;color:#555;text-transform:uppercase;margin-bottom:2px}
    table{width:100%;border-collapse:collapse;font-size:10.5px}
    th,td{border:1px solid #d4d4d4;padding:5px;text-align:left;vertical-align:top}
    th{background:#f1f5f9;font-size:10px}
    .totals{margin-top:12px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;font-size:12px;font-weight:700}
    .totals div{border:1px solid #ddd;padding:7px;background:#fafafa}
    .generated{margin-top:12px;color:#666;font-size:10px}
    .toolbar{position:sticky;top:0;z-index:5;margin:-24px -24px 18px;padding:10px 24px;background:#f8fafc;border-bottom:1px solid #d4d4d4}
    .toolbar button{border:1px solid #94a3b8;border-radius:8px;background:#fff;color:#111;font-weight:700;padding:9px 14px;cursor:pointer}
    @page{margin:10mm}
    @media print{body{margin:0}.noPrint{display:none}}
  </style>
</head>
<body>
  ${toolbar ? `<div class="toolbar noPrint">
    <button type="button" onclick="window.focus(); window.print();">Print / PDF</button>
  </div>` : ""}
  <h1>${escapeHtml(title)}</h1>
  ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}
  ${metaRows.length ? `<div class="meta">${metaRows.map((item) => `<div><b>${escapeHtml(item.label)}</b>${escapeHtml(textValue(item.value))}</div>`).join("")}</div>` : ""}
  <table>
    <thead>
      <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${rows.length ? rows.map((row) => `
        <tr>${columns.map((column) => `<td>${escapeHtml(textValue(row[column.key]))}</td>`).join("")}</tr>
      `).join("") : `<tr><td colspan="${Math.max(1, columns.length)}">Nema podataka.</td></tr>`}
    </tbody>
  </table>
  ${totalRows.length ? `<div class="totals">${totalRows.map((item) => `<div>${escapeHtml(item.label)}<br>${escapeHtml(textValue(item.value))}</div>`).join("")}</div>` : ""}
  <div class="generated">Generisano: ${escapeHtml(fmtDateTime(new Date()))}</div>
  ${autoPrint ? `<script>
    window.addEventListener("load", function(){
      setTimeout(function(){
        window.focus();
        window.print();
      }, 450);
    });
  </script>` : ""}
</body>
</html>`;
}

function imageDataUrl(base64, mime = "image/png") {
  const value = String(base64 || "").trim();
  if (!value) return "";
  if (value.startsWith("data:")) return value;
  return `data:${mime};base64,${value}`;
}

function detailLine(label, value) {
  const clean = textValue(value);
  if (clean === "-") return "";
  return `<div><b>${escapeHtml(label)}</b>${escapeHtml(clean)}</div>`;
}

function buildInvoicePrintableHtml({
  title,
  subject,
  company = {},
  customer = {},
  invoice = {},
  columns = [],
  rows = [],
  totals = [],
  notes = [],
  autoPrint = false,
}) {
  const logoSrc = imageDataUrl(company.Postavke_LogoBase64 || company.logoBase64 || company.logo);
  const logo2Src = imageDataUrl(company.Postavke_Logo2Base64 || company.logo2Base64 || company.logo2);
  const stampSrc = imageDataUrl(company.Postavke_PecatBase64 || company.pecatBase64 || company.pecat);
  const signatureSrc = imageDataUrl(company.Postavke_PotpisBase64 || company.potpisBase64 || company.potpis);
  const totalRows = metaToRows(totals);
  const noteRows = [
    company.Postavke_Standard,
    company.Postavke_Izjava,
    ...notes,
  ].map((x) => String(x || "").trim()).filter(Boolean);
  const companyName = company.Postavke_Naziv || company.SifPreduzeca_Naziv || company.name || "";
  const companyCityLine = [company.SifPreduzeca_PostanskiBroj, company.SifPreduzeca_Grad].filter(Boolean).join(" ");
  const companyIdLine = [
    company.SifPreduzeca_IDBroj ? `ID: ${company.SifPreduzeca_IDBroj}` : "",
    company.SifPreduzeca_PDVBroj ? `PDV: ${company.SifPreduzeca_PDVBroj}` : "",
  ].filter(Boolean).join("   ");
  const companyInfoLines = [
    company.SifPreduzeca_Adresa,
    companyCityLine,
    company.SifPreduzeca_Drzava,
    company.Postavke_TextNaDokumentu1,
    company.Postavke_TextNaDokumentu2,
    companyIdLine,
  ].map((x) => String(x || "").trim()).filter(Boolean);
  const customerAddress = [
    customer.address,
    [customer.postalCode, customer.city].filter(Boolean).join(" "),
    customer.country,
  ].filter(Boolean).join(", ");
  const docTitle = invoice.documentTitle || title || "Faktura";
  const docNumber = invoice.number || subject || "";
  const amountKeys = new Set(["cijena", "rabat", "pdv", "ukupno"]);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>&#8203;</title>
  <style>
    *{box-sizing:border-box}
    @page{size:A4;margin:9mm}
    body{font-family:Arial,sans-serif;color:#111;background:#fff;margin:0;font-size:10.5px;line-height:1.25}
    .invoice{width:100%;max-width:190mm;margin:0 auto;padding:0}
    .companyHead{display:grid;grid-template-columns:36mm minmax(0,1fr) 82mm;gap:6mm;align-items:start;min-height:29mm;margin-bottom:2mm}
    .logoBox{min-height:24mm;display:flex;align-items:flex-start;justify-content:flex-start}
    .logoBox img{max-width:32mm;max-height:24mm;object-fit:contain}
    .companyExtraLogo{display:flex;align-items:flex-start;justify-content:center;min-height:22mm}
    .companyExtraLogo img{max-width:30mm;max-height:21mm;object-fit:contain;opacity:.96}
    .companyInfo{text-align:right;font-size:9.4px;line-height:1.16;padding-top:.5mm}
    .companyName{font-size:12px;font-weight:800;text-transform:uppercase}
    .companySmall{margin-top:1.2mm;color:#222}
    .buyerBox{width:58mm;margin-top:2mm;padding:3mm;background:#eee;border:1px solid #bdbdbd;font-size:10px}
    .buyerLabel{font-size:9px;font-weight:800;text-transform:uppercase;border-bottom:1px solid #888;margin-bottom:2mm}
    .buyerName{font-weight:800;text-transform:uppercase}
    .docTitle{text-align:center;font-size:15px;font-weight:800;text-decoration:underline;margin:11mm 0 2.2mm}
    .docTitle span{font-weight:700}
    .infoGrid{display:grid;grid-template-columns:1fr 1fr;column-gap:8mm;row-gap:2mm;border-top:1px solid #333;border-bottom:1px solid #333;padding:2.2mm 0;margin-bottom:5mm}
    .infoGrid div{display:grid;grid-template-columns:28mm minmax(0,1fr);gap:2mm;font-size:10px;line-height:1.2}
    .infoGrid b{font-size:9px;text-transform:uppercase}
    table.items{width:100%;border-collapse:collapse;font-size:9.5px;margin-top:2mm}
    .items th,.items td{border:1px solid #999;padding:3.5px 4px;text-align:left;vertical-align:middle}
    .items th{background:#f3f3f3;font-size:9px;font-weight:800}
    .items td.amount,.items th.amount{text-align:right;white-space:nowrap}
    .items td.center,.items th.center{text-align:center;white-space:nowrap}
    .totalsWrap{display:grid;grid-template-columns:minmax(0,1fr) 58mm;margin-top:3mm;gap:5mm}
    .amountWords{font-size:9.5px;padding-top:2mm}
    .totalTable{border:1px solid #999;border-collapse:collapse;width:100%;font-size:10px}
    .totalTable td{border-bottom:1px solid #bbb;padding:3px 4px}
    .totalTable tr:last-child td{border-bottom:0;font-weight:800}
    .totalTable td:last-child{text-align:right;font-weight:800}
    .taxRecap{margin-top:5mm;border-collapse:collapse;width:100%;font-size:9.5px}
    .taxRecap td,.taxRecap th{border:1px solid #aaa;padding:3px 4px}
    .taxRecap th{background:#f3f3f3;text-align:left}
    .notes{margin-top:5mm;font-size:9.5px;color:#222;display:grid;gap:2mm}
    .pageFiller{height:0;min-height:0}
    .signatureRow{margin-top:14mm;display:grid;grid-template-columns:1fr 38mm 1fr;align-items:end;gap:10mm;font-size:9.5px}
    .signatureLine{border-top:1px dashed #555;padding-top:2mm;text-align:center}
    .stampBox{text-align:center;min-height:24mm;display:flex;align-items:center;justify-content:center;position:relative}
    .mpText{position:relative;z-index:1;color:#333}
    .stampBox img{max-width:30mm;max-height:24mm;object-fit:contain;opacity:.92}
    .stampImage{position:absolute;inset:0;margin:auto;z-index:2}
    .signatureImage{position:absolute;max-width:34mm;max-height:16mm;object-fit:contain;bottom:5mm;right:-18mm;z-index:3}
    .generated{margin-top:6mm;color:#666;font-size:8.5px}
    @media print{body{margin:0}.invoice{padding-top:0}.items thead{display:table-header-group}.items tr,.totalTable,.taxRecap,.notes,.signatureRow{break-inside:avoid;page-break-inside:avoid}}
  </style>
</head>
<body>
  <main class="invoice">
    <section class="companyHead">
      <div class="logoBox">${logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="Logo" />` : ""}</div>
      <div class="companyExtraLogo">${logo2Src ? `<img src="${escapeHtml(logo2Src)}" alt="Logo 2" />` : ""}</div>
      <div class="companyInfo">
        ${companyName ? `<div class="companyName">${escapeHtml(companyName)}</div>` : ""}
        ${companyInfoLines.map((line) => `<div class="companySmall">${escapeHtml(line)}</div>`).join("")}
      </div>
    </section>

    <section class="buyerBox">
      <div class="buyerLabel">Kupac</div>
      <div class="buyerName">${escapeHtml(textValue(customer.name))}</div>
      ${customerAddress ? `<div>${escapeHtml(customerAddress)}</div>` : ""}
      ${customer.idNumber ? `<div>ID: ${escapeHtml(customer.idNumber)}</div>` : ""}
      ${customer.vatNumber ? `<div>PDV: ${escapeHtml(customer.vatNumber)}</div>` : ""}
    </section>

    <div class="docTitle">${escapeHtml(docTitle)} broj: <span>${escapeHtml(docNumber)}</span></div>

    <section class="infoGrid">
      <div><b>Mjesto, datum</b>${escapeHtml(textValue(invoice.placeDate))}</div>
      <div><b>Način plaćanja</b>${escapeHtml(textValue(invoice.paymentType))}</div>
      <div><b>Datum računa</b>${escapeHtml(textValue(invoice.date))}</div>
      <div><b>Valuta</b>${escapeHtml(textValue(invoice.currency))}</div>
      <div><b>Broj fiskalnog</b>${escapeHtml(textValue(invoice.fiscalNumber))}</div>
      <div><b>Referent</b>${escapeHtml(textValue(invoice.referent))}</div>
    </section>

    <table class="items">
      <thead>
        <tr>${columns.map((column) => `<th class="${amountKeys.has(column.key) ? "amount" : column.key === "jm" || column.key === "kolicina" ? "center" : ""}">${escapeHtml(column.label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.length ? rows.map((row) => `
          <tr>
            ${columns.map((column) => `<td class="${amountKeys.has(column.key) ? "amount" : column.key === "jm" || column.key === "kolicina" ? "center" : ""}">${escapeHtml(textValue(row[column.key]))}</td>`).join("")}
          </tr>
        `).join("") : `<tr><td colspan="${Math.max(1, columns.length)}">Nema podataka.</td></tr>`}
      </tbody>
    </table>

    <section class="totalsWrap">
      <div class="amountWords">${invoice.amountWords ? `Slovima: ${escapeHtml(invoice.amountWords)}` : ""}</div>
      <table class="totalTable">
        <tbody>
          ${totalRows.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(textValue(item.value))}</td></tr>`).join("")}
        </tbody>
      </table>
    </section>

    ${totalRows.length ? `<table class="taxRecap"><thead><tr><th>Rekapitulacija PDV-a</th><th>Osnovica</th><th>Iznos PDV-a</th><th>Ukupno</th></tr></thead><tbody><tr><td>P1</td><td>${escapeHtml(textValue(totalRows.find((x) => x.label === "Osnovica")?.value))}</td><td>${escapeHtml(textValue(totalRows.find((x) => x.label === "PDV")?.value))}</td><td>${escapeHtml(textValue(totalRows.find((x) => x.label === "Za platiti" || x.label === "Ukupno" || x.label === "Zbir stavki")?.value))}</td></tr></tbody></table>` : ""}

    ${noteRows.length ? `<section class="notes">${noteRows.map((note) => `<div>${escapeHtml(note)}</div>`).join("")}</section>` : ""}

    <div class="pageFiller" aria-hidden="true"></div>

    <section class="signatureRow">
      <div class="signatureLine">Fakturisao</div>
      <div class="stampBox">
        ${stampSrc ? `<img src="${escapeHtml(stampSrc)}" alt="Pečat" />` : "M.P."}
        ${signatureSrc ? `<img class="signatureImage" src="${escapeHtml(signatureSrc)}" alt="Potpis" />` : ""}
      </div>
      <div class="signatureLine">Odgovorno lice</div>
    </section>

    <div class="generated">Generisano: ${escapeHtml(fmtDateTime(new Date()))}</div>
  </main>
  <script>
    (function(){
      function mmToPx(mm){
        var probe = document.createElement("div");
        probe.style.position = "absolute";
        probe.style.visibility = "hidden";
        probe.style.height = mm + "mm";
        document.body.appendChild(probe);
        var px = probe.getBoundingClientRect().height;
        probe.remove();
        return px || mm * 3.7795275591;
      }

      function fitFirstPage(){
        var invoiceEl = document.querySelector(".invoice");
        var filler = document.querySelector(".pageFiller");
        if (!invoiceEl || !filler) return;
        filler.style.height = "0px";
        var pageContentHeight = mmToPx(279);
        var currentHeight = invoiceEl.getBoundingClientRect().height;
        var freeSpace = Math.floor(pageContentHeight - currentHeight);
        filler.style.height = freeSpace > 0 ? Math.max(0, freeSpace - 2) + "px" : "0px";
      }

      fitFirstPage();
      window.addEventListener("load", function(){
        fitFirstPage();
        setTimeout(fitFirstPage, 60);
      });
    })();
  </script>
  ${autoPrint ? `<script>
    window.addEventListener("load", function(){
      setTimeout(function(){
        window.focus();
        window.print();
      }, 450);
    });
  </script>` : ""}
</body>
</html>`;
}

function buildMailBody({ title, subtitle, meta = [], columns = [], rows = [], totals = [] }) {
  const lines = [
    title,
    subtitle || "",
    "",
    ...metaToRows(meta).map((item) => `${item.label}: ${textValue(item.value)}`),
    "",
    ...metaToRows(totals).map((item) => `${item.label}: ${textValue(item.value)}`),
    "",
    ...rows.slice(0, 80).map((row, index) => {
      const values = columns.map((column) => `${column.label}: ${textValue(row[column.key])}`).join(" | ");
      return `${index + 1}. ${values}`;
    }),
  ].filter((line, index, all) => line || all[index - 1]);

  if (rows.length > 80) {
    lines.push(`... prikazano 80 od ${rows.length} stavki.`);
  }

  return lines.join("\n");
}

export function printReport(report) {
  const html = report?.layout === "invoice"
    ? buildInvoicePrintableHtml(report)
    : buildPrintableHtml(report);
  printHtmlDocument(html, `${safeFileName(report?.subject || report?.title)}.html`);
}

export function printHtmlDocument(html, downloadName = "dokument.html") {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  let iframe = null;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      iframe?.remove();
    } catch {}
  };

  try {
    iframe = document.createElement("iframe");
    iframe.title = "Print / PDF";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const frameDocument = iframe.contentDocument || frameWindow?.document;
    if (!frameWindow || !frameDocument) throw new Error("Print okvir nije dostupan.");

    let printed = false;
    const printOnce = () => {
      if (printed) return;
      printed = true;
      try {
        frameWindow.focus();
        frameWindow.print();
      } catch {
        cleanup();
        fallbackDownloadPrintableHtml(html, downloadName);
        return;
      }
      window.setTimeout(cleanup, 30000);
    };

    frameWindow.addEventListener?.("afterprint", cleanup, { once: true });
    iframe.addEventListener("load", () => window.setTimeout(printOnce, 80), { once: true });
    frameDocument.open();
    frameDocument.write(html);
    frameDocument.close();
    window.setTimeout(printOnce, 450);
    return;
  } catch {
    cleanup();
    fallbackDownloadPrintableHtml(html, downloadName);
  }
}

function fallbackDownloadPrintableHtml(html, downloadName) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFileName(downloadName || "dokument.html");
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function mailReport(report) {
  const subject = report.subject || report.title || "Dokument";
  const body = buildMailBody(report);
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function DocumentExportActions({ onPrint, onMail, disabled = false, compact = false }) {
  return (
    <div className={`documentActions ${compact ? "documentActionsCompact" : ""}`.trim()}>
      <button className="btn clickable documentActionBtn" type="button" onClick={onPrint} disabled={disabled} title="Print / PDF">
        <PrintIcon />
        <span>PDF</span>
      </button>
      {onMail && (
        <button className="btn clickable documentActionBtn" type="button" onClick={onMail} disabled={disabled} title="Pošalji mailom">
          <MailIcon />
          <span>Mail</span>
        </button>
      )}
    </div>
  );
}
