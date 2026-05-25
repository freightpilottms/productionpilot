import sql from "mssql";
import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sifraArtikla = String(searchParams.get("sifraArtikla") || "").trim();

    if (!sifraArtikla) {
      return Response.json(
        { ok: false, error: "Missing sifraArtikla" },
        { status: 400 }
      );
    }

    const pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewZalihe) {
      return forbiddenResponse("Nemate pristup zalihama.");
    }
    const ncSelect = permissions.canViewStockCost
      ? "ProsjecnaNabavna AS NC"
      : "CAST(NULL AS decimal(18,4)) AS NC";

    const r = await pool
      .request()
      .input("sifraArtikla", sql.NVarChar, sifraArtikla)
      .query(`
        SELECT
          SifraArtikla,
          NazivArtikla,
          Skladiste,
          Zaliha AS Kolicina,
          Barkod AS Barcode,
          ${ncSelect},
          MPC,
          VPC
        FROM dbo.View_ZaliheAPP
        WHERE SifraArtikla = @sifraArtikla
        ORDER BY Skladiste, MPC
      `);

    return Response.json({
      ok: true,
      rows: r.recordset || [],
      permissions: {
        canViewStockCost: permissions.canViewStockCost,
      },
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
