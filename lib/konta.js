import { getSessionFromRequest } from "@/lib/session";

export const DEFAULT_RACUNI_KONTA = ["1000", "1010", "1020", "1030", "1040"];
export const DEFAULT_KUPCI_KONTA = ["2110", "2120"];
export const DEFAULT_DOBAVLJACI_KONTA = ["4320", "4330"];

// Parse konta
export function parseKontoList(raw, fallback = []) {
  const values = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(/[,\s;]+/)
        .map((x) => x.trim());

  const clean = values
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 50);

  return clean.length ? clean : [...fallback];
}

// Normalize konta
export function normalizeKontaSettings(raw = {}) {
  return {
    racuni: parseKontoList(raw.racuni, DEFAULT_RACUNI_KONTA),
    kupci: parseKontoList(raw.kupci, DEFAULT_KUPCI_KONTA),
    dobavljaci: parseKontoList(raw.dobavljaci, DEFAULT_DOBAVLJACI_KONTA),
  };
}

// Session konta
export async function getKontaFromRequest(req) {
  const session = await getSessionFromRequest(req);
  return normalizeKontaSettings(session?.konta || {});
}
