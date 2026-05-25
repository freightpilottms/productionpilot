import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { getKontaFromRequest } from "@/lib/konta";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIsoDateOrNull(s) {
  const v = String(s || "").trim();
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function addKontoParams(req, list, prefix) {
  return list.map((k, i) => {
    const p = `${prefix}${i}`;
    req.input(p, k);
    return `@${p}`;
  });
}

export async function GET(req) {
  try {
    const pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewDobavljaci) {
      return forbiddenResponse("Nemate pristup dobavljacima.");
    }
    const kontaSettings = await getKontaFromRequest(req);
    const { searchParams } = new URL(req.url);

    const subjekt = (searchParams.get("subjekt") || "").trim();
    const od = toIsoDateOrNull(searchParams.get("od"));
    const doo = toIsoDateOrNull(searchParams.get("do"));

    if (!subjekt) {
      return Response.json(
        { ok: false, error: "Missing subjekt" },
        { status: 400 }
      );
    }

    const dbReq = pool
      .request()
      .input("subjekt", subjekt)
      .input("od", od)
      .input("do", doo);
    const kontoParams = addKontoParams(dbReq, kontaSettings.dobavljaci, "k");
    const kontoInSql = kontoParams.join(",");

    const sql = `
      ;WITH PocetnoStanje AS (
        SELECT
          COALESCE(SUM(COALESCE(v.Potrazuje, 0) - COALESCE(v.Duguje, 0)), 0) AS PocetniSaldo
        FROM dbo.View_StanjeKartica v
        WHERE v.Subjekt = @subjekt
          AND v.Konto IN (${kontoInSql})
          AND (@od IS NOT NULL AND v.DatumKnjizenja < CONVERT(date, @od, 23))
      ),
      StavkePerioda AS (
        SELECT
          COALESCE(NULLIF(v.BrojSaCrtama, ''), CAST(v.Broj AS varchar(50))) AS Knjizenje,
          v.BrojSaCrtama,
          v.Broj,
          v.DatumKnjizenja,
          v.DatumDokumenta,
          v.Subjekt,
          COALESCE(v.VezniDokument, '') +
            CASE
              WHEN COALESCE(v.VezniDokument2, '') <> '' THEN ' ' + v.VezniDokument2
              ELSE ''
            END AS Dokument,
          COALESCE(v.Duguje, 0) AS Duguje,
          COALESCE(v.Potrazuje, 0) AS Potrazuje,
          v.RedBr
        FROM dbo.View_StanjeKartica v
        WHERE v.Subjekt = @subjekt
          AND v.Konto IN (${kontoInSql})
          AND (@od IS NULL OR v.DatumKnjizenja >= CONVERT(date, @od, 23))
          AND (@do IS NULL OR v.DatumKnjizenja <= CONVERT(date, @do, 23))
      )
      SELECT
        s.Knjizenje,
        s.BrojSaCrtama,
        s.Broj,
        s.DatumKnjizenja,
        s.DatumDokumenta,
        s.Subjekt,
        s.Dokument,
        s.Duguje,
        s.Potrazuje,
        p.PocetniSaldo +
          SUM(s.Potrazuje - s.Duguje) OVER (
            ORDER BY s.DatumKnjizenja, s.Broj, s.RedBr
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS SaldoKumulativno,
        p.PocetniSaldo
      FROM StavkePerioda s
      CROSS JOIN PocetnoStanje p
      ORDER BY s.DatumKnjizenja, s.Broj, s.RedBr;
    `;

    const r = await dbReq.query(sql);
    const rows = r.recordset || [];

    const pocetniSaldo = rows.length ? Number(rows[0].PocetniSaldo || 0) : 0;

    const ukupnoDuguje = rows.reduce(
      (sum, row) => sum + Number(row.Duguje || 0),
      0
    );

    const ukupnoPotrazuje = rows.reduce(
      (sum, row) => sum + Number(row.Potrazuje || 0),
      0
    );

    const saldo = rows.length
      ? Number(rows[rows.length - 1].SaldoKumulativno || 0)
      : pocetniSaldo;

    return Response.json({
      ok: true,
      konto: kontaSettings.dobavljaci,
      pocetniSaldo,
      ukupnoDuguje,
      ukupnoPotrazuje,
      saldo,
      rows,
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
