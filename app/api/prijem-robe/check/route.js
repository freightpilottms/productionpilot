import sql from "mssql";
import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";

function clean(value, max = 255) {
  return String(value || "").trim().slice(0, max);
}

function mapKey(value) {
  return clean(value).toUpperCase();
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    const rawItems = Array.isArray(body?.items) ? body.items : [];
    const items = rawItems.slice(0, 120).map((item, index) => ({
      index,
      sifra: clean(item?.sifra || item?.SifraArtikla),
      barcode: clean(item?.barcode || item?.Barcode || item?.Barkod),
      naziv: clean(item?.naziv || item?.NazivArtikla, 500),
    }));

    if (!items.length) {
      return Response.json({ ok: true, results: [] });
    }

    const pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewZalihe) {
      return forbiddenResponse("Nemate pristup provjeri zaliha.");
    }
    const sifre = Array.from(new Set(items.map((item) => clean(item.sifra)).filter(Boolean))).slice(0, 120);
    const barcodes = Array.from(new Set(items.map((item) => clean(item.barcode)).filter(Boolean))).slice(0, 120);

    if (!sifre.length && !barcodes.length) {
      return Response.json({
        ok: true,
        results: items.map((item) => ({
          index: item.index,
          exists: false,
          match: null,
          matchType: "",
        })),
      });
    }

    const reqDb = pool.request();
    const whereParts = [];

    if (sifre.length) {
      const params = sifre.map((value, index) => {
        const name = `sifra${index}`;
        reqDb.input(name, sql.NVarChar, value);
        return `@${name}`;
      });
      whereParts.push(`SifraArtikla IN (${params.join(", ")})`);
    }

    if (barcodes.length) {
      const params = barcodes.map((value, index) => {
        const name = `barcode${index}`;
        reqDb.input(name, sql.NVarChar, value);
        return `@${name}`;
      });
      whereParts.push(`Barkod IN (${params.join(", ")})`);
    }

    const q = await reqDb.query(`
      SELECT
        SifraArtikla,
        NazivArtikla,
        Barkod AS Barcode,
        Skladiste,
        CAST(ISNULL(Zaliha, 0) AS decimal(18,3)) AS Kolicina,
        CAST(ISNULL(MPC, 0) AS decimal(18,4)) AS MPC,
        CAST(ISNULL(VPC, 0) AS decimal(18,4)) AS VPC
      FROM dbo.View_ZaliheAPP
      WHERE ${whereParts.join(" OR ")}
      ORDER BY SifraArtikla, Skladiste, MPC
    `);

    const bySifra = new Map();
    const byBarcode = new Map();

    for (const row of q.recordset || []) {
      const sifraKey = mapKey(row.SifraArtikla);
      const barcodeKey = mapKey(row.Barcode);
      if (sifraKey && !bySifra.has(sifraKey)) bySifra.set(sifraKey, row);
      if (barcodeKey && !byBarcode.has(barcodeKey)) byBarcode.set(barcodeKey, row);
    }

    const results = items.map((item) => {
      const barcodeMatch = item.barcode ? byBarcode.get(mapKey(item.barcode)) : null;
      const sifraMatch = item.sifra ? bySifra.get(mapKey(item.sifra)) : null;
      const match = barcodeMatch || sifraMatch || null;
      return {
        index: item.index,
        exists: Boolean(match),
        match,
        matchType: barcodeMatch ? "barcode" : sifraMatch ? "sifra" : "",
      };
    });

    return Response.json({ ok: true, results });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
