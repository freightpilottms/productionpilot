"use client";
import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import DocumentExportActions, { printReport } from "@/app/_ui/DocumentExportActions";
import { useEffect, useState } from "react";
import { dateInputToIso, fmtDate, fmtDateInput, fmtMoney } from "@/lib/format";

export default function ZaduzenjeKartica({ params }) {
  const konto = decodeURIComponent(params.konto || "");

  const [od, setOd] = useState("");
  const [doo, setDo] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  async function loadPromet() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(
        `/api/karticaZaduzenja?konto=${encodeURIComponent(konto)}&od=${encodeURIComponent(
          dateInputToIso(od)
        )}&do=${encodeURIComponent(dateInputToIso(doo))}`,
        { cache: "no-store" }
      );
      const j = await r.json().catch(() => null);
      if (r.ok && j?.ok) {
        setRows(j.rows || []);
      } else {
        setRows([]);
        setErr(j?.error || `API error (${r.status})`);
      }
    } catch (e) {
      setRows([]);
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (konto) loadPromet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [konto]);

  function printZaduzenjeKartica() {
    printReport({
      title: "Kartica zaduženja",
      subject: `Kartica zaduženja ${konto}`,
      subtitle: `Konto: ${konto}`,
      meta: [
        { label: "Od", value: fmtDateInput(od) || "Sve" },
        { label: "Do", value: fmtDateInput(doo) || "Sve" },
        { label: "Stavki", value: rows.length.toLocaleString("bs-BA") },
      ],
      columns: [
        { key: "datum", label: "Datum" },
        { key: "dokument", label: "Dokument" },
        { key: "duguje", label: "Duguje" },
        { key: "potrazuje", label: "Potražuje" },
        { key: "saldo", label: "Saldo" },
      ],
      rows: rows.map((row) => ({
        datum: fmtDate(row.DatumKnjizenja),
        dokument: row.Dokument || "",
        duguje: fmtMoney(row.Duguje || 0),
        potrazuje: fmtMoney(row.Potrazuje || 0),
        saldo: fmtMoney(row.SaldoKumulativno || 0),
      })),
    });
  }

  const mode = loading ? "Učitavanje…" : err ? "GREŠKA" : "UČITANO";

  return (
    <main className="container page">
      <DesktopAppHeader title="Kartica zaduženja" subtitle={`Konto: ${konto}`} status={mode} />

      <div className="topbar mobileOnlyHeader">
        <div>
          <div className="brand">Kartica zaduženja</div>
          <div className="subtitle">Konto: {konto}</div>
        </div>
        <div className="pill clickable" role="button" tabIndex={0} title="Status">
          {mode}
        </div>
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        <div className="cardTitle">Promet po periodu</div>

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

          <button className="btn clickable" onClick={loadPromet} style={{ width: "100%" }}>
            Učitaj
          </button>
        </div>

        <div className="small" style={{ marginTop: 10, opacity: 0.85 }}>
          Stavki: <b>{rows.length}</b>
        </div>

        {!!err && (
          <div className="small bad" style={{ marginTop: 8 }}>
            {err}
          </div>
        )}
      </div>

      <div className="sectionActionRow">
        <div className="sectionTitle" style={{ margin: 0 }}>Stavke</div>
        <DocumentExportActions onPrint={printZaduzenjeKartica} disabled={loading || !rows.length} compact />
      </div>

      <div className="list">
        {rows.length === 0 ? (
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft">
              <div className="itemTitle">Nema stavki</div>
              <div className="itemSub">
                Izaberi period i klikni <b>Učitaj</b>.
              </div>
            </div>
            <div className="amount">—</div>
          </div>
        ) : (
          rows.map((x, i) => (
            <div key={i} className="item clickable" role="button" tabIndex={0}>
              <div className="itemLeft">
                <div className="itemTitle">
                  {fmtDate(x.DatumKnjizenja)} · {x.Dokument}
                </div>
                <div className="itemSub">
                  Duguje: {fmtMoney(x.Duguje)} · Potražuje: {fmtMoney(x.Potrazuje)}
                </div>
              </div>
              <div className="amount">{fmtMoney(x.SaldoKumulativno)}</div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
