import sql from "mssql";
import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { documentPermissionKey, forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";
import { readServerCache, requestCacheKey, withServerCacheMeta, writeServerCache } from "@/lib/serverCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = {
  racuni: {
    label: "Fakture",
    headerView: "dbo.View_RacuniZaglavljeAPP",
    itemsView: "dbo.View_RacuniArtikliAPP",
  },
  predracuni: {
    label: "Predračuni",
    headerView: "dbo.View_PredracuniZaglavljeAPP",
    itemsView: "dbo.View_PredracuniArtikliAPP",
  },
};

const DEFAULT_LIST_PAGE_SIZE = 80;
const MAX_LIST_PAGE_SIZE = 200;
const CACHE_OPTIONS = { freshMs: 10 * 60 * 1000, staleMs: 2 * 60 * 60 * 1000 };

async function objectExists(pool, fullName) {
  const r = await pool
    .request()
    .input("name", sql.NVarChar, fullName)
    .query(`SELECT CASE WHEN OBJECT_ID(@name) IS NULL THEN 0 ELSE 1 END AS ok`);
  return !!r.recordset?.[0]?.ok;
}

async function columnExists(pool, fullName, columnName) {
  const r = await pool
    .request()
    .input("objectName", sql.NVarChar, fullName)
    .input("columnName", sql.NVarChar, columnName)
    .query(`SELECT CASE WHEN COL_LENGTH(@objectName, @columnName) IS NULL THEN 0 ELSE 1 END AS ok`);
  return !!r.recordset?.[0]?.ok;
}

async function existingColumns(pool, fullName, columnNames) {
  const entries = await Promise.all(
    columnNames.map(async (columnName) => [columnName, await columnExists(pool, fullName, columnName)])
  );
  return new Set(entries.filter(([, exists]) => exists).map(([columnName]) => columnName));
}

function bracket(columnName) {
  return `[${String(columnName).replace(/]/g, "]]")}]`;
}

function selectColumn(columns, columnName, fallback = "CAST(NULL AS nvarchar(255))") {
  return columns.has(columnName)
    ? `${bracket(columnName)} AS ${bracket(columnName)}`
    : `${fallback} AS ${bracket(columnName)}`;
}

function selectMoneyColumn(columns, columnName) {
  return columns.has(columnName)
    ? `TRY_CONVERT(decimal(18,2), ${bracket(columnName)}) AS ${bracket(columnName)}`
    : `CAST(NULL AS decimal(18,2)) AS ${bracket(columnName)}`;
}

function selectBase64Column(columns, columnName) {
  if (!columns.has(columnName)) {
    return `CAST(NULL AS varchar(max)) AS ${bracket(`${columnName}Base64`)}`;
  }

  return `CASE
    WHEN ${bracket(columnName)} IS NULL THEN NULL
    ELSE CAST(N'' AS xml).value('xs:base64Binary(sql:column("${columnName}"))', 'varchar(max)')
  END AS ${bracket(`${columnName}Base64`)}`;
}

function firstExistingColumn(columns, columnNames) {
  return columnNames.find((columnName) => columns.has(columnName)) || "";
}

