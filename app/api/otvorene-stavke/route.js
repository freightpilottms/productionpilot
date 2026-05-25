import sql from "mssql";
import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";
import { readServerCache, requestCacheKey, withServerCacheMeta, writeServerCache } from "@/lib/serverCache";
import { getSessionFromRequest } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = {
  neplaceni: {
    label: "Neplaceni racuni",
    view: "dbo.View_NeplaceniRacuniAPP",
    racunColumn: "RacunDobavljaca",
    permissionKey: "canViewDobavljaci",
    forbidden: "Nemate pristup neplacenim racunima dobavljaca.",
    payable: true,
  },
  nenaplaceni: {
    label: "Nenaplaceni racuni",
    view: "dbo.View_NenaplaceniRacuniAPP",
    racunColumn: "RacunKupca",
    permissionKey: "canViewKupci",
    forbidden: "Nemate pristup nenaplacenim racunima kupaca.",
  },
};

const DEFAULT_PAGE_SIZE = 80;
const MAX_PAGE_SIZE = 200;
const CACHE_OPTIONS = { freshMs: 5 * 60 * 1000, staleMs: 60 * 60 * 1000 };

function cleanType(raw) {
  const value = String(raw || "neplaceni").toLowerCase();
  return TYPES[value] ? value : "neplaceni";
}

function parseBoundedInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function cleanSearch(value) {
  return String(value || "").trim().slice(0, 80);
}

async function objectExists(pool, fullName) {
  const r = await pool
    .request()
    .input("name", sql.NVarChar, fullName)
    .query("SELECT CASE WHEN OBJECT_ID(@name) IS NULL THEN 0 ELSE 1 END AS ok");
  return !!r.recordset?.[0]?.ok;
}

function searchWhereSql(hasSearch, cfg) {
  if (!hasSearch) return "";

  return `
    AND (
      CONVERT(nvarchar(255), [Subjekt]) LIKE @search
      OR CONVERT(nvarchar(255), [${cfg.racunColumn}]) LIKE @search
      OR CONVERT(nvarchar(255), [DatumDokumenta]) LIKE @search
      OR CONVERT(nvarchar(255), [Referent]) LIKE @search
      ${cfg.payable ? `
      OR CONVERT(nvarchar(255), [Broj]) LIKE @search
      OR CONVERT(nvarchar(255), [BrojSaCrtama]) LIKE @search
      OR CONVERT(nvarchar(255), [Status]) LIKE @search
      ` : ""}
    )
  `;
}

function mapRow(row, typeConfig) {
  return {
    Subjekt: row.Subjekt || "",
    Racun: row.Racun || "",
    DatumDokumenta: row.DatumDokumenta || null,
    IznosRacuna: Number(row.IznosRacuna || 0),
    Otvoreno: Number(row.Otvoreno || 0),
    Dospjelo: Number(row.Dospjelo || 0),
    Referent: row.Referent || "",
    racunColumn: typeConfig.racunColumn,
    payable: Boolean(typeConfig.payable),
    Broj: row.Broj ?? "",
    BrojSaCrtama: row.BrojSaCrtama ?? "",
    RedBr: row.RedBr ?? null,
    Konto: row.Konto ?? "",
    RacunDobavljaca: row.RacunDobavljaca ?? row.Racun ?? "",
    DatumKnjizenja: row.DatumKnjizenja || null,
    DatumDospijeca: row.DatumDospijeca || null,
    PlacenoPoFIFO: Number(row.PlacenoPoFIFO || 0),
    DanaKasni: Number(row.DanaKasni || 0),
    KasniDO30dana: Number(row.KasniDO30dana || 0),
    KasniDO60dana: Number(row.KasniDO60dana || 0),
    KasniDO90dana: Number(row.KasniDO90dana || 0),
    KasniPreko90dana: Number(row.KasniPreko90dana || 0),
    Status: row.Status ?? "",
    Valuta: row.Valuta ?? "",
    KursValute: row.KursValute ?? null,
    Napomena: row.Napomena ?? "",
    SifraDokumenta: row.SifraDokumenta ?? "",
    Naziv: row.Naziv ?? "",
  };
}

