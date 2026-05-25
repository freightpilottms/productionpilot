import sql from "mssql";
import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { getKontaFromRequest } from "@/lib/konta";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";
import { readServerCache, requestCacheKey, withServerCacheMeta, writeServerCache } from "@/lib/serverCache";

const CACHE_OPTIONS = { freshMs: 10 * 60 * 1000, staleMs: 2 * 60 * 60 * 1000 };

function parseKontoParam(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function normalizeDigits(raw) {
  return String(raw || "").replace(/[^0-9]/g, "");
}

function normalizeAccountKey(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[\s:./-]+/g, "");
}

function pickFirst(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") {
      return obj[k];
    }
  }
  return "";
}

function mapRacunRow(x) {
  const konto = String(
    pickFirst(x, [
      "Tekući račun",
      "TekuciRacun",
      "Tekuci racun",
      "BrojRacuna",
      "BrojRačuna",
      "Racun",
      "Račun",
      "Konto",
      "Subjekt",
    ])
  ).trim();

  const naziv = String(
    pickFirst(x, [
      "Naziv",
      "Subjekt",
      "NazivBanke",
      "Banka",
      "Opis",
    ])
  ).trim();

  return {
    Konto: konto,
    Naziv: naziv || konto,
    Saldo: Number(x?.Saldo || 0),
    ZadnjiDatumKnjizenja: x?.ZadnjiDatumKnjizenja ?? x?.DatumKnjizenja ?? null,
  };
}

async function objectExists(pool, fullName) {
  const r = await pool
    .request()
    .input("name", sql.NVarChar, fullName)
    .query(`SELECT CASE WHEN OBJECT_ID(@name) IS NULL THEN 0 ELSE 1 END AS ok`);
  return !!r.recordset?.[0]?.ok;
}

