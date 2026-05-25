// app/api/inventura/load/route.js
import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";
import { inventuraResolutionResponse, resolveInventuraForWrite } from "@/lib/inventura";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { inventuraId, skladiste } = await req.json();

    if (!inventuraId || !skladiste) {
      return Response.json(
        { ok: false, error: "Missing inventuraId or skladiste" },
        { status: 400 }
      );
    }

    const pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewZalihe) {
      return forbiddenResponse("Nemate pristup inventuri.");
    }
    const resolved = await resolveInventuraForWrite(pool, inventuraId);
    if (!resolved.ok) {
      return inventuraResolutionResponse(resolved);
    }
    const resolvedKey = resolved.key;

    const result = await pool.request()
      .input("invId", resolvedKey)
      .input("skladiste", skladiste)
      .query(`
        DECLARE @baseRedBr int;

        SELECT @baseRedBr = ISNULL(MAX(racArtikliPopisRedBr), 0)
        FROM dbo.racuniArtikliPopis
        WHERE racArtikliPopisKey = @invId;

        ;WITH SourceRows AS (
          SELECT
            CAST(SifraArtikla AS nvarchar(255)) AS SifraArtikla,
            MAX(CAST(NazivArtikla AS nvarchar(500))) AS NazivArtikla,
            MAX(CAST(Barkod AS nvarchar(255))) AS Barcode,
            @skladiste AS Skladiste,
            ISNULL(SUM(TRY_CONVERT(decimal(18,3), Zaliha)), 0) AS KnjigovodstvenaKolicina,
            ISNULL(MAX(TRY_CONVERT(decimal(18,4), MPC)), 0) AS MPC,
            ISNULL(MAX(TRY_CONVERT(decimal(18,4), VPC)), 0) AS VPC,
            ISNULL(MAX(TRY_CONVERT(decimal(18,4), ProsjecnaNabavna)), 0) AS ProsjecnaNabavna
          FROM dbo.View_ZaliheAPP
          WHERE CAST(Skladiste AS nvarchar(255)) = @skladiste
            AND NULLIF(LTRIM(RTRIM(CAST(SifraArtikla AS nvarchar(255)))), '') IS NOT NULL
          GROUP BY CAST(SifraArtikla AS nvarchar(255))
        ),
        ToInsert AS (
          SELECT
            ROW_NUMBER() OVER (ORDER BY SifraArtikla) AS rn,
            s.*
          FROM SourceRows s
          WHERE NOT EXISTS (
            SELECT 1
            FROM dbo.racuniArtikliPopis p
            WHERE p.racArtikliPopisKey = @invId
              AND CAST(p.racArtikliPopisSifra AS nvarchar(255)) = s.SifraArtikla
          )
        )
        INSERT INTO dbo.racuniArtikliPopis (
          racArtikliPopisKey,
          racArtikliPopisRedBr,
          racArtikliPopisSifra,
          racArtikliPopisNaziv,
          racArtikliPopisBarCode,
          racArtikliPopisJM,
          racArtikliPopisSkladiste,
          racArtikliPopisMPC,
          racArtikliPopisVPC,
          racArtikliPopisProsjecnaNabavna,
          racArtikliPopisKnjigovodstvenaKolicina,
          racArtikliPopisPopisanaKolicina,
          racArtikliPopisNapomena,
          racArtikliPopisDatumUnosa,
          racArtikliPopisUnio
        )
        SELECT
          @invId,
          @baseRedBr + rn,
          SifraArtikla,
          NazivArtikla,
          Barcode,
          N'KOM',
          Skladiste,
          MPC,
          VPC,
          ProsjecnaNabavna,
          KnjigovodstvenaKolicina,
          0,
          N'Učitano iz zaliha',
          GETDATE(),
          N'Admin'
        FROM ToInsert
      `);

    return Response.json({ ok: true, inventuraId: resolvedKey, inserted: result.rowsAffected?.[0] || 0 });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
