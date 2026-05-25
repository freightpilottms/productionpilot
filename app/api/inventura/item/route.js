import sql from "mssql";
import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";
import {
  buildInventuraKeyCandidates,
  inventuraResolutionResponse,
  resolveInventuraForRead,
  resolveInventuraForWrite,
} from "@/lib/inventura";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rawInventuraId = String(searchParams.get("inventuraId") || "").trim();
    const sifraArtikla = String(searchParams.get("sifraArtikla") || "").trim();

    if (!rawInventuraId || !sifraArtikla) {
      return Response.json(
        { ok: false, error: "Missing inventuraId or sifraArtikla" },
        { status: 400 }
      );
    }

    const pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewZalihe) {
      return forbiddenResponse("Nemate pristup inventuri.");
    }
    const resolved = await resolveInventuraForRead(pool, rawInventuraId);
    const keys = resolved.key
      ? [resolved.key]
      : buildInventuraKeyCandidates(rawInventuraId);

    const existingQ = await pool.request()
      .input("k1", keys[0] || null)
      .input("k2", keys[1] || null)
      .input("k3", keys[2] || null)
      .input("sifraArtikla", sql.NVarChar, sifraArtikla)
      .query(`
        SELECT TOP 1
          ID,
          racArtikliPopisKey,
          racArtikliPopisSifra AS SifraArtikla,
          racArtikliPopisNaziv AS NazivArtikla,
          racArtikliPopisBarCode AS Barcode,
          racArtikliPopisSkladiste AS Skladiste,
          CAST(ISNULL(racArtikliPopisPopisanaKolicina, 0) AS decimal(18,3)) AS StvarnaKolicina,
          CAST(ISNULL(racArtikliPopisKnjigovodstvenaKolicina, 0) AS decimal(18,3)) AS KnjigovodstvenaKolicina,
          CAST(ISNULL(racArtikliPopisMPC, 0) AS decimal(18,4)) AS MPC,
          racArtikliPopisNapomena AS Napomena
        FROM dbo.racuniArtikliPopis
        WHERE (
          racArtikliPopisKey = @k1
          OR racArtikliPopisKey = @k2
          OR racArtikliPopisKey = @k3
        )
          AND racArtikliPopisSifra = @sifraArtikla
        ORDER BY ID DESC
      `);

    if (existingQ.recordset?.[0]) {
      return Response.json({
        ok: true,
        item: existingQ.recordset[0],
        source: "inventura",
      });
    }

    const artikalQ = await pool.request()
      .input("sifraArtikla", sql.NVarChar, sifraArtikla)
      .query(`
        SELECT TOP 1
          SifraArtikla,
          NazivArtikla,
          Barkod,
          Skladiste,
          CAST(ISNULL(Zaliha, 0) AS decimal(18,3)) AS KnjigovodstvenaKolicina,
          CAST(ISNULL(MPC, 0) AS decimal(18,4)) AS MPC
        FROM dbo.View_ZaliheAPP
        WHERE SifraArtikla = @sifraArtikla
   OR Barkod = @sifraArtikla
        ORDER BY Skladiste, MPC
      `);

    const a = artikalQ.recordset?.[0];

    return Response.json({
      ok: true,
      item: a
        ? {
            SifraArtikla: a.SifraArtikla,
            NazivArtikla: a.NazivArtikla || "",
            Barcode: a.Barkod || "",
            Skladiste: a.Skladiste || "",
            StvarnaKolicina: null,
            KnjigovodstvenaKolicina: a.KnjigovodstvenaKolicina,
            MPC: a.MPC,
            Napomena: "Prvi unos",
          }
        : {
            SifraArtikla: sifraArtikla,
            NazivArtikla: "",
            Barcode: "",
            Skladiste: "",
            StvarnaKolicina: null,
            KnjigovodstvenaKolicina: null,
            MPC: null,
            Napomena: "Prvi unos",
          },
      source: a ? "zalihe" : "manual",
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function POST(req) {
  try {
    const body = await req.json();

    const rawInventuraId = String(body.inventuraId || "").trim();
    const sifraArtikla = String(body.sifraArtikla || "").trim();
    const nazivArtikla = String(body.nazivArtikla || "").trim();
    const stvarnaKolicina = Number(body.stvarnaKolicina || 0);
    const knjigovodstvenaKolicina = Number(body.knjigovodstvenaKolicina || 0);
    const mpc = Number(body.mpc || 0);
    const skladiste = String(body.skladiste || "").trim();
    const barcode = String(body.barcode || "").trim();
    const unio = String(body.unio || "Admin").trim();
    const napomena = String(body.napomena || "Prvi unos").trim();

    if (!rawInventuraId || !sifraArtikla) {
      return Response.json(
        { ok: false, error: "Missing inventuraId or sifraArtikla" },
        { status: 400 }
      );
    }

    const pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewZalihe) {
      return forbiddenResponse("Nemate pristup inventuri.");
    }
    const resolved = await resolveInventuraForWrite(pool, rawInventuraId);
    if (!resolved.ok) {
      return inventuraResolutionResponse(resolved);
    }
    const inventuraId = resolved.key;

    const existingQ = await pool.request()
      .input("inventuraId", inventuraId)
      .input("sifraArtikla", sql.NVarChar, sifraArtikla)
      .query(`
        SELECT TOP 1 ID, racArtikliPopisRedBr
        FROM dbo.racuniArtikliPopis
        WHERE racArtikliPopisKey = @inventuraId
          AND racArtikliPopisSifra = @sifraArtikla
      `);

    if (existingQ.recordset?.[0]?.ID) {
      await pool.request()
        .input("id", existingQ.recordset[0].ID)
        .input("nazivArtikla", sql.NVarChar, nazivArtikla || null)
        .input("barcode", sql.NVarChar, barcode || null)
        .input("skladiste", sql.NVarChar, skladiste || null)
        .input("mpc", mpc)
        .input("stvarnaKolicina", stvarnaKolicina)
        .input("knjigovodstvenaKolicina", knjigovodstvenaKolicina)
        .input("napomena", sql.NVarChar, napomena || null)
        .input("unio", sql.NVarChar, unio || null)
        .query(`
          UPDATE dbo.racuniArtikliPopis
          SET
            racArtikliPopisNaziv = @nazivArtikla,
            racArtikliPopisBarCode = @barcode,
            racArtikliPopisSkladiste = @skladiste,
            racArtikliPopisMPC = @mpc,
            racArtikliPopisPopisanaKolicina = @stvarnaKolicina,
            racArtikliPopisKnjigovodstvenaKolicina = @knjigovodstvenaKolicina,
            racArtikliPopisNapomena = @napomena,
            racArtikliPopisDatumUnosa = GETDATE(),
            racArtikliPopisUnio = @unio
          WHERE ID = @id
        `);

      return Response.json({ ok: true, action: "updated" });
    }

    const nextRedBrQ = await pool.request()
      .input("inventuraId", inventuraId)
      .query(`
        SELECT ISNULL(MAX(racArtikliPopisRedBr), 0) + 1 AS NextRedBr
        FROM dbo.racuniArtikliPopis
        WHERE racArtikliPopisKey = @inventuraId
      `);

    const nextRedBr = Number(nextRedBrQ.recordset?.[0]?.NextRedBr || 1);

    await pool.request()
      .input("inventuraId", inventuraId)
      .input("redBr", nextRedBr)
      .input("sifraArtikla", sql.NVarChar, sifraArtikla)
      .input("nazivArtikla", sql.NVarChar, nazivArtikla || null)
      .input("barcode", sql.NVarChar, barcode || null)
      .input("jm", sql.NVarChar, "KOM")
      .input("skladiste", sql.NVarChar, skladiste || null)
      .input("mpc", mpc)
      .input("vpc", 0)
      .input("prosjecnaNabavna", 0)
      .input("stvarnaKolicina", stvarnaKolicina)
      .input("knjigovodstvenaKolicina", knjigovodstvenaKolicina)
      .input("napomena", sql.NVarChar, napomena || null)
      .input("unio", sql.NVarChar, unio || null)
      .query(`
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
        VALUES (
          @inventuraId,
          @redBr,
          @sifraArtikla,
          @nazivArtikla,
          @barcode,
          @jm,
          @skladiste,
          @mpc,
          @vpc,
          @prosjecnaNabavna,
          @knjigovodstvenaKolicina,
          @stvarnaKolicina,
          @napomena,
          GETDATE(),
          @unio
        )
      `);

    return Response.json({ ok: true, action: "inserted" });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
