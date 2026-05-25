import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";
import { resolveInventuraForRead } from "@/lib/inventura";

export async function GET(req, { params }) {
  try {
    const rawId = String(params.id || "").trim();
    if (!rawId) {
      return Response.json(
        { ok: false, error: "Invalid inventura id" },
        { status: 400 }
      );
    }

    const pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewZalihe) {
      return forbiddenResponse("Nemate pristup inventuri.");
    }

    const resolved = await resolveInventuraForRead(pool, rawId);
    if (!resolved.ok) {
      return Response.json(
        { ok: false, error: "Inventura nije pronadjena." },
        { status: 404 }
      );
    }

    const header = resolved.header;
    const ncSelect = permissions.canViewStockCost
      ? "CAST(ISNULL(racArtikliPopisProsjecnaNabavna, 0) AS decimal(18,4)) AS NC"
      : "CAST(NULL AS decimal(18,4)) AS NC";

    const headQ = await pool.request()
      .input("resolvedKey", resolved.key)
      .query(`
        SELECT TOP 1
          racArtikliPopisKey AS Id,
          racArtikliPopisSkladiste AS Skladiste,
          racArtikliPopisDatumUnosa AS Datum,
          racArtikliPopisUnio AS Unio
        FROM dbo.racuniArtikliPopis
        WHERE racArtikliPopisKey = @resolvedKey
        ORDER BY ID DESC
      `);

    const itemsQ = await pool.request()
      .input("resolvedKey", resolved.key)
      .query(`
        SELECT
          ID,
          racArtikliPopisKey,
          racArtikliPopisRedBr,
          racArtikliPopisSifra AS SifraArtikla,
          racArtikliPopisNaziv AS NazivArtikla,
          racArtikliPopisBarCode AS Barcode,
          racArtikliPopisSkladiste AS Skladiste,
          CAST(ISNULL(racArtikliPopisKnjigovodstvenaKolicina, 0) AS decimal(18,3)) AS KnjigovodstvenaKolicina,
          CAST(ISNULL(racArtikliPopisPopisanaKolicina, 0) AS decimal(18,3)) AS StvarnaKolicina,
          CAST(ISNULL(racArtikliPopisMPC, 0) AS decimal(18,4)) AS MPC,
          CAST(ISNULL(racArtikliPopisVPC, 0) AS decimal(18,4)) AS VPC,
          ${ncSelect},
          racArtikliPopisNapomena AS Napomena
        FROM dbo.racuniArtikliPopis
        WHERE racArtikliPopisKey = @resolvedKey
        ORDER BY racArtikliPopisRedBr, racArtikliPopisSifra
      `);

    const head = headQ.recordset?.[0] || null;
    const status = header?.statusRac || "OTVORENA";
    const inventura = {
      Id: head?.Id || resolved.key,
      Skladiste:
        head?.Skladiste ||
        header?.racSkladiste ||
        header?.racSkladistePrijem ||
        "-",
      Datum: head?.Datum || header?.racDatum || null,
      Unio: head?.Unio || "",
      Status: status,
      Locked: resolved.locked,
    };

    return Response.json({
      ok: true,
      inventura,
      items: itemsQ.recordset || [],
      permissions,
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
