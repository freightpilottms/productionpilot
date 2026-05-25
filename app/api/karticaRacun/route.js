import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";

function normalizeAccount(v) {
  return String(v || "").replace(/[^0-9]/g, "");
}

export async function GET(req) {
  let pool;

  try {
    pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewRacuni) {
      return forbiddenResponse("Nemate pristup racunima.");
    }
    const { searchParams } = new URL(req.url);

    const rawRacun =
      (searchParams.get("racun") || searchParams.get("konto") || "").trim();

    if (!rawRacun) {
      return Response.json(
        { ok: false, error: "Missing racun" },
        { status: 400 }
      );
    }

    const racun = normalizeAccount(rawRacun);

    if (!racun) {
      return Response.json(
        { ok: false, error: "Invalid racun" },
        { status: 400 }
      );
    }

    const r = await pool.request().input("racun", racun).query(`
      WITH Izvodi AS (
        SELECT
          CAST([Broj] AS nvarchar(100)) AS Broj,
          [Tekući račun] AS TekuciRacun,
          [Subjekt],
          TRY_CONVERT(decimal(18,2), [Uplate]) AS Uplate,
          TRY_CONVERT(decimal(18,2), [Isplate]) AS Isplate,
          TRY_CONVERT(date, [DatumDokumenta]) AS DatumDokumenta,
          REPLACE(REPLACE(REPLACE(REPLACE(REPLACE([Tekući račun], 'TR:', ''), 'tr:', ''), ' ', ''), '-', ''), '.', '') AS TekuciRacunNorm
        FROM dbo.View_IzvodiIzBanke
      )
      SELECT
        Broj,
        TekuciRacun,
        Subjekt,
        ISNULL(Uplate, 0) AS Uplate,
        ISNULL(Isplate, 0) AS Isplate,
        DatumDokumenta
      FROM Izvodi
      WHERE TekuciRacunNorm = @racun
      ORDER BY
        DatumDokumenta DESC,
        TRY_CONVERT(bigint, Broj) DESC,
        Broj DESC
    `);

    const rows = r.recordset || [];

    const totals = rows.reduce(
      (acc, x) => {
        const u = Number(x.Uplate || 0);
        const i = Number(x.Isplate || 0);
        acc.uplate += u;
        acc.isplate += i;
        acc.saldo += u - i;
        return acc;
      },
      { uplate: 0, isplate: 0, saldo: 0 }
    );

    return Response.json({
      ok: true,
      racun,
      rows,
      totals,
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