async function readCompanySettings(pool) {
  const view = "dbo.View_PostavkePreduzecaAPP";
  const hasView = await objectExists(pool, view);
  if (!hasView) return null;

  const columns = await existingColumns(pool, view, [
    "Postavke_ID",
    "Postavke_Naziv",
    "Postavke_Direktor",
    "Postavke_TextNaDokumentu1",
    "Postavke_TextNaDokumentu2",
    "Postavke_Logo",
    "Postavke_Logo2",
    "Postavke_Pecat",
    "Postavke_Potpis",
    "Postavke_Standard",
    "Postavke_Izjava",
    "SifPreduzeca_Naziv",
    "SifPreduzeca_Adresa",
    "SifPreduzeca_PostanskiBroj",
    "SifPreduzeca_Grad",
    "SifPreduzeca_Drzava",
    "SifPreduzeca_PDVBroj",
    "SifPreduzeca_IDBroj",
  ]);

  const orderSql = columns.has("Postavke_ID") ? "[Postavke_ID]" : "(SELECT NULL)";
  const result = await pool.request().query(`
    SELECT TOP 1
      ${selectColumn(columns, "Postavke_ID")},
      ${selectColumn(columns, "Postavke_Naziv")},
      ${selectColumn(columns, "Postavke_Direktor")},
      ${selectColumn(columns, "Postavke_TextNaDokumentu1")},
      ${selectColumn(columns, "Postavke_TextNaDokumentu2")},
      ${selectColumn(columns, "Postavke_Standard")},
      ${selectColumn(columns, "Postavke_Izjava")},
      ${selectColumn(columns, "SifPreduzeca_Naziv")},
      ${selectColumn(columns, "SifPreduzeca_Adresa")},
      ${selectColumn(columns, "SifPreduzeca_PostanskiBroj")},
      ${selectColumn(columns, "SifPreduzeca_Grad")},
      ${selectColumn(columns, "SifPreduzeca_Drzava")},
      ${selectColumn(columns, "SifPreduzeca_PDVBroj")},
      ${selectColumn(columns, "SifPreduzeca_IDBroj")},
      ${selectBase64Column(columns, "Postavke_Logo")},
      ${selectBase64Column(columns, "Postavke_Logo2")},
      ${selectBase64Column(columns, "Postavke_Pecat")},
      ${selectBase64Column(columns, "Postavke_Potpis")}
    FROM ${view}
    ORDER BY ${orderSql}
  `);

  return result.recordset?.[0] || null;
}

function cleanType(raw) {
  const t = String(raw || "racuni").toLowerCase();
  return TYPES[t] ? t : "racuni";
}

