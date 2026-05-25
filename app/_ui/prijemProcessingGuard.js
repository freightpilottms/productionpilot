"use client";

export const PRIJEM_PROCESSING_STATE_KEY = "becleven:prijem-robe:processing";
export const PRIJEM_PROCESSING_BLOCKED_EVENT = "becleven:prijem-robe:navigation-blocked";

const STALE_AFTER_MS = 15 * 60 * 1000;

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function normalizeTargetPath(href) {
  const raw = String(href || "").trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) return "";

  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return raw;
  }
}

export function setPrijemProcessingState(active, status = "") {
  if (!canUseSessionStorage()) return;

  try {
    if (!active) {
      window.sessionStorage.removeItem(PRIJEM_PROCESSING_STATE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      PRIJEM_PROCESSING_STATE_KEY,
      JSON.stringify({
        active: true,
        status: String(status || ""),
        at: Date.now(),
      })
    );
  } catch {}
}

export function getPrijemProcessingState() {
  if (!canUseSessionStorage()) return null;

  try {
    const raw = window.sessionStorage.getItem(PRIJEM_PROCESSING_STATE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const at = Number(parsed?.at || 0);
    const stale = !at || Date.now() - at > STALE_AFTER_MS;
    if (!parsed?.active || stale) {
      window.sessionStorage.removeItem(PRIJEM_PROCESSING_STATE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function shouldBlockPrijemNavigation(href) {
  const targetPath = normalizeTargetPath(href);
  if (!targetPath || targetPath.startsWith("/prijem-robe")) return false;
  return Boolean(getPrijemProcessingState()?.active);
}

export function announcePrijemNavigationBlocked() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PRIJEM_PROCESSING_BLOCKED_EVENT, {
      detail: getPrijemProcessingState() || {},
    })
  );
}