function payableSelectSql(cfg) {
  if (!cfg.payable) return "";

  return `
          CONVERT(nvarchar(80), [Broj]) AS Broj,
          [BrojSaCrtama],
          [RedBr],
          [Konto],
          [RacunDobavljaca],
          [DatumKnjizenja],
          [DatumDospijeca],
          ISNULL(TRY_CONVERT(decimal(18,2), [PlacenoPoFIFO]), 0) AS PlacenoPoFIFO,
          ISNULL(TRY_CONVERT(decimal(18,2), [DanaKasni]), 0) AS DanaKasni,
          ISNULL(TRY_CONVERT(decimal(18,2), [KasniDO30dana]), 0) AS KasniDO30dana,
          ISNULL(TRY_CONVERT(decimal(18,2), [KasniDO60dana]), 0) AS KasniDO60dana,
          ISNULL(TRY_CONVERT(decimal(18,2), [KasniDO90dana]), 0) AS KasniDO90dana,
          ISNULL(TRY_CONVERT(decimal(18,2), [KasniPreko90dana]), 0) AS KasniPreko90dana,
          [Status],
          [Valuta],
          [KursValute],
          [Napomena],
          [SifraDokumenta],
          [Naziv],
  `;
}

function orderBySql(cfg) {
  if (cfg.payable) {
    return `
        ORDER BY
          COALESCE(CONVERT(nvarchar(80), [Status]), '') DESC,
          TRY_CONVERT(date, [DatumDospijeca]) ASC,
          TRY_CONVERT(date, [DatumDokumenta]) ASC,
          [Subjekt] ASC,
          [${cfg.racunColumn}] ASC
    `;
  }

  return `ORDER BY TRY_CONVERT(date, [DatumDokumenta]) DESC, [Subjekt] ASC, [${cfg.racunColumn}] ASC`;
}

