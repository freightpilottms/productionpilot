import sql from "mssql";
import { getSessionFromRequest } from "@/lib/session";
import { objectExists } from "@/lib/appAccess";

export const AUTH_CODES = {
  RACUNI: "ABA",
  KUPCI: "AKU",
  DOBAVLJACI: "ADO",
  ZALIHE: "AZA",
  ZALIHE_NC: "ANC",
  ZADUZENJA: "AZD",
  FAKTURE: "AFA",
  PREDRACUNI: "APR",
  POS: "APO",
};

const AUTH_VIEW = "dbo.View_AutorizacijeAPP";

export const DEFAULT_PERMISSIONS = Object.freeze({
  configured: false,
  deniedCodes: [],
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
});

function cleanCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function permissionsFromDeniedCodes(codes = [], configured = true) {
  const denied = new Set(codes.map(cleanCode).filter(Boolean));
  const canViewZalihe = !denied.has(AUTH_CODES.ZALIHE);
  const canViewRacuni = !denied.has(AUTH_CODES.RACUNI);
  const canViewFakture = !denied.has(AUTH_CODES.FAKTURE);
  const canViewPredracuni = !denied.has(AUTH_CODES.PREDRACUNI);
  const canViewPos = !denied.has(AUTH_CODES.POS);

  return {
    configured,
    deniedCodes: Array.from(denied),
    canViewRacuni,
    canViewKupci: !denied.has(AUTH_CODES.KUPCI),
    canViewDobavljaci: !denied.has(AUTH_CODES.DOBAVLJACI),
    canViewZalihe,
    canViewStockCost: canViewZalihe && !denied.has(AUTH_CODES.ZALIHE_NC),
    canViewZaduzenja: canViewRacuni && !denied.has(AUTH_CODES.ZADUZENJA),
    canViewOtvoreneStavke: !denied.has(AUTH_CODES.KUPCI) || !denied.has(AUTH_CODES.DOBAVLJACI),
    canViewFakture,
    canViewPredracuni,
    canViewPos,
    canViewIzdaniRacuni: canViewFakture || canViewPredracuni || canViewPos,
  };
}

export async function getUserPermissions(pool, username) {
  const cleanUser = String(username || "").trim();
  if (!cleanUser) return { ...DEFAULT_PERMISSIONS };

  const hasView = await objectExists(pool, AUTH_VIEW);
  if (!hasView) return { ...DEFAULT_PERMISSIONS };

  const result = await pool
    .request()
    .input("username", sql.NVarChar, cleanUser)
    .query(`
      SELECT DISTINCT
        UPPER(LTRIM(RTRIM(CONVERT(nvarchar(50), [sifra])))) AS sifra
      FROM ${AUTH_VIEW}
      WHERE LTRIM(RTRIM(CONVERT(nvarchar(255), [Users]))) = @username
    `);

  const codes = (result.recordset || [])
    .map((row) => row.sifra)
    .filter(Boolean);

  return permissionsFromDeniedCodes(codes, true);
}

export async function getUserPermissionsFromRequest(pool, req) {
  const session = await getSessionFromRequest(req);
  return getUserPermissions(pool, session?.username);
}

export function forbiddenResponse(message = "Nemate pristup ovom modulu.") {
  return Response.json(
    {
      ok: false,
      forbidden: true,
      error: message,
    },
    { status: 403 }
  );
}

export function documentPermissionKey(typeOrMode) {
  const clean = String(typeOrMode || "").trim().toLowerCase();
  if (clean === "predracuni") return "canViewPredracuni";
  if (clean === "pos") return "canViewPos";
  return "canViewFakture";
}
