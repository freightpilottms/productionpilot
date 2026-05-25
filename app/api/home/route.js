// app/api/home/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { getKontaFromRequest } from "@/lib/konta";
import { getUserPermissionsFromRequest } from "@/lib/permissions";
import { readServerCache, requestCacheKey, withServerCacheMeta, writeServerCache } from "@/lib/serverCache";

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

async function safeRead(fallback, reader) {
  try {
    return await reader();
  } catch {
    return fallback;
  }
}

const VIEW_FAKTURE = "dbo.View_RacuniZaglavljeAPP";
const VIEW_PREDRACUNI = "dbo.View_PredracuniZaglavljeAPP";
const VIEW_POS = "dbo.View_POSRacuniZaglavljeAPP";
const VIEW_ZALIHE = "dbo.View_ZaliheAPP";
const VALID_RAC_BROJ_SQL =
  "NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), [racBroj]))), '') IS NOT NULL AND COALESCE(TRY_CONVERT(decimal(38,0), NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), [racBroj]))), '')), 1) <> 0";
const AUX_QUERY_TIMEOUT_MS = 5500;
const FAST_QUERY_TIMEOUT_MS = 2500;
const HOME_CACHE_OPTIONS = { freshMs: 10 * 60 * 1000, staleMs: 2 * 60 * 60 * 1000 };

function addKontoParams(req, list, prefix) {
  return list.map((k, i) => {
    const p = `${prefix}${i}`;
    req.input(p, k);
    return `@${p}`;
  });
}