function cleanProcedureText(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function cleanDateLiteral(value) {
  if (value === undefined || value === null || value === "") return "";
  const raw = String(value).trim();
  const isoDate = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return isoDate || raw;
}

export async function GET(req) {
  let pool;

  try {
    pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    const { searchParams } = new URL(req.url);
    const type = cleanType(searchParams.get("type"));
    const cfg = TYPES[type];

    if (!permissions[cfg.permissionKey]) {
      return forbiddenResponse(cfg.forbidden);
    }

    const pageSize = parseBoundedInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, 20, MAX_PAGE_SIZE);
    const offset = parseBoundedInt(searchParams.get("offset"), 0, 0, 1000000);
    const take = pageSize + 1;
    const search = cleanSearch(searchParams.get("q"));
    const forceRefresh = searchParams.get("refresh") === "1";
    const permissionVariant = (permissions.deniedCodes || []).join(",") || "allow";
    const cacheKey = await requestCacheKey(req, "otvorene-stavke", `${type}:${search || "all"}:${offset}:${pageSize}:${permissionVariant}`);

    if (!forceRefresh) {
      const cached = readServerCache(cacheKey, CACHE_OPTIONS);
      if (cached) return Response.json(withServerCacheMeta(cached.data, cached));
    }

    const hasView = await objectExists(pool, cfg.view);
    if (!hasView) {
      const payload = {
        ok: true,
        type,
        label: cfg.label,
        rows: [],
        totalRows: 0,
        totalIznosRacuna: 0,
        totalOtvoreno: 0,
        totalDospjelo: 0,
        hasMore: false,
        pageSize,
        offset,
        permissions,
      };
      writeServerCache(cacheKey, payload);
      return Response.json(payload);
    }

    const whereSql = searchWhereSql(Boolean(search), cfg);
    const listReq = pool
      .request()
      .input("offset", sql.Int, offset)
      .input("take", sql.Int, take);
    const totalsReq = pool.request();
    if (search) {
      listReq.input("search", sql.NVarChar, `%${search}%`);
      totalsReq.input("search", sql.NVarChar, `%${search}%`);
    }

    const [rowsResult, totalsResult] = await Promise.all([
      listReq.query(`
        SELECT
          [Subjekt],
          [${cfg.racunColumn}] AS Racun,
          ${payableSelectSql(cfg)}
          [DatumDokumenta],
          ISNULL(TRY_CONVERT(decimal(18,2), [IznosRacuna]), 0) AS IznosRacuna,
          ISNULL(TRY_CONVERT(decimal(18,2), [Otvoreno]), 0) AS Otvoreno,
          ISNULL(TRY_CONVERT(decimal(18,2), [Dospjelo]), 0) AS Dospjelo,
          [Referent]
        FROM ${cfg.view}
        WHERE 1 = 1
          ${whereSql}
        ${orderBySql(cfg)}
        OFFSET @offset ROWS
        FETCH NEXT @take ROWS ONLY
      `),
      totalsReq.query(`
        SELECT
          COUNT(1) AS totalRows,
          ISNULL(SUM(TRY_CONVERT(decimal(18,2), [IznosRacuna])), 0) AS totalIznosRacuna,
          ISNULL(SUM(TRY_CONVERT(decimal(18,2), [Otvoreno])), 0) AS totalOtvoreno,
          ISNULL(SUM(TRY_CONVERT(decimal(18,2), [Dospjelo])), 0) AS totalDospjelo
        FROM ${cfg.view}
        WHERE 1 = 1
          ${whereSql}
      `),
    ]);

    const fetchedRows = rowsResult.recordset || [];
    const rows = fetchedRows.slice(0, pageSize).map((row) => mapRow(row, cfg));
    const totals = totalsResult.recordset?.[0] || {};
    const payload = {
      ok: true,
      type,
      label: cfg.label,
      rows,
      totalRows: Number(totals.totalRows || 0),
      totalIznosRacuna: Number(totals.totalIznosRacuna || 0),
      totalOtvoreno: Number(totals.totalOtvoreno || 0),
      totalDospjelo: Number(totals.totalDospjelo || 0),
      hasMore: fetchedRows.length > pageSize,
      pageSize,
      offset,
      permissions,
    };
    writeServerCache(cacheKey, payload);
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

export async function POST(req) {
  let pool;

  try {
    const body = await req.json().catch(() => ({}));
    const session = await getSessionFromRequest();
    pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);

    if (!permissions.canViewDobavljaci) {
      return forbiddenResponse("Nemate pristup placanju neplacenih racuna dobavljaca.");
    }

    const required = ["Broj", "RedBr", "Subjekt", "BrojSaCrtama", "RacunDobavljaca", "DatumDokumenta"];
    const missing = required.filter((key) => {
      const value = body?.[key];
      return value === undefined || value === null || String(value).trim() === "";
    });

    if (missing.length) {
      return Response.json(
        { ok: false, error: `Nedostaju podaci za placanje: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const referent = cleanProcedureText(session?.username || body.Referent || "Admin").trim() || "Admin";
    const datumDokumenta = cleanDateLiteral(body.DatumDokumenta);

    const result = await pool.request()
      .input("Broj", sql.NVarChar, cleanProcedureText(body.Broj))
      .input("RedBr", sql.Int, Number(body.RedBr))
      .input("Subjekt", sql.NVarChar, cleanProcedureText(body.Subjekt))
      .input("BrojSaCrtama", sql.NVarChar, cleanProcedureText(body.BrojSaCrtama))
      .input("RacunDobavljaca", sql.NVarChar, cleanProcedureText(body.RacunDobavljaca))
      .input("DatumDokumenta", sql.NVarChar, datumDokumenta)
      .input("Referent", sql.NVarChar, referent)
      .query(`
        EXEC dbo.sp_KreirajUplatnicuIzNeplacenogRacunaAPP
          @Broj = @Broj,
          @RedBr = @RedBr,
          @Subjekt = @Subjekt,
          @BrojSaCrtama = @BrojSaCrtama,
          @RacunDobavljaca = @RacunDobavljaca,
          @DatumDokumenta = @DatumDokumenta,
          @Referent = @Referent
      `);

    return Response.json({
      ok: true,
      message: "Uplatnica je kreirana.",
      rows: result.recordset || [],
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
