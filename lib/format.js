const DASH = "\u2014";
const NBSP = "\u00A0";
const LOCALE = "bs-BA";

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatFixed(value, digits = 2) {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function compactMoney(abs) {
  if (abs >= 1000000000) {
    return `${formatFixed(abs / 1000000000, 2)}${NBSP}mlrd.`;
  }

  if (abs >= 1000000) {
    return `${formatFixed(abs / 1000000, 2)}${NBSP}mil.`;
  }

  return null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeYear(value) {
  const year = String(value || "").trim();
  if (year.length === 2) return `20${year}`;
  return year.padStart(4, "0");
}

function validDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return { year: String(y).padStart(4, "0"), month: pad2(m), day: pad2(d) };
}

function dateParts(value) {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return validDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  const text = String(value).trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]|$)/);
  if (iso) return validDateParts(iso[1], iso[2], iso[3]);

  const local = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s|$)/);
  if (local) return validDateParts(normalizeYear(local[3]), local[2], local[1]);

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return validDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function timeParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { hours: pad2(date.getHours()), minutes: pad2(date.getMinutes()) };
}

export function fmtMoney(v, options = {}) {
  if (v === null || v === undefined || v === "") return DASH;

  const n = toFiniteNumber(v);
  if (n === null) return DASH;

  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const prefix = options.currency === false ? "" : `KM${NBSP}`;
  const compact = options.compact !== false ? compactMoney(abs) : null;
  const amount = compact || formatFixed(abs, options.digits ?? 2);

  return `${sign}${prefix}${amount}`;
}

export function fmtMoneyFull(v, options = {}) {
  return fmtMoney(v, { ...options, compact: false });
}

export function fmtMoneyNoCurrency(v, options = {}) {
  return fmtMoney(v, { ...options, currency: false });
}

export function amountFitClass(value) {
  const length = String(value || "").replace(/\s/g, "").length;
  if (length >= 21) return "amountFit amountFitXxl";
  if (length >= 18) return "amountFit amountFitXl";
  if (length >= 15) return "amountFit amountFitLg";
  if (length >= 12) return "amountFit amountFitMd";
  return "amountFit";
}

export function fmtDate(value) {
  const parts = dateParts(value);
  if (!parts) return DASH;
  return `${parts.day}.${parts.month}.${parts.year}`;
}

export function fmtDateTime(value) {
  const date = fmtDate(value);
  if (date === DASH) return DASH;
  const time = timeParts(value);
  return time ? `${date} ${time.hours}:${time.minutes}` : date;
}

export function dateInputToIso(value) {
  const parts = dateParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
}

export function fmtDateInput(value) {
  if (!value) return "";
  const formatted = fmtDate(value);
  return formatted === DASH ? String(value) : formatted;
}

export function asRows(value) {
  return Array.isArray(value) ? value : [];
}

export function signClass(value) {
  const n = Number(value || 0);
  if (n > 0) return "good";
  if (n < 0) return "bad";
  return "warn";
}

export function formatDatabaseName(raw) {
  const db = String(raw || "").trim();
  if (!db) return DASH;

  let name = db.replace(/_beCleven$/i, "");
  name = name.replace(/_/g, " ");
  name = name.replace(/\bdoo\b/gi, "d.o.o");
  name = name.replace(/\s+/g, " ").trim();

  return name || db;
}
