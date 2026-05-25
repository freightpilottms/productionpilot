import sql from "mssql";
import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";
import { readServerCache, requestCacheKey, withServerCacheMeta, writeServerCache } from "@/lib/serverCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 250;
const MAX_PAGE_SIZE = 500;
const AUX_QUERY_TIMEOUT_MS = 4500;
const ROW_QUERY_TIMEOUT_MS = 30000;
const CACHE_OPTIONS = { freshMs: 2 * 60 * 1000, staleMs: 30 * 60 * 1000 };

function parseBoundedInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function safeRecordset(result) {
  return Array.isArray(result?.recordset) ? result.recordset : [];
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const page = parseBoundedInt(searchParams.get("page"), 1, 1, 100000);
    const pageSize = parseBoundedInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, 50, MAX_PAGE_SIZE);
    const offset = (page - 1) * pageSize;
    const take = pageSize + 1;
    const q = String(searchParams.get("q") || "").trim();
    const fast = searchParams.get("fast") === "1";
    const forceRefresh = searchParams.get("refresh") === "1";

    const pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewZalihe) {
      return forbiddenResponse("Nemate pristup zalihama.");
    }
    const ncSelect = permissions.canViewStockCost
      ? "ProsjecnaNabavna AS NC"
      : "CAST(NULL AS decimal(18,4)) AS NC";
    const permissionVariant = permissions.canViewStockCost ? "cost" : "no-cost";
    const cacheKey = await requestCacheKey(req, "zalihe", `${fast ? "fast" : "full"}:${permissionVariant}`);
    if (!forceRefresh) {
      const cached = readServerCache(cacheKey, CACHE_OPTIONS);
      if (cached) return Response.json(withServerCacheMeta(cached.data, cached));
    }

    const whereSql = q
      ? `
        WHERE
          CAST(SifraArtikla AS NVARCHAR(255)) LIKE @q
          OR CAST(NazivArtikla AS NVARCHAR(500)) LIKE @q
          OR CAST(Barkod AS NVARCHAR(255)) LIKE @q
      `
      : "";

    const rowsReq = pool.request();
    rowsReq.timeout = ROW_QUERY_TIMEOUT_MS;
    rowsReq.input("offset", sql.Int, offset);
    rowsReq.input("take", sql.Int, take);
    if (q) rowsReq.input("q", sql.NVarChar, `%${q}%`);

    const rowsQ = await rowsReq.query(`
      SELECT
        SifraArtikla,
        NazivArtikla,
        Zaliha AS Kolicina,
        Barkod AS Barcode,
        ${ncSelect},
        MPC,
        VPC
      FROM dbo.View_ZaliheAPP
      ${whereSql}
      ORDER BY SifraArtikla
      OFFSET @offset ROWS
      FETCH NEXT @take ROWS ONLY
    `);

    const fetchedRows = safeRecordset(rowsQ);
    const hasMore = fetchedRows.length > pageSize;
    const rows = fetchedRows.slice(0, pageSize);

    let total = offset + rows.length + (hasMore ? 1 : 0);
    let totalApproximate = hasMore;
    const totalPromise = fast ? null : (async () => {
      const totalReq = pool.request();
      totalReq.timeout = AUX_QUERY_TIMEOUT_MS;
      if (q) totalReq.input("q", sql.NVarChar, `%${q}%`);

      return totalReq.query(`
        SELECT COUNT(1) AS cnt
        FROM dbo.View_ZaliheAPP
        ${whereSql}
      `);
    })();

    let topKolicine = rows
      .slice()
      .sort((a, b) => Number(b.Kolicina || 0) - Number(a.Kolicina || 0))
      .slice(0, 30);
    let topKolicineApproximate = true;
    const topPromise = fast ? null : (async () => {
      const topReq = pool.request();
      topReq.timeout = AUX_QUERY_TIMEOUT_MS;
      if (q) topReq.input("q", sql.NVarChar, `%${q}%`);

      return topReq.query(`
        SELECT TOP 30
          SifraArtikla,
          NazivArtikla,
          Zaliha AS Kolicina
        FROM dbo.View_ZaliheAPP
        ${whereSql}
        ORDER BY ISNULL(TRY_CONVERT(decimal(18,3), Zaliha), 0) DESC
      `);
    })();

    const [totalResult, topResult] = fast
      ? [{ status: "skipped" }, { status: "skipped" }]
      : await Promise.allSettled([totalPromise, topPromise]);
    if (totalResult.status === "fulfilled") {
      total = Number(totalResult.value.recordset?.[0]?.cnt || 0);
      totalApproximate = false;
    }
    if (topResult.status === "fulfilled") {
      topKolicine = safeRecordset(topResult.value);
      topKolicineApproximate = false;
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const payload = {
      ok: true,
      partial: fast,
      rows,
      topKolicine,
      total,
      totalApproximate,
      topKolicineApproximate,
      hasMore,
      page,
      pageSize,
      totalPages,
      q,
      permissions: {
        canViewStockCost: permissions.canViewStockCost,
      },
    };

    writeServerCache(cacheKey, payload);
    return Response.json(payload);
  } catch (e) {
    return apiErrorResponse(e);
  }
}
