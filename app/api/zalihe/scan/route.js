import sql from "mssql";
import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const code = String(searchParams.get("code") || "").trim();

    if (!code) {
      return Response.json(
        { ok: false, error: "Missing code" },
        { status: 400 }
      );
    }

    const pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewZalihe) {
      return forbiddenResponse("Nemate pristup zalihama.");
    }
    const ncSelect = permissions.canViewStockCost
      ? "CAST(ISNULL(ProsjecnaNabavna, 0) AS decimal(18,4)) AS NC"
      : "CAST(NULL AS decimal(18,4)) AS NC";

    const r = await pool
      .request()
      .input("code", sql.NVarChar, code)
      .query(`
        SELECT TOP 50
          SifraArtikla,
          NazivArtikla,
          Barkod AS Barcode,
          Skladiste,
          CAST(ISNULL(Zaliha, 0) AS decimal(18,3)) AS Kolicina,
          ${ncSelect},
          CAST(ISNULL(MPC, 0) AS decimal(18,4)) AS MPC,
          CAST(ISNULL(VPC, 0) AS decimal(18,4)) AS VPC
        FROM dbo.View_ZaliheAPP
        WHERE CAST(SifraArtikla AS nvarchar(255)) = @code
           OR CAST(Barkod AS nvarchar(255)) = @code
        ORDER BY
          CASE
            WHEN CAST(SifraArtikla AS nvarchar(255)) = @code THEN 0
            WHEN CAST(Barkod AS nvarchar(255)) = @code THEN 0
            ELSE 1
          END,
          Skladiste,
          SifraArtikla,
          MPC
      `);

    const rows = r.recordset || [];

    return Response.json({
      ok: true,
      found: rows.length > 0,
      rows,
      total: rows.length,
      item: rows[0] || null,
      permissions: {
        canViewStockCost: permissions.canViewStockCost,
      },
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