export async function GET(req) {
  let pool;

  try {
    pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewRacuni) {
      return forbiddenResponse("Nemate pristup računima banaka.");
    }
    const kontaSettings = await getKontaFromRequest(req);
    const { searchParams } = new URL(req.url);

    const mode = String(searchParams.get("mode") || "").trim();
    const forceRefresh = searchParams.get("refresh") === "1";
    const permissionVariant = (permissions.deniedCodes || []).join(",") || "allow";
    const cacheKey = await requestCacheKey(req, "racuni", `${mode || "list"}:${permissionVariant}`);

    if (!forceRefresh) {
      const cached = readServerCache(cacheKey, CACHE_OPTIONS);
      if (cached) return Response.json(withServerCacheMeta(cached.data, cached));
    }

    if (mode === "izvod") {
      const racunRaw = String(searchParams.get("racun") || "").trim();
      const racun = racunRaw;
      const racunDigits = normalizeDigits(racunRaw);
      const racunKey = normalizeAccountKey(racunRaw);
      const hasAccountPrefix = /[A-Za-z]/.test(racunRaw);
      const action = String(searchParams.get("action") || "latest").trim();
      const broj = String(searchParams.get("broj") || "").trim() || null;
    
      if (!racunKey && !racunDigits) {
        return Response.json(
          { ok: false, error: "Missing racun" },
          { status: 400 }
        );
      }
    
      if ((action === "next" || action === "prev") && !broj) {
        return Response.json(
          { ok: false, error: "Missing broj" },
          { status: 400 }
        );
      }
    
      const racunDigitsExpr = `
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    REPLACE(
                      REPLACE(
                        COALESCE(CONVERT(nvarchar(200), [Tekući račun]), ''),
                        'TR DEV:',
                        ''
                      ),
                      'tr dev:',
                      ''
                    ),
                    'TR:',
                    ''
                  ),
                  'tr:',
                  ''
                ),
                ' ',
                ''
              ),
              '-',
              ''
            ),
            '/',
            ''
          ),
          '.',
          ''
        )
      `;

      const racunKeyExpr = `
        UPPER(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    COALESCE(CONVERT(nvarchar(200), [Tekući račun]), ''),
                    ' ',
                    ''
                  ),
                  ':',
                  ''
                ),
                '-',
                ''
              ),
              '/',
              ''
            ),
            '.',
            ''
          )
        )
      `;

      const racunRawCleanExpr = `
        REPLACE(
          REPLACE(
            REPLACE(
              CONVERT(nvarchar(200), [Tekući račun]),
              ' ',
              ''
            ),
            '-',
            ''
          ),
          '.',
          ''
        )
      `;

      const accountWhere = hasAccountPrefix
        ? `${racunKeyExpr} = @racunKey`
        : `(
            ${racunDigitsExpr} = @racunDigits
            OR ${racunRawCleanExpr} LIKE '%' + @racunDigits + '%'
          )`;
    
      const listResult = await pool
        .request()
        .input("racunDigits", sql.NVarChar, racunDigits)
        .input("racunKey", sql.NVarChar, racunKey)
        .query(`
          WITH Brojevi AS (
            SELECT DISTINCT CONVERT(varchar(50), [Broj]) AS Broj
            FROM [dbo].[View_IzvodiIzBanke]
            WHERE ${accountWhere}
          )
          SELECT Broj
          FROM Brojevi
          ORDER BY TRY_CONVERT(bigint, Broj) DESC, Broj DESC
        `);
    
      const brojevi = (listResult.recordset || [])
        .map((x) => String(x.Broj || "").trim())
        .filter(Boolean);
    
      const totalPages = brojevi.length;
    
      if (!totalPages) {
        const payload = {
          ok: true,
          source: "View_IzvodiIzBanke",
          racun,
          broj: null,
          rows: [],
          totals: { uplate: 0, isplate: 0, saldo: 0 },
          hasPrev: false,
          hasNext: false,
          pageIndex: 1,
          totalPages: 1,
        };
        writeServerCache(cacheKey, payload);
        return Response.json(payload);
      }
    
      let currentIndex = 0;
    
      if (action === "latest") {
        currentIndex = 0;
      } else {
        const foundIndex = brojevi.indexOf(String(broj));
        if (foundIndex === -1) {
          currentIndex = 0;
        } else if (action === "prev") {
          currentIndex = Math.min(foundIndex + 1, totalPages - 1);
        } else if (action === "next") {
          currentIndex = Math.max(foundIndex - 1, 0);
        } else {
          return Response.json(
            { ok: false, error: "Invalid action" },
            { status: 400 }
          );
        }
      }
    
      const targetBroj = brojevi[currentIndex];
    
      const dataResult = await pool
        .request()
        .input("racunDigits", sql.NVarChar, racunDigits)
        .input("racunKey", sql.NVarChar, racunKey)
        .input("broj", sql.NVarChar, targetBroj)
        .query(`
          SELECT
            CONVERT(varchar(50), [Broj]) AS Broj,
            [Tekući račun],
            [Subjekt],
            ISNULL([Uplate], 0) AS Uplate,
            ABS(ISNULL([Isplate], 0)) AS Isplate,
            [DatumDokumenta]
          FROM [dbo].[View_IzvodiIzBanke]
          WHERE ${accountWhere}
            AND CONVERT(varchar(50), [Broj]) = @broj
          ORDER BY [DatumDokumenta] ASC, [Subjekt] ASC
        `);
    
      const rows = dataResult.recordset || [];
      const totalUplate = rows.reduce((a, x) => a + Number(x.Uplate || 0), 0);
      const totalIsplate = rows.reduce((a, x) => a + Number(x.Isplate || 0), 0);
    
      const datumIzvoda = rows.length
        ? rows.reduce((max, r) => {
            const d = new Date(r.DatumDokumenta);
            return d > max ? d : max;
          }, new Date(0))
        : null;
    
      let saldoIzvoda = 0;
    
      if (datumIzvoda) {
        // 1) Trenutno stanje računa iz View_StanjeRacuna
        const stanjeResult = await pool
          .request()
          .query(`
            SELECT *
            FROM dbo.View_StanjeRacuna
          `);
    
        const stanjeRows = (stanjeResult.recordset || []).map(mapRacunRow);
    
        const racunRow = stanjeRows.find((x) => {
          if (hasAccountPrefix) {
            return normalizeAccountKey(x.Konto) === racunKey;
          }
          return normalizeDigits(x.Konto) === racunDigits;
        });
    
        const trenutnoStanje = Number(racunRow?.Saldo || 0);
    
        // 2) Promet nakon ovog izvoda
        const prometPoslijeResult = await pool
          .request()
          .input("racunDigits", sql.NVarChar, racunDigits)
          .input("racunKey", sql.NVarChar, racunKey)
          .input("datumIzvoda", sql.Date, datumIzvoda)
          .input("broj", sql.NVarChar, targetBroj)
          .query(`
            SELECT
              ISNULL(SUM(ISNULL([Uplate], 0) - ABS(ISNULL([Isplate], 0))), 0) AS PrometPoslije
            FROM [dbo].[View_IzvodiIzBanke]
            WHERE ${accountWhere}
              AND (
                CAST([DatumDokumenta] AS date) > @datumIzvoda
                OR (
                  CAST([DatumDokumenta] AS date) = @datumIzvoda
                  AND TRY_CONVERT(bigint, [Broj]) > TRY_CONVERT(bigint, @broj)
                )
              )
          `);
    
        const prometPoslije = Number(
          prometPoslijeResult.recordset?.[0]?.PrometPoslije || 0
        );
    
        // 3) Saldo na dan tog izvoda
        saldoIzvoda = trenutnoStanje - prometPoslije;
      }
    
      const payload = {
        ok: true,
        source: "View_IzvodiIzBanke",
        racun,
        broj: targetBroj,
        rows,
        totals: {
          uplate: totalUplate,
          isplate: totalIsplate,
          saldo: saldoIzvoda,
        },
        hasPrev: currentIndex < totalPages - 1,
        hasNext: currentIndex > 0,
        pageIndex: currentIndex + 1,
        totalPages,
      };
      writeServerCache(cacheKey, payload);
      return Response.json(payload);
    }

    const VIEW_RACUNI = "dbo.View_StanjeRacuna";
    const hasViewRacuni = await objectExists(pool, VIEW_RACUNI);

    if (hasViewRacuni) {
      const r = await pool.request().query(`
        SELECT *
        FROM dbo.View_StanjeRacuna
      `);

      const rows = (r.recordset || [])
        .map(mapRacunRow)
        .filter((x) => x.Konto)
        .sort((a, b) =>
          Number(b.Saldo || 0) - Number(a.Saldo || 0) ||
          String(a.Naziv || a.Konto).localeCompare(String(b.Naziv || b.Konto))
        );

      const totalSaldo = rows.reduce((a, x) => a + Number(x.Saldo || 0), 0);

      const payload = {
        ok: true,
        source: "View_StanjeRacuna",
        konto: null,
        rows,
        totalSaldo,
      };
      writeServerCache(cacheKey, payload);
      return Response.json(payload);
    }

    const kontoList =
      parseKontoParam(searchParams.get("konto")) || kontaSettings.racuni;

    const rq = pool.request();
    const kontoParams = kontoList.map((k, i) => {
      const p = `k${i}`;
      rq.input(p, sql.NVarChar, k);
      return `@${p}`;
    });

    const sqlQuery = `
      SELECT
        v.Konto,
        ISNULL(SUM(COALESCE(v.Duguje,0) - COALESCE(v.Potrazuje,0)),0) AS Saldo,
        MAX(v.DatumKnjizenja) AS ZadnjiDatumKnjizenja
      FROM dbo.View_StanjeKartica v
      WHERE v.Konto IN (${kontoParams.join(",")})
      GROUP BY v.Konto
      ORDER BY Saldo DESC, v.Konto
    `;

    const r2 = await rq.query(sqlQuery);
    const rows2 = r2.recordset || [];
    const totalSaldo2 = rows2.reduce((a, x) => a + Number(x.Saldo || 0), 0);

    const payload = {
      ok: true,
      source: "View_StanjeKartica",
      konto: kontoList,
      rows: rows2,
      totalSaldo: totalSaldo2,
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