export async function GET(req) {
  let pool = null;

  try {
    pool = await getPoolFromRequest(req);
    const konta = await getKontaFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "1";
    const fast = searchParams.get("fast") === "1";
    const permissionVariant = (permissions.deniedCodes || []).join(",") || "allow";
    const fullCacheKey = await requestCacheKey(req, "home", `full:${permissionVariant}`);
    const fastCacheKey = await requestCacheKey(req, "home", `fast:${permissionVariant}`);

    if (!forceRefresh) {
      const cachedFull = readServerCache(fullCacheKey, HOME_CACHE_OPTIONS);
      if (cachedFull) {
        return Response.json(withServerCacheMeta(cachedFull.data, cachedFull));
      }

      if (fast) {
        const cachedFast = readServerCache(fastCacheKey, HOME_CACHE_OPTIONS);
        if (cachedFast) {
          return Response.json(withServerCacheMeta(cachedFast.data, cachedFast));
        }
      }
    }

    const VIEW_ZAD = "dbo.View_StanjeZaduzenja";
    const VIEW_KARTICA = "dbo.View_StanjeKartica";
    const VIEW_RACUNI = "dbo.View_StanjeRacuna";
    const VIEW_KUPCI_SUMMARY = "dbo.View_StanjeKupaca";
    const VIEW_DOB_SUMMARY = "dbo.View_StanjeDobavljaca";

    const hasZaduzenjaView = await objectExists(pool, VIEW_ZAD);
    const hasKarticaView = await objectExists(pool, VIEW_KARTICA);
    const hasRacuniView = await objectExists(pool, VIEW_RACUNI);
    const hasKupciSummaryView = await objectExists(pool, VIEW_KUPCI_SUMMARY);
    const hasDobSummaryView = await objectExists(pool, VIEW_DOB_SUMMARY);

    if (!hasKarticaView) {
      return Response.json(
        { ok: false, error: "Missing view dbo.View_StanjeKartica" },
        { status: 500 }
      );
    }

    if (fast) {
      async function readFastIssuedSummary(viewName, options = {}) {
        const exists = await objectExists(pool, viewName);
        if (!exists) return { count: 0, total: 0 };
        const hasAmount = await columnExists(pool, viewName, "sifRacArtikliZaPlatiti");
        const hasBroj = await columnExists(pool, viewName, "racBroj");
        const hasDate = options.yearOnly ? await columnExists(pool, viewName, "racDatumRacuna") : false;
        const whereParts = [];
        if (hasBroj) whereParts.push(VALID_RAC_BROJ_SQL);
        if (hasDate) {
          whereParts.push(`
            TRY_CONVERT(date, [racDatumRacuna]) >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
            AND TRY_CONVERT(date, [racDatumRacuna]) < DATEFROMPARTS(YEAR(GETDATE()) + 1, 1, 1)
          `);
        }
        const where = whereParts.length ? `WHERE ${whereParts.join("\n          AND ")}` : "";
        const reqFast = pool.request();
        reqFast.timeout = FAST_QUERY_TIMEOUT_MS;
        const q = await reqFast.query(`
          SELECT
            COUNT(1) AS count,
            ${hasAmount ? "ISNULL(SUM(ISNULL(TRY_CONVERT(decimal(18,2), [sifRacArtikliZaPlatiti]), 0)), 0)" : "0"} AS total
          FROM ${viewName}
          ${where}
        `);

        const count = Number(q.recordset?.[0]?.count || 0);
        return { count, total: count > 0 ? Number(q.recordset?.[0]?.total || 0) : 0 };
      }

      async function readFastPartnerSummary(viewName) {
        const exists = await objectExists(pool, viewName);
        if (!exists) {
          return {
            count: 0,
            activeCount: 0,
            preplateCount: 0,
            saldo: 0,
            preplate: 0,
            top: [],
          };
        }

        const hasDospjelo = await columnExists(pool, viewName, "Dospjelo");
        const hasDanaKasni = await columnExists(pool, viewName, "DanaKasni");
        const reqSummary = pool.request();
        reqSummary.timeout = FAST_QUERY_TIMEOUT_MS;
        const summaryQ = await reqSummary.query(`
          SELECT
            COUNT(1) AS cnt,
            ISNULL(SUM(CASE WHEN ISNULL(TRY_CONVERT(decimal(18,2), [Saldo]),0) > 0 THEN 1 ELSE 0 END),0) AS activeCount,
            ISNULL(SUM(CASE WHEN ISNULL(TRY_CONVERT(decimal(18,2), [Saldo]),0) < 0 THEN 1 ELSE 0 END),0) AS preplateCount,
            ISNULL(SUM(CASE WHEN ISNULL(TRY_CONVERT(decimal(18,2), [Saldo]),0) > 0 THEN ISNULL(TRY_CONVERT(decimal(18,2), [Saldo]),0) ELSE 0 END),0) AS saldo,
            ISNULL(SUM(CASE WHEN ISNULL(TRY_CONVERT(decimal(18,2), [Saldo]),0) < 0 THEN ABS(ISNULL(TRY_CONVERT(decimal(18,2), [Saldo]),0)) ELSE 0 END),0) AS preplate
          FROM ${viewName}
        `);

        const reqTop = pool.request();
        reqTop.timeout = FAST_QUERY_TIMEOUT_MS;
        const topQ = await reqTop.query(`
          SELECT TOP 8
            [Subjekt],
            ISNULL(TRY_CONVERT(decimal(18,2), [Saldo]), 0) AS Saldo,
            [ZadnjiDatumKnjizenja] AS ZadnjiDatumKnjizenja,
            ${hasDospjelo ? "ISNULL(TRY_CONVERT(decimal(18,2), [Dospjelo]), 0)" : "CAST(NULL AS decimal(18,2))"} AS Dospjelo,
            ${hasDanaKasni ? "ISNULL(TRY_CONVERT(int, [DanaKasni]), 0)" : "CAST(NULL AS int)"} AS DanaKasni
          FROM ${viewName}
          ORDER BY
            CASE WHEN ISNULL(TRY_CONVERT(decimal(18,2), [Saldo]),0) < 0 THEN 1 ELSE 0 END,
            ABS(ISNULL(TRY_CONVERT(decimal(18,2), [Saldo]),0)) DESC,
            [Subjekt] ASC
        `);

        return {
          count: Number(summaryQ.recordset?.[0]?.cnt || 0),
          activeCount: Number(summaryQ.recordset?.[0]?.activeCount || 0),
          preplateCount: Number(summaryQ.recordset?.[0]?.preplateCount || 0),
          saldo: Number(summaryQ.recordset?.[0]?.saldo || 0),
          preplate: Number(summaryQ.recordset?.[0]?.preplate || 0),
          top: topQ.recordset || [],
        };
      }

      async function readFastRacuni() {
        if (hasRacuniView) {
          const reqFast = pool.request();
          reqFast.timeout = FAST_QUERY_TIMEOUT_MS;
          const q = await reqFast.query(`
            SELECT ISNULL(SUM(COALESCE(Saldo,0)),0) AS totalRacuni
            FROM dbo.View_StanjeRacuna
          `);
          return Number(q.recordset?.[0]?.totalRacuni || 0);
        }

        const reqFast = pool.request();
        reqFast.timeout = FAST_QUERY_TIMEOUT_MS;
        const kontoParams = addKontoParams(reqFast, konta.racuni, "fr");
        const q = await reqFast.query(`
          SELECT ISNULL(SUM(COALESCE(v.Duguje,0) - COALESCE(v.Potrazuje,0)),0) AS totalRacuni
          FROM dbo.View_StanjeKartica v
          WHERE v.Konto IN (${kontoParams.join(",")})
        `);
        return Number(q.recordset?.[0]?.totalRacuni || 0);
      }

      async function readFastZaduzenja() {
        if (!hasZaduzenjaView) return 0;
        const reqFast = pool.request();
        reqFast.timeout = FAST_QUERY_TIMEOUT_MS;
        const q = await reqFast.query(`
          SELECT -ISNULL(SUM(ABS(ISNULL(Saldo,0))),0) AS totalZaduzenja
          FROM [dbo].[View_StanjeZaduzenja]
        `);
        return Number(q.recordset?.[0]?.totalZaduzenja || 0);
      }

      async function readFastZaliheStats() {
        const exists = await objectExists(pool, VIEW_ZALIHE);
        if (!exists) return { artikli: 0, bezZalihe: 0, negativne: 0, pozitivne: 0, topKolicine: [], topOdstupanja: [] };
        const hasKolicina = await columnExists(pool, VIEW_ZALIHE, "Kolicina");
        const hasZaliha = await columnExists(pool, VIEW_ZALIHE, "Zaliha");
        if (!hasKolicina && !hasZaliha) return { artikli: 0, bezZalihe: 0, negativne: 0, pozitivne: 0, topKolicine: [], topOdstupanja: [] };
        const hasSifra = await columnExists(pool, VIEW_ZALIHE, "SifraArtikla");
        const hasNaziv = await columnExists(pool, VIEW_ZALIHE, "NazivArtikla");
        const qtyExpr = hasKolicina ? "[Kolicina]" : "[Zaliha]";
        const reqTop = pool.request();
        reqTop.timeout = FAST_QUERY_TIMEOUT_MS;
        const top = await reqTop.query(`
          SELECT TOP 12
            ${hasNaziv ? "[NazivArtikla]" : "''"} AS NazivArtikla,
            ${hasSifra ? "[SifraArtikla]" : "''"} AS SifraArtikla,
            ISNULL(TRY_CONVERT(decimal(18,3), ${qtyExpr}), 0) AS Kolicina
          FROM ${VIEW_ZALIHE}
          ORDER BY ISNULL(TRY_CONVERT(decimal(18,3), ${qtyExpr}), 0) DESC
        `);
        return {
          artikli: 0,
          bezZalihe: 0,
          negativne: 0,
          pozitivne: 0,
          topKolicine: top.recordset || [],
          topOdstupanja: top.recordset || [],
          approximate: true,
        };
      }

      const [fastKupci, fastDob, fastRacuni, fastZaduzenja, faktureSummary, predracuniSummary, posSummary, zaliheStats] =
        await Promise.all([
          permissions.canViewKupci ? safeRead({ count: 0, activeCount: 0, preplateCount: 0, saldo: 0, preplate: 0, top: [] }, () => readFastPartnerSummary(VIEW_KUPCI_SUMMARY)) : { count: 0, activeCount: 0, preplateCount: 0, saldo: 0, preplate: 0, top: [] },
          permissions.canViewDobavljaci ? safeRead({ count: 0, activeCount: 0, preplateCount: 0, saldo: 0, preplate: 0, top: [] }, () => readFastPartnerSummary(VIEW_DOB_SUMMARY)) : { count: 0, activeCount: 0, preplateCount: 0, saldo: 0, preplate: 0, top: [] },
          permissions.canViewRacuni ? safeRead(0, readFastRacuni) : 0,
          permissions.canViewZaduzenja ? safeRead(0, readFastZaduzenja) : 0,
          permissions.canViewFakture ? safeRead({ count: 0, total: 0 }, () => readFastIssuedSummary(VIEW_FAKTURE)) : { count: 0, total: 0 },
          permissions.canViewPredracuni ? safeRead({ count: 0, total: 0 }, () => readFastIssuedSummary(VIEW_PREDRACUNI)) : { count: 0, total: 0 },
          permissions.canViewPos ? safeRead({ count: 0, total: 0 }, () => readFastIssuedSummary(VIEW_POS, { yearOnly: true })) : { count: 0, total: 0 },
          permissions.canViewZalihe ? safeRead({ artikli: 0, bezZalihe: 0, negativne: 0, pozitivne: 0, topKolicine: [], topOdstupanja: [] }, readFastZaliheStats) : { artikli: 0, bezZalihe: 0, negativne: 0, pozitivne: 0, topKolicine: [], topOdstupanja: [] },
        ]);

      const payload = {
        ok: true,
        partial: true,
        totals: {
          racuni: fastRacuni,
          zaduzenja: permissions.canViewZaduzenja ? fastZaduzenja : 0,
          kupci: fastKupci.saldo,
          dobavljaci: fastDob.saldo,
          preplateKupci: fastKupci.preplate,
          preplateDobavljaci: fastDob.preplate,
        },
        top5: {
          kupci: fastKupci.top,
          dobavljaci: fastDob.top,
        },
        meta: {
          counts: {
            kupci: fastKupci.count,
            dobavljaci: fastDob.count,
            kupciActive: fastKupci.activeCount,
            kupciPreplate: fastKupci.preplateCount,
            dobavljaciActive: fastDob.activeCount,
            dobavljaciPreplate: fastDob.preplateCount,
          },
          issued: {
            fakture: faktureSummary,
            predracuni: predracuniSummary,
            pos: posSummary,
          },
          monthlyPromet: [],
          weeklyPromet: [],
          dailyPromet: [],
          zalihe: zaliheStats,
          konta: {
            racuni: permissions.canViewRacuni ? konta.racuni : [],
            kupci: permissions.canViewKupci ? konta.kupci : [],
            dobavljaci: permissions.canViewDobavljaci ? konta.dobavljaci : [],
          },
          views: {
            zaduzenja: permissions.canViewZaduzenja && hasZaduzenjaView ? VIEW_ZAD : null,
            kartica: hasKarticaView ? VIEW_KARTICA : null,
            racuni: hasRacuniView ? VIEW_RACUNI : null,
          },
        },
        permissions,
      };

      writeServerCache(fastCacheKey, payload);
      return Response.json(payload);
    }

    // KUPCI: Duguje - Potrazuje
    const kupciReq = pool.request();
    const kupciParams = addKontoParams(kupciReq, konta.kupci, "kup");
    const kupciQ = await kupciReq.query(`
      ;WITH Kupci AS (
        SELECT
          v.Subjekt,
          SUM(COALESCE(v.Duguje,0) - COALESCE(v.Potrazuje,0)) AS Saldo,
          MAX(v.DatumKnjizenja) AS ZadnjiDatumKnjizenja
        FROM dbo.View_StanjeKartica v
        WHERE v.Konto IN (${kupciParams.join(",")})
        GROUP BY v.Subjekt
      )
      SELECT
        COUNT(1) AS cnt,
        ISNULL(SUM(CASE WHEN ISNULL(Saldo,0) > 0 THEN 1 ELSE 0 END),0) AS activeCount,
        ISNULL(SUM(CASE WHEN ISNULL(Saldo,0) < 0 THEN 1 ELSE 0 END),0) AS preplateCount,
        ISNULL(SUM(CASE WHEN ISNULL(Saldo,0) > 0 THEN ISNULL(Saldo,0) ELSE 0 END),0) AS potrazivanja,
        ISNULL(SUM(CASE WHEN ISNULL(Saldo,0) < 0 THEN ABS(ISNULL(Saldo,0)) ELSE 0 END),0) AS preplate
      FROM Kupci
    `);

    const kupciCount = Number(kupciQ.recordset?.[0]?.cnt || 0);
    const kupciActiveCount = Number(kupciQ.recordset?.[0]?.activeCount || 0);
    const kupciPreplateCount = Number(kupciQ.recordset?.[0]?.preplateCount || 0);
    const potrazivanja = Number(kupciQ.recordset?.[0]?.potrazivanja || 0);
    const preplateKupci = Number(kupciQ.recordset?.[0]?.preplate || 0);

    let top5Kupci = [];
    if (hasKupciSummaryView) {
      const hasDospjelo = await columnExists(pool, VIEW_KUPCI_SUMMARY, "Dospjelo");
      const hasDanaKasni = await columnExists(pool, VIEW_KUPCI_SUMMARY, "DanaKasni");
      const topKupciReq = pool.request();
      topKupciReq.timeout = AUX_QUERY_TIMEOUT_MS;
      const topKupciQ = await topKupciReq.query(`
        SELECT TOP 30
          v.Subjekt,
          ISNULL(TRY_CONVERT(decimal(18,2), v.[Saldo]), 0) AS Saldo,
          v.[ZadnjiDatumKnjizenja] AS ZadnjiDatumKnjizenja,
          ${hasDospjelo ? "ISNULL(TRY_CONVERT(decimal(18,2), v.[Dospjelo]), 0)" : "CAST(NULL AS decimal(18,2))"} AS Dospjelo,
          ${hasDanaKasni ? "ISNULL(TRY_CONVERT(int, v.[DanaKasni]), 0)" : "CAST(NULL AS int)"} AS DanaKasni
        FROM ${VIEW_KUPCI_SUMMARY} v
        ORDER BY
          CASE WHEN ISNULL(TRY_CONVERT(decimal(18,2), v.[Saldo]),0) < 0 THEN 1 ELSE 0 END,
          ISNULL(TRY_CONVERT(decimal(18,2), v.[Saldo]),0) DESC,
          v.Subjekt ASC
      `);
      top5Kupci = topKupciQ.recordset || [];
    } else {
      const hasDospjelo = await columnExists(pool, VIEW_KARTICA, "Dospjelo");
      const hasDanaKasni = await columnExists(pool, VIEW_KARTICA, "DanaKasni");
      const dospjeloSelect = hasDospjelo
        ? "SUM(ISNULL(TRY_CONVERT(decimal(18,2), v.[Dospjelo]), 0)) AS Dospjelo,"
        : "CAST(NULL AS decimal(18,2)) AS Dospjelo,";
      const danaKasniSelect = hasDanaKasni
        ? "MAX(ISNULL(TRY_CONVERT(int, v.[DanaKasni]), 0)) AS DanaKasni"
        : "CAST(NULL AS int) AS DanaKasni";
      const topKupciReq = pool.request();
      topKupciReq.timeout = AUX_QUERY_TIMEOUT_MS;
      const topKupciParams = addKontoParams(topKupciReq, konta.kupci, "tk");
      const topKupciQ = await topKupciReq.query(`
        ;WITH Kupci AS (
          SELECT
            v.Subjekt,
            SUM(COALESCE(v.Duguje,0) - COALESCE(v.Potrazuje,0)) AS Saldo,
            MAX(v.DatumKnjizenja) AS ZadnjiDatumKnjizenja,
            ${dospjeloSelect}
            ${danaKasniSelect}
          FROM dbo.View_StanjeKartica v
          WHERE v.Konto IN (${topKupciParams.join(",")})
          GROUP BY v.Subjekt
        )
        SELECT TOP 30
          Subjekt,
          ISNULL(Saldo,0) AS Saldo,
          ZadnjiDatumKnjizenja,
          Dospjelo,
          DanaKasni
        FROM Kupci
        ORDER BY
          CASE WHEN ISNULL(Saldo,0) < 0 THEN 1 ELSE 0 END,
          ISNULL(Saldo,0) DESC,
          Subjekt ASC
      `);
      top5Kupci = topKupciQ.recordset || [];
    }

    // DOBAVLJAČI: Potrazuje - Duguje
    const dobReq = pool.request();
    const dobParams = addKontoParams(dobReq, konta.dobavljaci, "dob");
    const dobQ = await dobReq.query(`
      ;WITH Dobavljaci AS (
        SELECT
          v.Subjekt,
          SUM(COALESCE(v.Potrazuje,0) - COALESCE(v.Duguje,0)) AS Saldo,
          MAX(v.DatumKnjizenja) AS ZadnjiDatumKnjizenja
        FROM dbo.View_StanjeKartica v
        WHERE v.Konto IN (${dobParams.join(",")})
        GROUP BY v.Subjekt
      )
      SELECT
        COUNT(1) AS cnt,
        ISNULL(SUM(CASE WHEN ISNULL(Saldo,0) > 0 THEN 1 ELSE 0 END),0) AS activeCount,
        ISNULL(SUM(CASE WHEN ISNULL(Saldo,0) < 0 THEN 1 ELSE 0 END),0) AS preplateCount,
        ISNULL(SUM(CASE WHEN ISNULL(Saldo,0) > 0 THEN ISNULL(Saldo,0) ELSE 0 END),0) AS dugovanja,
        ISNULL(SUM(CASE WHEN ISNULL(Saldo,0) < 0 THEN ABS(ISNULL(Saldo,0)) ELSE 0 END),0) AS preplate
      FROM Dobavljaci
    `);

    const dobCount = Number(dobQ.recordset?.[0]?.cnt || 0);
    const dobActiveCount = Number(dobQ.recordset?.[0]?.activeCount || 0);
    const dobPreplateCount = Number(dobQ.recordset?.[0]?.preplateCount || 0);
    const dugovanja = Number(dobQ.recordset?.[0]?.dugovanja || 0);
    const preplateDobavljaci = Number(dobQ.recordset?.[0]?.preplate || 0);

    let top5Dob = [];
    if (hasDobSummaryView) {
      const hasDospjelo = await columnExists(pool, VIEW_DOB_SUMMARY, "Dospjelo");
      const hasDanaKasni = await columnExists(pool, VIEW_DOB_SUMMARY, "DanaKasni");
      const topDobReq = pool.request();
      topDobReq.timeout = AUX_QUERY_TIMEOUT_MS;
      const topDobQ = await topDobReq.query(`
        SELECT TOP 30
          v.Subjekt,
          ISNULL(TRY_CONVERT(decimal(18,2), v.[Saldo]), 0) AS Saldo,
          v.[ZadnjiDatumKnjizenja] AS ZadnjiDatumKnjizenja,
          ${hasDospjelo ? "ISNULL(TRY_CONVERT(decimal(18,2), v.[Dospjelo]), 0)" : "CAST(NULL AS decimal(18,2))"} AS Dospjelo,
          ${hasDanaKasni ? "ISNULL(TRY_CONVERT(int, v.[DanaKasni]), 0)" : "CAST(NULL AS int)"} AS DanaKasni
        FROM ${VIEW_DOB_SUMMARY} v
        ORDER BY
          CASE WHEN ISNULL(TRY_CONVERT(decimal(18,2), v.[Saldo]),0) < 0 THEN 1 ELSE 0 END,
          ISNULL(TRY_CONVERT(decimal(18,2), v.[Saldo]),0) DESC,
          v.Subjekt ASC
      `);
      top5Dob = topDobQ.recordset || [];
    } else {
      const hasDospjelo = await columnExists(pool, VIEW_KARTICA, "Dospjelo");
      const hasDanaKasni = await columnExists(pool, VIEW_KARTICA, "DanaKasni");
      const dospjeloSelect = hasDospjelo
        ? "SUM(ISNULL(TRY_CONVERT(decimal(18,2), v.[Dospjelo]), 0)) AS Dospjelo,"
        : "CAST(NULL AS decimal(18,2)) AS Dospjelo,";
      const danaKasniSelect = hasDanaKasni
        ? "MAX(ISNULL(TRY_CONVERT(int, v.[DanaKasni]), 0)) AS DanaKasni"
        : "CAST(NULL AS int) AS DanaKasni";
      const topDobReq = pool.request();
      topDobReq.timeout = AUX_QUERY_TIMEOUT_MS;
      const topDobParams = addKontoParams(topDobReq, konta.dobavljaci, "td");
      const topDobQ = await topDobReq.query(`
        ;WITH Dobavljaci AS (
          SELECT
            v.Subjekt,
            SUM(COALESCE(v.Potrazuje,0) - COALESCE(v.Duguje,0)) AS Saldo,
            MAX(v.DatumKnjizenja) AS ZadnjiDatumKnjizenja,
            ${dospjeloSelect}
            ${danaKasniSelect}
          FROM dbo.View_StanjeKartica v
          WHERE v.Konto IN (${topDobParams.join(",")})
          GROUP BY v.Subjekt
        )
        SELECT TOP 30
          Subjekt,
          ISNULL(Saldo,0) AS Saldo,
          ZadnjiDatumKnjizenja,
          Dospjelo,
          DanaKasni
        FROM Dobavljaci
        ORDER BY
          CASE WHEN ISNULL(Saldo,0) < 0 THEN 1 ELSE 0 END,
          ISNULL(Saldo,0) DESC,
          Subjekt ASC
      `);
      top5Dob = topDobQ.recordset || [];
    }

    let zaduzenja = 0;

    if (hasZaduzenjaView && permissions.canViewZaduzenja) {
      const q = await pool.request().query(`
        SELECT -ISNULL(SUM(ABS(ISNULL(Saldo,0))),0) AS totalZaduzenja
        FROM [dbo].[View_StanjeZaduzenja]
      `);

      zaduzenja = Number(q.recordset?.[0]?.totalZaduzenja || 0);
    }

    let racuni = 0;

    if (hasRacuniView) {
      const q = await pool.request().query(`
        SELECT ISNULL(SUM(COALESCE(Saldo,0)),0) AS totalRacuni
        FROM dbo.View_StanjeRacuna
      `);

      racuni = Number(q.recordset?.[0]?.totalRacuni || 0);
    } else {
      const rq = pool.request();
      const kontoParams = addKontoParams(rq, konta.racuni, "rac");

      const q = await rq.query(`
        SELECT ISNULL(SUM(COALESCE(v.Duguje,0) - COALESCE(v.Potrazuje,0)),0) AS totalRacuni
        FROM dbo.View_StanjeKartica v
        WHERE v.Konto IN (${kontoParams.join(",")})
      `);

      racuni = Number(q.recordset?.[0]?.totalRacuni || 0);
    }

    async function readIssuedSummary(viewName, options = {}) {
      const exists = await objectExists(pool, viewName);
      if (!exists) return { count: 0, total: 0 };
      const hasAmount = await columnExists(pool, viewName, "sifRacArtikliZaPlatiti");
      const hasBroj = await columnExists(pool, viewName, "racBroj");
      const hasDate = options.yearOnly ? await columnExists(pool, viewName, "racDatumRacuna") : false;
      const whereParts = [];
      if (hasBroj) whereParts.push(VALID_RAC_BROJ_SQL);
      if (hasDate) {
        whereParts.push(`
          TRY_CONVERT(date, [racDatumRacuna]) >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
          AND TRY_CONVERT(date, [racDatumRacuna]) < DATEFROMPARTS(YEAR(GETDATE()) + 1, 1, 1)
        `);
      }
      const where = whereParts.length ? `WHERE ${whereParts.join("\n          AND ")}` : "";

      const summaryReq = pool.request();
      summaryReq.timeout = AUX_QUERY_TIMEOUT_MS;
      const q = await summaryReq.query(`
        SELECT
          COUNT(1) AS count,
          ${
            hasAmount
              ? "ISNULL(SUM(ISNULL(TRY_CONVERT(decimal(18,2), [sifRacArtikliZaPlatiti]), 0)), 0)"
              : "0"
          } AS total
        FROM ${viewName}
        ${where}
      `);

      const count = Number(q.recordset?.[0]?.count || 0);

      return {
        count,
        total: count > 0 ? Number(q.recordset?.[0]?.total || 0) : 0,
      };
    }

    async function buildPrometSourceParts() {
      const sourceParts = [];

      for (const { viewName, sourceType } of [
        permissions.canViewFakture ? { viewName: VIEW_FAKTURE, sourceType: "fakture" } : null,
        permissions.canViewPos ? { viewName: VIEW_POS, sourceType: "pos" } : null,
      ].filter(Boolean)) {
        const exists = await objectExists(pool, viewName);
        if (!exists) continue;

        const hasDate = await columnExists(pool, viewName, "racDatumRacuna");
        const hasAmount = await columnExists(pool, viewName, "sifRacArtikliZaPlatiti");
        if (!hasDate || !hasAmount) continue;

        const hasBroj = await columnExists(pool, viewName, "racBroj");
        const where = hasBroj ? `WHERE ${VALID_RAC_BROJ_SQL}` : "";

        sourceParts.push(`
          SELECT
            TRY_CONVERT(date, [racDatumRacuna]) AS datum,
            ISNULL(TRY_CONVERT(decimal(18,2), [sifRacArtikliZaPlatiti]), 0) AS amount,
            N'${sourceType}' AS sourceType
          FROM ${viewName}
          ${where}
        `);
      }

      return sourceParts;
    }

    async function readMonthlyPromet() {
      const sourceParts = await buildPrometSourceParts();

      if (!sourceParts.length) return [];

      const monthlyReq = pool.request();
      monthlyReq.timeout = AUX_QUERY_TIMEOUT_MS;
      const q = await monthlyReq.query(`
        ;WITH Months AS (
          SELECT DATEFROMPARTS(YEAR(GETDATE()), v.m, 1) AS monthStart
          FROM (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)) v(m)
          WHERE v.m <= MONTH(GETDATE())
        ),
        Source AS (
          ${sourceParts.join("\n          UNION ALL\n")}
        ),
        Promet AS (
          SELECT
            DATEFROMPARTS(YEAR(datum), MONTH(datum), 1) AS monthStart,
            SUM(amount) AS total
          FROM Source
          WHERE
            datum >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
            AND datum < DATEADD(month, 1, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
          GROUP BY DATEFROMPARTS(YEAR(datum), MONTH(datum), 1)
        )
        SELECT
          CONVERT(char(7), m.monthStart, 120) AS period,
          ISNULL(p.total, 0) AS total
        FROM Months m
        LEFT JOIN Promet p ON p.monthStart = m.monthStart
        ORDER BY m.monthStart ASC
      `);

      return q.recordset || [];
    }

    async function readWeeklyPromet() {
      const sourceParts = await buildPrometSourceParts();

      if (!sourceParts.length) return [];

      const weeklyReq = pool.request();
      weeklyReq.timeout = AUX_QUERY_TIMEOUT_MS;
      const q = await weeklyReq.query(`
        ;WITH Source AS (
          ${sourceParts.join("\n          UNION ALL\n")}
        ),
        Promet AS (
          SELECT
            DATEADD(day, -(((DATEDIFF(day, CONVERT(date, '19000101'), CONVERT(date, datum)) % 7) + 7) % 7), CONVERT(date, datum)) AS weekStart,
            SUM(amount) AS total
          FROM Source
          WHERE
            datum >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
            AND datum < DATEADD(day, 1, CONVERT(date, GETDATE()))
          GROUP BY DATEADD(day, -(((DATEDIFF(day, CONVERT(date, '19000101'), CONVERT(date, datum)) % 7) + 7) % 7), CONVERT(date, datum))
        ),
        LastWeeks AS (
          SELECT TOP 12
            weekStart,
            CONCAT(N'Sed. ', RIGHT(CONCAT('0', DATEPART(ISO_WEEK, weekStart)), 2)) AS period,
            ISNULL(total, 0) AS total
          FROM Promet
          WHERE ISNULL(total, 0) <> 0
          ORDER BY weekStart DESC
        )
        SELECT period, total
        FROM LastWeeks
        ORDER BY weekStart ASC
      `);

      return q.recordset || [];
    }

    async function readDailyPromet() {
      const sourceParts = await buildPrometSourceParts();

      if (!sourceParts.length) return [];

      const dailyReq = pool.request();
      dailyReq.timeout = AUX_QUERY_TIMEOUT_MS;
      const q = await dailyReq.query(`
        ;WITH WeekDays AS (
          SELECT *
          FROM (VALUES
            (1, N'Ponedjeljak'),
            (2, N'Utorak'),
            (3, N'Srijeda'),
            (4, N'Četvrtak'),
            (5, N'Petak'),
            (6, N'Subota'),
            (7, N'Nedjelja')
          ) v(dayNo, period)
        ),
        Source AS (
          ${sourceParts.join("\n          UNION ALL\n")}
        ),
        Promet AS (
          SELECT
            (((DATEDIFF(day, CONVERT(date, '19000101'), CONVERT(date, datum)) % 7) + 7) % 7) + 1 AS dayNo,
            SUM(CASE WHEN sourceType = N'pos' THEN amount ELSE 0 END) AS pos,
            SUM(CASE WHEN sourceType = N'fakture' THEN amount ELSE 0 END) AS fakture,
            SUM(amount) AS total
          FROM Source
          WHERE
            datum >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
            AND datum < DATEADD(day, 1, CONVERT(date, GETDATE()))
          GROUP BY (((DATEDIFF(day, CONVERT(date, '19000101'), CONVERT(date, datum)) % 7) + 7) % 7) + 1
        )
        SELECT
          w.period,
          ISNULL(pos, 0) AS pos,
          ISNULL(fakture, 0) AS fakture,
          ISNULL(total, 0) AS total
        FROM WeekDays w
        LEFT JOIN Promet p ON p.dayNo = w.dayNo
        ORDER BY w.dayNo ASC
      `);

      return q.recordset || [];
    }

    async function readZaliheStats() {
      const exists = await objectExists(pool, VIEW_ZALIHE);
      if (!exists) return { artikli: 0, bezZalihe: 0, negativne: 0, pozitivne: 0, topKolicine: [], topOdstupanja: [] };
      const hasKolicina = await columnExists(pool, VIEW_ZALIHE, "Kolicina");
      const hasZaliha = await columnExists(pool, VIEW_ZALIHE, "Zaliha");
      if (!hasKolicina && !hasZaliha) return { artikli: 0, bezZalihe: 0, negativne: 0, pozitivne: 0, topKolicine: [], topOdstupanja: [] };
      const hasSifra = await columnExists(pool, VIEW_ZALIHE, "SifraArtikla");
      const hasNaziv = await columnExists(pool, VIEW_ZALIHE, "NazivArtikla");
      const qtyExpr = hasKolicina ? "[Kolicina]" : "[Zaliha]";

      const statsReq = pool.request();
      statsReq.timeout = AUX_QUERY_TIMEOUT_MS;
      const q = await statsReq.query(`
        SELECT
          COUNT(1) AS artikli,
          SUM(CASE WHEN ISNULL(TRY_CONVERT(decimal(18,3), ${qtyExpr}), 0) = 0 THEN 1 ELSE 0 END) AS bezZalihe,
          SUM(CASE WHEN ISNULL(TRY_CONVERT(decimal(18,3), ${qtyExpr}), 0) < 0 THEN 1 ELSE 0 END) AS negativne,
          SUM(CASE WHEN ISNULL(TRY_CONVERT(decimal(18,3), ${qtyExpr}), 0) > 0 THEN 1 ELSE 0 END) AS pozitivne
        FROM ${VIEW_ZALIHE}
      `);

      const topReq = pool.request();
      topReq.timeout = AUX_QUERY_TIMEOUT_MS;
      const top = await topReq.query(`
        SELECT TOP 30
          ${hasNaziv ? "[NazivArtikla]" : "''"} AS NazivArtikla,
          ${hasSifra ? "[SifraArtikla]" : "''"} AS SifraArtikla,
          ISNULL(TRY_CONVERT(decimal(18,3), ${qtyExpr}), 0) AS Kolicina
        FROM ${VIEW_ZALIHE}
        ORDER BY ISNULL(TRY_CONVERT(decimal(18,3), ${qtyExpr}), 0) DESC
      `);

      return {
        artikli: Number(q.recordset?.[0]?.artikli || 0),
        bezZalihe: Number(q.recordset?.[0]?.bezZalihe || 0),
        negativne: Number(q.recordset?.[0]?.negativne || 0),
        pozitivne: Number(q.recordset?.[0]?.pozitivne || 0),
        topKolicine: top.recordset || [],
        topOdstupanja: top.recordset || [],
      };
    }

    const [faktureSummary, predracuniSummary, posSummary, monthlyPromet, weeklyPromet, dailyPromet, zaliheStats] =
      await Promise.all([
        permissions.canViewFakture ? safeRead({ count: 0, total: 0 }, () => readIssuedSummary(VIEW_FAKTURE)) : { count: 0, total: 0 },
        permissions.canViewPredracuni ? safeRead({ count: 0, total: 0 }, () => readIssuedSummary(VIEW_PREDRACUNI)) : { count: 0, total: 0 },
        permissions.canViewPos ? safeRead({ count: 0, total: 0 }, () => readIssuedSummary(VIEW_POS, { yearOnly: true })) : { count: 0, total: 0 },
        safeRead([], readMonthlyPromet),
        safeRead([], readWeeklyPromet),
        safeRead([], readDailyPromet),
        permissions.canViewZalihe ? safeRead({ artikli: 0, bezZalihe: 0, negativne: 0 }, readZaliheStats) : { artikli: 0, bezZalihe: 0, negativne: 0, pozitivne: 0, topKolicine: [], topOdstupanja: [] },
      ]);

    const payload = {
      ok: true,
      partial: false,
      totals: {
        racuni: permissions.canViewRacuni ? racuni : 0,
        zaduzenja: permissions.canViewZaduzenja ? zaduzenja : 0,
        kupci: permissions.canViewKupci ? potrazivanja : 0,
        dobavljaci: permissions.canViewDobavljaci ? dugovanja : 0,
        preplateKupci: permissions.canViewKupci ? preplateKupci : 0,
        preplateDobavljaci: permissions.canViewDobavljaci ? preplateDobavljaci : 0,
      },
      top5: {
        kupci: permissions.canViewKupci ? top5Kupci : [],
        dobavljaci: permissions.canViewDobavljaci ? top5Dob : [],
      },
      meta: {
        counts: {
          kupci: permissions.canViewKupci ? kupciCount : 0,
          dobavljaci: permissions.canViewDobavljaci ? dobCount : 0,
          kupciActive: permissions.canViewKupci ? kupciActiveCount : 0,
          kupciPreplate: permissions.canViewKupci ? kupciPreplateCount : 0,
          dobavljaciActive: permissions.canViewDobavljaci ? dobActiveCount : 0,
          dobavljaciPreplate: permissions.canViewDobavljaci ? dobPreplateCount : 0,
        },
        issued: {
          fakture: faktureSummary,
          predracuni: predracuniSummary,
          pos: posSummary,
        },
        monthlyPromet,
        weeklyPromet,
        dailyPromet,
        zalihe: zaliheStats,
        konta: {
          racuni: permissions.canViewRacuni ? konta.racuni : [],
          kupci: permissions.canViewKupci ? konta.kupci : [],
          dobavljaci: permissions.canViewDobavljaci ? konta.dobavljaci : [],
        },
        views: {
          zaduzenja: permissions.canViewZaduzenja && hasZaduzenjaView ? VIEW_ZAD : null,
          kartica: hasKarticaView ? VIEW_KARTICA : null,
          racuni: hasRacuniView ? VIEW_RACUNI : null,
        },
      },
      permissions,
    };

    writeServerCache(fullCacheKey, payload);
    return Response.json(payload);
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
