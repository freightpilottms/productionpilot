// app/api/kupci/route.js
import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { getKontaFromRequest } from "@/lib/konta";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function objectExists(pool, fullName) {
  const r = await pool
    .request()
    .input("name", fullName)
    .query(`SELECT CASE WHEN OBJECT_ID(@name) IS NULL THEN 0 ELSE 1 END AS ok`);
  return !!r.recordset?.[0]?.ok;
}

async function columnExists(pool, fullName, columnName) {
  const r = await pool
    .request()
    .input("objectName", fullName)
    .input("columnName", columnName)
    .query(`SELECT CASE WHEN COL_LENGTH(@objectName, @columnName) IS NULL THEN 0 ELSE 1 END AS ok`);
  return !!r.recordset?.[0]?.ok;
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
    if (!permissions.canViewKupci) {
      return forbiddenResponse("Nemate pristup kupcima.");
    }
    const kontaSettings = await getKontaFromRequest(req);

    const SUMMARY_VIEW = "dbo.View_StanjeKupaca";
    const FALLBACK_VIEW = "dbo.View_StanjeKartica";
    const hasSummaryView = await objectExists(pool, SUMMARY_VIEW);
    const VIEW = hasSummaryView ? SUMMARY_VIEW : FALLBACK_VIEW;
    const has = await objectExists(pool, VIEW);
    if (!has) {
      return Response.json(
        { ok: false, error: `Missing view ${VIEW}` },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") || "").trim();
    const sort = (searchParams.get("sort") || "subjekt").toLowerCase();
    const dir = (searchParams.get("dir") || "asc").toLowerCase();

    const sortCol =
      sort === "saldo"
        ? "Saldo"
        : sort === "zadnje"
        ? "ZadnjiDatumKnjizenja"
        : "Subjekt";

    const sortDir = dir === "desc" ? "DESC" : "ASC";
    const whereSubjektSql = q ? `AND v.Subjekt LIKE @q` : "";

    if (hasSummaryView) {
      const hasDospjelo = await columnExists(pool, VIEW, "Dospjelo");
      const hasDanaKasni = await columnExists(pool, VIEW, "DanaKasni");
      const dospjeloSelect = hasDospjelo
        ? "ISNULL(TRY_CONVERT(decimal(18,2), v.[Dospjelo]), 0) AS Dospjelo"
        : "CAST(NULL AS decimal(18,2)) AS Dospjelo";
      const danaKasniSelect = hasDanaKasni
        ? "ISNULL(TRY_CONVERT(int, v.[DanaKasni]), 0) AS DanaKasni"
        : "CAST(NULL AS int) AS DanaKasni";

      const cntReq = pool.request();
      if (q) cntReq.input("q", `%${q}%`);
      const cntQ = await cntReq.query(`
        SELECT COUNT(1) AS cnt
        FROM ${VIEW} v
        WHERE 1 = 1
          ${whereSubjektSql}
      `);
      const total = Number(cntQ.recordset?.[0]?.cnt || 0);

      const dataReq = pool.request();
      if (q) dataReq.input("q", `%${q}%`);
      const rowsQ = await dataReq.query(`
        SELECT
          v.Subjekt,
          ISNULL(TRY_CONVERT(decimal(18,2), v.[Saldo]), 0) AS Saldo,
          v.[ZadnjiDatumKnjizenja] AS ZadnjiDatumKnjizenja,
          ${dospjeloSelect},
          ${danaKasniSelect}
        FROM ${VIEW} v
        WHERE 1 = 1
          ${whereSubjektSql}
        ORDER BY ${sortCol} ${sortDir}
      `);

      return Response.json({
        ok: true,
        total,
        rows: rowsQ.recordset || [],
        meta: { view: VIEW, source: "summary" },
      });
    }

    const konta = kontaSettings.kupci;
    const hasDospjelo = await columnExists(pool, VIEW, "Dospjelo");
    const hasDanaKasni = await columnExists(pool, VIEW, "DanaKasni");
    const dospjeloSelect = hasDospjelo
      ? "SUM(ISNULL(TRY_CONVERT(decimal(18,2), v.[Dospjelo]), 0)) AS Dospjelo,"
      : "CAST(NULL AS decimal(18,2)) AS Dospjelo,";
    const danaKasniSelect = hasDanaKasni
      ? "MAX(ISNULL(TRY_CONVERT(int, v.[DanaKasni]), 0)) AS DanaKasni"
      : "CAST(NULL AS int) AS DanaKasni";

    const cntReq = pool.request();
    const cntParams = addKontoParams(cntReq, konta, "k");
    if (q) cntReq.input("q", `%${q}%`);
    const cntQ = await cntReq.query(`
      ;WITH Kupci AS (
        SELECT
          v.Subjekt,
          SUM(COALESCE(v.Duguje,0) - COALESCE(v.Potrazuje,0)) AS Saldo,
          MAX(v.DatumKnjizenja) AS ZadnjiDatumKnjizenja,
          ${dospjeloSelect}
          ${danaKasniSelect}
        FROM dbo.View_StanjeKartica v
        WHERE v.Konto IN (${cntParams.join(",")})
          ${whereSubjektSql}
        GROUP BY v.Subjekt
      )
      SELECT COUNT(1) AS cnt
      FROM Kupci
    `);
    const total = Number(cntQ.recordset?.[0]?.cnt || 0);

    const dataReq = pool.request();
    const dataParams = addKontoParams(dataReq, konta, "dk");
    if (q) dataReq.input("q", `%${q}%`);

    const rowsQ = await dataReq.query(`
      ;WITH Kupci AS (
        SELECT
          v.Subjekt,
          SUM(COALESCE(v.Duguje,0) - COALESCE(v.Potrazuje,0)) AS Saldo,
          MAX(v.DatumKnjizenja) AS ZadnjiDatumKnjizenja,
          ${dospjeloSelect}
          ${danaKasniSelect}
        FROM dbo.View_StanjeKartica v
        WHERE v.Konto IN (${dataParams.join(",")})
          ${whereSubjektSql}
        GROUP BY v.Subjekt
      )
      SELECT
        Subjekt,
        ISNULL(Saldo, 0) AS Saldo,
        ZadnjiDatumKnjizenja,
        Dospjelo,
        DanaKasni
      FROM Kupci
      ORDER BY ${sortCol} ${sortDir}
    `);

    return Response.json({
      ok: true,
      total,
      rows: rowsQ.recordset || [],
      meta: { view: VIEW, konta },
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