function toMoney(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function parseBoundedInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function cleanSearch(value) {
  return String(value || "").trim().slice(0, 80);
}

function documentMatchSql(columnSql) {
  return `(
    LTRIM(RTRIM(CONVERT(nvarchar(100), ${columnSql}))) = @broj
    OR TRY_CONVERT(decimal(38,0), ${columnSql}) = TRY_CONVERT(decimal(38,0), @broj)
  )`;
}

function documentMatchParamSql(columnSql, paramName) {
  return `(
    LTRIM(RTRIM(CONVERT(nvarchar(100), ${columnSql}))) = @${paramName}
    OR TRY_CONVERT(decimal(38,0), ${columnSql}) = TRY_CONVERT(decimal(38,0), @${paramName})
  )`;
}

const VALID_RAC_BROJ_SQL =
  "NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), [racBroj]))), '') IS NOT NULL AND COALESCE(TRY_CONVERT(decimal(38,0), NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), [racBroj]))), '')), 1) <> 0";

function cleanDocKey(value) {
  return String(value ?? "").trim();
}

function numericDocKey(value) {
  const text = cleanDocKey(value);
  if (!/^\d+(?:\.0+)?$/.test(text)) return "";
  try {
    return BigInt(text.replace(/\.0+$/, "") || "0").toString();
  } catch {
    return "";
  }
}

function addLookupValue(map, key, index) {
  if (!key) return;
  const set = map.get(key) || new Set();
  set.add(index);
  map.set(key, set);
}

function addSet(target, source) {
  if (!source) return;
  source.forEach((value) => target.add(value));
}

function itemKeyAlias(columnName) {
  return `match_${columnName}`;
}

function preferredDocumentColumns(columns) {
  const preferred = ["racBroj", "racBrojSaCrtama", "Broj", "BrojSaCrtama"].filter((columnName) => columns.has(columnName));
  if (preferred.length) return preferred;
  return columns.has("sifRacArtikliKey") ? ["sifRacArtikliKey"] : [];
}

async function readItemTotalsForHeaderRows(pool, itemsView, headerRows, options = {}) {
  const hasItems = await objectExists(pool, itemsView);
  if (!hasItems || !headerRows.length) return new Map();

  const itemColumns = await existingColumns(pool, itemsView, [
    "sifRacArtikliKey",
    "racBroj",
    "racBrojSaCrtama",
    "Broj",
    "BrojSaCrtama",
    "sifRacArtikliZaPlatiti",
  ]);
  const itemKeyColumns = preferredDocumentColumns(itemColumns);
  if (!itemKeyColumns.length || !itemColumns.has("sifRacArtikliZaPlatiti")) return new Map();

  const exactLookup = new Map();
  const numericLookup = new Map();
  const documentValues = [];

  headerRows.forEach((row, index) => {
    const values = [
      row.racBroj,
      row.racBrojSaCrtama,
      row.Broj,
      row.BrojSaCrtama,
    ];

    values.forEach((value) => {
      const exact = cleanDocKey(value);
      const numeric = numericDocKey(value);
      addLookupValue(exactLookup, exact, index);
      addLookupValue(numericLookup, numeric, index);
      if (exact && !documentValues.includes(exact)) documentValues.push(exact);
    });
  });

  const totals = new Map();
  const keySelectSql = itemKeyColumns
    .map((columnName) => `NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), ${bracket(columnName)}))), '') AS ${bracket(itemKeyAlias(columnName))}`)
    .join(",\n            ");
  const amountSql = "ISNULL(TRY_CONVERT(decimal(18,2), [sifRacArtikliZaPlatiti]), 0)";
  const chunkSize = 60;

  for (let offset = 0; offset < documentValues.length; offset += chunkSize) {
    const chunk = documentValues.slice(offset, offset + chunkSize);
    if (!chunk.length) continue;

    const request = pool.request();
    if (options.timeoutMs) request.timeout = options.timeoutMs;
    chunk.forEach((value, index) => {
      request.input(`doc${index}`, sql.NVarChar, value);
    });

    const whereSql = chunk
      .map((_, index) => {
        const paramName = `doc${index}`;
        return itemKeyColumns
          .map((columnName) => documentMatchParamSql(bracket(columnName), paramName))
          .join("\n            OR ");
      })
      .join("\n            OR ");

    const result = await request.query(`
      SELECT
        ${keySelectSql},
        ${amountSql} AS itemAmount
      FROM ${itemsView}
      WHERE ${whereSql}
    `);

    for (const item of result.recordset || []) {
      const matchedIndexes = new Set();
      itemKeyColumns.forEach((columnName) => {
        const value = item[itemKeyAlias(columnName)];
        addSet(matchedIndexes, exactLookup.get(cleanDocKey(value)));
        addSet(matchedIndexes, numericLookup.get(numericDocKey(value)));
      });

      matchedIndexes.forEach((index) => {
        totals.set(index, toMoney(totals.get(index)) + toMoney(item.itemAmount));
      });
    }
  }

  return totals;
}

export async function GET(req) {
  let pool;

  try {
    pool = await getPoolFromRequest(req);
    const { searchParams } = new URL(req.url);
    const mode = String(searchParams.get("mode") || "list").toLowerCase();
    const type = cleanType(searchParams.get("type"));
    const cfg = TYPES[type];
    const pageSize = parseBoundedInt(searchParams.get("pageSize"), DEFAULT_LIST_PAGE_SIZE, 20, MAX_LIST_PAGE_SIZE);
    const offset = parseBoundedInt(searchParams.get("offset"), 0, 0, 1000000);
    const take = pageSize + 1;
    const search = cleanSearch(searchParams.get("q"));
    const permissions = await getUserPermissionsFromRequest(pool, req);
    const fast = searchParams.get("fast") === "1";
    const forceRefresh = searchParams.get("refresh") === "1";
    const permissionVariant = (permissions.deniedCodes || []).join(",") || "allow";
    const cacheVariant = mode === "pos" ? `pos:${permissionVariant}` : `${type}:${mode}:${fast ? "fast" : "full"}:${permissionVariant}`;
    const cacheKey = await requestCacheKey(req, "izdani-racuni", cacheVariant);

    if (mode === "pos") {
      if (!permissions.canViewPos) {
        return forbiddenResponse("Nemate pristup POS prometu.");
      }
      if (!forceRefresh) {
        const cached = readServerCache(cacheKey, CACHE_OPTIONS);
        if (cached) return Response.json(withServerCacheMeta(cached.data, cached));
      }
      const hasPos = await objectExists(pool, "dbo.View_POSRacuniZaglavljeAPP");
      if (!hasPos) {
        const payload = { ok: true, mode: "pos", rows: [], total: 0, permissions };
        writeServerCache(cacheKey, payload);
        return Response.json(payload);
      }
      const posView = "dbo.View_POSRacuniZaglavljeAPP";
      const posColumns = await existingColumns(pool, posView, [
        "racDatumRacuna",
        "racBroj",
        "racBrojSaCrtama",
        "racKupac",
        "racKupacAdresa",
        "racKupacPostanskiBroj",
        "racKupacGrad",
        "racKupacDrzava",
        "racKupacPDVBroj",
        "racKupacIDBroj",
        "sifRacArtikliZaPlatiti",
        "Trgovina",
        "Skladiste",
        "Skladište",
        "NazivSkladista",
        "NazivSkladišta",
        "Poslovnica",
        "Objekat",
        "Magacin",
      ]);
      const hasDate = posColumns.has("racDatumRacuna");
      if (!hasDate) {
        return Response.json(
          {
            ok: false,
            error: "View_POSRacuniZaglavljeAPP mora imati kolonu racDatumRacuna za POS promet po danima.",
          },
          { status: 500 }
        );
      }
      const hasBroj = posColumns.has("racBroj");
      const validBrojWhere = hasBroj ? `AND ${VALID_RAC_BROJ_SQL}` : "";
      const racBrojExpr = hasBroj
        ? "NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), [racBroj]))), '')"
        : "CAST(NULL AS nvarchar(255))";
      const racBrojSaCrtamaExpr = posColumns.has("racBrojSaCrtama")
        ? "NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), [racBrojSaCrtama]))), '')"
        : racBrojExpr;
      const inferredLocationExpr = hasBroj
        ? `NULLIF(LTRIM(RTRIM(CASE
            WHEN CHARINDEX(N' - ', ${racBrojExpr}) > 0
            THEN SUBSTRING(${racBrojExpr}, CHARINDEX(N' - ', ${racBrojExpr}) + 3, 255)
            ELSE NULL
          END)), '')`
        : "CAST(NULL AS nvarchar(255))";
      const locationColumn = firstExistingColumn(posColumns, [
        "Trgovina",
        "Skladiste",
        "Skladište",
        "NazivSkladista",
        "NazivSkladišta",
        "Poslovnica",
        "Objekat",
        "Magacin",
      ]);
      const locationExpr = locationColumn
        ? `COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), ${bracket(locationColumn)}))), ''), ${inferredLocationExpr})`
        : inferredLocationExpr;
      const posAmountExpr = posColumns.has("sifRacArtikliZaPlatiti")
        ? "ISNULL(TRY_CONVERT(decimal(18,2), [sifRacArtikliZaPlatiti]), 0)"
        : "0";
      const orderBrojSql = hasBroj ? ", [racBroj] DESC" : "";

      const posSearchColumns = [
        hasBroj ? racBrojExpr : "",
        racBrojSaCrtamaExpr,
        posColumns.has("racKupac") ? "[racKupac]" : "",
        locationExpr,
      ].filter(Boolean);
      const posSearchWhere = search && posSearchColumns.length
        ? `AND (${posSearchColumns.map((expr) => `CONVERT(nvarchar(255), ${expr}) LIKE @search`).join(" OR ")})`
        : "";
      const posReq = pool
        .request()
        .input("offset", sql.Int, offset)
        .input("take", sql.Int, take);
      if (search) posReq.input("search", sql.NVarChar, `%${search}%`);

      const q = await posReq.query(`
        SELECT
          CONVERT(date, [racDatumRacuna]) AS racDatumRacuna,
          ${racBrojExpr} AS racBroj,
          ${racBrojSaCrtamaExpr} AS racBrojSaCrtama,
          ${selectColumn(posColumns, "racKupac")},
          ${locationExpr} AS Lokacija,
          1 AS brojRacuna,
          ${posAmountExpr} AS sifRacArtikliZaPlatiti
        FROM ${posView}
        WHERE TRY_CONVERT(date, [racDatumRacuna]) >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
          AND TRY_CONVERT(date, [racDatumRacuna]) < DATEFROMPARTS(YEAR(GETDATE()) + 1, 1, 1)
          ${validBrojWhere}
          ${posSearchWhere}
        ORDER BY CONVERT(date, [racDatumRacuna]) DESC${orderBrojSql}, Lokacija ASC
        OFFSET @offset ROWS
        FETCH NEXT @take ROWS ONLY
      `);

      const fetchedRows = q.recordset || [];
      const hasMore = fetchedRows.length > pageSize;
      const rows = fetchedRows.slice(0, pageSize);
      const totalReq = pool.request();
      if (search) totalReq.input("search", sql.NVarChar, `%${search}%`);
      const totalQ = await totalReq.query(`
        SELECT ISNULL(SUM(${posAmountExpr}), 0) AS total
        FROM ${posView}
        WHERE TRY_CONVERT(date, [racDatumRacuna]) >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
          AND TRY_CONVERT(date, [racDatumRacuna]) < DATEFROMPARTS(YEAR(GETDATE()) + 1, 1, 1)
          ${validBrojWhere}
          ${posSearchWhere}
      `);
      const total = toMoney(totalQ.recordset?.[0]?.total);

      const payload = { ok: true, mode: "pos", rows, total, hasMore, pageSize, offset, permissions };
      writeServerCache(cacheKey, payload);
      return Response.json(payload);
    }

    if (!permissions[documentPermissionKey(type)]) {
      return forbiddenResponse(type === "predracuni" ? "Nemate pristup predračunima." : "Nemate pristup fakturama.");
    }
    if (!forceRefresh) {
      const cached = readServerCache(cacheKey, CACHE_OPTIONS);
      if (cached) return Response.json(withServerCacheMeta(cached.data, cached));
    }

    const hasHeader = await objectExists(pool, cfg.headerView);
    if (!hasHeader) {
      const payload = { ok: true, type, rows: [], total: 0, permissions };
      writeServerCache(cacheKey, payload);
      return Response.json(payload);
    }

    if (mode === "detail") {
      const broj = String(searchParams.get("broj") || "").trim();
      if (!broj) {
        return Response.json({ ok: false, error: "Missing broj" }, { status: 400 });
      }

      const hasItems = await objectExists(pool, cfg.itemsView);
      if (!hasItems) {
        const payload = { ok: true, type, broj, header: null, rows: [], total: 0, permissions };
        writeServerCache(cacheKey, payload);
        return Response.json(payload);
      }

      const headerColumns = await existingColumns(pool, cfg.headerView, [
        "racBroj",
        "racBrojSaCrtama",
        "Broj",
        "BrojSaCrtama",
        "racDatumRacuna",
        "racKupac",
        "racKupacAdresa",
        "racKupacPostanskiBroj",
        "racKupacGrad",
        "racKupacDrzava",
        "racKupacPDVBroj",
        "racKupacIDBroj",
        "sifRacArtikliZaPlatiti",
        "sifRacArtikliPDVOsnovica",
        "sifRacArtikliIznosPDV",
        "statusRac",
        "racReferent",
        "racValutaPlacanja",
        "racKursValute",
        "racBrojFiskalnog",
        "VrstaPlacanja",
      ]);
      const itemColumns = await existingColumns(pool, cfg.itemsView, [
        "sifRacArtikliKey",
        "racBroj",
        "racBrojSaCrtama",
        "Broj",
        "BrojSaCrtama",
        "sifRacArtikliNaziv",
        "sifRacArtikliSifra",
        "sifRacArtikliJM",
        "sifRacArtikliKolicina",
        "sifRacArtikliCijenaBezPDV",
        "rabatUkupnoProc",
        "sifRacArtikliZaPlatiti",
        "sifRacArtikliPDVStopaProc",
      ]);
      const itemKeyColumns = preferredDocumentColumns(itemColumns);

      const itemWhereSql = itemKeyColumns.length
        ? itemKeyColumns.map((columnName) => documentMatchSql(`[${columnName}]`)).join("\n             OR ")
        : "1 = 0";
      const headerKeyColumns = ["racBroj", "racBrojSaCrtama", "Broj", "BrojSaCrtama"].filter((columnName) => headerColumns.has(columnName));
      const headerWhereSql = headerKeyColumns.length
        ? headerKeyColumns.map((columnName) => documentMatchSql(bracket(columnName))).join("\n             OR ")
        : "1 = 0";
      const itemOrderSql = itemColumns.has("sifRacArtikliKey")
        ? `TRY_CONVERT(int, [sifRacArtikliKey])${itemColumns.has("sifRacArtikliNaziv") ? ", [sifRacArtikliNaziv]" : ""}`
        : itemColumns.has("sifRacArtikliNaziv")
          ? "[sifRacArtikliNaziv]"
          : "(SELECT NULL)";

      const headerResult = await pool
        .request()
        .input("broj", sql.NVarChar, broj)
        .query(`
          SELECT TOP 1
            [racBroj],
            ${selectColumn(headerColumns, "racBrojSaCrtama")},
            [racDatumRacuna],
            [racKupac],
            ${selectColumn(headerColumns, "racKupacAdresa")},
            ${selectColumn(headerColumns, "racKupacPostanskiBroj")},
            ${selectColumn(headerColumns, "racKupacGrad")},
            ${selectColumn(headerColumns, "racKupacDrzava")},
            ${selectColumn(headerColumns, "racKupacPDVBroj")},
            ${selectColumn(headerColumns, "racKupacIDBroj")},
            ISNULL(TRY_CONVERT(decimal(18,2), [sifRacArtikliZaPlatiti]), 0) AS sifRacArtikliZaPlatiti,
            ${selectMoneyColumn(headerColumns, "sifRacArtikliPDVOsnovica")},
            ${selectMoneyColumn(headerColumns, "sifRacArtikliIznosPDV")},
            [statusRac],
            [racReferent],
            ${selectColumn(headerColumns, "racValutaPlacanja")},
            ${selectMoneyColumn(headerColumns, "racKursValute")},
            ${selectColumn(headerColumns, "VrstaPlacanja")},
            ${selectColumn(headerColumns, "racBrojFiskalnog")}
          FROM ${cfg.headerView}
          WHERE ${headerWhereSql}
        `);

      const itemsResult = await pool
        .request()
        .input("broj", sql.NVarChar, broj)
        .query(`
          SELECT
            ${selectColumn(itemColumns, "sifRacArtikliKey")},
            ${selectColumn(itemColumns, "sifRacArtikliNaziv")},
            ${selectColumn(itemColumns, "sifRacArtikliSifra")},
            ${selectColumn(itemColumns, "sifRacArtikliJM")},
            ${itemColumns.has("sifRacArtikliKolicina") ? "ISNULL(TRY_CONVERT(decimal(18,3), [sifRacArtikliKolicina]), 0)" : "0"} AS sifRacArtikliKolicina,
            ${itemColumns.has("sifRacArtikliCijenaBezPDV") ? "ISNULL(TRY_CONVERT(decimal(18,4), [sifRacArtikliCijenaBezPDV]), 0)" : "0"} AS sifRacArtikliCijenaBezPDV,
            ${itemColumns.has("rabatUkupnoProc") ? "ISNULL(TRY_CONVERT(decimal(18,2), [rabatUkupnoProc]), 0)" : "0"} AS rabatUkupnoProc,
            ${itemColumns.has("sifRacArtikliPDVStopaProc") ? "TRY_CONVERT(decimal(18,2), [sifRacArtikliPDVStopaProc])" : "CAST(NULL AS decimal(18,2))"} AS sifRacArtikliPDVStopaProc,
            ${itemColumns.has("sifRacArtikliZaPlatiti") ? "ISNULL(TRY_CONVERT(decimal(18,2), [sifRacArtikliZaPlatiti]), 0)" : "0"} AS sifRacArtikliZaPlatiti
          FROM ${cfg.itemsView}
          WHERE ${itemWhereSql}
          ORDER BY ${itemOrderSql}
        `);

      const rows = itemsResult.recordset || [];
      const total = rows.reduce((a, x) => a + toMoney(x.sifRacArtikliZaPlatiti), 0);
      let company = null;
      try {
        company = await readCompanySettings(pool);
      } catch {
        company = null;
      }

      const payload = {
        ok: true,
        type,
        label: cfg.label,
        broj,
        header: headerResult.recordset?.[0] || null,
        company,
        rows,
        total,
        permissions,
      };
      writeServerCache(cacheKey, payload);
      return Response.json(payload);
    }

    const listColumns = await existingColumns(pool, cfg.headerView, [
      "racBroj",
      "racBrojSaCrtama",
      "Broj",
      "BrojSaCrtama",
      "racDatumRacuna",
      "racKupac",
      "sifRacArtikliZaPlatiti",
      "statusRac",
      "racReferent",
      "racValutaPlacanja",
      "VrstaPlacanja",
    ]);

    const listSearchColumns = [
      "racBroj",
      "racBrojSaCrtama",
      "Broj",
      "BrojSaCrtama",
      "racKupac",
      "statusRac",
      "racReferent",
    ].filter((columnName) => listColumns.has(columnName));
    const listSearchWhere = search && listSearchColumns.length
      ? `AND (${listSearchColumns.map((columnName) => `CONVERT(nvarchar(255), ${bracket(columnName)}) LIKE @search`).join(" OR ")})`
      : "";
    const listReq = pool
      .request()
      .input("offset", sql.Int, offset)
      .input("take", sql.Int, take);
    if (search) listReq.input("search", sql.NVarChar, `%${search}%`);

    const q = await listReq.query(`
      SELECT
        [racBroj],
        ${selectColumn(listColumns, "racBrojSaCrtama")},
        ${selectColumn(listColumns, "Broj")},
        ${selectColumn(listColumns, "BrojSaCrtama")},
        [racDatumRacuna],
        [racKupac],
        ${selectMoneyColumn(listColumns, "sifRacArtikliZaPlatiti")},
        [statusRac],
        [racReferent],
        ${selectColumn(listColumns, "racValutaPlacanja")},
        ${selectColumn(listColumns, "VrstaPlacanja")}
      FROM ${cfg.headerView}
      WHERE ${VALID_RAC_BROJ_SQL}
        ${listSearchWhere}
      ORDER BY TRY_CONVERT(date, [racDatumRacuna]) DESC, TRY_CONVERT(bigint, [racBroj]) DESC, [racBroj] DESC
      OFFSET @offset ROWS
      FETCH NEXT @take ROWS ONLY
    `);

    const fetchedRows = q.recordset || [];
    const hasMore = fetchedRows.length > pageSize;
    let rows = fetchedRows.slice(0, pageSize);
    let itemTotalsOk = !fast;
    if (!fast) {
      try {
        const itemTotals = await readItemTotalsForHeaderRows(pool, cfg.itemsView, rows, { timeoutMs: 4500 });
        rows = rows.map((row, index) => {
          if (!itemTotals.has(index)) return row;
          return {
            ...row,
            headerSifRacArtikliZaPlatiti: row.sifRacArtikliZaPlatiti,
            sifRacArtikliZaPlatiti: itemTotals.get(index),
          };
        });
      } catch {
        itemTotalsOk = false;
      }
    }
    const total = rows.reduce((a, x) => a + toMoney(x.sifRacArtikliZaPlatiti), 0);

    const payload = { ok: true, type, label: cfg.label, rows, total, hasMore, pageSize, offset, itemTotalsOk, partial: fast, permissions };
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
