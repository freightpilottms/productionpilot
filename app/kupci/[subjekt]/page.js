"use client";
import { useEffect, useMemo, useState } from "react";
import ReportTable from "@/components/ReportTable";
import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import { asRows, dateInputToIso, fmtDate, fmtDateInput, fmtMoney } from "@/lib/format";
import DocumentExportActions, { mailReport, printReport } from "@/app/_ui/DocumentExportActions";

function moneyNoKm(value) {
  const num = Number(value || 0);
  const clean = String(fmtMoney(Math.abs(num))).replace(/^-?KM\s*/, "");
  return num < 0 ? `-${clean}` : clean;
}

export default function KupacKartica({ params }) {
  const subjekt = decodeURIComponent(params.subjekt || "");

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("…");
  const [row, setRow] = useState(null);

  const [od, setOd] = useState("");
  const [doo, setDo] = useState("");
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [loadingStavke, setLoadingStavke] = useState(false);

  async function loadPromet() {
    setErr("");
    setLoadingStavke(true);

    const qs = new URLSearchParams();
    qs.set("subjekt", subjekt);
    const odIso = dateInputToIso(od);
    const doIso = dateInputToIso(doo);
    if (odIso) qs.set("od", odIso);
    if (doIso) qs.set("do", doIso);

    try {
      const r = await fetch(`/api/kartica?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        setRows([]);
        setErr(j?.error || `API error (${r.status})`);
        return;
      }

      setRows(asRows(j.rows));
    } catch (e) {
      setRows([]);
      setErr(String(e?.message || e));
    } finally {
      setLoadingStavke(false);
    }
  }

  useEffect(() => {
    let alive = true;

    async function loadHeader() {
      setLoading(true);
      setMode("…");

      try {
        const url = `/api/kupci?q=${encodeURIComponent(
          subjekt
        )}&page=1&pageSize=5&sort=subjekt&dir=asc`;

        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json();

        if (!alive) return;

        if (r.ok && j?.ok) {
          const headerRows = asRows(j.rows);
          const exact =
            headerRows.find(
              (x) => String(x.Subjekt).toLowerCase() === subjekt.toLowerCase()
            ) ||
            headerRows[0] ||
            null;

          setRow(exact);
          setMode("UČITANO");
        } else {
          setRow(null);
          setMode("GREŠKA");
        }
      } catch {
        if (!alive) return;
        setRow(null);
        setMode("GREŠKA");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadHeader();
    return () => {
      alive = false;
    };
  }, [subjekt]);

  useEffect(() => {
    loadPromet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjekt]);

  const totals = useMemo(() => {
    return rows.reduce(
      (a, x) => {
        a.dug += Number(x.Duguje || 0);
        a.potraz += Number(x.Potrazuje || 0);
        a.saldo = Number(x.SaldoKumulativno || a.saldo || 0);
        return a;
      },
      { dug: 0, potraz: 0, saldo: 0 }
    );
  }, [rows]);

  const karticaColumns = [
    { key: "knjizenje", label: "Knjiženje", style: { width: "110px" } },
    {
      key: "dokument",
      label: "Dokument",
      style: {
        width: "220px",
        maxWidth: "220px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      },
    },
    { key: "datum", label: "Datum", style: { width: "110px" } },
    {
      key: "duguje",
      label: "Duguje",
      style: { width: "130px", textAlign: "right" },
    },
    {
      key: "potrazuje",
      label: "Potražuje",
      style: { width: "130px", textAlign: "right" },
    },
    {
      key: "saldo",
      label: "Saldo",
      style: { width: "130px", textAlign: "right" },
    },
  ];

  const tableRows = rows.map((x, i) => ({
    id: i,
    knjizenje: x.Knjizenje || x.BrojSaCrtama || x.Broj || "—",
    dokument: x.Dokument || "",
    datum: fmtDate(x.DatumDokumenta || x.DatumKnjizenja),
    duguje: fmtMoney(x.Duguje || 0),
    potrazuje: fmtMoney(x.Potrazuje || 0),
    saldo: fmtMoney(x.SaldoKumulativno || 0),
  }));

  function periodLabel() {
    if (!od && !doo) return "Svi dostupni podaci";
    return `${od || "Početak"} - ${doo || "Danas"}`;
  }

  function buildKarticaReport() {
    return {
      title: "Kartica kupca",
      subtitle: subjekt,
      subject: `Kartica kupca - ${subjekt}`,
      meta: [
        ["Kupac", row?.Subjekt || subjekt],
        ["Šifra", row?.Sifra || "—"],
        ["Period", periodLabel()],
      ],
      columns: karticaColumns,
      rows: tableRows,
      totals: [
        ["Ukupno duguje", fmtMoney(totals.dug)],
        ["Ukupno potražuje", fmtMoney(totals.potraz)],
        ["Saldo", fmtMoney(totals.saldo)],
      ],
    };
  }

  function printKartica() {
    printReport(buildKarticaReport());
  }

  function mailKartica() {
    mailReport(buildKarticaReport());
  }

  const filterContent = (
    <>
      <div className="cardTitle">Filter perioda</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          alignItems: "end",
          marginTop: 8,
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <div className="small">Od</div>
          <input
            type="text"
            inputMode="numeric"
            placeholder="DD.MM.YYYY"
            value={fmtDateInput(od)}
            onChange={(e) => setOd(e.target.value)}
            className="input"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div className="small">Do</div>
          <input
            type="text"
            inputMode="numeric"
            placeholder="DD.MM.YYYY"
            value={fmtDateInput(doo)}
            onChange={(e) => setDo(e.target.value)}
            className="input"
          />
        </label>

        <button
          className="btn clickable"
          onClick={loadPromet}
          style={{ width: "100%" }}
        >
          {loadingStavke ? "Učitavanje…" : "Učitaj"}
        </button>
      </div>

      {!!err && (
        <div className="small bad" style={{ marginTop: 10 }}>
          {err}
        </div>
      )}
    </>
  );

  return (
    <main className="container page">
      <DesktopAppHeader title="Kartica kupca" subtitle={subjekt} status={loading ? "Učitavanje…" : mode} />

      <div className="topbar mobileOnlyHeader">
        <div>
          <div className="brand">Kartica kupca</div>
          <div
            className="subtitle"
            title={subjekt}
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "100%",
            }}
          >
            {subjekt}
          </div>
        </div>
        <div className="pill clickable" role="button" tabIndex={0} title="Status">
          {loading ? "Učitavanje…" : mode}
        </div>
      </div>

      <div
        className="grid2"
        style={{
          marginTop: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        <div className="card clickable" role="button" tabIndex={0}>
          <div className="cardTitle">Kupac</div>
          <div
            className="big"
            title={row?.Subjekt || subjekt}
            style={{
              fontSize: 20,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {row?.Subjekt || subjekt}
          </div>
          <div className="small">
            Šifra: <b>{row?.Sifra || "—"}</b>
          </div>
        </div>

        <div className="card clickable" role="button" tabIndex={0}>
          <div className="cardTitle">Ukupno saldo</div>
          <div className={"big " + (Number(totals.saldo) < 0 ? "bad" : "good")}>
            {fmtMoney(totals.saldo)}
          </div>
          <div className="small">Kumulativno stanje kartice</div>
        </div>
      </div>

      {/* Desktop filter stays where it is */}
      <div className="card karticaFilterDesktop" style={{ marginTop: 10 }}>
        {filterContent}
      </div>

      <div
        className="card"
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <div>
          <div className="small">Ukupno duguje</div>
          <div className="amount good">{moneyNoKm(totals.dug)}</div>
        </div>

        <div>
          <div className="small">Ukupno potražuje</div>
          <div className="amount bad">{moneyNoKm(totals.potraz)}</div>
        </div>

        <div>
          <div className="small">Saldo</div>
          <div className={"amount " + (Number(totals.saldo) < 0 ? "bad" : "good")}>
            {moneyNoKm(totals.saldo)}
          </div>
        </div>
      </div>

      <div className="sectionActionRow">
        <div className="sectionTitle">Stavke kartice</div>
        <DocumentExportActions onPrint={printKartica} onMail={mailKartica} disabled={loadingStavke || !rows.length} compact />
      </div>

      {/* Mobile filter moves below section title */}
     

      {loadingStavke ? (
        <div className="card" style={{ marginTop: 10, fontSize: "70%", opacity: 0.85 }}>
          Učitavanje stavki…
        </div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ marginTop: 10, fontSize: "70%", opacity: 0.85 }}>
          Nema stavki za odabrani period.
        </div>
      ) : (
        <div className="karticaTableWrap" style={{ marginTop: 10 }}>
          <ReportTable columns={karticaColumns} rows={tableRows} />
        </div>


      )}
<div className="card karticaFilterMobile" style={{ marginTop: 10 }}>
  {filterContent}
</div>
      <style jsx global>{`
        .karticaFilterMobile {
          display: none;
        }

        .karticaFilterDesktop {
          display: block;
        }

        @media (max-width: 760px) {
          .karticaFilterDesktop {
            display: none;
          }

          .karticaFilterMobile {
            display: block;
          }

          .karticaTableWrap {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .karticaTableWrap table {
            width: 100%;
            min-width: 640px;
            border-spacing: 0;
          }

          .karticaTableWrap th,
          .karticaTableWrap td {
            padding: 6px 6px !important;
            font-size: 11.5px !important;
            line-height: 1.15 !important;
            vertical-align: middle;
          }

          .karticaTableWrap th {
            font-size: 10px !important;
            letter-spacing: 0.2px;
            white-space: nowrap;
          }

          .karticaTableWrap td {
            white-space: nowrap;
          }

          .karticaTableWrap tr {
            height: 36px;
          }
        }
      `}</style>
    </main>
  );
}
