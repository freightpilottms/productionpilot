"use client";

import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import { CACHE_TTL_MS, fetchJsonWithAuth, readCachedJson, scopedCacheKey, writeCachedJson } from "@/app/_ui/clientCache";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { asRows, fmtMoney, fmtDate } from "@/lib/format";
import DocumentExportActions, { mailReport, printReport } from "@/app/_ui/DocumentExportActions";

function fmtQty(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("bs-BA", { maximumFractionDigits: 3 }).format(n);
}

function moneyNumber(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

export default function IzdaniRacunDetalj({ params }) {
  const router = useRouter();
  const type = decodeURIComponent(params.type || "racuni");
  const broj = decodeURIComponent(params.broj || "");

  const [loading, setLoading] = useState(true);
  const [header, setHeader] = useState(null);
  const [company, setCompany] = useState(null);
  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState("…");

  useEffect(() => {
    let alive = true;
    let timer = null;
    const url = `/api/izdani-racuni?mode=detail&type=${encodeURIComponent(type)}&broj=${encodeURIComponent(broj)}`;
    const cacheKey = scopedCacheKey(`izdani-racuni:detail:v4:${type}:${broj}`);
    const cached = readCachedJson(cacheKey);

    if (cached?.data) {
      setHeader(cached.data.header || null);
      setCompany(cached.data.company || null);
      setRows(asRows(cached.data.rows));
      setMode("UČITANO");
      setLoading(false);
    }

    async function load({ silent = false } = {}) {
      if (!silent) {
        setLoading(true);
        setMode("…");
      }

      try {
        const j = await fetchJsonWithAuth(url);

        if (!alive) return;

        writeCachedJson(cacheKey, j);
        setHeader(j.header || null);
        setCompany(j.company || null);
        setRows(asRows(j.rows));
        setMode("UČITANO");
      } catch {
        if (!alive) return;
        if (!cached?.data) {
          setMode("GREŠKA");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    if (!cached?.data || cached.stale) {
      load({ silent: !!cached?.data });
    }

    timer = window.setInterval(() => {
      load({ silent: true });
    }, CACHE_TTL_MS);

    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
    };
  }, [type, broj]);

  const title = type === "predracuni" ? "Predračun" : "Faktura";
  const officialBroj = header?.racBrojSaCrtama || broj;
  const printDocumentColumns = [
    { key: "naziv", label: "Naziv artikla" },
    { key: "sifra", label: "Šifra" },
    { key: "jm", label: "JM" },
    { key: "kolicina", label: "Količina" },
    { key: "cijena", label: "Cijena bez PDV" },
    { key: "rabat", label: "Rabat" },
    { key: "pdv", label: "PDV %" },
    { key: "ukupno", label: "Ukupno" },
  ];
  const documentRows = rows.map((x) => ({
    naziv: x.sifRacArtikliNaziv || "—",
    sifra: x.sifRacArtikliSifra || "—",
    jm: x.sifRacArtikliJM || "—",
    kolicina: fmtQty(x.sifRacArtikliKolicina),
    cijena: fmtMoney(x.sifRacArtikliCijenaBezPDV),
    rabat: `${fmtQty(x.rabatUkupnoProc)}%`,
    pdv: x.sifRacArtikliPDVStopaProc === null || x.sifRacArtikliPDVStopaProc === undefined ? "—" : `${fmtQty(x.sifRacArtikliPDVStopaProc)}%`,
    ukupno: fmtMoney(x.sifRacArtikliZaPlatiti),
  }));
  const itemsTotal = rows.reduce((sum, row) => sum + moneyNumber(row.sifRacArtikliZaPlatiti), 0);

  function buildDocumentReport() {
    return {
      layout: "invoice",
      title: `${title} #${officialBroj}`,
      subject: `${title} #${officialBroj}`,
      company: company || {},
      customer: {
        name: header?.racKupac || "—",
        address: header?.racKupacAdresa || "",
        postalCode: header?.racKupacPostanskiBroj || "",
        city: header?.racKupacGrad || "",
        country: header?.racKupacDrzava || "",
        vatNumber: header?.racKupacPDVBroj || "",
        idNumber: header?.racKupacIDBroj || "",
      },
      invoice: {
        documentTitle: title,
        number: officialBroj,
        internalNumber: broj,
        date: fmtDate(header?.racDatumRacuna),
        placeDate: fmtDate(header?.racDatumRacuna),
        status: header?.statusRac || "—",
        referent: header?.racReferent || "—",
        currency: header?.racValutaPlacanja || "—",
        paymentType: header?.VrstaPlacanja || "—",
        fiscalNumber: header?.racBrojFiskalnog || "—",
      },
      meta: [
        ["Kupac", header?.racKupac || "—"],
        ["Broj", officialBroj],
        ["Interni broj", broj],
        ["Datum", fmtDate(header?.racDatumRacuna)],
        ["Status", header?.statusRac || "—"],
        ["Referent", header?.racReferent || "—"],
        ["Valuta", header?.racValutaPlacanja || "—"],
        ["Način plaćanja", header?.VrstaPlacanja || "—"],
        ["Broj fiskalnog", header?.racBrojFiskalnog || "—"],
      ],
      columns: printDocumentColumns,
      rows: documentRows,
      totals: [
        ["Osnovica", fmtMoney(header?.sifRacArtikliPDVOsnovica)],
        ["PDV", fmtMoney(header?.sifRacArtikliIznosPDV)],
        ["Za platiti", fmtMoney(itemsTotal)],
      ],
    };
  }

  function printDocument() {
    printReport(buildDocumentReport());
  }

  function mailDocument() {
    mailReport(buildDocumentReport());
  }

  return (
    <main className="container page">
      <DesktopAppHeader status={loading ? "Učitavanje…" : mode} />

      <div className="topbar documentHeaderRow documentDesktopActionRow">
        <button
          className="btn clickable documentActionBtn docBackBtn"
          type="button"
          onClick={() => router.push(`/izdani-racuni?tab=${encodeURIComponent(type)}`)}
        >
          ← Nazad
        </button>

        <div className="documentHeaderTitle">
          <div className="brand">{title}</div>
          <div className="brand documentNumber">#{broj}</div>
        </div>

        <DocumentExportActions onPrint={printDocument} onMail={mailDocument} disabled={loading || !header} compact />
      </div>

      <div className="topbar mobileOnlyHeader documentMobileHeaderRow">
        <button
          className="btn clickable docBackBtn mobileDocBackBtn"
          type="button"
          onClick={() => router.push(`/izdani-racuni?tab=${encodeURIComponent(type)}`)}
        >
          ←
        </button>
        <div className="documentHeaderTitle documentMobileHeaderTitle">
          <div className="brand">{title}</div>
          <div className="subtitle documentNumber">#{broj}</div>
        </div>
        <div className="pill clickable" role="button" tabIndex={0} title="Status">
          {loading ? "…" : mode}
        </div>
      </div>

      <div className="mobileDocumentActions">
        <DocumentExportActions onPrint={printDocument} onMail={mailDocument} disabled={loading || !header} compact />
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        <div className="cardTitle">Zaglavlje:</div>
        <div style={{ marginTop: 8, fontWeight: 950 }}>{header?.racKupac || "—"}</div>
        <div className="small" style={{ marginTop: 6 }}>Broj: <b>{officialBroj}</b></div>
        {officialBroj !== broj && <div className="small">Interni broj: <b>{broj}</b></div>}
        <div className="small">Datum: <b>{fmtDate(header?.racDatumRacuna)}</b></div>
        <div className="small">Status: <b>{header?.statusRac || "—"}</b></div>
        <div className="small">Referent: <b>{header?.racReferent || "—"}</b></div>
        <div className="small">Valuta: <b>{header?.racValutaPlacanja || "—"}</b></div>
        <div className="small">Način plaćanja: <b>{header?.VrstaPlacanja || "—"}</b></div>
        <div className="small">Broj fiskalnog: <b>{header?.racBrojFiskalnog || "—"}</b></div>
      </div>

      <div className="card clickable" role="button" tabIndex={0} style={{ marginTop: 10 }}>
        <div className="cardTitle">Ukupno:</div>
        <div className="big">{fmtMoney(itemsTotal)}</div>
        <div className="small">Zbir stavki računa</div>
      </div>

      <div className="sectionTitle">Artikli:</div>
      <div className="list">
        {loading && (
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft"><div className="itemTitle">Učitavanje…</div></div>
            <div className="amount">—</div>
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft">
              <div className="itemTitle">Nema artikala</div>
              <div className="itemSub">Podaci nisu dostupni za ovaj dokument.</div>
            </div>
            <div className="amount">—</div>
          </div>
        )}

        {!loading && rows.map((x, idx) => (
          <div key={idx} className="item invoiceDocumentItem">
            <div className="itemLeft invoiceDocumentItemMain">
              <div
                className="itemTitle invoiceItemName"
                title={x.sifRacArtikliNaziv}
              >
                {x.sifRacArtikliNaziv || "—"}
              </div>
              <div className="itemSub invoiceItemMetaLine invoiceItemBaseLine">
                Šifra: {x.sifRacArtikliSifra || "—"} · JM: {x.sifRacArtikliJM || "—"}
              </div>
              <div className="itemSub invoiceItemMetaLine invoiceItemValueLine">
                Količina: {fmtQty(x.sifRacArtikliKolicina)} · Cijena: {fmtMoney(x.sifRacArtikliCijenaBezPDV)} · Rabat: {fmtQty(x.rabatUkupnoProc)}%
              </div>
            </div>
            <div className="amount good">{fmtMoney(x.sifRacArtikliZaPlatiti)}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
