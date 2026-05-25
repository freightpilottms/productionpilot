"use client";

import { readAuthSession } from "@/app/_ui/clientCache";

const ALLOW_ALL = {
  canViewRacuni: true,
  canViewKupci: true,
  canViewDobavljaci: true,
  canViewZalihe: true,
  canViewStockCost: true,
  canViewZaduzenja: true,
  canViewOtvoreneStavke: true,
  canViewFakture: true,
  canViewPredracuni: true,
  canViewPos: true,
  canViewIzdaniRacuni: true,
};

export const PERMISSION_DENIED_TEXT = "Nemate pristup ovoj sekciji.";
export const PERMISSION_DENIED_SUBTEXT = "Kontaktirajte administratora.";

export function normalizePermissions(raw) {
  return {
    ...ALLOW_ALL,
    ...(raw && typeof raw === "object" ? raw : {}),
  };
}

export function cachedPermissions() {
  return normalizePermissions(readAuthSession()?.data?.permissions);
}

export function moduleAllowed(permissions, moduleName) {
  const p = normalizePermissions(permissions);
  const key = String(moduleName || "").toLowerCase();

  if (key === "racuni") return p.canViewRacuni;
  if (key === "kupci") return p.canViewKupci;
  if (key === "dobavljaci") return p.canViewDobavljaci;
  if (key === "zalihe") return p.canViewZalihe;
  if (key === "zaduzenja") return p.canViewZaduzenja;
  if (key === "otvorene-stavke") return p.canViewKupci || p.canViewDobavljaci;
  if (key === "fakture") return p.canViewFakture;
  if (key === "predracuni") return p.canViewPredracuni;
  if (key === "pos") return p.canViewPos;
  if (key === "izdani-racuni") return p.canViewIzdaniRacuni;

  return true;
}

export function moduleNameForHref(href) {
  const clean = String(href || "").toLowerCase();
  if (clean === "/racuni" || clean.startsWith("/racuni/")) return "racuni";
  if (clean === "/kupci" || clean.startsWith("/kupci/")) return "kupci";
  if (clean === "/dobavljaci" || clean.startsWith("/dobavljaci/")) return "dobavljaci";
  if (clean === "/zalihe" || clean.startsWith("/zalihe/")) return "zalihe";
  if (clean === "/zaduzenja" || clean.startsWith("/zaduzenja/")) return "zaduzenja";
  if (clean === "/otvorene-stavke" || clean.startsWith("/otvorene-stavke/")) return "otvorene-stavke";
  if (clean === "/izdani-racuni" || clean.startsWith("/izdani-racuni/")) return "izdani-racuni";
  return "";
}

export function moduleAllowedForHref(permissions, href) {
  const moduleName = moduleNameForHref(href);
  return moduleName ? moduleAllowed(permissions, moduleName) : true;
}

export function firstAllowedIzdaniTab(permissions) {
  const p = normalizePermissions(permissions);
  if (p.canViewFakture) return "racuni";
  if (p.canViewPredracuni) return "predracuni";
  if (p.canViewPos) return "pos";
  return "";
}
