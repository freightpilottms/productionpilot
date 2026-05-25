import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { getKontaFromRequest } from "@/lib/konta";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseKontoParam(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  return s.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20);
}

function toIsoDateOrNull(s) {
  const v = String(s || "").trim();
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function GET(req) {
  try {
    const pool = await getPoolFromRequest(req);
    const kontaSettings = await getKontaFromRequest(req);
    const { searchParams } = new URL(req.url);

    const subjekt = (searchParams.get("subjekt") || "").trim();
    const od = toIsoDateOrNull(searchParams.get("od"));
    const doo = toIsoDateOrNull(searchParams.get("do"));
    const type = String(searchParams.get("type") || "kupac").toLowerCase();
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (type === "dobavljac" && !permissions.canViewDobavljaci) {
      return forbiddenResponse("Nemate pristup dobavljačima.");
    }
    if (type !== "dobavljac" && !permissions.canViewKupci) {
      return forbiddenResponse("Nemate pristup kupcima.");
    }

    const kontoList =
      parseKontoParam(searchParams.get("konto")) ||
      (type === "dobavljac" ? kontaSettings.dobavljaci : kontaSettings.kupci);

    if (!subjekt) {
      return Response.json(
        { ok: false, error: "Missing subjekt" },
        { status: 400 }
      );
    }

    const isDobavljac = type === "dobavljac";

    const saldoExpr = isDobavljac
      ? "(COALESCE(v.Potrazuje, 0) - COALESCE(v.Duguje, 0))"
      : "(COALESCE(v.Duguje, 0) - COALESCE(v.Potrazuje, 0))";

    const saldoExprStavke = isDobavljac
      ? "(s.Potrazuje - s.Duguje)"
      : "(s.Duguje - s.Potrazuje)";

    const dbReq = pool
      .request()
      .input("subjekt", subjekt)
      .input("od", od)
      .input("do", doo);

    const kontoParams = kontoList.map((k, i) => {
      const p = `k${i}`;
      dbReq.input(p, k);
      return `@${p}`;
    });

    const kontoInSql = kontoParams.join(",");

    const sql = `
      ;WITH PocetnoStanje AS (
        SELECT
          COALESCE(SUM(${saldoExpr}), 0) AS PocetniSaldo
        FROM dbo.View_StanjeKartica v
        WHERE v.Subjekt = @subjekt
          AND v.Konto IN (${kontoInSql})
          AND (@od IS NOT NULL AND v.DatumKnjizenja < CONVERT(date, @od, 23))
      ),
      StavkePerioda AS (
        SELECT
          COALESCE(NULLIF(v.BrojSaCrtama, ''), CAST(v.Broj AS varchar(50))) AS Knjizenje,
          v.BrojSaCrtama,
          v.DatumKnjizenja,
          v.Subjekt,
          COALESCE(v.VezniDokument, '') +
            CASE
              WHEN COALESCE(v.VezniDokument2, '') <> '' THEN ' ' + v.VezniDokument2
              ELSE ''
            END AS Dokument,
          COALESCE(v.Duguje, 0) AS Duguje,
          COALESCE(v.Potrazuje, 0) AS Potrazuje,
          v.Broj,
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
        s.DatumKnjizenja,
        s.Subjekt,
        s.Dokument,
        s.Duguje,
        s.Potrazuje,
        p.PocetniSaldo +
          SUM(${saldoExprStavke}) OVER (
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
      type,
      konto: kontoList,
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
