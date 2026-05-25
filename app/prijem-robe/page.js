"use client";

import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import { printHtmlDocument } from "@/app/_ui/DocumentExportActions";
import { readAuthSession, readCachedJson, refreshAuthSession, removeCachedJson, scopedCacheKey } from "@/app/_ui/clientCache";
import { PRIJEM_PROCESSING_BLOCKED_EVENT, setPrijemProcessingState } from "@/app/_ui/prijemProcessingGuard";
import { fmtDateTime } from "@/lib/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TESSERACT_PATHS = {
  workerPath: "/ocr/tesseract/worker.min.js",
  corePath: "/ocr/tesseract",
  langPath: "/ocr/tessdata",
};

const FIELD_LABELS = {
  redniBroj: ["#", "id#", "id", "r.br", "rb", "redni broj", "redni"],
  sifra: ["sifra", "sifra artikla", "artikal", "art br", "kod", "code"],
  barcode: ["barcode", "bar code", "barkod", "barkod artikla", "ean", "gtin"],
  naziv: ["naziv", "naziv artikla", "opis", "proizvod"],
  kolicina: ["kolicina", "kol", "qty", "kom"],
  vpc: ["vpc", "cij", "cij.", "cijena", "cena", "price"],
  rabat: ["r1", "rab1", "rabat", "rab.", "rab", "popust", "discount"],
};

const STOP_LINE_RE = /\b(ukupno|total|subtotal|pdv|porez|iznos|za\s+platiti|dobavljac|kupac|datum|faktura|racun)\b/i;
const DOCUMENT_META_STOP_RE = /\b(ukupno|total|subtotal|rekapitulacija|osnovica|za\s+platiti|slovima|potpis|fakturisao|odgovorno|napomena|m\.?\s*p\.?)\b/i;
const NUMBER_RE = /-?\d+(?:[.,]\d+)?\s*%?/g;
const DATE_RE = /\b[\dOoIl|!SsBb]{1,2}[\s.,/-]+[\dOoIl|!SsBb]{1,2}[\s.,/-]+[\dOoIl|!SsBb]{2,4}\b/;
const ARTICLE_ROW_RE = /^\s*(\d{1,6})[\s.)-]+([A-Z0-9][A-Z0-9./_-]{2,24})\s+(.+)$/i;
const QTY_UNIT_RE = /([\dOoIl|]{1,6}(?:[.,][\dOoIl|]{1,4})?)\s*(kom|komad|komada|kg|g|l|lit|m|m2|m3|pak|set|pcs)\b/i;
const FOOTER_LINE_RE = /\b(stranica|reg\.?|sudskog|unicredit|raiffeisen|sparkasse|banka|pbs|intesa)\b/i;
const HEADER_NOISE_RE = /\b(www|@|jib|pdv|broj\s+racuna|datum|referent|nacin|poziv|mjesto|telefon|tel|mob|finansije|prodaja|email|mail|transakcijski|cerik|brcko|bosnia|herzegovina|maj|ul\.?|reg\.?)\b/i;
const UNIT_TOKEN_RE = /^\d{1,5}(?:[.,]\d{1,4})?\s*(kom|kg|g|l|m|m2|m3|pak|set|pcs)$/i;
const MAX_RECEIPT_ROWS = 160;
const MAX_ARTICLE_ROW_NO = 999999;
const MAX_SEQUENTIAL_ROW_NO = 300;
const MIN_NUMBERED_ROW_SCORE = 42;
const MIN_UNNUMBERED_ROW_SCORE = 58;
const SUPPLIER_SUGGESTION_LIMIT = 8;
const PRIJEM_DRAFT_CACHE_ID = "prijem-robe:draft:v2";
const PRICING_NUMBER_FIELDS = ["kolicina", "vpc", "rabat", "vpc2", "rabat2", "vpc3", "rabat3", "mpc"];
const ORIENTATION_RETRY_DEGREES = [180, 90, 270];

const EMPTY_META = {
  supplier: "",
  customer: "",
  invoiceNo: "",
  invoiceDate: "",
  deliveryDate: "",
  pageInfo: "",
};

const SCAN_FRAME_PLANS = [
  { key: "full", kind: "full", label: "cijeli dokument", guide: "Drzi cijeli dokument u kadru. Kada je slika ostra, uhvati cijelu stranicu.", x: 0, y: 0, w: 1, h: 1, minWidth: 3000, maxWidth: 4200, psm: "6", dpi: "430", rotateAuto: false, contrast: 1.36, thresholdHigh: 222, thresholdLow: 48, sharpen: 0.22, keepPreview: true, prepareMs: 120, focusMs: 260, captureSamples: 3, sampleDelayMs: 95, binarize: true },
  { key: "left", kind: "left", label: "lijevu stranu", guide: "Priblizi lijevu stranu tabele: redni broj, sifra, barcode, naziv i kolicina moraju biti jasni.", x: 0, y: 0, w: 1, h: 1, minWidth: 3300, maxWidth: 4600, psm: "6", dpi: "500", rotateAuto: false, contrast: 1.48, thresholdHigh: 224, thresholdLow: 46, sharpen: 0.34, prepareMs: 100, focusMs: 260, captureSamples: 3, sampleDelayMs: 95, binarize: true },
  { key: "right", kind: "right", label: "desnu stranu", guide: "Priblizi desnu stranu tabele: kolicina, VPC, rabat i iznosi moraju biti jasni.", x: 0, y: 0, w: 1, h: 1, minWidth: 3300, maxWidth: 4600, psm: "6", dpi: "500", rotateAuto: false, contrast: 1.48, thresholdHigh: 224, thresholdLow: 46, sharpen: 0.34, prepareMs: 100, focusMs: 260, captureSamples: 3, sampleDelayMs: 95, binarize: true },
];

const CORRECTION_SCAN_PLAN = {
  key: "correction",
  kind: "correction",
  label: "dopuna skeniranja",
  guide: "Postavi kameru na dio koji nije tačan i pritisni Skeniraj ponovo.",
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  minWidth: 3200,
  maxWidth: 4400,
  psm: "6",
  dpi: "460",
  rotateAuto: false,
  contrast: 1.62,
  thresholdHigh: 216,
  thresholdLow: 58,
  sharpen: 0.38,
  prepareMs: 100,
  focusMs: 260,
  captureSamples: 3,
  sampleDelayMs: 95,
  binarize: true,
};

const FILE_SCAN_FRAME_PLANS = [
  { ...SCAN_FRAME_PLANS[0], key: "file-header", kind: "header", label: "zaglavlje", uiLabel: "broj računa", x: 0, y: 0, w: 1, h: 0.32, keepPreview: true, minWidth: 3000, maxWidth: 4600, dpi: "520", psm: "6", contrast: 1.24, thresholdHigh: 232, thresholdLow: 36, sharpen: 0.18, binarize: false, allowSoftPass: false },
  { ...SCAN_FRAME_PLANS[0], key: "file-table-wide", kind: "table", label: "tabela cijela", uiLabel: "tabela", x: 0, y: 0.12, w: 1, h: 0.78, keepPreview: false, minWidth: 3600, maxWidth: 5200, dpi: "520", psm: "6", contrast: 1.28, thresholdHigh: 230, thresholdLow: 38, sharpen: 0.22, binarize: true },
  { ...SCAN_FRAME_PLANS[1], key: "file-left", kind: "left", label: "lijevi dio dokumenta", uiLabel: "lijeva strana", x: 0, y: 0.08, w: 0.72, h: 0.86, keepPreview: false, minWidth: 3400, maxWidth: 5000, dpi: "540", psm: "6", contrast: 1.24, thresholdHigh: 236, thresholdLow: 32, sharpen: 0.2, binarize: false },
  { ...SCAN_FRAME_PLANS[2], key: "file-right", kind: "right", label: "desni dio dokumenta", uiLabel: "desna strana", x: 0.28, y: 0.08, w: 0.72, h: 0.86, keepPreview: false, minWidth: 3200, maxWidth: 4800, dpi: "540", psm: "6", contrast: 1.26, thresholdHigh: 232, thresholdLow: 36, sharpen: 0.2, binarize: false, allowSoftPass: false },
];

const SUPPLIER_SCAN_TEMPLATES = [
  {
    id: "zetra",
    name: "ZETRA",
    aliases: ["zetra"],
    filePlans: [
      { ...SCAN_FRAME_PLANS[0], key: "zetra-header", kind: "header", label: "zaglavlje", uiLabel: "broj računa", x: 0.04, y: 0.05, w: 0.9, h: 0.22, keepPreview: true, minWidth: 3000, maxWidth: 4600, dpi: "520", psm: "6", contrast: 1.24, thresholdHigh: 232, thresholdLow: 36, sharpen: 0.18, binarize: false, allowSoftPass: false },
      { ...SCAN_FRAME_PLANS[0], key: "zetra-table", kind: "table", label: "tabela", uiLabel: "tabela", x: 0.07, y: 0.31, w: 0.86, h: 0.49, keepPreview: false, minWidth: 3800, maxWidth: 5600, dpi: "540", psm: "6", contrast: 1.32, thresholdHigh: 226, thresholdLow: 40, sharpen: 0.24, binarize: true },
      { ...SCAN_FRAME_PLANS[1], key: "zetra-left", kind: "left", label: "lijeva strana", uiLabel: "# i nazivi", x: 0.07, y: 0.31, w: 0.48, h: 0.49, keepPreview: false, minWidth: 3500, maxWidth: 5200, dpi: "560", psm: "6", contrast: 1.24, thresholdHigh: 236, thresholdLow: 32, sharpen: 0.2, binarize: false },
      { ...SCAN_FRAME_PLANS[2], key: "zetra-right", kind: "right", label: "desna strana", uiLabel: "količine i cijene", x: 0.48, y: 0.31, w: 0.45, h: 0.49, keepPreview: false, minWidth: 3400, maxWidth: 5000, dpi: "560", psm: "6", contrast: 1.28, thresholdHigh: 232, thresholdLow: 36, sharpen: 0.2, binarize: false, allowSoftPass: false },
    ],
    cameraPlans: SCAN_FRAME_PLANS,
  },
  {
    id: "dense-a4",
    name: "A4 veleprodajni račun",
    aliases: ["belamionix", "belamioniks", "best", "mepas", "medic", "medić", "stanić", "stanic", "bingo", "lukas", "ataco"],
    filePlans: [
      { ...SCAN_FRAME_PLANS[0], key: "dense-header", kind: "header", label: "zaglavlje", uiLabel: "broj računa", x: 0.02, y: 0.02, w: 0.96, h: 0.28, keepPreview: true, minWidth: 3200, maxWidth: 4800, dpi: "530", psm: "6", contrast: 1.24, thresholdHigh: 232, thresholdLow: 34, sharpen: 0.18, binarize: false, allowSoftPass: false },
      { ...SCAN_FRAME_PLANS[0], key: "dense-table", kind: "table", label: "tabela", uiLabel: "tabela", x: 0.02, y: 0.2, w: 0.96, h: 0.68, keepPreview: false, minWidth: 3800, maxWidth: 5600, dpi: "550", psm: "6", contrast: 1.34, thresholdHigh: 226, thresholdLow: 38, sharpen: 0.26, binarize: true },
      { ...SCAN_FRAME_PLANS[1], key: "dense-left", kind: "left", label: "lijeva strana", uiLabel: "# i nazivi", x: 0.02, y: 0.2, w: 0.7, h: 0.68, keepPreview: false, minWidth: 3600, maxWidth: 5400, dpi: "560", psm: "6", contrast: 1.26, thresholdHigh: 234, thresholdLow: 34, sharpen: 0.22, binarize: false },
      { ...SCAN_FRAME_PLANS[2], key: "dense-right", kind: "right", label: "desna strana", uiLabel: "količine i cijene", x: 0.42, y: 0.2, w: 0.56, h: 0.68, keepPreview: false, minWidth: 3400, maxWidth: 5200, dpi: "560", psm: "6", contrast: 1.3, thresholdHigh: 232, thresholdLow: 36, sharpen: 0.22, binarize: false, allowSoftPass: false },
    ],
    cameraPlans: SCAN_FRAME_PLANS,
  },
];

const OCR_STATUS_LABELS = {
  "loading tesseract core": "Učitavam OCR engine...",
  "initializing tesseract": "Pripremam OCR engine...",
  "initializing api": "Pripremam prepoznavanje teksta...",
  "loading language traineddata": "Učitavam jezik za OCR...",
  "initializing language traineddata": "Pripremam jezik za OCR...",
  "recognizing text": "Prepoznavanje teksta...",
};

function ocrStatusLabel(status) {
  const key = normalizeLetters(status).trim();
  return OCR_STATUS_LABELS[key] || status;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitForUiPaint() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return sleep(0);
  }

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

function waitForVisiblePage(onHidden) {
  if (typeof document === "undefined" || !document.hidden) {
    return Promise.resolve(false);
  }

  onHidden?.();

  return new Promise((resolve) => {
    const cleanup = () => {
      document.removeEventListener("visibilitychange", done);
      window.removeEventListener("pageshow", done);
      window.removeEventListener("focus", done);
    };

    const done = () => {
      if (document.hidden) return;
      cleanup();
      resolve(true);
    };

    document.addEventListener("visibilitychange", done);
    window.addEventListener("pageshow", done);
    window.addEventListener("focus", done);
  });
}

