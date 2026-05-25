// app/api/dobavljaci/route.js
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

function searchTokens(value) {
  const stop = new Set(["doo", "d", "o", "dd", "ad", "tr", "obrt"]);
  return String(value || "")
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stop.has(token.toLowerCase()))
    .slice(0, 4);
}

function addSearchParams(req, q, prefix) {
  if (!q) return { rawParam: "", tokenParams: [] };
  req.input(`${prefix}q`, `%${q}%`);
  const tokenParams = searchTokens(q).map((token, index) => {
    const name = `${prefix}t${index}`;
    req.input(name, `%${token}%`);
    return name;
  });
  return { rawParam: `${prefix}q`, tokenParams };
}

function buildSubjektWhere(search) {
  if (!search.rawParam) return "";
  const tokenSql = search.tokenParams.length
    ? ` OR (${search.tokenParams.map((param) => `v.Subjekt LIKE @${param}`).join(" AND ")})`
    : "";
  return `AND (v.Subjekt LIKE @${search.rawParam}${tokenSql})`;
}

export async function GET(req) {
  try {
    const pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewDobavljaci) {
      return forbiddenResponse("Nemate pristup dobavljačima.");
    }
    const kontaSettings = await getKontaFromRequest(req);

    const SUMMARY_VIEW = "dbo.View_StanjeDobavljaca";
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
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 0) || 0, 0), 100);

    const sortCol =
      sort === "saldo"
        ? "Saldo"
        : sort === "zadnje"
        ? "ZadnjiDatumKnjizenja"
        : "Subjekt";

    const sortDir = dir === "desc" ? "DESC" : "ASC";

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
      const cntSearch = addSearchParams(cntReq, q, "c");
      const cntWhereSubjektSql = buildSubjektWhere(cntSearch);
      const cntQ = await cntReq.query(`
        SELECT COUNT(1) AS cnt
        FROM ${VIEW} v
        WHERE 1 = 1
          ${cntWhereSubjektSql}
      `);
      const total = Number(cntQ.recordset?.[0]?.cnt || 0);

      const dataReq = pool.request();
      const dataSearch = addSearchParams(dataReq, q, "d");
      const dataWhereSubjektSql = buildSubjektWhere(dataSearch);
      const rowsQ = await dataReq.query(`
        SELECT ${limit ? `TOP (${limit})` : ""}
          v.Subjekt,
          ISNULL(TRY_CONVERT(decimal(18,2), v.[Saldo]), 0) AS Saldo,
          v.[ZadnjiDatumKnjizenja] AS ZadnjiDatumKnjizenja,
          ${dospjeloSelect},
          ${danaKasniSelect}
        FROM ${VIEW} v
        WHERE 1 = 1
          ${dataWhereSubjektSql}
        ORDER BY ${sortCol} ${sortDir}
      `);

      return Response.json({
        ok: true,
        total,
        rows: rowsQ.recordset || [],
        meta: { view: VIEW, source: "summary" },
      });
    }

    const konta = kontaSettings.dobavljaci;
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
    const cntSearch = addSearchParams(cntReq, q, "c");
    const cntWhereSubjektSql = buildSubjektWhere(cntSearch);
    const cntQ = await cntReq.query(`
      ;WITH Dobavljaci AS (
        SELECT
          v.Subjekt,
          SUM(COALESCE(v.Potrazuje,0) - COALESCE(v.Duguje,0)) AS Saldo,
          MAX(v.DatumKnjizenja) AS ZadnjiDatumKnjizenja,
          ${dospjeloSelect}
          ${danaKasniSelect}
        FROM dbo.View_StanjeKartica v
        WHERE v.Konto IN (${cntParams.join(",")})
          ${cntWhereSubjektSql}
        GROUP BY v.Subjekt
      )
      SELECT COUNT(1) AS cnt
      FROM Dobavljaci
    `);
    const total = Number(cntQ.recordset?.[0]?.cnt || 0);

    const dataReq = pool.request();
    const dataParams = addKontoParams(dataReq, konta, "dk");
    const dataSearch = addSearchParams(dataReq, q, "d");
    const dataWhereSubjektSql = buildSubjektWhere(dataSearch);

    const rowsQ = await dataReq.query(`
      ;WITH Dobavljaci AS (
        SELECT
          v.Subjekt,
          SUM(COALESCE(v.Potrazuje,0) - COALESCE(v.Duguje,0)) AS Saldo,
          MAX(v.DatumKnjizenja) AS ZadnjiDatumKnjizenja,
          ${dospjeloSelect}
          ${danaKasniSelect}
        FROM dbo.View_StanjeKartica v
        WHERE v.Konto IN (${dataParams.join(",")})
          ${dataWhereSubjektSql}
        GROUP BY v.Subjekt
      )
      SELECT ${limit ? `TOP (${limit})` : ""}
        Subjekt,
        ISNULL(Saldo, 0) AS Saldo,
        ZadnjiDatumKnjizenja,
        Dospjelo,
        DanaKasni
      FROM Dobavljaci
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
