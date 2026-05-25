import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewZalihe) {
      return forbiddenResponse("Nemate pristup inventuri.");
    }

    const q = await pool.request().query(`
      SELECT
        [racBroj],
        [racBrojSaCrtama],
        [racDatum],
        [racDocType],
        [racKupac],
        [sifSIFRAkupca],
        [racOdjel],
        [racOdjelPrijem],
        [statusRac],
        [racNaponemaKupac],
        [racIporuka],
        [racDatumRacuna],
        [racDaniPlacanja],
        [racDatumIsporuke],
        [racPDV],
        [racVrijednostBezPdv],
        [racRabat],
        [racZaPlatiti],
        [racNacinPlacanja],
        [racNapomenaIspo],
        [racParitetIspo],
        [racKursValute],
        [racNapomena],
        [racNacinProdaje],
        [racVezniDokument],
        [racValutaPlacanja],
        [racSkladiste],
        [racSkladistePrijem],
        [racIzjava],
        [racReferent],
        [racZavisniTrosak],
        [racCarinskaDeklaracija],
        [racKljucZaRaspTros],
        [racCarina],
        [racTransport],
        [racUvozOsnovica],
        [racUvozPDV],
        [racDatumPDV],
        [racDatumPlacanja],
        [racUgovor],
        [racDatumPromjene],
        [racBrojFiskalnog],
        [Naplaceno],
        [PovratKusur],
        [VrstaPlacanja],
        [placeno],
        [PutanjaFile],
        [Knjizen],
        [Odabran],
        [BrojNarudzbe],
        [Proizveden],
        [racUvozOsnovicaNE],
        [racUvozPDVNE]
      FROM [dbo].[racuniZaglavlje]
      WHERE racDocType = 'INV'
      ORDER BY racDatum DESC, racBroj DESC
    `);

    const rows = (q.recordset || []).map((x) => ({
      Id: x.racBroj,
      Broj: x.racBroj,
      BrojPrikaz: x.racBrojSaCrtama || x.racBroj,
      Datum: x.racDatum || x.racDatumRacuna || null,
      Skladiste: x.racSkladiste || x.racSkladistePrijem || "—",
      Status: x.statusRac || "",
      Napomena: x.racNapomena || x.racNapomenaIspo || "",
      Kupac: String(x.racKupac || "").trim() || "Nepoznato",
    }));

    return Response.json({ ok: true, rows, total: rows.length, permissions });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function POST(req) {
  try {
    await req.json().catch(() => ({}));

    return Response.json(
      {
        ok: false,
        error:
          "Kreiranje inventure kroz ovaj API nije aktivno. Inventure se vode kroz dbo.racuniZaglavlje/racuniArtikliPopis.",
      },
      { status: 501 }
    );
  } catch (e) {
    return apiErrorResponse(e);
  }
}