function consoleTimeStamp(date = new Date()) {
  return date.toLocaleTimeString("bs-BA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function scanFrameUiLabel(frame) {
  return frame?.uiLabel || frame?.label || "kadar";
}

function normalizeLetters(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function supplierScanTemplate(supplier) {
  const normalized = normalizeLetters(supplier).replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized) return null;

  return SUPPLIER_SCAN_TEMPLATES.find((template) => (
    template.aliases.some((alias) => normalized.includes(normalizeLetters(alias).replace(/[^a-z0-9]+/g, " ").trim()))
  )) || null;
}

function withTemplate(plans, template) {
  return (plans || []).map((plan) => ({
    ...plan,
    supplierTemplateId: template?.id || "",
    supplierTemplateName: template?.name || "",
  }));
}

function fileScanPlansForSupplier(supplier) {
  const template = supplierScanTemplate(supplier);
  return withTemplate(template?.filePlans || FILE_SCAN_FRAME_PLANS, template);
}

function cameraScanPlansForSupplier(supplier) {
  const template = supplierScanTemplate(supplier);
  return withTemplate(template?.cameraPlans || SCAN_FRAME_PLANS, template);
}

function cleanCell(value) {
  return String(value || "")
    .replace(/[|;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function cleanInvoiceNumberValue(value) {
  const normalized = cleanCell(normalizeOcrDigits(value).replace(/[–—_]/g, "-"));
  const candidates = Array.from(normalized.matchAll(/[A-Z]?\d[\d\s./-]{3,}\d/gi))
    .map((match) => cleanCell(match[0])
      .replace(/\s*([./-])\s*/g, "$1")
      .replace(/\s+/g, ""))
    .map((candidate) => candidate.replace(/^[./-]+|[./-]+$/g, ""))
    .filter((candidate) => {
      const digits = compactDigits(candidate);
      return digits.length >= 5 && digits.length <= 22 && !extractDateValue(candidate);
    });

  return candidates[candidates.length - 1] || "";
}

function todayIsoDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function createDefaultMeta() {
  return { ...EMPTY_META, invoiceDate: todayIsoDate() };
}

function normalizeOcrDigits(value) {
  return String(value || "")
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1");
}

function normalizeOcrDateDigits(value) {
  return normalizeOcrDigits(value)
    .replace(/!/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8");
}

function normalizedDateParts(yearRaw, monthRaw, dayRaw) {
  const year = yearRaw.length === 2 ? Number(`20${yearRaw}`) : Number(yearRaw);
  let month = Number(monthRaw);
  let day = Number(dayRaw);
  if (month > 12 && day <= 12) {
    [day, month] = [month, day];
  }
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return {
    year: String(year).padStart(4, "0"),
    month: String(month).padStart(2, "0"),
    day: String(day).padStart(2, "0"),
  };
}

function datePartsFromValue(value) {
  const normalized = normalizeOcrDateDigits(value);
  const iso = normalized.match(/\b(20\d{2})[\s.,/-]+(\d{1,2})[\s.,/-]+(\d{1,2})\b/);
  if (iso) return normalizedDateParts(iso[1], iso[2], iso[3]);

  const local = normalized.match(/\b(\d{1,2})[\s.,/-]+(\d{1,2})[\s.,/-]+(\d{2,4})\b/);
  if (local) return normalizedDateParts(local[3], local[2], local[1]);

  const compactLocal = normalized.match(/\b(\d{2})(\d{2})(20\d{2})\b/);
  if (compactLocal) return normalizedDateParts(compactLocal[3], compactLocal[2], compactLocal[1]);

  const compactIso = normalized.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
  if (compactIso) return normalizedDateParts(compactIso[1], compactIso[2], compactIso[3]);

  return null;
}

function normalizeInvoiceDate(value) {
  const parts = datePartsFromValue(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
}

function formatInvoiceDate(value) {
  const parts = datePartsFromValue(value);
  return parts ? `${parts.day}.${parts.month}.${parts.year}` : cleanCell(value);
}

function extractDateValue(value) {
  const text = normalizeOcrDateDigits(value).replace(/\s+/g, " ");
  const candidates = [
    ...Array.from(text.matchAll(/\b20\d{2}[\s.,/-]+\d{1,2}[\s.,/-]+\d{1,2}\b/g)),
    ...Array.from(text.matchAll(new RegExp(DATE_RE.source, "g"))),
    ...Array.from(text.matchAll(/\b\d{2}\d{2}20\d{2}\b/g)),
    ...Array.from(text.matchAll(/\b20\d{2}\d{2}\d{2}\b/g)),
  ]
    .map((match) => match[0]);
  for (const candidate of candidates) {
    const normalized = normalizeInvoiceDate(candidate);
    if (normalized) return normalized;
  }
  return "";
}

function trimOcrLine(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\t/g, " ")
    .trim();
}

function looksLikeQuantityToken(value) {
  const token = cleanCell(value).toLowerCase();
  if (!token) return true;
  if (UNIT_TOKEN_RE.test(token)) return true;
  if (/^[o0il|.,-]+$/i.test(token)) return true;
  if (/^\d{1,3}$/.test(token)) return true;
  if (/^\d{1,3}\/\d{1,2}$/.test(token)) return true;
  return false;
}

function isValidArticleCode(value) {
  const code = cleanCell(value);
  if (!code || code.length > 24 || looksLikeQuantityToken(code)) return false;

  const digits = compactDigits(code);
  if (/^\d+$/.test(code)) return digits.length >= 4 && digits.length <= 10 && !/^0+$/.test(digits);
  if (/^[\d./_-]+$/.test(code)) return digits.length >= 6 && digits.length <= 10 && !/^\d{1,3}\/\d{1,2}$/.test(code);

  return /^[A-Z0-9][A-Z0-9./_-]{3,24}$/i.test(code) && /\d/.test(code);
}

function cleanArticleCode(value) {
  const code = cleanCell(value).replace(/^[#*:;.,-]+|[#*:;.,-]+$/g, "");
  return isValidArticleCode(code) ? code : "";
}

function isLikelyEan13(value) {
  const digits = compactDigits(value);
  if (digits.length !== 13) return false;
  const first12 = digits.slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10) === digits[12];
}

function articleNameScore(value) {
  const name = cleanArticleName(value);
  if (name.length < 4) return 0;

  const normalized = normalizeLetters(name);
  if (HEADER_NOISE_RE.test(normalized) || FOOTER_LINE_RE.test(normalized)) return 0;

  const letters = (name.match(/\p{L}/gu) || []).length;
  const words = name.match(/\p{L}{2,}/gu) || [];
  const badSymbols = name.replace(/[\p{L}\p{N}\s.,:+%()&/_-]/gu, "").length;
  const alnum = (name.match(/[\p{L}\p{N}]/gu) || []).length;
  if (!alnum || badSymbols / Math.max(1, name.length) > 0.12) return 0;
  const signal = Math.min(18, letters / 2) + Math.min(10, words.length * 2);
  return Math.max(0, signal - badSymbols * 4);
}

function cleanArticleName(value) {
  let text = cleanCell(String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[|;`"'“”‘’]+/g, " ")
    .replace(/[^\p{L}\p{N}\s.,:+%()&/_-]/gu, " "));

  text = removeFieldLabels(text)
    .replace(/\b(jm|j\/m|pdv|vpc|mpc|rabat|rab|iznos|ukupno|total|subtotal)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = text
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((token) => {
      if (!token) return false;
      if (/^[.,:+%()&/_-]+$/.test(token)) return false;
      if (/^[o0il|.,:_-]+$/i.test(token)) return false;
      if (/^\d{7,14}$/.test(compactDigits(token))) return false;
      if (/^\d+$/.test(token) && token.length > 6) return false;
      const alnum = (token.match(/[\p{L}\p{N}]/gu) || []).length;
      const bad = token.replace(/[\p{L}\p{N}.,:+%()&/_-]/gu, "").length;
      if (!alnum || bad) return false;
      if (token.length === 1 && !/\d/.test(token)) return false;
      return true;
    });

  const clean = cleanCell(tokens.join(" ")).slice(0, 180);
  const letters = (clean.match(/\p{L}/gu) || []).length;
  const alnum = (clean.match(/[\p{L}\p{N}]/gu) || []).length;
  if (letters < 2 || alnum < 3) return "";
  return clean;
}

function articleNameTokens(value) {
  return Array.from(new Set(normalizeLetters(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token))));
}

function articleNameSimilarity(left, right) {
  const leftTokens = articleNameTokens(left);
  const rightTokens = articleNameTokens(right);
  if (!leftTokens.length || !rightTokens.length) return 1;
  const rightSet = new Set(rightTokens);
  const matches = leftTokens.filter((token) => rightSet.has(token) || rightTokens.some((other) => other.includes(token) || token.includes(other))).length;
  return matches / Math.max(leftTokens.length, rightTokens.length);
}

function shouldTrustInventoryMatch(row, match, matchType) {
  if (matchType === "barcode") return true;

  const scannedName = cleanCell(row?.naziv);
  const dbName = cleanCell(match?.NazivArtikla);
  const scannedScore = articleNameScore(scannedName);
  const dbScore = articleNameScore(dbName);

  if (matchType === "sifra") {
    if (scannedScore < 10 || dbScore < 10) return false;
    return articleNameSimilarity(scannedName, dbName) >= 0.32;
  }

  if (scannedScore < 10 || dbScore < 10) return false;
  return articleNameSimilarity(scannedName, dbName) >= 0.32;
}

function isValidRowNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= MAX_ARTICLE_ROW_NO;
}

function parseRowNumberToken(value) {
  const token = normalizeOcrDigits(cleanCell(value)).replace(/[^\d.)-]/g, "");
  const match = token.match(/^(\d{1,6})[.)-]?$/);
  if (!match) return "";
  const number = Number(match[1]);
  return isValidRowNumber(number) ? number : "";
}

function tokenLooksLikeUnitOrAmount(value) {
  const token = normalizeLetters(cleanCell(value)).replace(/[^a-z0-9,.\-%]+/g, "");
  if (!token) return true;
  if (/^(kom|komad|komada|kg|g|l|lit|m|m2|m3|pak|set|pcs)$/i.test(token)) return true;
  if (/^\d+(?:[,.]\d+)?%?$/.test(token)) return true;
  if (/^\d+(?:[,.]\d+)?(kom|kg|g|l|m|m2|m3|pak|set|pcs)$/i.test(token)) return true;
  return false;
}

function trustedLeadingRowMatch(match) {
  if (!match) return false;
  const rowNo = parseRowNumberToken(match[1]);
  if (!rowNo) return false;
  const nextToken = cleanCell(match[2] || "");
  if (!nextToken || tokenLooksLikeUnitOrAmount(nextToken)) return false;
  return isValidArticleCode(nextToken) || compactDigits(nextToken).length >= 7 || /[A-Za-z]{3,}/.test(nextToken);
}

function extractTrustedLeadingRowNumber(line) {
  const match = cleanCell(line).match(/^\s*([\dOoIl|]{1,6})[\s.)-]+(\S+)/);
  return trustedLeadingRowMatch(match) ? parseRowNumberToken(match[1]) : "";
}

function rowHasQuantityUnit(row) {
  return QTY_UNIT_RE.test(`${row?.sourceLine || ""} ${row?.kolicina || ""}`);
}

function isPlausibleQuantity(row) {
  if (!hasValue(row?.kolicina)) return true;
  const quantity = Number(row.kolicina);
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  if (quantity <= 300) return true;
  return quantity <= 1000 && rowHasQuantityUnit(row);
}

function parsedRowScore(row) {
  const normalizedSource = normalizeLetters(row?.sourceLine || row?.naziv || "");
  if (HEADER_NOISE_RE.test(normalizedSource) || FOOTER_LINE_RE.test(normalizedSource)) return -40;
  if (row?._invalidRowNo) return -60;

  const scoreName = articleNameScore(row?.naziv);
  const codeOk = isValidArticleCode(row?.sifra);
  const barcode = compactDigits(row?.barcode);
  const quantity = Number(row?.kolicina);
  const price = Number(row?.vpc);
  const discount = Number(row?.rabat);

  let score = 0;
  if (isValidRowNumber(row?.redniBroj)) score += 12;
  if (codeOk) score += /^\d+$/.test(cleanCell(row.sifra)) ? 20 : 10;
  else if (row?.sifra) score -= 12;
  if (barcode.length >= 7 && barcode.length <= 13) score += barcode.length === 13 ? 12 : 7;
  if (isLikelyEan13(barcode)) score += 8;
  score += Math.min(22, scoreName);
  if (Number.isFinite(quantity) && quantity > 0 && isPlausibleQuantity(row)) score += 12;
  else if (hasValue(row?.kolicina)) score -= 12;
  if (Number.isFinite(price) && price > 0 && price < 100000) score += 8;
  if (Number.isFinite(discount) && discount >= 0 && discount <= 100) score += 4;
  if (!codeOk && barcode.length < 7) score -= 12;
  if (scoreName < 6) score -= 16;

  return score;
}

function cleanupParsedRow(row) {
  const sifra = cleanArticleCode(row?.sifra);
  const barcode = compactDigits(row?.barcode);
  const redniBroj = isValidRowNumber(row?.redniBroj) ? Number(row.redniBroj) : "";
  const invalidRowNo = hasValue(row?.redniBroj) && !redniBroj;
  const quantity = Number(row?.kolicina);
  const safeQuantity = hasValue(row?.kolicina) && Number.isFinite(quantity)
    ? row.kolicina
    : "";
  return {
    ...row,
    redniBroj,
    _invalidRowNo: invalidRowNo,
    sifra,
    barcode: barcode.length >= 7 && barcode.length <= 13 ? barcode : "",
    naziv: cleanArticleName(row?.naziv),
    kolicina: safeQuantity,
  };
}

function pruneNumberedOutliers(rows) {
  const numbered = rows
    .filter((row) => isValidRowNumber(row.redniBroj))
    .sort((a, b) => Number(a.redniBroj) - Number(b.redniBroj));
  if (numbered.length < 5) return rows;

  const numbers = Array.from(new Set(numbered.map((row) => Number(row.redniBroj))));
  const maxNumber = numbers[numbers.length - 1] || 0;
  const span = maxNumber - (numbers[0] || 0);
  if (maxNumber > MAX_SEQUENTIAL_ROW_NO || span > numbers.length * 5) return rows;

  let cutFrom = Infinity;
  for (let i = 1; i < numbers.length; i += 1) {
    const gap = numbers[i] - numbers[i - 1];
    if (gap > 10 && i >= 5) {
      cutFrom = numbers[i];
      break;
    }
  }

  if (!Number.isFinite(cutFrom)) return rows;
  return rows.filter((row) => !row.redniBroj || Number(row.redniBroj) < cutFrom);
}

function isAmountOnlyRow(row) {
  return !row?.sifra &&
    compactDigits(row?.barcode).length < 7 &&
    articleNameScore(row?.naziv) < 6 &&
    (hasValue(row?.kolicina) || hasValue(row?.vpc) || hasValue(row?.rabat));
}

function rowsLikelySameArticle(left, right) {
  if (!left || !right) return false;
  if (isAmountOnlyRow(left) || isAmountOnlyRow(right)) return true;

  const leftBarcode = compactDigits(left.barcode);
  const rightBarcode = compactDigits(right.barcode);
  if (leftBarcode.length >= 7 && rightBarcode.length >= 7) return leftBarcode === rightBarcode;

  const leftCode = cleanArticleCode(left.sifra);
  const rightCode = cleanArticleCode(right.sifra);
  if (leftCode && rightCode) return normalizeLetters(leftCode) === normalizeLetters(rightCode);

  const leftName = cleanCell(left.naziv);
  const rightName = cleanCell(right.naziv);
  if (articleNameScore(leftName) >= 10 && articleNameScore(rightName) >= 10) {
    return articleNameSimilarity(leftName, rightName) >= 0.58;
  }

  return !leftCode && !rightCode && leftBarcode.length < 7 && rightBarcode.length < 7;
}

function filterArticleRows(rows) {
  const ranked = rows
    .map(cleanupParsedRow)
    .map((row, order) => ({ ...row, _order: order, _score: parsedRowScore(row) }))
    .filter((row) => {
      if (row._invalidRowNo || !isPlausibleQuantity(row)) return false;
      const minScore = row.redniBroj ? MIN_NUMBERED_ROW_SCORE : MIN_UNNUMBERED_ROW_SCORE;
      const nameScore = articleNameScore(row.naziv);
      const hasStableIdentity = row.sifra || row.barcode;
      const hasTableNumbers = hasValue(row.kolicina) || hasValue(row.vpc);
      if (!row.naziv || nameScore < 8) return false;
      if (!hasStableIdentity && !row.redniBroj) return false;
      if (!hasStableIdentity && (!hasTableNumbers || nameScore < 18)) return false;
      if (row.redniBroj && !hasStableIdentity && nameScore < 18) return false;
      return row._score >= minScore;
    });

  const byNumber = new Map();
  const withoutNumber = [];
  for (const row of ranked) {
    if (!row.redniBroj) {
      withoutNumber.push(row);
      continue;
    }

    const key = `${row.pageNo || 1}:${row.redniBroj}`;
    const current = byNumber.get(key);
    if (!current) {
      byNumber.set(key, row);
      continue;
    }

    const merged = (row._score || 0) > (current._score || 0) + 8
      ? mergeRowRecords(row, current)
      : mergeRowRecords(current, row);
    byNumber.set(key, {
      ...merged,
      _score: Math.max(current._score || 0, row._score || 0),
      _order: Math.min(current._order || 0, row._order || 0),
    });
  }

  return pruneNumberedOutliers([...byNumber.values(), ...withoutNumber])
    .sort((a, b) => {
      const aNo = Number(a.redniBroj || 10000 + a._order);
      const bNo = Number(b.redniBroj || 10000 + b._order);
      return aNo - bNo || a._order - b._order;
    })
    .slice(0, MAX_RECEIPT_ROWS)
    .map(({ _order, _score, _invalidRowNo, _rowNoConflict, ...row }) => row);
}

function cleanCompanyName(value) {
  return cleanCell(String(value || "")
    .replace(/[^\p{L}\p{N} .,&/-]/gu, " ")
    .replace(/\bd\s*o\s*o\b/gi, "d.o.o."));
}

function parseNumber(value) {
  let raw = String(value || "")
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[^\d,.-]/g, "");
  if (!raw) return "";

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");

  if (comma > -1 && dot > -1) {
    raw = comma > dot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (comma > -1) {
    raw = raw.replace(",", ".");
  }

  const n = Number(raw);
  return Number.isFinite(n) ? n : "";
}

function parseDecimalColumnValue(value, kind = "money") {
  const text = String(value || "");
  const normalized = text.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
  const hasDecimalSeparator = /[,.]/.test(normalized);
  const digits = compactDigits(normalized);
  const direct = parseNumber(text);
  if (direct === "") return "";
  if (hasDecimalSeparator) return direct;

  if (digits.length >= 3 && digits.length <= 6) {
    const corrected = Number(digits) / 100;
    if (!Number.isFinite(corrected)) return direct;
    if (kind === "percent") return corrected >= 0 && corrected <= 100 ? corrected : direct;
    if (kind === "money") return corrected > 0 && corrected < 100000 ? corrected : direct;
  }

  return direct;
}

function parseMoneyValue(value) {
  return parseDecimalColumnValue(value, "money");
}

function parsePercentValue(value) {
  return parseDecimalColumnValue(value, "percent");
}

function parseQuantity(value) {
  const text = String(value || "");
  const qtyMatch = text.match(QTY_UNIT_RE);
  const hasUnit = Boolean(qtyMatch);
  const numericToken = qtyMatch?.[1] || text.match(/[\dOoIl|]{1,6}(?:[.,][\dOoIl|]{1,6})?/)?.[0] || "";
  const direct = parseNumber(numericToken);
  if (direct === "") return "";

  const normalized = numericToken.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
  const digits = compactDigits(normalized);
  const hasDecimalSeparator = /[,.]/.test(normalized);

  if (hasDecimalSeparator) {
    const match = normalized.match(/(\d{1,5})[,.](\d{1,6})/);
    if (match) {
      const whole = Number(match[1]);
      const decimal = match[2];
      if (Number.isFinite(whole) && decimal.length > 2) {
        if (decimal.startsWith("00")) return whole;
        return Number(`${whole}.${decimal.slice(0, 2)}`);
      }
    }
  }

  if (!hasDecimalSeparator && digits.length >= 3 && digits.length <= 6 && (hasUnit || digits.endsWith("00"))) {
    const corrected = Number(digits) / 100;
    if (Number.isFinite(corrected) && corrected > 0) return corrected;
  }

  return direct;
}

function formatNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value || "");
  return n.toLocaleString("bs-BA", { maximumFractionDigits: 4 });
}

function fieldIndex(line, key) {
  const normalized = normalizeLetters(line);
  const labels = FIELD_LABELS[key] || [];
  let best = -1;

  for (const label of labels) {
    const idx = normalized.indexOf(normalizeLetters(label));
    if (idx >= 0 && (best < 0 || idx < best)) best = idx;
  }

  return best;
}

function findHeader(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const hits = ["sifra", "barcode", "naziv", "kolicina", "vpc", "rabat"]
      .map((key) => fieldIndex(lines[i], key) >= 0)
      .filter(Boolean).length;

    if (hits >= 3) return i;
  }

  return -1;
}

function extractLabelValue(line, key) {
  const normalized = normalizeLetters(line);
  const labels = FIELD_LABELS[key] || [];

  for (const label of labels) {
    const cleanLabel = normalizeLetters(label);
    const idx = normalized.indexOf(cleanLabel);
    if (idx < 0) continue;

    const afterStart = idx + cleanLabel.length;
    let value = line.slice(afterStart).replace(/^\s*[:=\-]\s*/, "");
    let nextIdx = value.length;

    for (const otherKey of Object.keys(FIELD_LABELS)) {
      if (otherKey === key) continue;
      const other = fieldIndex(value, otherKey);
      if (other >= 0 && other < nextIdx) nextIdx = other;
    }

    return cleanCell(value.slice(0, nextIdx));
  }

  return "";
}

function removeFieldLabels(value) {
  let next = String(value || "");
  for (const labels of Object.values(FIELD_LABELS)) {
    for (const label of labels) {
      next = next.replace(new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), " ");
    }
  }
  return cleanCell(next);
}

function pickBarcode(line) {
  const labeled = compactDigits(extractLabelValue(line, "barcode"));
  if (labeled.length >= 7) return labeled.slice(0, 13);

  const inParentheses = Array.from(String(line || "").matchAll(/\(([^)]*\d{7,14}[^)]*)\)/g))
    .map((m) => compactDigits(m[1]))
    .filter((x) => x.length >= 7 && x.length <= 14);
  if (inParentheses.length) {
    return (inParentheses.find((x) => x.length === 13) || inParentheses[0]).slice(0, 13);
  }

  const all = Array.from(String(line || "").matchAll(/\b\d{7,14}\b/g)).map((m) => m[0]);
  return all.find((x) => x.length === 13) || all.find((x) => x.length >= 7) || "";
}

function pickSifra(line, barcode) {
  const labeled = cleanCell(extractLabelValue(line, "sifra"));
  if (labeled) {
    const token = labeled.match(/[A-Z0-9][A-Z0-9./_-]{1,24}/i)?.[0] || labeled;
    return cleanArticleCode(token);
  }

  const tokens = cleanCell(line).match(/[A-Z0-9][A-Z0-9./_-]{2,24}/gi) || [];
  return tokens.find((token) => compactDigits(token) !== barcode && cleanArticleCode(token)) || "";
}

function extractNumbers(line, sifra, barcode, redniBroj = "") {
  let work = String(line || "");
  if (redniBroj) {
    work = work.replace(new RegExp(`^\\s*${String(redniBroj).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s.)-]+`), " ");
  }
  if (sifra) work = work.replaceAll(sifra, " ");
  if (barcode) work = work.replaceAll(barcode, " ");
  return Array.from(work.matchAll(NUMBER_RE)).map((m) => ({
    raw: m[0],
    value: parseNumber(m[0]),
    percent: m[0].includes("%"),
  })).filter((x) => x.value !== "");
}

function findLastQtyUnit(value) {
  const matches = Array.from(String(value || "").matchAll(new RegExp(QTY_UNIT_RE.source, "ig")));
  return matches[matches.length - 1] || null;
}

function extractOcrNumberTokens(value) {
  return Array.from(String(value || "").matchAll(/\S+/g))
    .map((match) => {
      const token = match[0];
      const raw = token.replace(/[^\dOoIl|,.\-%]/g, "");
      if (!/\d/.test(raw) && !/[,.]/.test(raw)) return null;
      const normalized = normalizeOcrDigits(raw);
      if (!/\d/.test(normalized) || !/^-?\d+(?:[.,]\d+)?%?$/.test(normalized)) return null;
      const number = parseNumber(raw);
      if (number === "") return null;
      return {
        raw,
        token,
        value: number,
        percent: raw.includes("%"),
        index: match.index || 0,
        end: (match.index || 0) + token.length,
      };
    })
    .filter(Boolean);
}

function buildName(line, sifra, barcode) {
  const labeled = extractLabelValue(line, "naziv");
  let work = labeled || line;
  if (sifra) work = work.replaceAll(sifra, " ");
  if (barcode) work = work.replaceAll(barcode, " ");
  work = work.replace(/\([^)]*\d{7,14}[^)]*\)/g, " ");
  work = work.replace(NUMBER_RE, " ");
  work = removeFieldLabels(work);
  work = work.replace(/\b(kom|pcs|kg|l|m|m2|m3)\b/gi, " ");
  return cleanArticleName(work);
}

function extractLineValue(lines, labels, type = "text") {
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const normalized = normalizeLetters(line);
    for (const label of labels) {
      const cleanLabel = normalizeLetters(label);
      const idx = normalized.indexOf(cleanLabel);
      if (idx < 0) continue;

      const raw = line.slice(idx + cleanLabel.length).replace(/^\s*[:=\-./]*\s*/, "");
      if (type === "date") {
        const date = extractDateValue(raw) || extractDateValue(lines.slice(lineIndex, lineIndex + 3).join(" "));
        if (date) return date;
        continue;
      }

      if (type === "invoice") {
        const value = cleanInvoiceNumberValue(raw) || cleanInvoiceNumberValue(lines.slice(lineIndex, lineIndex + 3).join(" "));
        if (value) return value;
        continue;
      }

      if (type === "number") {
        const value = compactDigits(raw.match(/\d[\d .-]{4,}/)?.[0] || raw.match(/\d{5,}/)?.[0] || "");
        if (value.length >= 5) return value;
        continue;
      }

      const value = cleanCell(raw);
      if (value) return value;
    }
  }

  return "";
}

function findMetaValue(lines, requiredWords, type = "text", blockedWords = []) {
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const normalized = normalizeLetters(line).replace(/[^a-z0-9]+/g, " ");
    if (!requiredWords.every((word) => normalized.includes(normalizeLetters(word)))) continue;
    if (blockedWords.some((word) => normalized.includes(normalizeLetters(word)))) continue;

    if (type === "date") {
      const date = extractDateValue(line) || extractDateValue(lines.slice(lineIndex, lineIndex + 3).join(" "));
      if (date) return date;
    }

    if (type === "invoice") {
      const value = cleanInvoiceNumberValue(line) || cleanInvoiceNumberValue(lines.slice(lineIndex, lineIndex + 3).join(" "));
      if (value) return value;
    }

    if (type === "number") {
      const number = line.match(/\d[\d .-]{4,}/)?.[0] || "";
      const compact = compactDigits(number);
      if (compact.length >= 5) return compact;
    }

    const value = cleanCell(line.replace(/^.*?[:=\-]\s*/, ""));
    if (value && value !== line) return value;
  }

  return "";
}

function invoiceLabelMatch(line) {
  const normalized = normalizeLetters(line).replace(/[^a-z0-9]+/g, " ").trim();
  if (/\b(datum|pdv|jib|id broj|telefon|tel|fax|ziro|racun kupca|transakcijski)\b/.test(normalized)) return false;
  const hasInvoiceWord = /\b(racun|acun|cun|faktura|otpremnica)\b/.test(normalized);
  const hasNumberWord = /\b(br|broj|brojracuna)\b/.test(normalized);
  return hasInvoiceWord && (hasNumberWord || /\b(faktura|otpremnica)\b/.test(normalized));
}

function extractInvoiceNumberFallback(lines) {
  for (const line of (lines || []).slice(0, 32)) {
    const text = cleanCell(line?.text || line);
    if (!invoiceLabelMatch(text)) continue;

    const candidates = Array.from(normalizeOcrDigits(text).matchAll(/\d[\d ._/-]{4,}/g))
      .map((match) => cleanInvoiceNumberValue(match[0]))
      .filter(Boolean);
    if (candidates.length) return candidates[candidates.length - 1];
  }

  return "";
}

function lineLooksLikeArticleStart(line) {
  const text = cleanCell(line?.text || line);
  if (!text) return false;
  return lineLooksLikeHeader(text) || ARTICLE_ROW_RE.test(text);
}

function documentHeaderTextLines(lines) {
  const cleanLines = (lines || [])
    .map((line) => cleanCell(line?.text || line))
    .filter(Boolean);
  if (!cleanLines.length) return [];

  const tableIndex = cleanLines.findIndex((line, index) => {
    if (index < 4) return false;
    const normalized = normalizeLetters(line);
    return lineLooksLikeArticleStart(line) || (index >= 8 && DOCUMENT_META_STOP_RE.test(normalized));
  });
  const limit = tableIndex > 0
    ? Math.min(tableIndex, 48)
    : Math.min(cleanLines.length, 38);
  return cleanLines.slice(0, limit);
}

function documentHeaderLayoutLines(lines) {
  const sorted = (lines || [])
    .filter((line) => cleanCell(line?.text))
    .sort((a, b) => (Math.abs(Number(a.y || 0) - Number(b.y || 0)) > 8 ? Number(a.y || 0) - Number(b.y || 0) : Number(a.x || 0) - Number(b.x || 0)));
  if (!sorted.length) return [];
  if (sorted.length <= 24 && !sorted.some(lineLooksLikeArticleStart)) return sorted;

  const minY = Math.min(...sorted.map((line) => Number(line.y0 ?? line.y ?? 0)));
  const maxY = Math.max(...sorted.map((line) => Number(line.y1 ?? line.y ?? 0)));
  const span = Math.max(1, maxY - minY);
  const articleHeaderY = sorted
    .filter(lineLooksLikeArticleStart)
    .map((line) => Number(line.y || line.y0 || 0))
    .filter((y) => Number.isFinite(y) && y > minY + span * 0.08)
    .sort((a, b) => a - b)[0];
  const fallbackCutoff = minY + span * 0.42;
  const cutoff = articleHeaderY
    ? Math.min(articleHeaderY - Math.max(6, span * 0.012), fallbackCutoff)
    : fallbackCutoff;

  return sorted.filter((line) => Number(line.y || line.y0 || 0) <= cutoff);
}

function isCompanyCandidate(line) {
  const clean = cleanCompanyName(line);
  if (clean.length < 4 || clean.length > 52) return false;
  if (HEADER_NOISE_RE.test(normalizeLetters(clean))) return false;
  if (/\d{3,}/.test(clean)) return false;
  return /\p{L}{3,}/u.test(clean);
}

function supplierCandidateScore(line, index) {
  const clean = cleanCompanyName(line);
  const normalized = normalizeLetters(clean);
  if (!isCompanyCandidate(clean)) return 0;
  if (/\b(kupac|primaoc|racun|faktura|datum|broj)\b/.test(normalized)) return 0;

  const letters = (clean.match(/\p{L}/gu) || []).length;
  const words = clean.match(/\p{L}{3,}/gu) || [];
  let score = Math.min(25, letters) + Math.min(14, words.length * 5);
  if (/\b(d\.?\s*o\.?\s*o\.?|doo|d\.d\.|dd|obrt|tr|s\.p\.)\b/i.test(clean)) score += 18;
  if (index <= 2) score += 18;
  else if (index <= 5) score += 8;
  if (/[A-ZČĆŽŠĐ]{4,}/.test(clean)) score += 8;
  if (/\b(bosnia|herzegovina|cazin|brcko|brčko|bb|ulica)\b/.test(normalized)) score -= 16;
  if (/\d/.test(clean)) score -= 12;
  return score;
}

function extractSupplierCandidate(lines) {
  const candidates = lines
    .slice(0, 14)
    .map((line, index) => ({
      value: cleanCompanyName(line),
      score: supplierCandidateScore(line, index),
      index,
    }))
    .filter((candidate) => candidate.score >= 24)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return candidates[0]?.value || "";
}

function extractDocumentMeta(lines) {
  const headerLines = documentHeaderTextLines(lines);
  const supplier = extractSupplierCandidate(headerLines);
  const customer = "";

  const joined = headerLines.join(" ");
  const invoiceNo =
    extractLineValue(headerLines, ["Broj racuna", "Broj računa", "Racun br", "Račun br", "Cun br", "CUN br", "Acun br", "Faktura br", "Otpremnica br"], "invoice") ||
    extractInvoiceNumberFallback(headerLines) ||
    findMetaValue(headerLines, ["broj", "rac"], "invoice") ||
    findMetaValue(headerLines, ["cun", "br"], "invoice") ||
    findMetaValue(headerLines, ["acun", "br"], "invoice") ||
    findMetaValue(headerLines, ["rac", "br"], "invoice") ||
    findMetaValue(headerLines, ["broj"], "invoice", ["pdv", "jib", "id", "fiskal", "telefon", "tel", "transakcijski"]) ||
    cleanInvoiceNumberValue(cleanCell(joined.match(/(?:racun|račun|acun|cun|faktura|otpremnica)(?:\s*[-–]?\s*(?:br|broj|otpremnica))?\.?\s*[:.-]?\s*([A-Z]?\d[\d ._/-]{4,})/i)?.[1] || ""));

  const invoiceDate =
    extractLineValue(headerLines, ["Datum racuna", "Datum računa"], "date") ||
    findMetaValue(headerLines, ["datum", "rac"], "date", ["dosp", "valuta"]) ||
    findMetaValue(headerLines, ["datum"], "date", ["dosp", "valuta"]);
  const deliveryDate =
    extractLineValue(headerLines, ["Datum dospijeca", "Datum dospijeća"], "date") ||
    findMetaValue(headerLines, ["datum", "dosp"], "date") ||
    findMetaValue(headerLines, ["valuta"], "date");
  const pageInfo = cleanCell((lines || []).join(" ").match(/stranica\s*\d+\s*\/\s*\d+/i)?.[0] || "");

  return {
    supplier,
    customer,
    invoiceNo,
    invoiceDate,
    deliveryDate,
    pageInfo,
  };
}

function mergeMeta(current, next, options = {}) {
  const merged = { ...(current || EMPTY_META) };
  for (const key of Object.keys(EMPTY_META)) {
    let value = next?.[key];
    if ((key === "invoiceDate" || key === "deliveryDate") && value) {
      value = normalizeInvoiceDate(value) || value;
    }
    if (value && (!merged[key] || (options.preferDates && (key === "invoiceDate" || key === "deliveryDate")))) {
      merged[key] = value;
    }
  }
  return merged;
}

function lineIncludesWords(line, words) {
  const normalized = normalizeLetters(line?.text || line).replace(/[^a-z0-9]+/g, " ");
  return words.every((word) => normalized.includes(normalizeLetters(word)));
}

function extractLayoutValueNearLabel(lines, requiredWords, type = "text") {
  const labelLines = lines.filter((line) => lineIncludesWords(line, requiredWords));

  for (const labelLine of labelLines) {
    const sameLine = cleanCell(labelLine.text || "");
    if (type === "date") {
      const sameDate = extractDateValue(sameLine);
      if (sameDate) return sameDate;
    }

    if (type === "invoice") {
      const sameInvoice = cleanInvoiceNumberValue(sameLine);
      if (sameInvoice) return sameInvoice;
    }

    if (type === "number") {
      const sameNumber = sameLine.match(/\d[\d .-]{4,}/)?.[0] || "";
      const compact = compactDigits(sameNumber);
      if (compact.length >= 5) return compact;
    }

    const nearby = lines
      .filter((line) => line !== labelLine)
      .filter((line) => Math.abs(Number(line.y || 0) - Number(labelLine.y || 0)) <= 26)
      .filter((line) => Number(line.x || 0) >= Number(labelLine.x || 0) || Number(line.x1 || 0) > Number(labelLine.x1 || 0))
      .sort((a, b) => Math.abs(Number(a.y || 0) - Number(labelLine.y || 0)) - Math.abs(Number(b.y || 0) - Number(labelLine.y || 0)));

    for (const line of nearby) {
      if (type === "date") {
        const date = extractDateValue(line.text || "");
        if (date) return date;
      }

      if (type === "invoice") {
        const invoice = cleanInvoiceNumberValue(line.text || "");
        if (invoice) return invoice;
      }

      if (type === "number") {
        const number = String(line.text || "").match(/\d[\d .-]{4,}/)?.[0] || "";
        const compact = compactDigits(number);
        if (compact.length >= 5) return compact;
      }
    }
  }

  return "";
}

function extractDocumentMetaFromLayout(lines) {
  const headerLines = documentHeaderLayoutLines(lines);
  const textLines = headerLines.map((line) => line.text);
  const allTextLines = lines.map((line) => line.text);
  return {
    supplier: extractSupplierCandidate(textLines),
    customer: "",
    invoiceNo:
      extractInvoiceNumberFallback(textLines) ||
      extractLayoutValueNearLabel(lines, ["broj", "rac"], "invoice") ||
      extractLayoutValueNearLabel(lines, ["cun", "br"], "invoice") ||
      extractLayoutValueNearLabel(lines, ["acun", "br"], "invoice"),
    invoiceDate: extractLayoutValueNearLabel(lines, ["datum", "rac"], "date"),
    deliveryDate: extractLayoutValueNearLabel(lines, ["datum", "dosp"], "date"),
    pageInfo: cleanCell(allTextLines.join(" ").match(/stranica\s*\d+\s*\/\s*\d+/i)?.[0] || ""),
  };
}

function groupInvoiceArticleLines(lines, headerIndex) {
  const startAt = headerIndex >= 0 ? headerIndex + 1 : 0;
  const groups = [];
  let current = null;

  for (let i = startAt; i < lines.length; i += 1) {
    const line = cleanCell(lines[i]);
    if (!line) continue;

    const normalized = normalizeLetters(line);
    if (FOOTER_LINE_RE.test(normalized)) {
      if (current) groups.push(current);
      break;
    }

    const startMatch = line.match(ARTICLE_ROW_RE);
    if (startMatch) {
      if (current) groups.push(current);
      current = {
        rowNo: Number(startMatch[1]),
        sifra: cleanCell(startMatch[2]),
        parts: [startMatch[3]],
        sourceLine: line,
      };
      continue;
    }

    if (!current) continue;
    if (/^\(?\d{7,14}\)?$/.test(compactDigits(line)) || /\([^)]*\d{7,14}[^)]*\)/.test(line) || !STOP_LINE_RE.test(normalized)) {
      current.parts.push(line);
      current.sourceLine = `${current.sourceLine} ${line}`;
    }
  }

  if (current && !groups.includes(current)) groups.push(current);
  return groups;
}

function parseInvoiceGroup(group, pageNo) {
  const body = cleanCell(group.parts.join(" "));
  const barcode = pickBarcode(body);
  const sifra = cleanArticleCode(group.sifra);
  const qtyMatch = findLastQtyUnit(body);

  let kolicina = "";
  let vpc = "";
  let rabat = "";
  let nameArea = body;
  let numericArea = body;

  if (qtyMatch) {
    kolicina = parseQuantity(qtyMatch[0]);
    nameArea = body.slice(0, qtyMatch.index);
    numericArea = body.slice(qtyMatch.index + qtyMatch[0].length);
    const nums = Array.from(numericArea.matchAll(NUMBER_RE)).map((m) => m[0]).filter(Boolean);
    vpc = nums[0] ? parseMoneyValue(nums[0]) : "";
    rabat = nums[1] ? parsePercentValue(nums[1]) : "";
  } else {
    const nums = extractNumbers(body, sifra || group.sifra, barcode);
    if (nums.length >= 7) {
      kolicina = parseQuantity(nums[nums.length - 7].raw);
      vpc = parseMoneyValue(nums[nums.length - 6].raw);
      rabat = parsePercentValue(nums[nums.length - 5].raw);
    }
  }

  let naziv = cleanArticleName(nameArea
    .replace(/\([^)]*\d{7,14}[^)]*\)/g, " ")
    .replace(barcode ? new RegExp(barcode, "g") : /$a/, " ")
    .replace(/\b(kom|komad|komada|kg|g|l|m|m2|m3|pak|pcs)\b/gi, " "));

  if (!naziv) naziv = buildName(body, group.sifra, barcode);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    pageNo,
    redniBroj: group.rowNo,
    sifra,
    barcode: barcode.length >= 7 ? barcode : "",
    naziv,
    kolicina,
    vpc,
    rabat,
    generatedBarcode: "",
    exists: false,
    matchType: "",
    match: null,
    sourceLine: group.sourceLine,
  };
}

function parseInvoiceTableRows(lines, headerIndex, pageNo) {
  return filterArticleRows(groupInvoiceArticleLines(lines, headerIndex)
    .map((group) => parseInvoiceGroup(group, pageNo))
    .filter((row) => row.sifra || row.barcode || row.naziv)
    .filter((row) => row.naziv.length >= 2));
}

function normalizeParsedRow(raw, sourceLine, pageNo) {
  const line = cleanCell(sourceLine);
  const rowMatch = line.match(ARTICLE_ROW_RE);
  const trustedRowMatch = trustedLeadingRowMatch(rowMatch);
  const redniBroj = trustedRowMatch
    ? parseRowNumberToken(rowMatch[1])
    : parseRowNumberToken(raw.redniBroj) || extractTrustedLeadingRowNumber(line);
  const inferredSifra = raw.sifra || (trustedRowMatch ? rowMatch?.[2] : "") || pickSifra(line, raw.barcode || "");
  const sifra = cleanArticleCode(inferredSifra);
  const barcode = compactDigits(raw.barcode || pickBarcode(line));
  const numbers = extractNumbers(line, sifra, barcode, redniBroj);

  let kolicina = parseQuantity(raw.kolicina);
  let vpc = parseMoneyValue(raw.vpc);
  let rabat = parsePercentValue(raw.rabat);

  if (kolicina === "" && numbers.length) kolicina = parseQuantity(numbers[0].raw);
  if (vpc === "" && numbers.length >= 2) vpc = parseMoneyValue(numbers[numbers.length - 1].raw);

  const percent = numbers.find((x) => x.percent && Number(x.value) <= 100);
  if (rabat === "" && percent) rabat = parsePercentValue(percent.raw);
  if (rabat === "" && numbers.length >= 3) {
    const last = parsePercentValue(numbers[numbers.length - 1].raw);
    if (Number(last) <= 100) {
      rabat = last;
      vpc = parseMoneyValue(numbers[numbers.length - 2].raw);
    }
  }

  const naziv = cleanArticleName(raw.naziv || buildName(line, sifra, barcode));
  if (!sifra && !barcode && naziv.length < 3) return null;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    pageNo,
    redniBroj,
    sifra,
    barcode: barcode.length >= 7 ? barcode : "",
    naziv,
    kolicina,
    vpc,
    rabat,
    generatedBarcode: "",
    exists: false,
    matchType: "",
    match: null,
    sourceLine: line,
  };
}

function parseColumnRows(lines, headerIndex, pageNo) {
  if (headerIndex < 0) return [];

  const header = lines[headerIndex];
  const columns = ["redniBroj", "sifra", "barcode", "naziv", "kolicina", "vpc", "rabat"]
    .map((key) => ({ key, pos: fieldIndex(header, key) }))
    .filter((x) => x.pos >= 0)
    .sort((a, b) => a.pos - b.pos);

  if (columns.length < 3) return [];

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = cleanCell(lines[i]);
    if (!line || STOP_LINE_RE.test(normalizeLetters(line))) continue;

    const raw = {};
    columns.forEach((column, index) => {
      const end = columns[index + 1]?.pos ?? line.length;
      raw[column.key] = cleanCell(line.slice(column.pos, end));
    });

    const parsed = normalizeParsedRow(raw, line, pageNo);
    if (parsed) rows.push(parsed);
  }

  return filterArticleRows(rows);
}

function parseLooseRows(lines, pageNo) {
  const rows = lines
    .filter((line) => {
      const clean = cleanCell(line);
      if (clean.length < 4) return false;
      const normalized = normalizeLetters(clean);
      if (STOP_LINE_RE.test(normalized) || DOCUMENT_META_STOP_RE.test(normalized)) return false;
      if (HEADER_NOISE_RE.test(normalized) || FOOTER_LINE_RE.test(normalized)) return false;
      const hasLetters = /[A-Za-z]/.test(clean);
      const hasNumbers = /\d/.test(clean);
      const hasBarcodeInName = /\([^)]*\d{7,14}[^)]*\)/.test(clean);
      const hasQty = QTY_UNIT_RE.test(clean);
      return hasLetters && hasNumbers && (ARTICLE_ROW_RE.test(clean) || hasBarcodeInName || hasQty);
    })
    .map((line) => normalizeParsedRow({}, line, pageNo))
    .filter(Boolean);
  return filterArticleRows(rows);
}

function hasValue(value) {
  return value !== "" && value !== null && value !== undefined;
}

function normalizePricingFields(row) {
  const next = { ...(row || {}) };
  for (const field of PRICING_NUMBER_FIELDS) {
    const value = next[field];
    next[field] = hasValue(value) ? parseNumber(value) : "";
  }
  return {
    vpc2: "",
    rabat2: "",
    vpc3: "",
    rabat3: "",
    mpc: "",
    ...next,
  };
}

function normalizePricingRows(rows) {
  return (rows || []).map(normalizePricingFields);
}

function preferRowValue(existing, incoming, field) {
  if (!hasValue(incoming)) return existing;
  if (!hasValue(existing)) return incoming;

  if (PRICING_NUMBER_FIELDS.includes(field)) {
    const current = Number(existing);
    const next = Number(incoming);
    if (!Number.isFinite(next)) return existing;
    if (!Number.isFinite(current)) return incoming;
    if (current > 0 && next === 0) return existing;
    if (field === "kolicina" && current >= 1000 && next > 0 && next <= current / 50) return incoming;
    if (field.startsWith("rabat") && (next < 0 || next > 100)) return existing;
    return existing;
  }

  if (field === "sifra") {
    const currentOk = isValidArticleCode(existing);
    const nextOk = isValidArticleCode(incoming);
    if (!nextOk) return existing;
    if (!currentOk) return incoming;
    return existing;
  }

  if (field === "barcode") {
    const currentDigits = compactDigits(existing);
    const nextDigits = compactDigits(incoming);
    if (nextDigits.length < 7) return existing;
    if (nextDigits.length === 13 && currentDigits.length !== 13) return incoming;
    if (isLikelyEan13(nextDigits) && !isLikelyEan13(currentDigits)) return incoming;
    return existing;
  }

  if (field === "naziv") {
    const current = cleanArticleName(existing);
    const next = cleanArticleName(incoming);
    if (!next) return current;
    if (!current) return next;
    const currentScore = articleNameScore(current);
    const nextScore = articleNameScore(next);
    if (current.length < 12 && next.length > current.length) return next;
    if (nextScore >= currentScore + 5 && next.length >= current.length * 0.75) return next;
    return current;
  }

  return existing;
}

function mergeRowRecords(existing, incoming) {
  const merged = { ...existing };

  for (const [field, value] of Object.entries(incoming)) {
    if (field === "id" || field === "pageNo" || field === "_mergeOrder") continue;
    merged[field] = preferRowValue(merged[field], value, field);
  }

  merged.id = existing.id;
  merged.pageNo = Math.min(existing.pageNo || incoming.pageNo || 1, incoming.pageNo || 1);
  merged.exists = Boolean(existing.exists || incoming.exists);
  merged.match = existing.match || incoming.match || null;
  merged.matchType = existing.matchType || incoming.matchType || "";
  if (merged.exists) merged.generatedBarcode = "";

  return merged;
}

function sortRowsByDocumentOrder(rows) {
  return [...rows].sort((a, b) => {
    const pageDiff = Number(a.pageNo || 1) - Number(b.pageNo || 1);
    if (pageDiff) return pageDiff;

    const aRowNo = Number(a.redniBroj);
    const bRowNo = Number(b.redniBroj);
    const aHasRowNo = isValidRowNumber(aRowNo);
    const bHasRowNo = isValidRowNumber(bRowNo);
    if (aHasRowNo && bHasRowNo && aRowNo !== bRowNo) return aRowNo - bRowNo;
    if (aHasRowNo !== bHasRowNo) return aHasRowNo ? -1 : 1;

    return Number(a._mergeOrder || 0) - Number(b._mergeOrder || 0);
  });
}

function mergeRows(rows) {
  const map = new Map();

  for (const [order, row] of rows.entries()) {
    const redniBroj = Number(row.redniBroj);
    const key = isValidRowNumber(redniBroj)
      ? `page:${row.pageNo || 1}:row:${redniBroj}`
      : row.barcode
        ? `barcode:${compactDigits(row.barcode)}`
        : row.sifra
          ? `sifra:${normalizeLetters(row.sifra)}`
          : `naziv:${normalizeLetters(row.naziv || "")}`;

    if (!isValidRowNumber(redniBroj) && !row.barcode && !row.sifra && articleNameScore(row.naziv) >= 14) {
      const similarEntry = Array.from(map.entries()).find(([, candidate]) => (
        !isValidRowNumber(candidate.redniBroj) &&
        !candidate.barcode &&
        !candidate.sifra &&
        articleNameScore(candidate.naziv) >= 14 &&
        articleNameSimilarity(candidate.naziv, row.naziv) >= 0.76
      ));

      if (similarEntry) {
        const [similarKey, similarRow] = similarEntry;
        map.set(similarKey, mergeRowRecords(similarRow, { ...row, _mergeOrder: order }));
        continue;
      }
    }

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row, _mergeOrder: order });
      continue;
    }

    map.set(key, mergeRowRecords(existing, { ...row, _mergeOrder: order }));
  }

  return sortRowsByDocumentOrder(Array.from(map.values()))
    .map(({ _mergeOrder, _rowNoConflict, ...row }) => row);
}

function estimateMaxDocumentRowNumber(rows) {
  const numbers = Array.from(new Set((rows || [])
    .map((row) => Number(row?.redniBroj))
    .filter((number) => isValidRowNumber(number))))
    .sort((a, b) => a - b);
  if (numbers.length < 6) {
    const maxNumber = numbers[numbers.length - 1] || 0;
    return maxNumber > MAX_SEQUENTIAL_ROW_NO ? MAX_ARTICLE_ROW_NO : maxNumber || MAX_ARTICLE_ROW_NO;
  }

  const maxNumber = numbers[numbers.length - 1] || 0;
  const span = maxNumber - (numbers[0] || 0);
  if (maxNumber > MAX_SEQUENTIAL_ROW_NO || span > numbers.length * 5) return MAX_ARTICLE_ROW_NO;

  let max = numbers[0];
  for (const number of numbers.slice(1)) {
    if (number - max > 5 && max >= 8) break;
    max = number;
  }

  return max || MAX_ARTICLE_ROW_NO;
}

function pruneRowsToDocumentSequence(rows, referenceRows = []) {
  const merged = filterArticleRows(mergeRows(rows || []));
  const reference = referenceRows?.length ? referenceRows : merged;
  const maxRowNo = estimateMaxDocumentRowNumber(reference);
  const knownKeys = new Set((referenceRows || []).map(rowMergeKey).filter(Boolean));

  return merged.filter((row) => {
    const redniBroj = Number(row.redniBroj);
    if (isValidRowNumber(redniBroj)) return redniBroj <= maxRowNo;
    if (!referenceRows?.length) return true;
    const key = rowMergeKey(row);
    return key && knownKeys.has(key);
  });
}

function rowMergeKey(row) {
  const redniBroj = Number(row?.redniBroj);
  if (isValidRowNumber(redniBroj)) return `page:${row.pageNo || 1}:row:${redniBroj}`;
  const barcode = compactDigits(row?.barcode);
  if (barcode.length >= 7) return `barcode:${barcode}`;
  if (row?.sifra) return `sifra:${normalizeLetters(row.sifra)}`;
  return "";
}

function rowsShareDocumentRow(left, right) {
  const leftPage = Number(left?.pageNo || 1);
  const rightPage = Number(right?.pageNo || 1);
  if (leftPage !== rightPage) return false;

  const leftRowNo = Number(left?.redniBroj);
  const rightRowNo = Number(right?.redniBroj);
  return isValidRowNumber(leftRowNo) && isValidRowNumber(rightRowNo) && leftRowNo === rightRowNo;
}

function rowsShareStableIdentity(left, right) {
  const leftPage = Number(left?.pageNo || 1);
  const rightPage = Number(right?.pageNo || 1);
  if (leftPage !== rightPage) return false;

  const leftBarcode = compactDigits(left?.barcode);
  const rightBarcode = compactDigits(right?.barcode);
  if (leftBarcode.length >= 7 && rightBarcode.length >= 7) return leftBarcode === rightBarcode;

  const leftCode = cleanArticleCode(left?.sifra);
  const rightCode = cleanArticleCode(right?.sifra);
  if (leftCode && rightCode) return normalizeLetters(leftCode) === normalizeLetters(rightCode);

  return articleNameScore(left?.naziv) >= 10 &&
    articleNameScore(right?.naziv) >= 10 &&
    articleNameSimilarity(left?.naziv, right?.naziv) >= 0.68;
}

function mergeRowRecordsPreferIncoming(existing, incoming) {
  const merged = { ...existing };
  const incomingFields = [
    "redniBroj",
    "sifra",
    "barcode",
    "naziv",
    "kolicina",
    "vpc",
    "rabat",
    "vpc2",
    "rabat2",
    "vpc3",
    "rabat3",
    "mpc",
    "sourceLine",
  ];

  for (const field of incomingFields) {
    if (hasValue(incoming?.[field])) merged[field] = incoming[field];
  }

  merged.id = existing.id;
  merged.pageNo = incoming.pageNo || existing.pageNo || 1;
  merged.exists = Boolean(incoming.exists || existing.exists);
  merged.match = incoming.match || existing.match || null;
  merged.matchType = incoming.matchType || existing.matchType || "";
  merged.generatedBarcode = merged.exists || merged.barcode
    ? ""
    : incoming.generatedBarcode || existing.generatedBarcode || "";

  return merged;
}

function rowNumberCoverage(rows) {
  const numbers = Array.from(new Set((rows || [])
    .map((row) => Number(row?.redniBroj))
    .filter((number) => isValidRowNumber(number))))
    .sort((a, b) => a - b);
  if (!numbers.length) return null;
  return {
    min: numbers[0],
    max: numbers[numbers.length - 1],
    count: numbers.length,
  };
}

function reconcileRowsWithScan(beforeRows, incomingRows, { reason = "manual" } = {}) {
  const incoming = normalizePricingRows(incomingRows || []);
  if (!incoming.length) return normalizePricingRows(beforeRows || []);
  if (reason === "upload") return incoming;

  const before = normalizePricingRows(beforeRows || []);
  const incomingByPage = new Map();
  for (const row of incoming) {
    const page = Number(row.pageNo || 1);
    if (!incomingByPage.has(page)) incomingByPage.set(page, []);
    incomingByPage.get(page).push(row);
  }

  const preparedIncoming = incoming.map((row) => {
    const existing = before.find((candidate) => (
      (rowsShareDocumentRow(candidate, row) || rowsShareStableIdentity(candidate, row)) &&
      rowsLikelySameArticle(candidate, row)
    ));
    return existing ? mergeRowRecordsPreferIncoming(existing, row) : row;
  });

  const keepExisting = before.filter((row) => {
    const pageRows = incomingByPage.get(Number(row.pageNo || 1));
    if (!pageRows?.length) return true;

    const samePageBefore = before.filter((candidate) => Number(candidate.pageNo || 1) === Number(row.pageNo || 1));
    const coverage = rowNumberCoverage(pageRows);
    const replaceWholePage = reason === "upload" ||
      (pageRows.length >= Math.max(3, Math.ceil(samePageBefore.length * 0.75)) && samePageBefore.length > 0);
    if (replaceWholePage) return false;

    const rowNo = Number(row.redniBroj);
    if (coverage && isValidRowNumber(rowNo) && rowNo >= coverage.min && rowNo <= coverage.max) {
      return false;
    }

    return !pageRows.some((incomingRow) => rowsShareDocumentRow(row, incomingRow) || rowsShareStableIdentity(row, incomingRow));
  });

  return normalizePricingRows(mergeRows([...keepExisting, ...preparedIncoming]));
}

function mergeAssistRows(primaryRows, assistRows) {
  const baseRows = filterArticleRows(mergeRows(primaryRows || []));
  if (!baseRows.length) return [];

  const byKey = new Map();
  for (const row of baseRows) {
    const key = rowMergeKey(row);
    if (key) byKey.set(key, row);
  }

  for (const assistRow of filterArticleRows(assistRows || [])) {
    const key = rowMergeKey(assistRow);
    if (!key || !byKey.has(key)) continue;
    byKey.set(key, mergeRowRecords(byKey.get(key), assistRow));
  }

  return filterArticleRows(Array.from(byKey.values()));
}

function mergeLeftDetailRows(primaryRows, leftRows) {
  const trustedLeftRows = filterArticleRows(leftRows || [])
    .filter((row) => isValidRowNumber(row.redniBroj))
    .filter((row) => row.sifra || row.barcode || articleNameScore(row.naziv) >= 12);

  return filterArticleRows(mergeRows([...(primaryRows || []), ...trustedLeftRows]));
}

function mergeAmountFields(row, amountRow) {
  if (!amountRow) return row;
  const next = { ...row };

  if (hasValue(amountRow.kolicina) && isPlausibleQuantity(amountRow)) next.kolicina = amountRow.kolicina;
  if (hasValue(amountRow.vpc)) {
    const value = Number(amountRow.vpc);
    if (Number.isFinite(value) && value > 0 && value < 100000) next.vpc = value;
  }
  if (hasValue(amountRow.rabat)) {
    const value = Number(amountRow.rabat);
    if (Number.isFinite(value) && value >= 0 && value <= 100) next.rabat = value;
  }

  next.sourceLine = cleanCell(`${row.sourceLine || ""} ${amountRow.sourceLine || ""}`);
  return next;
}

function mergeAmountRowsByOrder(primaryRows, amountRows) {
  const baseRows = filterArticleRows(mergeRows(primaryRows || []))
    .sort((a, b) => Number(a.redniBroj || 10000) - Number(b.redniBroj || 10000));
  const seenAmounts = new Set();
  const amounts = (amountRows || [])
    .filter((row) => hasValue(row.kolicina) || hasValue(row.vpc) || hasValue(row.rabat))
    .filter((row) => {
      const key = isValidRowNumber(row.redniBroj)
        ? `row:${row.pageNo || 1}:${row.redniBroj}`
        : `amount:${normalizeLetters(row.sourceLine || "")}:${row.kolicina || ""}:${row.vpc || ""}:${row.rabat || ""}`;
      if (seenAmounts.has(key)) return false;
      seenAmounts.add(key);
      return true;
    });
  if (!baseRows.length || !amounts.length) return baseRows;

  const byRowNo = new Map(amounts
    .filter((row) => isValidRowNumber(row.redniBroj))
    .map((row) => [Number(row.redniBroj), row]));
  let amountIndex = 0;

  return filterArticleRows(baseRows.map((row) => {
    const exact = byRowNo.get(Number(row.redniBroj));
    if (exact) return mergeAmountFields(row, exact);
    if (amountIndex >= amounts.length) return row;
    const amount = amounts[amountIndex];
    amountIndex += 1;
    return mergeAmountFields(row, amount);
  }));
}

function compactMissingNumbers(numbers) {
  if (!numbers.length) return "";
  const ranges = [];
  let start = numbers[0];
  let prev = numbers[0];

  for (const number of numbers.slice(1)) {
    if (number === prev + 1) {
      prev = number;
      continue;
    }

    ranges.push(start === prev ? String(start) : `${start}-${prev}`);
    start = number;
    prev = number;
  }

  ranges.push(start === prev ? String(start) : `${start}-${prev}`);
  return ranges.slice(0, 4).join(", ");
}

function findMissingRowNumbers(rows) {
  const rowNumbers = Array.from(new Set(rows
    .map((row) => Number(row.redniBroj))
    .filter((number) => isValidRowNumber(number))))
    .sort((a, b) => a - b);
  if (rowNumbers.length < 4) return [];
  const maxNumber = rowNumbers[rowNumbers.length - 1] || 0;
  const span = maxNumber - (rowNumbers[0] || 0);
  if (maxNumber > MAX_SEQUENTIAL_ROW_NO || span > rowNumbers.length * 5) return [];

  const missing = [];
  for (let n = rowNumbers[0]; n <= rowNumbers[rowNumbers.length - 1]; n += 1) {
    if (!rowNumbers.includes(n)) missing.push(n);
  }

  return missing;
}

function countMissing(rows, predicate) {
  return rows.reduce((sum, row) => sum + (predicate(row) ? 1 : 0), 0);
}

function buildScanGuidance(rows, meta, pageNo) {
  const pageRows = rows.filter((row) => Number(row.pageNo || 1) === Number(pageNo));
  const targetRows = pageRows.length ? pageRows : rows;
  const hints = [];

  if (!meta?.invoiceDate) {
    hints.push("Za datum računa usmjeri kameru prema gornjem desnom dijelu dokumenta.");
  }

  if (!targetRows.length) {
    hints.push("Učitaj jasniju sliku na kojoj se vide zaglavlje tabele i nekoliko redova odjednom.");
    return hints;
  }

  const missingNumbers = findMissingRowNumbers(targetRows);
  const numberedRows = targetRows.filter((row) => row.redniBroj).length;
  const missingSifra = countMissing(targetRows, (row) => !row.sifra);
  const missingNaziv = countMissing(targetRows, (row) => articleNameScore(row.naziv) < 10);
  const missingQty = countMissing(targetRows, (row) => !hasValue(row.kolicina));
  const missingVpc = countMissing(targetRows, (row) => !hasValue(row.vpc));
  const suspiciousQty = targetRows.some((row) => Number(row.kolicina) > 500 && String(row.sourceLine || "").match(/\bkom\b/i));
  const total = Math.max(1, targetRows.length);

  if (numberedRows < Math.min(4, total)) {
    hints.push("Na slici mora biti vidljiva lijeva ivica tabele da vidim kolonu # i stvarni redoslijed redova.");
  } else if (missingNumbers.length) {
    hints.push(`Fale redovi ${compactMissingNumbers(missingNumbers)}. Učitaj dodatnu sliku tog dijela dokumenta.`);
  }

  if (missingSifra / total > 0.25) {
    hints.push("Fale šifre artikala. Učitaj sliku gdje je kolona Šifra oštra i vidljiva.");
  }

  if (missingNaziv / total > 0.25) {
    hints.push("Fale nazivi artikala. Učitaj ravnu sliku sredine tabele bez zamućenja.");
  }

  if ((missingQty + missingVpc) / total > 0.35) {
    hints.push("Fale količina ili VPC. Učitaj dodatnu sliku desne strane tabele.");
  }

  if (suspiciousQty) {
    hints.push("Neki brojevi još izgledaju kao da je zarez promašen. Učitaj oštriju sliku kolona sa količinama.");
  }

  return hints.slice(0, 2);
}

function buildScanStatus({ reason, pageNo, parsedCount, beforeRows, rows, meta }) {
  const added = Math.max(0, rows.length - beforeRows.length);
  const updated = Math.max(0, parsedCount - added);
  const base = reason === "auto"
    ? `Stranica ${pageNo}: učitano ${parsedCount} stavki. Automatsko čitanje je završeno.`
    : `Stranica ${pageNo}: učitano ${parsedCount} stavki.`;
  const progress = added || updated
    ? ` Novo: ${added}, dopunjeno: ${updated}.`
    : " Nema novih redova, ali sam provjerio postojeće podatke.";
  const hints = buildScanGuidance(rows, meta, pageNo);
  return `${base}${progress}${hints.length ? ` ${hints.join(" ")}` : " Podaci izgledaju stabilno."}`;
}

function median(values) {
  if (!values.length) return 8;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 8;
}

function lineTextFromWords(line) {
  const words = Array.isArray(line?.words)
    ? line.words
      .map((word) => ({ text: cleanCell(word?.text), bbox: word?.bbox || {} }))
      .filter((word) => word.text)
      .sort((a, b) => (a.bbox.x0 || 0) - (b.bbox.x0 || 0))
    : [];

  if (!words.length) return cleanCell(line?.text || "");

  const charWidths = words
    .map((word) => {
      const width = Math.max(0, Number(word.bbox.x1 || 0) - Number(word.bbox.x0 || 0));
      return width / Math.max(1, word.text.length);
    })
    .filter((width) => width > 1 && width < 40);
  const avgCharWidth = Math.max(4, median(charWidths));

  let text = words[0].text;
  let previousBox = words[0].bbox;

  for (const word of words.slice(1)) {
    const gap = Number(word.bbox.x0 || 0) - Number(previousBox.x1 || 0);
    const spaces = gap > avgCharWidth * 2.4
      ? Math.min(10, Math.max(2, Math.round(gap / avgCharWidth)))
      : 1;
    text += `${" ".repeat(spaces)}${word.text}`;
    previousBox = word.bbox;
  }

  return trimOcrLine(text);
}

function structuredTextFromOcr(data) {
  return ocrLinesFromData(data)
    .sort((a, b) => (Math.abs(a.y - b.y) > 8 ? a.y - b.y : a.x - b.x))
    .map((line) => line.text)
    .join("\n")
    .trim();
}

function ocrLinesFromData(data) {
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
  const lines = [];

  for (const block of blocks) {
    for (const paragraph of block?.paragraphs || []) {
      for (const line of paragraph?.lines || []) {
        const text = lineTextFromWords(line);
        if (!text) continue;
        const bbox = line?.bbox || {};
        const words = Array.isArray(line?.words)
          ? line.words
            .map((word) => {
              const wordBox = word?.bbox || {};
              const wordText = cleanCell(word?.text);
              return {
                text: wordText,
                x0: Number(wordBox.x0 || 0),
                x1: Number(wordBox.x1 || 0),
                y0: Number(wordBox.y0 || 0),
                y1: Number(wordBox.y1 || 0),
                cx: (Number(wordBox.x0 || 0) + Number(wordBox.x1 || 0)) / 2,
                cy: (Number(wordBox.y0 || 0) + Number(wordBox.y1 || 0)) / 2,
              };
            })
            .filter((word) => word.text)
            .sort((a, b) => a.x0 - b.x0)
          : [];

        lines.push({
          text,
          x: Number(bbox.x0 || 0),
          x1: Number(bbox.x1 || 0),
          y0: Number(bbox.y0 || 0),
          y1: Number(bbox.y1 || 0),
          y: (Number(bbox.y0 || 0) + Number(bbox.y1 || 0)) / 2,
          words,
        });
      }
    }
  }

  return lines;
}

function lineLooksLikeHeader(line) {
  const normalized = normalizeLetters(line?.text || "");
  const hits = [
    normalized.includes("#"),
    /\b(id|rb|r\.?\s*br|redni)\b/.test(normalized),
    /\bsifra\b/.test(normalized),
    /\b(barcode|bar\s*code|barkod)\b/.test(normalized),
    /\b(opis|naziv)\b/.test(normalized),
    /\b(jm|j\/m)\b/.test(normalized),
    /\b(kolicina|kol)\b/.test(normalized),
    /\b(vpc|cij|cijena|cena)\b/.test(normalized),
    /\b(r1|rab)\b/.test(normalized),
  ].filter(Boolean).length;
  return hits >= 2;
}

function wordMatches(word, matchers) {
  const normalized = normalizeLetters(word?.text || "").replace(/[^a-z0-9#%]+/g, "");
  return matchers.some((matcher) => matcher.test(normalized));
}

function medianNumber(values, fallback = 0) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return fallback;
  return clean[Math.floor(clean.length / 2)];
}

function buildColumnGuide(lines) {
  const allWords = lines.flatMap((line) => line.words || []);
  const maxX = Math.max(1, ...allWords.map((word) => word.x1), ...lines.map((line) => line.x1 || 0));
  const headerLines = lines.filter(lineLooksLikeHeader);
  const headerY = headerLines.length
    ? medianNumber(headerLines.map((line) => line.y), Math.min(...lines.map((line) => line.y || 0)))
    : 0;
  const headerWords = headerLines.length
    ? headerLines.flatMap((line) => line.words || [])
    : allWords;

  const findXs = (matchers, after = -Infinity) => headerWords
      .filter((word) => word.cx > after && wordMatches(word, matchers))
      .map((word) => word.cx);
  const pickX = (matchers, fallback, after = -Infinity) => {
    const matches = findXs(matchers, after);
    return matches.length ? Math.min(...matches) : fallback;
  };

  const barcodeMatchers = [/^barcode$/, /^barcodeartikla$/, /^bar\s*code$/, /^barkod$/, /^ean$/, /^gtin$/];
  const jmMatchers = [/^jm$/, /^j\/m$/, /^j-m$/];
  const rabatMatchers = [/^r1$/, /^rab/, /^rabat$/];
  const hasBarcodeColumn = findXs(barcodeMatchers).length > 0;
  const hasJmColumn = findXs(jmMatchers).length > 0;
  const hasRabatColumn = findXs(rabatMatchers).length > 0;

  const rowNoX = pickX([/^#$/, /^id#?$/, /^rb$/, /^rbr$/, /^redni$/], maxX * 0.11);
  const sifraX = pickX([/^sifra$/, /^ifra$/], maxX * 0.16);
  const barcodeX = hasBarcodeColumn
    ? Math.max(pickX(barcodeMatchers, maxX * 0.25, sifraX - 1), sifraX + maxX * 0.04)
    : sifraX + maxX * 0.04;
  const nazivX = Math.max(
    pickX([/^opis$/, /^naziv$/, /^proizvod$/], hasBarcodeColumn ? maxX * 0.34 : maxX * 0.25, sifraX - 1),
    hasBarcodeColumn ? barcodeX + maxX * 0.06 : sifraX + maxX * 0.06,
  );
  const jmX = hasJmColumn
    ? Math.max(pickX(jmMatchers, maxX * 0.54, nazivX - 1), nazivX + maxX * 0.12)
    : nazivX + maxX * 0.18;
  const kolicinaX = Math.max(
    pickX([/^kolicina$/, /^kol$/, /^koliina$/, /^qty$/], hasJmColumn ? maxX * 0.6 : maxX * 0.58, nazivX - 1),
    hasJmColumn ? jmX + maxX * 0.04 : nazivX + maxX * 0.2,
  );
  const vpcX = Math.max(
    pickX([/^vpc$/, /^cij$/, /^cijena$/, /^cena$/, /^price$/], maxX * 0.66, kolicinaX - 1),
    kolicinaX + maxX * 0.04,
  );
  const rabatX = hasRabatColumn
    ? Math.max(pickX(rabatMatchers, maxX * 0.72, vpcX - 1), vpcX + maxX * 0.04)
    : vpcX + maxX * 0.12;

  const ordered = [
    ["redniBroj", Math.min(rowNoX, sifraX * 0.7)],
    ["sifra", Math.max(sifraX, rowNoX + 8)],
    ...(hasBarcodeColumn ? [["barcode", Math.max(barcodeX, sifraX + 20)]] : []),
    ["naziv", Math.max(nazivX, barcodeX + 20)],
    ...(hasJmColumn ? [["jm", Math.max(jmX, nazivX + 40)]] : []),
    ["kolicina", Math.max(kolicinaX, jmX + 12)],
    ["vpc", Math.max(vpcX, kolicinaX + 20)],
    ...(hasRabatColumn ? [["rabat", Math.max(rabatX, vpcX + 20)]] : []),
    ["afterRabat", Math.max(maxX * 0.78, rabatX + 20)],
  ].sort((a, b) => a[1] - b[1]);

  const starts = Object.fromEntries(ordered);
  const boundary = (left, right) => (starts[left] + starts[right]) / 2;
  const boundBetween = (key) => {
    const index = ordered.findIndex(([name]) => name === key);
    if (index < 0) return [0, 0];
    const start = index === 0 ? 0 : (ordered[index - 1][1] + ordered[index][1]) / 2;
    const end = index >= ordered.length - 1 ? maxX + 1 : (ordered[index][1] + ordered[index + 1][1]) / 2;
    return [start, end];
  };

  return {
    maxX,
    headerY,
    hasHeader: headerLines.length > 0,
    bounds: {
      redniBroj: [0, boundary("redniBroj", "sifra")],
      sifra: boundBetween("sifra"),
      barcode: boundBetween("barcode"),
      naziv: boundBetween("naziv"),
      jm: boundBetween("jm"),
      kolicina: boundBetween("kolicina"),
      vpc: boundBetween("vpc"),
      rabat: boundBetween("rabat"),
    },
  };
}

function wordsInBound(words, bound) {
  if (!bound) return [];
  const [start, end] = bound;
  return words.filter((word) => word.cx >= start && word.cx < end);
}

function wordsText(words) {
  return cleanCell((words || []).map((word) => word.text).join(" "));
}

function parseRowNumber(words, guide) {
  const rowNoBoundEnd = guide.bounds.redniBroj?.[1] || guide.maxX * 0.06;
  const tolerance = Math.max(10, guide.maxX * 0.012);
  const firstWord = words[0];
  const candidates = wordsInBound(words, guide.bounds.redniBroj);
  if (firstWord && firstWord.cx <= rowNoBoundEnd + tolerance && !candidates.includes(firstWord)) {
    candidates.push(firstWord);
  }

  for (const word of candidates) {
    const number = parseRowNumberToken(word.text);
    if (number) return number;
  }

  return "";
}

function rowCellsFromLine(line, guide) {
  const words = line.words?.length
    ? line.words
    : cleanCell(line.text).split(/\s+/).map((text, index) => ({ text, cx: line.x + index * 12 }));
  return {
    redniBroj: parseRowNumber(words, guide),
    sifra: wordsText(wordsInBound(words, guide.bounds.sifra)),
    barcode: wordsText(wordsInBound(words, guide.bounds.barcode)),
    naziv: wordsText(wordsInBound(words, guide.bounds.naziv)),
    jm: wordsText(wordsInBound(words, guide.bounds.jm)),
    kolicina: wordsText(wordsInBound(words, guide.bounds.kolicina)),
    vpc: wordsText(wordsInBound(words, guide.bounds.vpc)),
    rabat: wordsText(wordsInBound(words, guide.bounds.rabat)),
    sourceLine: line.text,
  };
}

function mergeLayoutCellText(current, next) {
  const cleanCurrent = cleanCell(current);
  const cleanNext = cleanCell(next);
  if (!cleanNext) return cleanCurrent;
  if (!cleanCurrent) return cleanNext;
  if (normalizeLetters(cleanCurrent).includes(normalizeLetters(cleanNext))) return cleanCurrent;
  return cleanCell(`${cleanCurrent} ${cleanNext}`);
}

function layoutGroupToRow(group, pageNo) {
  const sourceLine = group.sourceLines.join(" ");
  const barcode = pickBarcode(group.barcode) || pickBarcode(`${group.naziv} ${sourceLine}`);
  const sifra = cleanArticleCode(group.sifra || pickSifra(sourceLine, barcode));
  const kolicina = parseQuantity(group.kolicina);
  const vpc = parseMoneyValue(group.vpc);
  const rabat = parsePercentValue(group.rabat);
  const naziv = cleanArticleName((group.naziv || buildName(sourceLine, sifra, barcode))
    .replace(/\([^)]*\d{7,14}[^)]*\)/g, " ")
    .replace(barcode ? new RegExp(barcode, "g") : /$a/, " "));
  const nameScore = articleNameScore(naziv);
  const hasStableIdentity = sifra || barcode.length >= 7;
  const hasTableNumbers = hasValue(kolicina) || hasValue(vpc);

  if (!naziv || nameScore < 8) return null;
  if (!group.redniBroj && !hasStableIdentity) return null;
  if (!hasStableIdentity && (!hasTableNumbers || nameScore < 18)) return null;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    pageNo,
    redniBroj: group.redniBroj,
    sifra,
    barcode: barcode.length >= 7 ? barcode : "",
    naziv,
    kolicina,
    vpc,
    rabat,
    generatedBarcode: "",
    exists: false,
    matchType: "",
    match: null,
    sourceLine,
  };
}

function parseLayoutDocument(data, pageNo) {
  const lines = ocrLinesFromData(data)
    .filter((line) => cleanCell(line.text))
    .sort((a, b) => (Math.abs(a.y - b.y) > 8 ? a.y - b.y : a.x - b.x));
  if (!lines.length) return { meta: EMPTY_META, rows: [] };

  const guide = buildColumnGuide(lines);
  const groups = [];
  let current = null;

  for (const line of lines) {
    const normalized = normalizeLetters(line.text);
    if (lineLooksLikeHeader(line) || HEADER_NOISE_RE.test(normalized)) continue;
    if (FOOTER_LINE_RE.test(normalized)) break;
    if (guide.hasHeader && line.y < guide.headerY + 8) continue;

    const cells = rowCellsFromLine(line, guide);
    const rowNo = cells.redniBroj;
    const barcode = pickBarcode(cells.barcode) || pickBarcode(cells.naziv);
    const hasArticleSignal = rowNo || cleanArticleCode(cells.sifra) || barcode || QTY_UNIT_RE.test(cells.kolicina);
    if (!hasArticleSignal && !current) continue;

    if (rowNo || (!current && cleanArticleCode(cells.sifra))) {
      if (current) groups.push(current);
      current = {
        redniBroj: rowNo,
        sifra: cells.sifra,
        barcode: cells.barcode,
        naziv: cells.naziv,
        jm: cells.jm,
        kolicina: cells.kolicina,
        vpc: cells.vpc,
        rabat: cells.rabat,
        sourceLines: [cells.sourceLine],
      };
      continue;
    }

    if (!current) continue;
    current.barcode = current.barcode || cells.barcode;
    current.naziv = mergeLayoutCellText(current.naziv, cells.naziv || cells.sourceLine);
    current.jm = current.jm || cells.jm;
    current.kolicina = current.kolicina || cells.kolicina;
    current.vpc = current.vpc || cells.vpc;
    current.rabat = current.rabat || cells.rabat;
    current.sourceLines.push(cells.sourceLine);
  }

  if (current) groups.push(current);

  return {
    meta: mergeMeta(extractDocumentMeta(lines.map((line) => line.text)), extractDocumentMetaFromLayout(lines)),
    rows: filterArticleRows(groups.map((group) => layoutGroupToRow(group, pageNo)).filter(Boolean)),
  };
}

function parseAmountLine(line, pageNo, order, options = {}) {
  const text = cleanCell(line?.text || line);
  if (!text) return null;
  const normalized = normalizeLetters(text);
  if (lineLooksLikeHeader(line) || FOOTER_LINE_RE.test(normalized) || HEADER_NOISE_RE.test(normalized) || STOP_LINE_RE.test(normalized)) return null;

  const rowMatch = text.match(/^\s*([\dOoIl|]{1,6})[\s.)-]+(\S+)/);
  let redniBroj = trustedLeadingRowMatch(rowMatch) ? parseRowNumberToken(rowMatch[1]) : "";
  let rowNoEnd = rowMatch ? rowMatch[0].length : 0;
  const qtyMatch = findLastQtyUnit(text);
  let allNumbers = extractOcrNumberTokens(text).filter((token) => !redniBroj || token.index >= rowNoEnd || Number(token.value) !== redniBroj);

  if (!redniBroj && allNumbers.length >= 4) {
    const [first, second, third] = allNumbers;
    const firstValue = Number(first?.value);
    const secondValue = Number(second?.value);
    const thirdValue = Number(third?.value);
    const firstLooksLikeRowNo = Number.isInteger(firstValue) &&
      isValidRowNumber(firstValue) &&
      firstValue <= MAX_SEQUENTIAL_ROW_NO &&
      !first.percent &&
      !second?.percent &&
      Number.isFinite(secondValue) &&
      secondValue > 0 &&
      secondValue <= 1000 &&
      Number.isFinite(thirdValue) &&
      thirdValue > 0;
    if (firstLooksLikeRowNo) {
      redniBroj = firstValue;
      rowNoEnd = first.end;
      allNumbers = allNumbers.slice(1);
    }
  }

  let kolicina = qtyMatch ? parseQuantity(qtyMatch[0]) : "";
  let qtyEnd = qtyMatch ? qtyMatch.index + qtyMatch[0].length : -1;
  let qtyTokenIndex = -1;

  if (qtyMatch) {
    qtyTokenIndex = allNumbers.findIndex((token) => token.index >= qtyMatch.index && token.index < qtyEnd);
  }

  if (!hasValue(kolicina) && allNumbers.length >= (options.relaxed ? 2 : 3)) {
    qtyTokenIndex = allNumbers.findIndex((token) => !token.percent && Number(token.value) > 0 && Number(token.value) <= 1000);
    if (qtyTokenIndex >= 0) {
      const qtyToken = allNumbers[qtyTokenIndex];
      kolicina = parseQuantity(qtyToken.raw);
      qtyEnd = qtyToken.end;
    }
  }

  const afterQty = qtyEnd >= 0
    ? allNumbers.filter((token, index) => token.index >= qtyEnd || index > qtyTokenIndex)
    : allNumbers.filter((_, index) => index > qtyTokenIndex);
  const vpcToken = afterQty.find((token) => {
    if (token.percent) return false;
    const value = parseMoneyValue(token.raw);
    return Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) < 100000;
  });
  const vpc = vpcToken ? parseMoneyValue(vpcToken.raw) : "";
  const afterVpc = vpcToken ? afterQty.filter((token) => token.index > vpcToken.index) : afterQty;
  const rabatToken = afterVpc.find((token) => {
    const value = parsePercentValue(token.raw);
    if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100) return false;
    return token.percent || Number(value) === 0 || afterVpc.length >= 2;
  });
  const rabat = rabatToken ? parsePercentValue(rabatToken.raw) : "";

  if (!hasValue(kolicina) && !hasValue(vpc) && !hasValue(rabat)) return null;

  return {
    id: `${Date.now()}-${order}-${Math.random().toString(36).slice(2)}`,
    pageNo,
    redniBroj,
    sifra: "",
    barcode: "",
    naziv: "",
    kolicina,
    vpc,
    rabat,
    generatedBarcode: "",
    exists: false,
    matchType: "",
    match: null,
    sourceLine: text,
  };
}

function parseRightAmountRows(data, pageNo) {
  const lines = ocrLinesFromData(data)
    .filter((line) => cleanCell(line.text))
    .sort((a, b) => (Math.abs(a.y - b.y) > 8 ? a.y - b.y : a.x - b.x));
  const rows = [];

  for (const line of lines) {
    const text = cleanCell(line.text);
    if (!QTY_UNIT_RE.test(text) && extractOcrNumberTokens(text).length < 2) continue;
    const row = parseAmountLine(line, pageNo, rows.length, { relaxed: true });
    if (row) rows.push(row);
  }

  return rows.slice(0, MAX_RECEIPT_ROWS);
}

function scoreParsedDocument(doc, text) {
  const rows = doc?.rows || [];
  const meta = doc?.meta || EMPTY_META;
  const rowScore = rows.reduce((sum, row) => (
    sum +
    20 +
    (row.sifra ? 8 : 0) +
    (row.barcode ? 8 : 0) +
    (row.naziv ? Math.min(10, row.naziv.length / 8) : 0) +
    (hasValue(row.kolicina) ? 8 : 0) +
    (hasValue(row.vpc) ? 8 : 0) +
    (hasValue(row.rabat) ? 3 : 0)
  ), 0);

  return rowScore +
    (meta.invoiceNo ? 20 : 0) +
    (meta.invoiceDate ? 15 : 0) +
    Math.min(20, String(text || "").length / 120);
}

function scoreOrientationText(text) {
  const raw = String(text || "");
  const normalized = normalizeLetters(raw).replace(/[^a-z0-9]+/g, " ");
  if (!normalized.trim()) return 0;

  const keywordHits = [
    "racun",
    "acun",
    "faktura",
    "otpremnica",
    "dobavljac",
    "kupac",
    "datum",
    "broj",
    "sifra",
    "barcode",
    "barkod",
    "naziv",
    "kolicina",
    "cijena",
    "vpc",
    "rabat",
    "iznos",
    "pdv",
    "ukupno",
    "veleprodaja",
  ].reduce((sum, word) => sum + (normalized.includes(word) ? 1 : 0), 0);
  const dates = (raw.match(DATE_RE) || []).length;
  const invoiceLike = (raw.match(/\b\d{2,6}[-/]\d{2,8}(?:[-/]\d{2,6})?\b/g) || []).length;
  const tableRows = (raw.match(/^\s*\d{1,6}[\s.)-]+[A-Z0-9][A-Z0-9./_-]{2,}/gmi) || []).length;
  const words = normalized.split(/\s+/).filter((word) => word.length >= 3);
  const letters = (normalized.match(/[a-z]/g) || []).length;

  return keywordHits * 18 +
    dates * 10 +
    invoiceLike * 12 +
    tableRows * 14 +
    Math.min(20, words.length / 3) +
    Math.min(16, letters / 80);
}

function scoreRecognizedPass(pass) {
  const rows = filterArticleRows(mergeRows([
    ...(pass?.layoutDoc?.rows || []),
    ...(pass?.detailDoc?.doc?.rows || []),
  ]));
  const numbered = rows.filter((row) => isValidRowNumber(row.redniBroj)).length;
  const priced = rows.filter((row) => hasValue(row.kolicina) || hasValue(row.vpc)).length;
  const meta = mergeMeta(pass?.layoutDoc?.meta, pass?.detailDoc?.doc?.meta);
  return Number(pass?.detailDoc?.score || 0) +
    scoreOrientationText(`${pass?.raw || ""}\n${pass?.structured || ""}`) +
    rows.length * 16 +
    numbered * 8 +
    priced * 6 +
    (meta.invoiceNo ? 24 : 0) +
    (meta.invoiceDate ? 14 : 0);
}

function parseBestOcrDocument(rawText, structuredText, pageNo, layoutDocs = []) {
  const inputs = Array.isArray(rawText) ? rawText : [structuredText, rawText];
  const uniqueTexts = Array.from(new Set(inputs
    .map((text) => (cleanCell(text).length ? String(text || "") : ""))
    .filter(Boolean)));
  const candidates = uniqueTexts.map((text) => {
    const doc = parseReceiptDocument(text, pageNo);
    return { text, doc, score: scoreParsedDocument(doc, text) };
  });
  for (const doc of layoutDocs) {
    if (!doc?.rows?.length && !doc?.meta) continue;
    const text = [
      doc.meta?.invoiceNo ? `Broj računa ${doc.meta.invoiceNo}` : "",
      doc.meta?.invoiceDate ? `Datum računa ${doc.meta.invoiceDate}` : "",
      ...(doc.rows || []).map((row) => row.sourceLine || row.naziv || ""),
    ].filter(Boolean).join("\n");
    candidates.push({ text, doc, score: scoreParsedDocument(doc, text) + 25 });
  }

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (!best) {
    return {
      text: rawText || structuredText || "",
      doc: { meta: EMPTY_META, rows: [] },
      score: 0,
    };
  }

  const combinedMeta = candidates.reduce((current, candidate) => mergeMeta(current, candidate.doc?.meta), { ...EMPTY_META });
  const combinedRows = filterArticleRows(mergeRows(candidates.flatMap((candidate) => candidate.doc?.rows || [])));
  if (combinedRows.length >= best.doc.rows.length) {
    const combinedDoc = { meta: combinedMeta, rows: combinedRows };
    return {
      text: uniqueTexts.join("\n\n--- OCR prolaz ---\n\n"),
      doc: combinedDoc,
      score: scoreParsedDocument(combinedDoc, uniqueTexts.join("\n")),
    };
  }

  return best || {
    text: rawText || structuredText || "",
    doc: { meta: EMPTY_META, rows: [] },
    score: 0,
  };
}

function parseReceiptDocument(text, pageNo) {
  const lines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(trimOcrLine)
    .filter(Boolean);

  const headerIndex = findHeader(lines);
  const meta = extractDocumentMeta(lines);
  const invoiceRows = parseInvoiceTableRows(lines, headerIndex, pageNo);

  if (invoiceRows.length >= 3) {
    return { meta, rows: filterArticleRows(mergeRows(invoiceRows)) };
  }

  const byColumns = parseColumnRows(lines, headerIndex, pageNo);
  const loose = invoiceRows.length || byColumns.length ? [] : parseLooseRows(lines, pageNo);
  return { meta, rows: filterArticleRows(mergeRows([...invoiceRows, ...byColumns, ...loose])) };
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function ean13CheckDigit(first12) {
  const digits = compactDigits(first12).padStart(12, "0").slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

function generateBarcode(row, index) {
  const seed = `${row.sifra}|${row.naziv}|${index}|${Date.now()}`;
  const hash = String(hashText(seed)).padStart(10, "0");
  const first12 = `29${hash}`.slice(0, 12).padEnd(12, "0");
  return `${first12}${ean13CheckDigit(first12)}`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowsToCsv(rows, meta = EMPTY_META) {
  const header = ["Stranica", "Redni broj", "Šifra", "Barcode", "Generisani barcode", "Naziv", "Količina", "VPC 1", "Rabat 1", "VPC 2", "Rabat 2", "VPC 3", "Rabat 3", "Status", "MPC"];
  const body = normalizePricingRows(rows).map((row) => [
    row.pageNo,
    row.redniBroj || "",
    row.sifra,
    row.barcode,
    row.generatedBarcode,
    row.naziv,
    row.kolicina,
    row.vpc,
    row.rabat,
    row.vpc2,
    row.rabat2,
    row.vpc3,
    row.rabat3,
    row.matchType === "sifra-neprovjereno" ? "Provjeri" : row.exists ? "Postoji" : "Novo",
    row.mpc,
  ]);
  const metaRows = [
    ["Dobavljač", meta.supplier || ""],
    ["Kupac", meta.customer || ""],
    ["Broj računa", meta.invoiceNo || ""],
    ["Datum računa", formatInvoiceDate(meta.invoiceDate) || ""],
    ["Datum dospijeća", formatInvoiceDate(meta.deliveryDate) || ""],
    [],
  ];
  return [...metaRows, header, ...body].map((line) => line.map(csvEscape).join(";")).join("\n");
}

function buildPrintableHtml(rows, docId, meta = EMPTY_META) {
  const normalizedRows = normalizePricingRows(rows);
  const totalQty = normalizedRows.reduce((sum, row) => sum + (Number(row.kolicina) || 0), 0);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Prijem robe ${escapeHtml(docId)}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#111;margin:24px}
    h1{font-size:22px;margin:0 0 6px}
    .meta{font-size:12px;color:#555;margin-bottom:16px}
    .box{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 18px;margin:12px 0 18px;font-size:12px}
    .box div{border-bottom:1px solid #ddd;padding-bottom:4px}
    .box b{display:block;font-size:10px;color:#555;text-transform:uppercase}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th,td{border:1px solid #ccc;padding:6px;text-align:left}
    th{background:#f1f5f9}
    .existing{background:#fff7ed}
    .totals{margin-top:12px;font-weight:700}
  </style>
</head>
<body>
  <h1>Prijem robe</h1>
  <div class="meta">Dokument: ${escapeHtml(docId)} | Generisano: ${escapeHtml(fmtDateTime(new Date()))}</div>
  <div class="box">
    <div><b>Dobavljač</b>${escapeHtml(meta.supplier || "-")}</div>
    <div><b>Kupac</b>${escapeHtml(meta.customer || "-")}</div>
    <div><b>Broj računa</b>${escapeHtml(meta.invoiceNo || "-")}</div>
    <div><b>Datum računa</b>${escapeHtml(formatInvoiceDate(meta.invoiceDate) || "-")}</div>
  </div>
  <table>
    <thead>
      <tr><th>#</th><th>Šifra</th><th>Barcode</th><th>Naziv</th><th>Količina</th><th>VPC 1</th><th>Rab. 1</th><th>VPC 2</th><th>Rab. 2</th><th>VPC 3</th><th>Rab. 3</th><th>Status</th><th>MPC</th></tr>
    </thead>
    <tbody>
      ${normalizedRows.map((row) => `
        <tr class="${row.exists ? "existing" : ""}">
          <td>${escapeHtml(row.redniBroj || "")}</td>
          <td>${escapeHtml(row.sifra)}</td>
          <td>${escapeHtml(row.barcode || row.generatedBarcode)}</td>
          <td>${escapeHtml(row.naziv)}</td>
          <td>${escapeHtml(formatNumber(row.kolicina))}</td>
          <td>${escapeHtml(formatNumber(row.vpc))}</td>
          <td>${escapeHtml(formatNumber(row.rabat))}</td>
          <td>${escapeHtml(formatNumber(row.vpc2))}</td>
          <td>${escapeHtml(formatNumber(row.rabat2))}</td>
          <td>${escapeHtml(formatNumber(row.vpc3))}</td>
          <td>${escapeHtml(formatNumber(row.rabat3))}</td>
          <td>${row.matchType === "sifra-neprovjereno" ? "Provjeriti šifru/naziv" : row.exists ? "Postoji u zalihama" : "Novi artikal"}</td>
          <td>${escapeHtml(formatNumber(row.mpc))}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
  <div class="totals">Ukupno artikala: ${rows.length} | Ukupna količina: ${escapeHtml(formatNumber(totalQty))}</div>
</body>
</html>`;
}

function hasPrijemDraftWork(draft) {
  const meta = draft?.docMeta || {};
  const hasMeta = Boolean(meta.supplier || meta.invoiceNo || meta.deliveryDate);
  return Boolean(
    hasMeta ||
    draft?.rows?.length ||
    draft?.scanShots?.length ||
    draft?.rawText ||
    draft?.finalDoc ||
    Number(draft?.pageNo || 1) > 1 ||
    draft?.scanPassDone ||
    Number(draft?.guidedStepIndex || 0) > 0
  );
}

function writePrijemDraft(cacheKey, draft) {
  if (typeof window === "undefined" || !window.localStorage) return false;
  const payload = {
    data: draft,
    savedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(payload));
    return true;
  } catch {
    try {
      window.localStorage.setItem(cacheKey, JSON.stringify({
        ...payload,
        data: {
          ...draft,
          scanShots: [],
        },
      }));
      return false;
    } catch {
      return false;
    }
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Fajl nije moguće pročitati."));
    reader.readAsDataURL(file);
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Fajl nije moguće pročitati."));
    reader.readAsArrayBuffer(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Slika nije učitana."));
    image.src = src;
  });
}

function rotateImageElementToDataUrl(image, degrees = 0, maxSide = 0) {
  const normalizedDegrees = ((Number(degrees) % 360) + 360) % 360;
  const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const scale = maxSide && longestSide > maxSide ? maxSide / longestSide : 1;
  const drawWidth = Math.round(sourceWidth * scale);
  const drawHeight = Math.round(sourceHeight * scale);
  const swapsAxis = normalizedDegrees === 90 || normalizedDegrees === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swapsAxis ? drawHeight : drawWidth;
  canvas.height = swapsAxis ? drawWidth : drawHeight;

  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalizedDegrees * Math.PI) / 180);
  ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  return canvas.toDataURL("image/jpeg", 0.96);
}

async function rotateDataUrl(dataUrl, degrees = 0, maxSide = 0) {
  const image = await loadImageElement(dataUrl);
  return rotateImageElementToDataUrl(image, degrees, maxSide);
}

function focusScoreFromImageData(image, width, height) {
  const data = image?.data;
  if (!data || !width || !height) return 0;
  const step = Math.max(3, Math.floor(Math.min(width, height) / 180));
  let edgeSum = 0;
  let contrastSum = 0;
  let count = 0;
  let previousGray = null;

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const idx = (y * width + x) * 4;
      const gray = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      const leftIdx = idx - step * 4;
      const rightIdx = idx + step * 4;
      const upIdx = idx - step * width * 4;
      const downIdx = idx + step * width * 4;
      const left = data[leftIdx] * 0.299 + data[leftIdx + 1] * 0.587 + data[leftIdx + 2] * 0.114;
      const right = data[rightIdx] * 0.299 + data[rightIdx + 1] * 0.587 + data[rightIdx + 2] * 0.114;
      const up = data[upIdx] * 0.299 + data[upIdx + 1] * 0.587 + data[upIdx + 2] * 0.114;
      const down = data[downIdx] * 0.299 + data[downIdx + 1] * 0.587 + data[downIdx + 2] * 0.114;

      edgeSum += Math.abs(gray * 4 - left - right - up - down);
      if (previousGray !== null) contrastSum += Math.abs(gray - previousGray);
      previousGray = gray;
      count += 1;
    }
  }

  if (!count) return 0;
  return Math.round(((edgeSum / count) * 10 + (contrastSum / count) * 2) * 10) / 10;
}

function preprocessCanvasForOcr(canvas, ctx, plan) {
  const frameImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const focusScore = focusScoreFromImageData(frameImage, canvas.width, canvas.height);
  const data = frameImage.data;
  const original = plan.sharpen ? new Uint8ClampedArray(data) : null;
  const contrast = Number.isFinite(Number(plan.contrast)) ? Number(plan.contrast) : 1.35;
  const thresholdHigh = Number.isFinite(Number(plan.thresholdHigh)) ? Number(plan.thresholdHigh) : 224;
  const thresholdLow = Number.isFinite(Number(plan.thresholdLow)) ? Number(plan.thresholdLow) : 46;
  const binarize = plan.binarize !== false;

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    let sharpened = gray;

    if (original && i > canvas.width * 4 && i < original.length - canvas.width * 4 - 4) {
      const left = original[i - 4] * 0.299 + original[i - 3] * 0.587 + original[i - 2] * 0.114;
      const right = original[i + 4] * 0.299 + original[i + 5] * 0.587 + original[i + 6] * 0.114;
      const up = original[i - canvas.width * 4] * 0.299 + original[i - canvas.width * 4 + 1] * 0.587 + original[i - canvas.width * 4 + 2] * 0.114;
      const down = original[i + canvas.width * 4] * 0.299 + original[i + canvas.width * 4 + 1] * 0.587 + original[i + canvas.width * 4 + 2] * 0.114;
      const blur = (left + right + up + down) / 4;
      sharpened = Math.max(0, Math.min(255, gray + (gray - blur) * plan.sharpen));
    }

    const contrasted = Math.max(0, Math.min(255, (sharpened - 128) * contrast + 146));
    const cleaned = binarize
      ? contrasted > thresholdHigh ? 255 : contrasted < thresholdLow ? 0 : contrasted
      : contrasted;
    data[i] = cleaned;
    data[i + 1] = cleaned;
    data[i + 2] = cleaned;
  }

  ctx.putImageData(frameImage, 0, 0);
  return focusScore;
}

function prepareOcrFrameFromImageElement(image, plan) {
  const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const sourceX = Math.round(sourceWidth * Math.max(0, Math.min(0.98, plan.x || 0)));
  const sourceY = Math.round(sourceHeight * Math.max(0, Math.min(0.98, plan.y || 0)));
  const sourceW = Math.max(1, Math.min(sourceWidth - sourceX, Math.round(sourceWidth * (plan.w || 1))));
  const sourceH = Math.max(1, Math.min(sourceHeight - sourceY, Math.round(sourceHeight * (plan.h || 1))));
  const targetWidth = Math.min(Math.max(sourceW, plan.minWidth || 2400), plan.maxWidth || 4200);
  const scale = targetWidth / sourceW;
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = Math.round(sourceH * scale);

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, canvas.width, canvas.height);

  const rawImage = canvas.toDataURL("image/jpeg", 0.96);
  const previewImage = plan.keepPreview ? rawImage : "";
  const focusScore = preprocessCanvasForOcr(canvas, ctx, plan);

  return {
    ...plan,
    previewImage,
    rawImage,
    focusScore,
    image: canvas.toDataURL("image/jpeg", 0.97),
  };
}

function DatePickerField({ value, onChange }) {
  const isoValue = normalizeInvoiceDate(value) || todayIsoDate();
  const inputRef = useRef(null);

  function openDatePicker() {
    const input = inputRef.current;
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
    try {
      input.showPicker?.();
    } catch {}
  }

  return (
    <div className="datePickerControl" onClick={openDatePicker}>
      <input
        ref={inputRef}
        className="input datePickerTextInput datePickerNativeInput"
        type="date"
        value={isoValue}
        onClick={openDatePicker}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ButtonIcon({ name }) {
  const props = {
    className: "btnIcon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
  };

  if (name === "upload") {
    return (
      <svg {...props}>
        <path d="M12 3v12" />
        <path d="m7 8 5-5 5 5" />
        <path d="M5 15v4h14v-4" />
      </svg>
    );
  }

  if (name === "refresh") {
    return (
      <svg {...props}>
        <path d="M20 12a8 8 0 0 1-13.66 5.66" />
        <path d="M4 12A8 8 0 0 1 17.66 6.34" />
        <path d="M17 2v5h5" />
        <path d="M7 22v-5H2" />
      </svg>
    );
  }

  if (name === "check") {
    return (
      <svg {...props}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }

  if (name === "trash") {
    return (
      <svg {...props}>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M6 6l1 15h10l1-15" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    );
  }

  if (name === "file") {
    return (
      <svg {...props}>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v5h5" />
        <path d="M8 13h8" />
        <path d="M8 17h6" />
      </svg>
    );
  }

  if (name === "download") {
    return (
      <svg {...props}>
        <path d="M12 4v10" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 20h14" />
      </svg>
    );
  }

  if (name === "share") {
    return (
      <svg {...props}>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.6 10.5 6.8-4" />
        <path d="m8.6 13.5 6.8 4" />
      </svg>
    );
  }

  if (name === "mail") {
    return (
      <svg {...props}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    );
  }

  if (name === "eye") {
    return (
      <svg {...props}>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  return null;
}

function ButtonLabel({ icon, children }) {
  return (
    <>
      <ButtonIcon name={icon} />
      <span>{children}</span>
    </>
  );
}

export default function PrijemRobePage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);
  const workerRef = useRef(null);
  const busyRef = useRef(false);
  const lastOcrHashRef = useRef("");
  const rowsRef = useRef([]);
  const docMetaRef = useRef(null);
  const scanResultsRef = useRef([]);
  const scanFramesRef = useRef([]);
  const lastConsoleMessageRef = useRef("");
  const wakeLockRef = useRef(null);
  const keepAwakeWantedRef = useRef(false);
  const backgroundPauseRef = useRef(false);

  const [isMobile, setIsMobile] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [ocrReady, setOcrReady] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("Unesi dobavljača i učitaj PDF ili fotografiju dokumenta.");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [pageNo, setPageNo] = useState(1);
  const [rows, setRows] = useState([]);
  const [docMeta, setDocMeta] = useState(() => createDefaultMeta());
  const [rawText, setRawText] = useState("");
  const [checking, setChecking] = useState(false);
  const [finalDoc, setFinalDoc] = useState(null);
  const [companyName, setCompanyName] = useState("");
  const [supplierSuggestions, setSupplierSuggestions] = useState([]);
  const [supplierChecking, setSupplierChecking] = useState(false);
  const [scanShots, setScanShots] = useState([]);
  const [scanShotZooms, setScanShotZooms] = useState({});
  const [scanStep, setScanStep] = useState("");
  const [scanConsole, setScanConsole] = useState([]);
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);
  const [scanPassDone, setScanPassDone] = useState(false);
  const [draftCacheKey, setDraftCacheKey] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const scanShotTouchRef = useRef({});

  if (!docMetaRef.current) docMetaRef.current = docMeta;

  const activeCameraScanPlans = useMemo(() => cameraScanPlansForSupplier(docMeta.supplier), [docMeta.supplier]);
  const activeScanTemplate = useMemo(() => supplierScanTemplate(docMeta.supplier), [docMeta.supplier]);

  const requestProcessingWakeLock = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.wakeLock || typeof document === "undefined" || document.hidden) return;
    if (wakeLockRef.current) return;

    try {
      const lock = await navigator.wakeLock.request("screen");
      wakeLockRef.current = lock;
      lock.addEventListener?.("release", () => {
        if (wakeLockRef.current === lock) wakeLockRef.current = null;
      });
    } catch {}
  }, []);

  const releaseProcessingWakeLock = useCallback(() => {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    lock?.release?.().catch?.(() => {});
  }, []);

  useEffect(() => {
    setDraftCacheKey(scopedCacheKey(PRIJEM_DRAFT_CACHE_ID));
  }, []);

  useEffect(() => {
    if (!draftCacheKey) return;
    const cached = readCachedJson(draftCacheKey, Number.POSITIVE_INFINITY);
    const draft = cached?.data;
    if (draft && hasPrijemDraftWork(draft)) {
      const restoredRows = normalizePricingRows(draft.rows || []);
      rowsRef.current = restoredRows;
      setRows(restoredRows);
      const restoredMeta = { ...createDefaultMeta(), ...(draft.docMeta || {}) };
      docMetaRef.current = restoredMeta;
      setDocMeta(restoredMeta);
      setRawText(String(draft.rawText || ""));
      setFinalDoc(draft.finalDoc || null);
      setScanShots(Array.isArray(draft.scanShots) ? draft.scanShots : []);
      setPageNo(Number(draft.pageNo || 1));
      setGuidedStepIndex(Math.min(Number(draft.guidedStepIndex || 0), SCAN_FRAME_PLANS.length));
      setScanPassDone(Boolean(draft.scanPassDone));
      setOcrStatus("Radni prijem je vraćen iz memorije. Možeš nastaviti ispravke ili poništiti unos.");
      setDraftSavedAt(cached.savedAt ? new Date(cached.savedAt).toLocaleTimeString("bs-BA", { hour: "2-digit", minute: "2-digit" }) : "");
    }
    setDraftReady(true);
  }, [draftCacheKey]);

  useEffect(() => {
    const shouldKeepAwake = Boolean(ocrBusy || checking || scannerOpen || cameraStarting);
    keepAwakeWantedRef.current = shouldKeepAwake;

    if (shouldKeepAwake) {
      requestProcessingWakeLock();
    } else {
      releaseProcessingWakeLock();
    }
  }, [cameraStarting, checking, ocrBusy, releaseProcessingWakeLock, requestProcessingWakeLock, scannerOpen]);

  useEffect(() => {
    const processing = Boolean(ocrBusy || checking || scannerOpen || cameraStarting);
    const status = processing
      ? ocrStatus || (checking ? "Provjeravam zalihe..." : scannerOpen ? "Skener je otvoren..." : "Čitam dokument...")
      : "";

    setPrijemProcessingState(processing, status);

    return () => {
      if (!processing) setPrijemProcessingState(false);
    };
  }, [cameraStarting, checking, ocrBusy, ocrStatus, scannerOpen]);

  useEffect(() => {
    function markBackgroundPause() {
      if (!busyRef.current && !keepAwakeWantedRef.current) return;
      backgroundPauseRef.current = true;

      if (busyRef.current) {
        const status = "Obrada je pauzirana dok je aplikacija u pozadini. Vrati aplikaciju i nastavljam bez ponavljanja.";
        setOcrStatus(status);
        setPrijemProcessingState(true, status);
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        markBackgroundPause();
        return;
      }

      if (keepAwakeWantedRef.current) {
        requestProcessingWakeLock();
      }

      if (backgroundPauseRef.current && busyRef.current) {
        const status = "Aplikacija je opet aktivna. Nastavljam obradu dokumenta...";
        setOcrStatus(status);
        setPrijemProcessingState(true, status);
      }

      backgroundPauseRef.current = false;
    }

    function handleBeforeUnload(event) {
      if (!busyRef.current && !keepAwakeWantedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    window.addEventListener("pagehide", markBackgroundPause);
    window.addEventListener("freeze", markBackgroundPause);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
      window.removeEventListener("pagehide", markBackgroundPause);
      window.removeEventListener("freeze", markBackgroundPause);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      releaseProcessingWakeLock();
    };
  }, [releaseProcessingWakeLock, requestProcessingWakeLock]);

  useEffect(() => {
    function handleBlockedNavigation(event) {
      const status = event?.detail?.status || "Obrada dokumenta je u toku.";
      setOcrStatus(`${status} Sačekaj da završim OCR i provjeru zaliha prije promjene taba.`);
    }

    window.addEventListener(PRIJEM_PROCESSING_BLOCKED_EVENT, handleBlockedNavigation);
    return () => window.removeEventListener(PRIJEM_PROCESSING_BLOCKED_EVENT, handleBlockedNavigation);
  }, []);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    docMetaRef.current = docMeta;
  }, [docMeta]);

  useEffect(() => {
    if (!draftReady || !draftCacheKey) return;

    const draft = {
      rows: normalizePricingRows(rows),
      docMeta,
      rawText,
      finalDoc,
      scanShots,
      pageNo,
      guidedStepIndex,
      scanPassDone,
    };

    if (!hasPrijemDraftWork(draft)) return;

    writePrijemDraft(draftCacheKey, draft);
    setDraftSavedAt(new Date().toLocaleTimeString("bs-BA", { hour: "2-digit", minute: "2-digit" }));
  }, [docMeta, draftCacheKey, draftReady, finalDoc, guidedStepIndex, pageNo, rawText, rows, scanPassDone, scanShots]);

  const totals = useMemo(() => {
    const existing = rows.filter((row) => row.exists).length;
    const newItems = rows.length - existing;
    const qty = rows.reduce((sum, row) => sum + (Number(row.kolicina) || 0), 0);
    return { existing, newItems, qty };
  }, [rows]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const enableCameraTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    const capabilities = track?.getCapabilities?.();
    if (!track?.applyConstraints || !capabilities?.torch) return false;

    try {
      await track.applyConstraints({ advanced: [{ torch: true }] });
      return true;
    } catch {
      return false;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Browser ne podržava kameru.");
      return;
    }

    try {
      setCameraError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
      const torchOn = await enableCameraTorch();
      setOcrStatus(torchOn
        ? "Blic je uključen. Centriraj kameru da se vidi cijeli dokument, pa pritisni Skeniraj."
        : "Centriraj kameru da se vidi cijeli dokument, pa pritisni Skeniraj.");
    } catch (error) {
      setCameraError(String(error?.message || error || "Kamera nije dostupna."));
    }
  }, [enableCameraTorch]);

  const getWorker = useCallback(async () => {
    if (workerRef.current) return workerRef.current;

    setOcrStatus("Učitavam OCR engine...");
    const mod = await import("tesseract.js");
    const createWorker = mod.createWorker || mod.default?.createWorker;
    const PSM = mod.PSM || mod.default?.PSM || {};

    const worker = await createWorker("eng", 1, {
      ...TESSERACT_PATHS,
      gzip: true,
      logger: (m) => {
        if (!m?.status) return;
        setOcrStatus(ocrStatusLabel(m.status));
        setOcrProgress(Math.round(Number(m.progress || 0) * 100));
      },
    });

    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.AUTO || "3",
      user_defined_dpi: "300",
    });

    workerRef.current = worker;
    setOcrReady(true);
    setOcrStatus("OCR je spreman.");
    return worker;
  }, []);

  const detectUploadedImageOrientation = useCallback(async (image, sourceLabel = "Dokument") => {
    const worker = await getWorker();
    const quickPlan = {
      key: "orientation-check",
      kind: "full",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      minWidth: 1200,
      maxWidth: 1500,
      psm: "6",
      dpi: "220",
      contrast: 1.12,
      thresholdHigh: 244,
      thresholdLow: 26,
      sharpen: 0,
      binarize: false,
      keepPreview: false,
    };

    async function scoreDegrees(degrees) {
      await waitForVisiblePage(() => {
        setOcrStatus("Provjera orijentacije je pauzirana dok se aplikacija ne vrati u fokus.");
      });
      const dataUrl = rotateImageElementToDataUrl(image, degrees, 1500);
      const rotatedImage = await loadImageElement(dataUrl);
      const frame = prepareOcrFrameFromImageElement(rotatedImage, quickPlan);
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: "6",
        user_defined_dpi: "220",
      });
      let data = null;
      try {
        const recognized = await worker.recognize(frame.image, { rotateAuto: false }, { text: true });
        data = recognized.data;
      } catch {
        await waitForVisiblePage(() => {
          setOcrStatus("OCR je čekao dok je aplikacija bila u pozadini. Nastavljam provjeru orijentacije...");
        });
        const recognized = await worker.recognize(frame.image, { rotateAuto: false }, { text: true });
        data = recognized.data;
      }
      const text = String(data?.text || "");
      return { degrees, score: scoreOrientationText(text), textLength: text.trim().length };
    }

    setOcrStatus(`${sourceLabel}: ✓ provjeravam orijentaciju stranice.`);
    await waitForUiPaint();

    const upright = await scoreDegrees(0);
    if (upright.score >= 82) return upright;

    const alternatives = [];
    for (const degrees of ORIENTATION_RETRY_DEGREES) {
      alternatives.push(await scoreDegrees(degrees));
    }

    const best = [upright, ...alternatives].sort((a, b) => b.score - a.score || b.textLength - a.textLength)[0] || upright;
    return best.score >= upright.score + 18 ? best : upright;
  }, [getWorker]);

  const stabilizeCameraForScan = useCallback(async (waitMs = 540) => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (track?.applyConstraints) {
      await enableCameraTorch();
      await track.applyConstraints({
        advanced: [
          { focusMode: "continuous" },
          { exposureMode: "continuous" },
          { whiteBalanceMode: "continuous" },
        ],
      }).catch(() => null);
    }

    await sleep(waitMs);
  }, [enableCameraTorch]);

  const captureScanFrames = useCallback(async (onStep, plans = SCAN_FRAME_PLANS) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return [];
    const framePlans = Array.isArray(plans) && plans.length ? plans : SCAN_FRAME_PLANS;

    const frames = [];
    for (const [index, plan] of framePlans.entries()) {
      onStep?.(plan, index, framePlans.length, "prepare");
      await sleep(plan.prepareMs || 120);
      await stabilizeCameraForScan(plan.focusMs || 420);
      const sampleCount = Math.max(1, Number(plan.captureSamples || 1));
      let bestFrame = null;

      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        onStep?.(plan, index, framePlans.length, sampleIndex ? "sample" : "capture", {
          sampleIndex,
          sampleCount,
          bestScore: bestFrame?.focusScore || 0,
        });
        await sleep(sampleIndex ? plan.sampleDelayMs || 90 : 80);

        const safeX = Math.max(0, Math.min(0.98, plan.x || 0));
        const safeY = Math.max(0, Math.min(0.98, plan.y || 0));
        const safeW = Math.max(0.02, Math.min(1 - safeX, plan.w || 1));
        const safeH = Math.max(0.02, Math.min(1 - safeY, plan.h || 1));
        const sourceX = Math.round(video.videoWidth * safeX);
        const sourceY = Math.round(video.videoHeight * safeY);
        const sourceW = Math.max(1, Math.round(video.videoWidth * safeW));
        const sourceH = Math.max(1, Math.round(video.videoHeight * safeH));
        const targetWidth = Math.min(Math.max(sourceW, plan.minWidth || 2400), plan.maxWidth || 4400);
        const scale = targetWidth / sourceW;
        canvas.width = targetWidth;
        canvas.height = Math.round(sourceH * scale);

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(video, sourceX, sourceY, sourceW, sourceH, 0, 0, canvas.width, canvas.height);
        const rawImage = canvas.toDataURL("image/jpeg", 0.98);
        const previewImage = plan.keepPreview ? rawImage : "";
        const focusScore = preprocessCanvasForOcr(canvas, ctx, plan);
        const candidate = {
          ...plan,
          previewImage,
          rawImage,
          focusScore,
          image: canvas.toDataURL("image/jpeg", 0.97),
        };

        if (!bestFrame || candidate.focusScore > bestFrame.focusScore) bestFrame = candidate;
      }

      if (bestFrame) frames.push(bestFrame);
      onStep?.(plan, index, framePlans.length, "done", {
        focusScore: bestFrame?.focusScore || 0,
      });
      if (plan.key !== framePlans[framePlans.length - 1].key) await sleep(260);
    }

    return frames;
  }, [stabilizeCameraForScan]);

  const enrichRows = useCallback(async (items) => {
    if (!items.length) return [];

    setChecking(true);
    try {
      await waitForVisiblePage(() => {
        setOcrStatus("Provjera zaliha je pauzirana dok se aplikacija ne vrati u fokus.");
      });
      const res = await fetch("/api/prijem-robe/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Provjera zaliha nije uspjela.");

      const byIndex = new Map((json.results || []).map((x) => [x.index, x]));
      return items.map((row, index) => {
        const result = byIndex.get(index);
        const match = result?.match || null;
        const matchType = result?.matchType || "";
        const exactCodeMatch = matchType === "sifra" || matchType === "barcode";
        const trustedExactMatch = exactCodeMatch && shouldTrustInventoryMatch(row, match, matchType);
        const exists = Boolean(result?.exists && (matchType !== "sifra" || trustedExactMatch));
        return {
          ...row,
          exists,
          match: trustedExactMatch ? match : null,
          matchType: matchType === "sifra" && !trustedExactMatch ? "sifra-neprovjereno" : matchType,
          generatedBarcode: exists || row.barcode ? "" : row.generatedBarcode || generateBarcode(row, index),
        };
      });
    } finally {
      setChecking(false);
    }
  }, []);

  const recognizeScanFrame = useCallback(async (frame) => {
    let worker = await getWorker();
    const framePageNo = Number(frame.pageNo || pageNo || 1);

    async function recognizeImage(image, psm, dpi, orientationDegrees = 0) {
      await waitForVisiblePage(() => {
        setOcrStatus("Prepoznavanje teksta je pauzirano dok se aplikacija ne vrati u fokus.");
      });

      async function configureActiveWorker() {
        await worker.setParameters({
          preserve_interword_spaces: "1",
          tessedit_pageseg_mode: psm,
          user_defined_dpi: dpi || "300",
        });
      }

      await configureActiveWorker();

      async function runRecognize() {
        return worker.recognize(image, { rotateAuto: false }, { text: true, blocks: true });
      }

      let data = null;
      try {
        const recognized = await runRecognize();
        data = recognized.data;
      } catch (error) {
        await waitForVisiblePage(() => {
          setOcrStatus("OCR je čekao dok je aplikacija bila u pozadini. Nastavljam čitanje...");
        });
        try {
          const recognized = await runRecognize();
          data = recognized.data;
        } catch {
          workerRef.current?.terminate?.();
          workerRef.current = null;
          worker = await getWorker();
          await configureActiveWorker();
          const recognized = await runRecognize();
          data = recognized.data;
        }
      }
      const raw = String(data?.text || "").trim();
      const structured = structuredTextFromOcr(data);
      const layoutDoc = parseLayoutDocument(data, framePageNo);
      const detailDoc = parseBestOcrDocument([raw, structured], "", framePageNo, layoutDoc.rows.length ? [layoutDoc] : []);
      const amountRows = parseRightAmountRows(data, framePageNo);
      const pass = { raw, structured, layoutDoc, detailDoc, amountRows, orientationDegrees, image };
      return { ...pass, score: scoreRecognizedPass(pass) };
    }

    let primary = await recognizeImage(frame.image, frame.psm, frame.dpi, 0);
    let rawImageForSoftPass = frame.rawImage;
    const primaryRows = filterArticleRows(mergeRows([
      ...(primary.layoutDoc?.rows || []),
      ...(primary.detailDoc?.doc?.rows || []),
    ]));
    const primaryRowNoCount = primaryRows.filter((row) => isValidRowNumber(row.redniBroj)).length;
    const shouldRetryOrientation = !frame.skipOrientationRetry &&
      primary.score < 120 &&
      (primaryRows.length < 2 || primaryRowNoCount < Math.ceil(primaryRows.length * 0.5) || !primary.layoutDoc?.meta?.invoiceNo);

    if (shouldRetryOrientation) {
      let bestOrientationPass = primary;

      for (const degrees of ORIENTATION_RETRY_DEGREES) {
        try {
          const rotatedImage = await rotateDataUrl(frame.image, degrees);
          const pass = await recognizeImage(rotatedImage, frame.psm, frame.dpi, degrees);
          if (pass.score > bestOrientationPass.score) bestOrientationPass = pass;
        } catch {}
      }

      if (bestOrientationPass.orientationDegrees && bestOrientationPass.score >= primary.score + 18) {
        primary = bestOrientationPass;
        rawImageForSoftPass = frame.rawImage ? await rotateDataUrl(frame.rawImage, bestOrientationPass.orientationDegrees) : "";
      }
    }

    const selectedPrimaryRows = filterArticleRows(mergeRows([
      ...(primary.layoutDoc?.rows || []),
      ...(primary.detailDoc?.doc?.rows || []),
    ]));
    const selectedPrimaryRowNoCount = selectedPrimaryRows.filter((row) => isValidRowNumber(row.redniBroj)).length;
    const frameKind = frame.kind || "";
    const canUseSoftPass = frame.allowSoftPass !== false && frameKind !== "full" && frameKind !== "header" && frameKind !== "left";
    const needsFieldCompletion = frameKind === "table" || frameKind === "correction";
    const needsSoftPass = canUseSoftPass &&
      rawImageForSoftPass &&
      rawImageForSoftPass !== primary.image &&
      (selectedPrimaryRows.length < 3 ||
        selectedPrimaryRowNoCount < Math.ceil(selectedPrimaryRows.length * 0.7) ||
        (needsFieldCompletion && selectedPrimaryRows.some((row) => !hasValue(row.kolicina) || !hasValue(row.vpc))));

    const passes = [primary];
    if (needsSoftPass) {
      const alternatePsm = String(frame.psm || "") === "4" ? "6" : "4";
      passes.push(await recognizeImage(rawImageForSoftPass, alternatePsm, frame.dpi || "480", primary.orientationDegrees || 0));
    }

    const combinedMeta = passes.reduce((current, pass) => mergeMeta(current, pass.layoutDoc?.meta || pass.detailDoc?.doc?.meta), { ...EMPTY_META });
    const combinedLayoutRows = filterArticleRows(mergeRows(passes.flatMap((pass) => pass.layoutDoc?.rows || [])));
    const combinedDetailRows = filterArticleRows(mergeRows(passes.flatMap((pass) => pass.detailDoc?.doc?.rows || [])));
    const raw = passes.map((pass) => pass.raw).filter(Boolean).join("\n\n--- OCR varijanta ---\n\n");
    const structured = passes.map((pass) => pass.structured).filter(Boolean).join("\n\n--- OCR layout ---\n\n");
    const layoutDoc = { meta: combinedMeta, rows: combinedLayoutRows };
    const detailDoc = {
      doc: { meta: combinedMeta, rows: combinedDetailRows },
      text: [raw, structured].filter(Boolean).join("\n"),
      score: scoreParsedDocument({ meta: combinedMeta, rows: combinedDetailRows }, `${raw}\n${structured}`),
    };
    const amountRows = passes.flatMap((pass) => pass.amountRows || []).slice(0, MAX_RECEIPT_ROWS);

    return {
      frame,
      raw,
      structured,
      layoutDoc,
      detailDoc,
      amountRows,
    };
  }, [getWorker, pageNo]);

  const closeScannerForProcessing = useCallback(() => {
    setScannerOpen(false);
    stopCamera();
  }, [stopCamera]);

  const buildDocumentFromScanResults = useCallback((results) => {
    const fullInputs = [];
    const fullLayoutDocs = [];
    const tableRows = [];
    const leftRows = [];
    const rightRows = [];
    const amountRows = [];
    const metaDocs = [];
    const detailTexts = [];

    for (const result of results || []) {
      const { frame, raw, structured, layoutDoc, detailDoc } = result;
      const kind = frame?.kind || "";
      const metaLines = String(raw || "").split("\n").map(trimOcrLine).filter(Boolean);

      if (kind === "full") {
        metaDocs.push({ meta: mergeMeta(extractDocumentMeta(metaLines), layoutDoc?.meta), rows: [] });
        if (raw) detailTexts.push(raw);
        if (structured) detailTexts.push(structured);
        continue;
      }

      if (kind === "header") {
        metaDocs.push({ meta: mergeMeta(extractDocumentMeta(metaLines), layoutDoc?.meta), rows: [] });
        if (raw) detailTexts.push(raw);
        if (structured) detailTexts.push(structured);
        continue;
      }

      if (raw) detailTexts.push(raw);
      if (structured) detailTexts.push(structured);

      if (kind === "table") {
        tableRows.push(...(layoutDoc?.rows || []));
        tableRows.push(...(detailDoc?.doc?.rows || []));
        continue;
      }

      if (kind === "left") {
        leftRows.push(...(layoutDoc?.rows || []));
        leftRows.push(...(detailDoc?.doc?.rows || []));
        continue;
      }

      if (kind === "right") {
        rightRows.push(...filterArticleRows([
          ...(layoutDoc?.rows || []),
          ...(detailDoc?.doc?.rows || []),
        ]).filter((row) => rowMergeKey(row)));
        amountRows.push(...(result.amountRows || []));
        continue;
      }

      if (kind === "correction") {
        metaDocs.push({ meta: mergeMeta(extractDocumentMeta(metaLines), layoutDoc?.meta), rows: [] });
        leftRows.push(...(layoutDoc?.rows || []));
        leftRows.push(...(detailDoc?.doc?.rows || []));
        rightRows.push(...(layoutDoc?.rows || []));
        rightRows.push(...(detailDoc?.doc?.rows || []));
        amountRows.push(...(result.amountRows || []));
      }
    }

    const best = fullInputs.length || fullLayoutDocs.length
      ? parseBestOcrDocument(fullInputs, "", pageNo, fullLayoutDocs)
      : { text: "", doc: { meta: EMPTY_META, rows: [] }, score: 0 };
    const allRowCandidates = filterArticleRows(mergeRows([
      ...(best.doc?.rows || []),
      ...tableRows,
      ...leftRows,
    ]));
    const rowsWithLeftDetails = mergeLeftDetailRows(allRowCandidates, leftRows);
    const rowsWithRightDetails = mergeAssistRows(rowsWithLeftDetails.length ? rowsWithLeftDetails : allRowCandidates, rightRows);
    const mergedRows = rowsWithRightDetails.length ? rowsWithRightDetails : allRowCandidates;
    const doc = {
      meta: [...metaDocs, ...fullLayoutDocs].reduce((current, scanDoc) => mergeMeta(current, scanDoc.meta), best.doc?.meta || EMPTY_META),
      rows: mergeAmountRowsByOrder(mergedRows, amountRows),
    };
    const text = [best.text, ...detailTexts].filter(Boolean).join("\n\n--- OCR detalj ---\n\n").trim();

    return { doc, text };
  }, [pageNo]);

  const applyScanResults = useCallback(async (results, reason = "manual") => {
    const { doc, text } = buildDocumentFromScanResults(results);
    setRawText(text);

    const textHash = String(hashText(text));
    if (!text || text.length < 12) {
      setOcrStatus("Približi dokument i skeniraj stranicu ponovo.");
      return;
    }
    if (lastOcrHashRef.current === textHash && reason === "correction") {
      setOcrStatus("Isti dio je već pročitan. Pomjeri kameru na dio koji treba dopuniti.");
      return;
    }
    lastOcrHashRef.current = textHash;

    let nextMetaForStatus = docMetaRef.current;
    setDocMeta((current) => {
      const merged = mergeMeta(current, {
        ...doc.meta,
        supplier: current.supplier || "",
      }, { preferDates: true });
      const nextMeta = { ...merged, customer: companyName || merged.customer };
      docMetaRef.current = nextMeta;
      nextMetaForStatus = nextMeta;
      return nextMeta;
    });

    const beforeRows = rowsRef.current;
    const currentPageRows = beforeRows.filter((row) => Number(row.pageNo || 1) === Number(pageNo));
    const parsed = pruneRowsToDocumentSequence(doc.rows, reason === "correction" ? currentPageRows : []);
    if (!parsed.length) {
      const hints = buildScanGuidance(rowsRef.current, nextMetaForStatus, pageNo);
      setOcrStatus(`Tekst je pročitan, ali artikli nisu sigurno prepoznati. ${hints[0] || "Provjeri da se vide redovi, šifra i naziv artikla."}`);
      return;
    }

    closeScannerForProcessing();
    const enriched = await enrichRows(parsed);
    const mergedRows = reconcileRowsWithScan(beforeRows, enriched, { reason });
    rowsRef.current = mergedRows;
    setRows(mergedRows);
    setOcrStatus(buildScanStatus({
      reason,
      pageNo,
      parsedCount: enriched.length,
      beforeRows,
      rows: mergedRows,
      meta: nextMetaForStatus,
    }));
  }, [buildDocumentFromScanResults, closeScannerForProcessing, companyName, enrichRows, pageNo]);

  const renderPdfPageToImage = useCallback(async (pdf, pageNumber) => {
    const pdfPage = await pdf.getPage(pageNumber);
    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const targetWidth = Math.min(3000, Math.max(1800, baseViewport.width * 2.8));
    const scale = targetWidth / baseViewport.width;
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    pdfPage.cleanup?.();
    return canvas.toDataURL("image/jpeg", 0.96);
  }, []);

  const scanUploadedImageDataUrl = useCallback(async (dataUrl, sourceLabel, sourcePageNo, supplierName = "") => {
    const baseImage = await loadImageElement(dataUrl);
    const results = [];
    let previewSaved = false;
    const scanSupplier = supplierName || docMetaRef.current?.supplier || "";
    const scanPlans = fileScanPlansForSupplier(scanSupplier);
    const template = supplierScanTemplate(scanSupplier);
    const orientation = await detectUploadedImageOrientation(baseImage, sourceLabel);
    const orientationDegrees = Number(orientation?.degrees || 0);
    const orientedDataUrl = orientationDegrees
      ? rotateImageElementToDataUrl(baseImage, orientationDegrees)
      : dataUrl;
    const image = orientationDegrees ? await loadImageElement(orientedDataUrl) : baseImage;

    if (orientationDegrees) {
      setOcrStatus(`${sourceLabel}: ✓ stranica je bila okrenuta ${orientationDegrees}°, ispravljam prije čitanja.`);
      await waitForUiPaint();
    }

    if (template) {
      setOcrStatus(`${sourceLabel}: ✓ koristim format dobavljača ${template.name}.`);
      await waitForUiPaint();
    }

    for (const [index, plan] of scanPlans.entries()) {
      await waitForVisiblePage(() => {
        setOcrStatus(`${sourceLabel}: obrada je pauzirana dok se aplikacija ne vrati u fokus.`);
      });
      const stepLabel = `${index + 1}/${scanPlans.length} ${scanFrameUiLabel(plan)}`;
      setScanStep(`${sourcePageNo}.${index + 1}`);
      setOcrProgress(Math.min(88, 8 + index * Math.max(7, Math.round(70 / Math.max(1, scanPlans.length)))));
      setOcrStatus(`${sourceLabel}: ✓ pripremam ${stepLabel}.`);
      await waitForUiPaint();

      const frame = prepareOcrFrameFromImageElement(image, {
        ...plan,
        pageNo: sourcePageNo,
        pageOrientationDegrees: orientationDegrees,
        skipOrientationRetry: true,
      });

      if (!previewSaved) {
        setScanShots((current) => [
          ...current.slice(-5),
          {
            id: `${Date.now()}-${sourcePageNo}-upload`,
            pageNo: sourcePageNo,
            label: sourceLabel,
            image: frame.previewImage || orientedDataUrl,
            createdAt: new Date().toISOString(),
          },
        ]);
        previewSaved = true;
      }

      setScanStep(`${sourcePageNo}.${index + 1}`);
      setOcrProgress(Math.min(88, 14 + index * Math.max(7, Math.round(70 / Math.max(1, scanPlans.length)))));
      setOcrStatus(`${sourceLabel}: ✓ čitam ${stepLabel}.`);
      await waitForUiPaint();
      results.push(await recognizeScanFrame(frame));
      await waitForUiPaint();
    }

    return results;
  }, [detectUploadedImageOrientation, recognizeScanFrame]);

  const scanUploadedFile = useCallback(async (file) => {
    if (!file || busyRef.current) return;

    busyRef.current = true;
    setOcrBusy(true);
    keepAwakeWantedRef.current = true;
    await requestProcessingWakeLock();
    setFinalDoc(null);
    closeScannerForProcessing();
    lastOcrHashRef.current = "";
    scanResultsRef.current = [];
    scanFramesRef.current = [];

    try {
      const fileName = file.name || "Dokument";
      const fileType = String(file.type || "").toLowerCase();
      const isPdf = fileType.includes("pdf") || fileName.toLowerCase().endsWith(".pdf");
      const isImage = fileType.startsWith("image/");

      setOcrProgress(2);
      setScanStep(isPdf ? "1. Učitavanje PDF-a" : "1. Učitavanje slike");
      setOcrStatus(isPdf ? "Učitavam PDF dokument..." : "Učitavam sliku...");
      await waitForUiPaint();

      let results = [];
      let scannedPages = 1;

      if (isPdf) {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const buffer = await readFileAsArrayBuffer(file);
        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(buffer),
          disableWorker: true,
          useSystemFonts: true,
        });
        const pdf = await loadingTask.promise;
        scannedPages = Math.min(pdf.numPages || 1, 25);

        const supplierName = docMetaRef.current?.supplier || "";
        for (let pageIndex = 1; pageIndex <= scannedPages; pageIndex += 1) {
          await waitForVisiblePage(() => {
            setOcrStatus(`PDF stranica ${pageIndex}/${scannedPages}: obrada je pauzirana dok se aplikacija ne vrati u fokus.`);
          });
          setScanStep(`2. PDF ${pageIndex}/${scannedPages}`);
          setOcrProgress(Math.round(((pageIndex - 1) / scannedPages) * 78));
          setOcrStatus(`PDF stranica ${pageIndex}/${scannedPages}: pripremam sliku za OCR.`);
          await waitForUiPaint();
          const imageDataUrl = await renderPdfPageToImage(pdf, pageIndex);
          const pageResults = await scanUploadedImageDataUrl(imageDataUrl, `PDF stranica ${pageIndex}`, pageIndex, supplierName);
          results = [...results, ...pageResults];
        }
        await pdf.destroy?.();
      } else if (isImage) {
        setScanStep("2. Priprema slike");
        const imageDataUrl = await readFileAsDataUrl(file);
        results = await scanUploadedImageDataUrl(imageDataUrl, fileName, pageNo, docMetaRef.current?.supplier || "");
      } else {
        throw new Error("Podržani su PDF, JPG, PNG i ostali image fajlovi.");
      }

      if (!results.length) {
        setOcrStatus("Fajl je učitan, ali OCR nije vratio tekst.");
        return;
      }

      scanResultsRef.current = results;
      setGuidedStepIndex(activeCameraScanPlans.length || SCAN_FRAME_PLANS.length);
      setScanPassDone(true);
      setPageNo((current) => Math.max(Number(current || 1), scannedPages + 1));
      setScanStep("3. Spajanje stavki");
      setOcrProgress(92);
      setOcrStatus("OCR je završen. Slažem redove i provjeravam zalihe...");
      await waitForUiPaint();
      await applyScanResults(results, "upload");
    } catch (error) {
      setOcrStatus(String(error?.message || error || "Upload skeniranje nije uspjelo."));
    } finally {
      busyRef.current = false;
      setOcrBusy(false);
      setScanStep("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [activeCameraScanPlans.length, applyScanResults, closeScannerForProcessing, pageNo, renderPdfPageToImage, requestProcessingWakeLock, scanUploadedImageDataUrl]);

  function openFilePicker() {
    if (ocrBusy || checking) return;
    fileInputRef.current?.click();
  }

  function handleFileInputChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    scanUploadedFile(file);
  }

  const scanCurrentPage = useCallback(async () => {
    if (busyRef.current || !cameraReady) return;

    const scanPlans = activeCameraScanPlans.length ? activeCameraScanPlans : SCAN_FRAME_PLANS;
    const isCorrection = scanPassDone || guidedStepIndex >= scanPlans.length;
    const plan = isCorrection ? CORRECTION_SCAN_PLAN : scanPlans[guidedStepIndex];
    if (!plan) return;

    busyRef.current = true;
    setOcrBusy(true);
    keepAwakeWantedRef.current = true;
    await requestProcessingWakeLock();
    setFinalDoc(null);

    try {
      const displayStep = isCorrection ? "Dopuna" : `${guidedStepIndex + 1}/${scanPlans.length}`;
      setScanStep(displayStep);
      setOcrProgress(isCorrection ? 0 : Math.round((guidedStepIndex / scanPlans.length) * 35));
      setOcrStatus(isCorrection ? plan.guide : `Korak ${guidedStepIndex + 1}/${scanPlans.length}: ${plan.guide}`);
      await waitForUiPaint();

      const frames = await captureScanFrames((scanPlan, index, total, phase, detail = {}) => {
        setScanStep(displayStep);
        const stepPrefix = isCorrection ? "Dopuna" : `Korak ${guidedStepIndex + 1}/${scanPlans.length}`;
        if (phase === "capture" || phase === "sample") {
          setOcrStatus(`${stepPrefix}: cekam ostar kadar za ${scanPlan.label} (${Math.min(detail.sampleIndex + 1 || 1, detail.sampleCount || 1)}/${detail.sampleCount || 1}).`);
        } else if (phase === "done") {
          const score = detail.focusScore ? ` Fokus ${Math.round(detail.focusScore)}.` : "";
          setOcrStatus(`${stepPrefix}: kadar je snimljen.${score}`);
        } else {
          setOcrStatus(isCorrection ? scanPlan.guide : `${stepPrefix}: ${scanPlan.guide}`);
        }
        setOcrProgress(isCorrection
          ? Math.round(((index + 1) / total) * 16)
          : Math.min(35, Math.round(((guidedStepIndex + 0.65) / scanPlans.length) * 35)));
      }, [plan]);

      const frame = frames[0];
      if (!frame) {
        setOcrStatus("Kamera još nije spremna.");
        return;
      }

      if (frame.previewImage) {
        setScanShots((current) => [
          ...current.slice(-3),
          {
            id: `${Date.now()}-${pageNo}`,
            pageNo,
            label: "Cijeli dokument",
            image: frame.previewImage,
            createdAt: new Date().toISOString(),
          },
        ]);
      }

      if (!isCorrection) {
        scanFramesRef.current = [
          ...scanFramesRef.current.filter((item) => item.key !== frame.key || Number(item.pageNo || pageNo) !== Number(pageNo)),
          { ...frame, pageNo },
        ];

        if (guidedStepIndex < scanPlans.length - 1) {
          const nextIndex = guidedStepIndex + 1;
          setGuidedStepIndex(nextIndex);
          setOcrProgress(Math.round((nextIndex / scanPlans.length) * 35));
          setOcrStatus(`Korak ${nextIndex + 1}/${scanPlans.length}: ${scanPlans[nextIndex].guide}`);
          return;
        }

        const framesForRecognition = scanPlans
          .map((scanPlan) => scanFramesRef.current.find((item) => item.key === scanPlan.key && Number(item.pageNo || pageNo) === Number(pageNo)))
          .filter(Boolean);

        setGuidedStepIndex(scanPlans.length);
        setScanPassDone(true);
        closeScannerForProcessing();
        setOcrStatus(`Sva ${scanPlans.length} kadra su snimljena. Skener je zatvoren, sada čitam tekst i spajam artikle...`);
        setOcrProgress(38);
        await waitForUiPaint();

        const recognizedResults = [];
        for (const [index, capturedFrame] of framesForRecognition.entries()) {
          setScanStep(`${index + 1}/${framesForRecognition.length}`);
          setOcrStatus(`✓ Čitam ${index + 1}/${framesForRecognition.length} ${scanFrameUiLabel(capturedFrame)}...`);
          setOcrProgress(Math.min(90, 40 + Math.round((index / Math.max(1, framesForRecognition.length)) * 45)));
          await waitForUiPaint();
          recognizedResults.push(await recognizeScanFrame(capturedFrame));
          await waitForUiPaint();
        }

        scanResultsRef.current = [...scanResultsRef.current, ...recognizedResults];
        scanFramesRef.current = [];
        setOcrStatus("Skeniranje je pročitano. Slažem stavke i provjeravam zalihe...");
        setOcrProgress(92);
        await waitForUiPaint();
        await applyScanResults(scanResultsRef.current, "manual");
        return;
      }

      closeScannerForProcessing();
      setOcrStatus("Dopuna: skener je zatvoren, prepoznajem tekst...");
      setOcrProgress(40);
      await waitForUiPaint();
      const result = await recognizeScanFrame({ ...frame, pageNo });
      scanResultsRef.current = [...scanResultsRef.current, result];

      setGuidedStepIndex(scanPlans.length);
      setScanPassDone(true);
      setOcrStatus("Dopunjavam učitane stavke...");
      setOcrProgress(92);
      await waitForUiPaint();
      await applyScanResults(scanResultsRef.current, "correction");
    } catch (error) {
      setOcrStatus(String(error?.message || error || "OCR nije uspio."));
    } finally {
      busyRef.current = false;
      setOcrBusy(false);
      setScanStep("");
    }
  }, [activeCameraScanPlans, applyScanResults, cameraReady, captureScanFrames, closeScannerForProcessing, guidedStepIndex, pageNo, recognizeScanFrame, requestProcessingWakeLock, scanPassDone]);

  useEffect(() => {
    function updateMobileFlag() {
      setIsMobile(window.matchMedia("(max-width: 1000px)").matches);
    }

    updateMobileFlag();
    window.addEventListener("resize", updateMobileFlag);
    return () => window.removeEventListener("resize", updateMobileFlag);
  }, []);

  useEffect(() => {
    if (isMobile === false) {
      setScannerOpen(false);
      stopCamera();
    }
  }, [isMobile, stopCamera]);

  useEffect(() => {
    const status = cleanCell(ocrStatus);
    if (!status) return;

    const phase = checking
      ? "Zalihe"
      : ocrBusy
        ? "OCR"
        : scannerOpen
          ? "Skener"
          : rows.length
            ? "Stavke"
            : "Info";
    const progress = ocrBusy || checking
      ? Math.max(0, Math.min(100, Math.round(Number(ocrProgress || 0) / 10) * 10))
      : 0;
    const message = `${phase}${scanStep ? ` ${scanStep}` : ""}: ${status}${progress ? ` (${progress}%)` : ""}`;
    if (lastConsoleMessageRef.current === message) return;

    lastConsoleMessageRef.current = message;
    setScanConsole((current) => [
      ...current.slice(-8),
      {
        id: `${Date.now()}-${current.length}`,
        stamp: consoleTimeStamp(),
        text: message,
      },
    ]);
  }, [checking, ocrBusy, ocrProgress, ocrStatus, rows.length, scanStep, scannerOpen]);

  useEffect(() => {
    if (!scannerOpen || !isMobile) return undefined;

    let alive = true;
    setCameraStarting(true);
    startCamera().finally(() => {
      if (alive) setCameraStarting(false);
    });

    return () => {
      alive = false;
      stopCamera();
    };
  }, [isMobile, scannerOpen, startCamera, stopCamera]);

  useEffect(() => {
    function restoreCameraIfNeeded() {
      if (typeof document !== "undefined" && document.hidden) return;
      if (!scannerOpen || !isMobile || ocrBusy || checking || cameraStarting) return;

      const track = streamRef.current?.getVideoTracks?.()[0];
      const needsRestart = !cameraReady ||
        !track ||
        track.readyState === "ended" ||
        !videoRef.current?.srcObject;

      if (!needsRestart) return;
      setCameraStarting(true);
      startCamera().finally(() => setCameraStarting(false));
    }

    document.addEventListener("visibilitychange", restoreCameraIfNeeded);
    window.addEventListener("pageshow", restoreCameraIfNeeded);

    return () => {
      document.removeEventListener("visibilitychange", restoreCameraIfNeeded);
      window.removeEventListener("pageshow", restoreCameraIfNeeded);
    };
  }, [cameraReady, cameraStarting, checking, isMobile, ocrBusy, scannerOpen, startCamera]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate?.();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadSessionCompany() {
      const cached = readAuthSession();
      const cachedCompany = cached?.data?.companyName || cached?.data?.database || "";
      if (cachedCompany && !cached.stale) {
        setCompanyName(cachedCompany);
        setDocMeta((current) => ({ ...current, customer: cachedCompany }));
      }

      try {
        const json = await refreshAuthSession({ force: !cached?.data?.authenticated });
        const nextCompany = json?.companyName || json?.database || "";
        if (!alive || !nextCompany) return;
        setCompanyName(nextCompany);
        setDocMeta((current) => ({ ...current, customer: nextCompany }));
      } catch {}
    }

    loadSessionCompany();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const query = cleanCell(docMeta.supplier);
    if (query.length < 2) {
      setSupplierSuggestions([]);
      setSupplierChecking(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSupplierChecking(true);
      try {
        const params = new URLSearchParams({
          q: query,
          sort: "subjekt",
          dir: "asc",
          limit: String(SUPPLIER_SUGGESTION_LIMIT),
        });
        const res = await fetch(`/api/dobavljaci?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json().catch(() => null);
        if (!json?.ok) {
          setSupplierSuggestions([]);
          return;
        }

        const normalizedQuery = normalizeLetters(query);
        const names = Array.from(new Set((json.rows || []).map((row) => cleanCompanyName(row.Subjekt)).filter(Boolean)))
          .filter((name) => normalizeLetters(name) !== normalizedQuery);
        setSupplierSuggestions(names.slice(0, SUPPLIER_SUGGESTION_LIMIT));
      } catch (error) {
        if (error?.name !== "AbortError") setSupplierSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSupplierChecking(false);
      }
    }, 240);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [docMeta.supplier]);

  function updateRow(id, key, value) {
    setRows((current) => current.map((row) => (
      row.id === id
        ? {
            ...row,
            [key]: key === "redniBroj"
              ? parseRowNumberToken(value)
              : PRICING_NUMBER_FIELDS.includes(key) ? parseNumber(value) : value,
            generatedBarcode: key === "barcode" && value ? "" : row.generatedBarcode,
          }
        : row
    )));
  }

  function removeRow(id) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  function selectCellText(event) {
    const input = event.currentTarget;
    window.setTimeout(() => {
      input.select?.();
    }, 0);
  }

  function focusCellBelow(field, rowIndex) {
    if (typeof document === "undefined") return false;

    const next = document.querySelector(`input[data-prijem-field="${field}"][data-prijem-row="${rowIndex + 1}"]`);
    if (!next) return false;

    next.focus();
    window.setTimeout(() => {
      next.select?.();
    }, 0);
    return true;
  }

  function handleCellKeyDown(event, field, rowIndex) {
    const isForwardKey = event.key === "Enter" || (event.key === "Tab" && !event.shiftKey);
    if (!isForwardKey) return;

    event.preventDefault();
    if (!focusCellBelow(field, rowIndex)) {
      event.currentTarget.blur();
    }
  }

  function cellInputProps(field, rowIndex) {
    return {
      "data-prijem-field": field,
      "data-prijem-row": rowIndex,
      enterKeyHint: "next",
      onFocus: selectCellText,
      onClick: selectCellText,
      onMouseUp: (event) => event.preventDefault(),
      onKeyDown: (event) => handleCellKeyDown(event, field, rowIndex),
    };
  }

  function updateMetaField(key, value) {
    const nextValue = key === "invoiceDate" || key === "deliveryDate"
      ? normalizeInvoiceDate(value) || value
      : value;
    setDocMeta((current) => ({ ...current, [key]: nextValue }));
  }

  function selectSupplier(name) {
    setDocMeta((current) => ({ ...current, supplier: name }));
    setSupplierSuggestions([]);
  }

  function resetDraft() {
    setScannerOpen(false);
    stopCamera();
    removeCachedJson(draftCacheKey);
    lastOcrHashRef.current = "";
    scanResultsRef.current = [];
    scanFramesRef.current = [];
    rowsRef.current = [];
    const nextMeta = { ...createDefaultMeta(), customer: companyName || "" };
    docMetaRef.current = nextMeta;
    setRows([]);
    setDocMeta(nextMeta);
    setRawText("");
    setFinalDoc(null);
    setScanShots([]);
    setPageNo(1);
    setGuidedStepIndex(0);
    setScanPassDone(false);
    setDraftSavedAt("");
    lastConsoleMessageRef.current = "";
    setScanConsole([]);
    setOcrStatus("Prijem robe je poništen. Možeš početi novi unos.");
  }

  function handleScanButton() {
    const scanPlans = activeCameraScanPlans.length ? activeCameraScanPlans : SCAN_FRAME_PLANS;
    const nextPlanIndex = Math.min(guidedStepIndex, scanPlans.length - 1);
    const templateText = activeScanTemplate ? ` Format: ${activeScanTemplate.name}.` : "";

    if (!scannerOpen) {
      setScannerOpen(true);
      setFinalDoc(null);
      setOcrStatus(scanPassDone
        ? "Postavi kameru na dio koji treba dopuniti, pa pritisni Skeniraj ponovo."
        : `Korak ${Math.min(guidedStepIndex + 1, scanPlans.length)}/${scanPlans.length}: ${scanPlans[nextPlanIndex]?.guide || scanPlans[0].guide}${templateText}`);
      return;
    }

    if (!cameraReady) {
      setFinalDoc(null);
      setCameraStarting(true);
      startCamera().finally(() => setCameraStarting(false));
      return;
    }

    scanCurrentPage();
  }

  async function recheckRows() {
    setScannerOpen(false);
    stopCamera();
    const enriched = await enrichRows(rows.map((row) => ({ ...row, exists: false, match: null, matchType: "" })));
    setRows(normalizePricingRows(enriched));
  }

  function continueScan() {
    setScannerOpen(false);
    stopCamera();
    lastOcrHashRef.current = "";
    scanResultsRef.current = [];
    scanFramesRef.current = [];
    setGuidedStepIndex(0);
    setScanPassDone(false);
    setFinalDoc(null);
    setPageNo((current) => current + 1);
    setOcrStatus("Nova stranica je spremna. Učitaj PDF ili fotografiju dokumenta.");
  }

  function closeDocument() {
    if (!rows.length) return;
    const docId = `PR-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
    setFinalDoc({ id: docId, createdAt: new Date().toISOString() });
    setOcrStatus(`Dokument ${docId} je pripremljen. Možeš još ispraviti podatke prije exporta.`);
  }

  function printDocument() {
    const doc = { id: finalDoc?.id || "PR-DRAFT", rows, meta: docMeta };
    printHtmlDocument(buildPrintableHtml(doc.rows, doc.id, doc.meta), `${doc.id}.html`);
  }

  function downloadCsv() {
    const doc = { id: finalDoc?.id || "PR-DRAFT", rows, meta: docMeta };
    const blob = new Blob([rowsToCsv(doc.rows, doc.meta)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function shareCsv() {
    const doc = { id: finalDoc?.id || "PR-DRAFT", rows, meta: docMeta };
    const file = new File([rowsToCsv(doc.rows, doc.meta)], `${doc.id}.csv`, { type: "text/csv" });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: doc.id, text: "Prijem robe" });
      return;
    }

    downloadCsv();
  }

  function mailDocument() {
    const doc = { id: finalDoc?.id || "PR-DRAFT", rows, meta: docMeta };
    const body = [
      `Prijem robe: ${doc.id}`,
      `Dobavljač: ${doc.meta?.supplier || "-"}`,
      `Kupac: ${doc.meta?.customer || "-"}`,
      `Broj računa: ${doc.meta?.invoiceNo || "-"}`,
      `Datum računa: ${formatInvoiceDate(doc.meta?.invoiceDate) || "-"}`,
      `Artikala: ${doc.rows.length}`,
      `Postojeći: ${doc.rows.filter((row) => row.exists).length}`,
      "",
      ...doc.rows.slice(0, 30).map((row, index) => `${index + 1}. ${row.sifra || "-"} | ${row.barcode || row.generatedBarcode || "-"} | ${row.naziv || "-"} | kol: ${formatNumber(row.kolicina)}`),
    ].join("\n");

    window.location.href = `mailto:?subject=${encodeURIComponent(doc.id)}&body=${encodeURIComponent(body)}`;
  }

  async function scanImageObjectUrl(image) {
    const response = await fetch(image);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  function scanImageViewerHtml(url) {
    const safeUrl = escapeHtml(url);
    return `<!doctype html>
<html lang="bs">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Snimak skeniranja</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%;background:#050812;color:#f8fafc;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body{display:grid;grid-template-rows:auto minmax(0,1fr)}
    .toolbar{min-height:56px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.12);background:rgba(10,16,28,.92);backdrop-filter:blur(12px)}
    .toolbar strong{font-size:14px;line-height:1.1}
    .actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    button,a{min-height:34px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:0 11px;background:rgba(255,255,255,.07);color:#fff;font:800 12px/1 inherit;text-decoration:none;cursor:pointer}
    button:hover,a:hover{background:rgba(96,165,250,.18);border-color:rgba(96,165,250,.36)}
    .stage{min-height:0;overflow:auto;display:grid;place-items:center;padding:16px;background:radial-gradient(circle at 50% 0%,rgba(96,165,250,.12),transparent 36%),#050812}
    img{display:block;width:auto;height:auto;max-width:100%;max-height:calc(100vh - 88px);object-fit:contain;box-shadow:0 18px 50px rgba(0,0,0,.38);background:#fff}
    img.zoomed{max-width:none;max-height:none}
    @media(max-width:700px){.toolbar{align-items:flex-start;flex-direction:column}.stage{padding:10px}button,a{min-height:36px}}
  </style>
</head>
<body>
  <div class="toolbar">
    <strong>Snimak skeniranja</strong>
    <div class="actions">
      <button type="button" data-action="fit">Fit</button>
      <button type="button" data-action="actual">100%</button>
      <button type="button" data-action="out">-</button>
      <button type="button" data-action="in">+</button>
      <a href="${safeUrl}" download="prijem-robe-snimak.jpg">Sačuvaj</a>
      <button type="button" data-action="close">X</button>
    </div>
  </div>
  <div class="stage" id="stage">
    <img id="scanImage" src="${safeUrl}" alt="Snimak skeniranja" />
  </div>
  <script>
    const img = document.getElementById('scanImage');
    let zoom = 1;
    function fit(){
      zoom = 1;
      img.classList.remove('zoomed');
      img.style.width = 'auto';
    }
    function applyZoom(next){
      zoom = Math.max(0.25, Math.min(5, next));
      img.classList.add('zoomed');
      img.style.width = (zoom * 100) + '%';
    }
    document.addEventListener('click', (event) => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      if (action === 'fit') fit();
      if (action === 'actual') applyZoom(1);
      if (action === 'out') applyZoom(zoom - 0.25);
      if (action === 'in') applyZoom(zoom + 0.25);
      if (action === 'close') window.close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') window.close();
      if (event.key === '+') applyZoom(zoom + 0.25);
      if (event.key === '-') applyZoom(zoom - 0.25);
      if (event.key === '0') applyZoom(1);
    });
  </script>
</body>
</html>`;
  }

  async function openScanImage(image) {
    if (!image) return;
    const opened = window.open("about:blank", "_blank");
    try {
      const url = await scanImageObjectUrl(image);
      if (opened) {
        opened.document.open();
        opened.document.write(scanImageViewerHtml(url));
        opened.document.close();
        try {
          opened.opener = null;
        } catch {}
      } else {
        window.location.href = url;
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      if (opened) opened.location.href = image;
      else window.location.href = image;
    }
  }

  async function saveScanImage(image, fileName) {
    if (!image) return;
    let url = image;
    let shouldRevoke = false;
    try {
      url = await scanImageObjectUrl(image);
      shouldRevoke = true;
    } catch {
      url = image;
    }

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (shouldRevoke) window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function touchDistance(touches) {
    const first = touches[0];
    const second = touches[1];
    if (!first || !second) return 0;
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  }

  function scanShotZoom(shotId) {
    return scanShotZooms[shotId] || 1;
  }

  function setScanShotZoomValue(shotId, nextZoom) {
    setScanShotZooms((current) => ({
      ...current,
      [shotId]: Math.max(1, Math.min(4, Number(nextZoom || 1))),
    }));
  }

  function adjustScanShotZoom(shotId, delta) {
    setScanShotZoomValue(shotId, scanShotZoom(shotId) + delta);
  }

  function resetScanShotZoom(shotId) {
    setScanShotZooms((current) => {
      const next = { ...current };
      delete next[shotId];
      return next;
    });
  }

  function handleScanShotTouchStart(shotId, event) {
    const target = event.currentTarget;
    const touches = event.touches;
    if (touches.length === 2) {
      scanShotTouchRef.current[shotId] = {
        mode: "pinch",
        startDistance: touchDistance(touches),
        startZoom: scanShotZoom(shotId),
        moved: false,
      };
      return;
    }

    if (touches.length === 1) {
      scanShotTouchRef.current[shotId] = {
        mode: "pan",
        x: touches[0].clientX,
        y: touches[0].clientY,
        scrollLeft: target.scrollLeft,
        scrollTop: target.scrollTop,
        moved: false,
      };
    }
  }

  function handleScanShotTouchMove(shotId, event) {
    const state = scanShotTouchRef.current[shotId];
    if (!state) return;

    if (event.touches.length === 2 && state.mode === "pinch") {
      const distance = touchDistance(event.touches);
      if (!state.startDistance || !distance) return;
      event.preventDefault();
      state.moved = true;
      const nextZoom = Math.max(1, Math.min(4, state.startZoom * (distance / state.startDistance)));
      setScanShotZooms((current) => ({ ...current, [shotId]: nextZoom }));
      return;
    }

    if (event.touches.length === 1 && state.mode === "pan") {
      event.preventDefault();
      state.moved = true;
      const touch = event.touches[0];
      event.currentTarget.scrollLeft = state.scrollLeft - (touch.clientX - state.x);
      event.currentTarget.scrollTop = state.scrollTop - (touch.clientY - state.y);
    }
  }

  function handleScanShotTouchEnd(shotId) {
    const state = scanShotTouchRef.current[shotId];
    if (state?.moved) state.suppressClickUntil = Date.now() + 350;
    if (state && state.mode !== "pinch") return;
    if (state?.suppressClickUntil) {
      scanShotTouchRef.current[shotId] = { suppressClickUntil: state.suppressClickUntil };
      return;
    }
    delete scanShotTouchRef.current[shotId];
  }

  function handleScanShotClick(shot, event) {
    const state = scanShotTouchRef.current[shot.id];
    if (state?.suppressClickUntil && Date.now() < state.suppressClickUntil) {
      event.preventDefault();
      return;
    }
    openScanImage(shot.image);
  }

  const scannerClosed = !scannerOpen || !cameraReady;
  const processingData = ocrBusy || checking;
  const showLoadedData = !scannerOpen && !processingData;
  const showWorkArea = !scannerOpen;
  const showScanConsole = showWorkArea && (!rows.length || processingData);
  const processingWithClosedScanner = scannerClosed && processingData;
  const scanConsoleLines = scanConsole.length
    ? scanConsole
    : [{
      id: "initial",
      stamp: "",
      text: "Info: Unesi dobavljača i učitaj PDF ili jasnu fotografiju dokumenta.",
    }];
  const activeStepText = checking
    ? "Korak u toku: provjera zaliha."
    : ocrBusy
      ? `Korak u toku: ${scanStep ? `${scanStep} - ` : ""}${ocrStatus || "čitanje dokumenta."}`
      : "";
  const uploadButtonLabel = checking
    ? "✓ Provjeravam zalihe"
    : ocrBusy
      ? "✓ Čitam dokument"
      : "Učitaj PDF/sliku";
  const uploadGuideLabel = processingWithClosedScanner
    ? "Obrada"
    : "PDF / Slika";
  const uploadGuideText = processingWithClosedScanner
    ? "Kamera je privremeno isključena. Čitam učitani dokument i provjeravam zalihe."
    : "Odaberi PDF ili jasnu fotografiju računa. Skener kamere je za sada isključen dok ne dovedemo čitanje dokumenata do kraja.";
  const uploadButtonDisabled = ocrBusy || checking;

  return (
    <main className="container page prijemRobePage">
      <DesktopAppHeader title="Prijem robe" subtitle="OCR čitanje PDF-a i fotografija ulaznog dokumenta" status={ocrBusy ? "ČITAM" : "SPREMNO"} />

      {!scannerOpen && (
        <div className="topbar mobileOnlyHeader">
          <div>
            <div className="brand">Prijem robe</div>
            <div className="subtitle">PDF, slike i OCR priprema dokumenta</div>
          </div>
        </div>
      )}

      <div className="prijemMobileOnly">
        {!scannerOpen && (
          <div className="prijemMetaGrid">
            <label className="prijemSupplierField">
              <span>Dobavljač</span>
              <input className="input" value={docMeta.supplier} onChange={(e) => updateMetaField("supplier", e.target.value)} placeholder="npr. BELAMIONIX d.o.o." />
              {supplierSuggestions.length > 0 && (
                <div className="prijemSupplierSuggestions">
                  {supplierSuggestions.map((name) => (
                    <button className="prijemSupplierSuggestion clickable" type="button" key={name} onClick={() => selectSupplier(name)}>
                      {name}
                    </button>
                  ))}
                </div>
              )}
              {!supplierSuggestions.length && supplierChecking && <div className="prijemSupplierHint">Tražim dobavljača...</div>}
            </label>
            <div className="prijemMetaReadonly prijemCustomerField">
              <span>Kupac</span>
              <strong title={docMeta.customer || companyName || "Firma iz sesije"}>
                {docMeta.customer || companyName || "Firma iz sesije"}
              </strong>
            </div>
            <label className="prijemInvoiceNoField">
              <span>Broj računa</span>
              <input className="input" value={docMeta.invoiceNo} onChange={(e) => updateMetaField("invoiceNo", e.target.value)} placeholder="npr. 263011283" />
            </label>
            <label className="prijemInvoiceDateField">
              <span>Datum računa</span>
              <DatePickerField value={docMeta.invoiceDate} onChange={(value) => updateMetaField("invoiceDate", value)} />
            </label>
          </div>
        )}

        <div className="prijemStepGuide">
          <strong>{uploadGuideLabel}</strong>
          <span>{uploadGuideText}</span>
        </div>

        <div className="prijemControls">
          <button className="btn clickable prijemUploadBtn prijemUploadPrimary" type="button" onClick={openFilePicker} disabled={uploadButtonDisabled}>
            <ButtonLabel icon="upload">{uploadButtonLabel}</ButtonLabel>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          onChange={handleFileInputChange}
          style={{ display: "none" }}
        />

        <div className="prijemStatus">
          {activeStepText && <div className="prijemActiveStep">{activeStepText}</div>}
          <div>{ocrStatus}</div>
          {checking && <div>Provjeravam zalihe...</div>}
          {draftSavedAt && <div>Radni unos sačuvan u memoriju u {draftSavedAt}.</div>}
        </div>

        {showLoadedData && (
          <div className="prijemStats">
            <div><b>{rows.length}</b><span>Stavki</span></div>
            <div><b>{totals.existing}</b><span>Postoji</span></div>
            <div><b>{totals.newItems}</b><span>Novo</span></div>
            <div><b>{formatNumber(totals.qty)}</b><span>Količina</span></div>
          </div>
        )}

        {showWorkArea && <div className="sectionTitle">Učitane stavke</div>}

        {showLoadedData && rows.length ? (
          <>
            <div className="prijemTableWrap tableWrap">
              <table className="table prijemTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Šifra</th>
                    <th>Barcode</th>
                    <th>Naziv artikla</th>
                    <th>Količina</th>
                    <th>VPC 1</th>
                    <th>Rab 1</th>
                    <th>VPC 2</th>
                    <th>Rab 2</th>
                    <th>VPC 3</th>
                    <th>Rab 3</th>
                    <th>Status</th>
                    <th>MPC</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={row.id} className={row.exists ? "prijemExistingRow" : ""}>
                      <td>
                        <input
                          className="prijemCellInput prijemRowNoInput"
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max={MAX_ARTICLE_ROW_NO}
                          step="1"
                          value={row.redniBroj ?? ""}
                          placeholder="-"
                          onChange={(e) => updateRow(row.id, "redniBroj", e.target.value)}
                          {...cellInputProps("redniBroj", rowIndex)}
                        />
                      </td>
                      <td><input className="prijemCellInput" value={row.sifra} onChange={(e) => updateRow(row.id, "sifra", e.target.value)} {...cellInputProps("sifra", rowIndex)} /></td>
                      <td><input className="prijemCellInput" value={row.barcode || row.generatedBarcode} onChange={(e) => updateRow(row.id, "barcode", e.target.value)} {...cellInputProps("barcode", rowIndex)} /></td>
                      <td><input className="prijemCellInput prijemNameInput" value={row.naziv} onChange={(e) => updateRow(row.id, "naziv", e.target.value)} {...cellInputProps("naziv", rowIndex)} /></td>
                      <td><input className="prijemCellInput prijemNumberInput" type="number" inputMode="decimal" min="0" step="0.001" value={row.kolicina ?? ""} onChange={(e) => updateRow(row.id, "kolicina", e.target.value)} {...cellInputProps("kolicina", rowIndex)} /></td>
                      <td><input className="prijemCellInput prijemNumberInput" type="number" inputMode="decimal" min="0" step="0.01" value={row.vpc ?? ""} onChange={(e) => updateRow(row.id, "vpc", e.target.value)} {...cellInputProps("vpc", rowIndex)} /></td>
                      <td><input className="prijemCellInput prijemNumberInput" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={row.rabat ?? ""} onChange={(e) => updateRow(row.id, "rabat", e.target.value)} {...cellInputProps("rabat", rowIndex)} /></td>
                      <td><input className="prijemCellInput prijemNumberInput" type="number" inputMode="decimal" min="0" step="0.01" value={row.vpc2 ?? ""} onChange={(e) => updateRow(row.id, "vpc2", e.target.value)} {...cellInputProps("vpc2", rowIndex)} /></td>
                      <td><input className="prijemCellInput prijemNumberInput" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={row.rabat2 ?? ""} onChange={(e) => updateRow(row.id, "rabat2", e.target.value)} {...cellInputProps("rabat2", rowIndex)} /></td>
                      <td><input className="prijemCellInput prijemNumberInput" type="number" inputMode="decimal" min="0" step="0.01" value={row.vpc3 ?? ""} onChange={(e) => updateRow(row.id, "vpc3", e.target.value)} {...cellInputProps("vpc3", rowIndex)} /></td>
                      <td><input className="prijemCellInput prijemNumberInput" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={row.rabat3 ?? ""} onChange={(e) => updateRow(row.id, "rabat3", e.target.value)} {...cellInputProps("rabat3", rowIndex)} /></td>
                      <td>
                        <span className={row.exists ? "prijemBadge existing" : "prijemBadge fresh"}>
                          {row.matchType === "sifra-neprovjereno" ? "Provjeri" : row.exists ? "Postoji" : "Novo"}
                        </span>
                      </td>
                      <td><input className="prijemCellInput prijemNumberInput prijemMpcInput" type="number" inputMode="decimal" min="0" step="0.01" value={row.mpc ?? ""} onChange={(e) => updateRow(row.id, "mpc", e.target.value)} {...cellInputProps("mpc", rowIndex)} /></td>
                      <td>
                        <button className="prijemRemoveBtn clickable" type="button" onClick={() => removeRow(row.id)} aria-label="Ukloni stavku">x</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="prijemPostTableActions">
              <button className="btn clickable" type="button" onClick={recheckRows} disabled={checking || ocrBusy}>
                <ButtonLabel icon="refresh">Provjeri zalihe ponovo</ButtonLabel>
              </button>
              <button className="btn clickable prijemLockBtn" type="button" onClick={closeDocument} disabled={!rows.length || ocrBusy}>
                <ButtonLabel icon="check">Zaključi prijem robe</ButtonLabel>
              </button>
              <button className="btn clickable prijemDangerBtn" type="button" onClick={resetDraft} disabled={ocrBusy || checking}>
                <ButtonLabel icon="trash">Poništi prijem</ButtonLabel>
              </button>
            </div>
          </>
        ) : showScanConsole ? (
          <div className="prijemEmpty prijemConsolePanel">
            <div className="prijemConsoleHead">
              <span>{processingData ? "Rad u toku" : "Čekam skeniranje"}</span>
              <b>{processingData ? `${Math.max(0, Math.min(100, Math.round(Number(ocrProgress || 0))))}%` : "Spremno"}</b>
            </div>
            {processingData && (
              <div className="prijemProcessingBar" aria-hidden="true">
                <span style={{ width: `${Math.max(8, Math.min(100, Number(ocrProgress || 0)))}%` }} />
              </div>
            )}
            <div className="prijemConsoleLines" role="status" aria-live="polite">
              {scanConsoleLines.slice(-9).map((line) => (
                <div className="prijemConsoleLine" key={line.id}>
                  <span>{line.stamp || "..."}</span>
                  <p>{line.text}</p>
                </div>
              ))}
            </div>
            <div className="prijemConsoleHint">
              {processingData
                ? "Tabela će se prikazati tek kada OCR i provjera zaliha završe."
                : "Unesi dobavljača i učitaj PDF ili fotografiju dokumenta."}
            </div>
          </div>
        ) : null}

        {showLoadedData && finalDoc && (
          <section className="prijemFinalPanel">
            <div>
              <div className="cardTitle" style={{ margin: 0 }}>Pripremljeno</div>
              <div className="prijemDocId">{finalDoc.id}</div>
            </div>

            <div className="prijemExportGrid">
              <button className="btn clickable" type="button" onClick={printDocument}><ButtonLabel icon="file">PDF</ButtonLabel></button>
              <button className="btn clickable" type="button" onClick={downloadCsv}><ButtonLabel icon="download">Export CSV</ButtonLabel></button>
              <button className="btn clickable" type="button" onClick={shareCsv}><ButtonLabel icon="share">Podijeli fajl</ButtonLabel></button>
              <button className="btn clickable" type="button" onClick={mailDocument}><ButtonLabel icon="mail">Mail</ButtonLabel></button>
            </div>
          </section>
        )}

        {showLoadedData && scanShots.length > 0 && (
          <section className="prijemScanShots">
            <div className="sectionTitle">Snimci skeniranja</div>
            {scanShots.slice().reverse().map((shot) => {
              const zoom = scanShotZoom(shot.id);
              const zoomed = zoom > 1;
              return (
              <article className="prijemScanShot" key={shot.id}>
                <div className="prijemScanShotHeader">
                  <span>{shot.label || "Snimak"} · stranica {shot.pageNo}</span>
                  <div>
                    <div className="prijemShotZoomControls" aria-label="Kontrole prikaza slike">
                      <button className="btn clickable prijemShotBtn prijemShotZoomBtn" type="button" onClick={() => adjustScanShotZoom(shot.id, -0.25)} disabled={!zoomed}>-</button>
                      <button className="btn clickable prijemShotBtn prijemShotZoomBtn" type="button" onClick={() => resetScanShotZoom(shot.id)}>Fit</button>
                      <button className="btn clickable prijemShotBtn prijemShotZoomBtn" type="button" onClick={() => adjustScanShotZoom(shot.id, 0.25)}>+</button>
                    </div>
                    <button className="btn clickable prijemShotBtn" type="button" onClick={() => openScanImage(shot.image)}><ButtonLabel icon="eye">Otvori</ButtonLabel></button>
                    <button className="btn clickable prijemShotBtn" type="button" onClick={() => saveScanImage(shot.image, `prijem-robe-stranica-${shot.pageNo}.jpg`)}><ButtonLabel icon="download">Sačuvaj</ButtonLabel></button>
                  </div>
                </div>
                <div
                  className={`prijemScanShotImageLink ${zoomed ? "zoomed" : "fit"}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Otvori snimak stranice ${shot.pageNo}`}
                  title={zoomed ? "Pomjeri sliku ili otvori u pregledniku" : "Klikni za otvaranje slike"}
                  onClick={(event) => handleScanShotClick(shot, event)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openScanImage(shot.image);
                    }
                  }}
                  onTouchStart={(event) => handleScanShotTouchStart(shot.id, event)}
                  onTouchMove={(event) => handleScanShotTouchMove(shot.id, event)}
                  onTouchEnd={() => handleScanShotTouchEnd(shot.id)}
                  onTouchCancel={() => handleScanShotTouchEnd(shot.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={`prijemScanShotImage ${zoomed ? "zoomed" : "fit"}`}
                    src={shot.image}
                    alt={`Snimak skeniranja stranice ${shot.pageNo}`}
                    draggable={false}
                    style={zoomed
                      ? {
                        width: `${zoom * 100}%`,
                        minWidth: `${Math.round(zoom * 520)}px`,
                      }
                      : {
                        width: "auto",
                        minWidth: 0,
                      }}
                  />
                </div>
              </article>
              );
            })}
          </section>
        )}

      </div>
    </main>
  );
}
