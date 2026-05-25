import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";

function pickFirst(row, keys) {
  for (const key of keys) {
    const v = row?.[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return v;
    }
  }
  return "";
}

function normalizeCreditSaldo(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return 0;
  return -Math.abs(n);
}

export async function GET(req) {
  let pool;

  try {
    pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewZaduzenja) {
      return forbiddenResponse("Nemate pristup zaduzenjima.");
    }

    const result = await pool.request().query(`
      SELECT *
      FROM dbo.View_StanjeZaduzenja
    `);

    const rows = (result.recordset || []).map((x) => {
      const subjektRaw = pickFirst(x, ["Subjekt", "Naziv", "Partner", "Opis"]);
      const subjekt = String(subjektRaw || "").trim() || "Nepoznato";
      const konto = String(
        pickFirst(x, [
          "Konto",
          "KontoZaduzenja",
          "KreditniRacun",
          "Kreditni račun",
          "Racun",
          "Račun",
          "BrojRacuna",
          "BrojRačuna",
        ]) || ""
      ).trim();

      const rawSaldo = Number(
        x?.Saldo ??
          (Number(x?.Duguje || 0) - Number(x?.Potrazuje || 0))
      );

      return {
        Konto: konto,
        Subjekt: subjekt,
        DatumKnjizenja:
          x?.DatumKnjizenja ??
          x?.Datum ??
          x?.datum ??
          null,

        Dokument:
          pickFirst(x, ["Dokument", "BrojDokumenta", "Broj", "NazivDokumenta"]) || "",

        Duguje: Number(x?.Duguje || 0),
        Potrazuje: Number(x?.Potrazuje || 0),
        Saldo: normalizeCreditSaldo(rawSaldo),
        SaldoRaw: Number.isFinite(rawSaldo) ? rawSaldo : 0,

        Napomena: pickFirst(x, ["Napomena", "Opis", "OpisDokumenta"]) || "",
      };
    });

    return Response.json({
      ok: true,
      rows,
      totalSaldo: rows.reduce((a, x) => a + Number(x.Saldo || 0), 0),
      source: "View_StanjeZaduzenja",
    });
  } catch (e) {
    return apiErrorResponse(e);
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch {}
    }
  }
}
