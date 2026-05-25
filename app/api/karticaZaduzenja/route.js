// app/api/karticaZaduzenje/route.js
import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";

function normalizeCreditSaldo(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return 0;
  return -Math.abs(n);
}

export async function GET(req) {
  try {
    const pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewZaduzenja) {
      return forbiddenResponse("Nemate pristup zaduzenjima.");
    }
    const { searchParams } = new URL(req.url);

    const konto = (searchParams.get("konto") || "").trim();
    const od = (searchParams.get("od") || "").trim();
    const doo = (searchParams.get("do") || "").trim();

    if (!konto) {
      return Response.json({ ok: false, error: "Missing konto" }, { status: 400 });
    }

    const r = await pool
      .request()
      .input("konto", konto)
      .input("od", od || null)
      .input("do", doo || null)
      .query(`
        SELECT
          v.BrojSaCrtama,
          v.DatumKnjizenja,
          v.Subjekt,
          v.VezniDokument + ' ' + v.VezniDokument2 AS Dokument,
          v.Duguje,
          v.Potrazuje,
          SUM(COALESCE(v.Duguje,0) - COALESCE(v.Potrazuje,0)) OVER (
            PARTITION BY v.Konto
            ORDER BY v.DatumKnjizenja, v.Broj, v.RedBr
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS SaldoKumulativno
        FROM dbo.View_StanjeKartica v
        WHERE v.Konto = @konto
          AND (@od IS NULL OR v.DatumKnjizenja >= CONVERT(date, @od, 23))
          AND (@do IS NULL OR v.DatumKnjizenja <= CONVERT(date, @do, 23))
        ORDER BY v.DatumKnjizenja, v.Broj, v.RedBr
      `);

    const rows = (r.recordset || []).map((row) => ({
      ...row,
      SaldoKumulativno: normalizeCreditSaldo(row.SaldoKumulativno),
      SaldoKumulativnoRaw: Number(row.SaldoKumulativno || 0),
    }));

    return Response.json({ ok: true, rows });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
