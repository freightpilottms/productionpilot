"use client";

import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import DocumentExportActions, { printReport } from "@/app/_ui/DocumentExportActions";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { dateInputToIso, fmtDate, fmtDateInput, fmtMoney } from "@/lib/format";

export default function KarticaClient() {
  const sp = useSearchParams();
  const subjekt = sp.get("subjekt") || "";
  const type = sp.get("type") || "kupac";

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("…");
  const [err, setErr] = useState("");

  const backHref = useMemo(() => {
    if (type === "racun") return "/racuni";
    if (type === "dobavljac") return "/dobavljaci";
    if (type === "zaduzenje") return "/zaduzenja";
    return "/kupci";
  }, [type]);

  useEffect(() => {
    let alive = true;

    async function loadKartica() {
      if (!subjekt) {
        setRows([]);
        setLoading(false);
        setMode("GREŠKA");
        setErr("Nedostaje subjekt.");
        return;
      }

      setLoading(true);
      setMode("…");
      setErr("");

      try {
        const qs = new URLSearchParams();
        qs.set("subjekt", subjekt);
        qs.set("type", type);

        if (from) qs.set("od", from);
        if (to) qs.set("do", to);

        const r = await fetch(`/api/kartica?${qs.toString()}`, {
          cache: "no-store",
        });

        const j = await r.json().catch(() => null);
        if (!alive) return;

        if (r.ok && j?.ok) {
          setRows(Array.isArray(j.rows) ? j.rows : []);
          setMode("UČITANO");
        } else {
          setRows([]);
          setMode("GREŠKA");
          setErr(j?.error || `API error (${r.status})`);
        }
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setMode("GREŠKA");
        setErr(String(e?.message || e || "Greška pri učitavanju kartice."));
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadKartica();

    return () => {
      alive = false;
    };
  }, [subjekt, type, from, to]);

  const filtered = useMemo(() => {
    let r = rows;

    const fromIso = dateInputToIso(from);
    const toIso = dateInputToIso(to);

    if (fromIso) {
      const f = new Date(fromIso);
      r = r.filter((x) => new Date(x.DatumKnjizenja) >= f);
    }
    if (toIso) {
      const t = new Date(toIso);
      r = r.filter((x) => new Date(x.DatumKnjizenja) <= t);
    }
    return r;
  }, [rows, from, to]);

  function printKartica() {
    printReport({
      title: "Kartica",
      subject: `Kartica ${subjekt}`,
      subtitle: subjekt,
      meta: [
        { label: "Tip", value: type },
        { label: "Od", value: fmtDateInput(from) || "Sve" },
        { label: "Do", value: fmtDateInput(to) || "Sve" },
        { label: "Stavki", value: filtered.length.toLocaleString("bs-BA") },
      ],
      columns: [
        { key: "datum", label: "Datum" },
        { key: "dokument", label: "Dokument" },
        { key: "knjizenje", label: "Knjiženje" },
        { key: "duguje", label: "Duguje" },
        { key: "potrazuje", label: "Potražuje" },
        { key: "saldo", label: "Saldo" },
      ],
      rows: filtered.map((row) => ({
        datum: fmtDate(row.DatumKnjizenja),
        dokument: row.Dokument || "",
        knjizenje: row.BrojSaCrtama || row.Knjizenje || row.Broj || "",
        duguje: fmtMoney(row.Duguje || 0),
        potrazuje: fmtMoney(row.Potrazuje || 0),
        saldo: fmtMoney(row.SaldoKumulativno || 0),
      })),
    });
  }

  return (
    <main className="container page">
      <DesktopAppHeader title="Kartica" subtitle={subjekt} status={loading ? "Učitavanje…" : mode} />

      <div className="desktopActionRow">
        <Link className="pill clickable" href={backHref} role="button" tabIndex={0}>
          ← Nazad
        </Link>
      </div>

      <div className="topbar mobileOnlyHeader">
        <div>
          <div className="brand">Kartica</div>
          <div
            className="subtitle"
            style={{
              maxWidth: 520,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={subjekt}
          >
            {subjekt}
          </div>
        </div>

        <Link className="pill clickable" href={backHref} role="button" tabIndex={0}>
          ← Nazad
        </Link>
      </div>

      {/* Filter */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          marginTop: 8,
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <div className="small">Od</div>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            placeholder="DD.MM.YYYY"
            value={fmtDateInput(from)}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div className="small">Do</div>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            placeholder="DD.MM.YYYY"
            value={fmtDateInput(to)}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>

      <div className="sectionActionRow">
        <div className="sectionTitle" style={{ margin: 0 }}>Promet</div>
        <DocumentExportActions onPrint={printKartica} disabled={loading || !!err || !filtered.length} compact />
      </div>

      {loading && (
        <div className="card" style={{ marginTop: 10, opacity: 0.9 }}>
          <div className="small">Učitavanje podataka…</div>
        </div>
      )}

      {!loading && !!err && (
        <div className="card" style={{ marginTop: 10, opacity: 0.9 }}>
          <div className="small bad">{err}</div>
        </div>
      )}

      {!loading && !err && (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((r, idx) => (
            <div key={idx} className="card clickable" role="button" tabIndex={0}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 950,
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={r.Dokument}
                  >
                    {r.Dokument || "—"}
                  </div>

                  <div className="small" style={{ lineHeight: 1.3 }}>
                    Knjiženje: <b>{r.BrojSaCrtama || r.Knjizenje || r.Broj || "—"}</b>
                  </div>

                  <div className="small" style={{ lineHeight: 1.3 }}>
                    Datum: {fmtDate(r.DatumKnjizenja)}
                  </div>
                </div>

                <div style={{ textAlign: "right", flex: "0 0 auto" }}>
                  <div className="small">Saldo</div>
                  <div style={{ fontWeight: 950, fontSize: 14 }}>
                    {fmtMoney(r.SaldoKumulativno)}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginTop: 10,
                  borderTop: "1px solid var(--line)",
                  paddingTop: 10,
                }}
              >
                <div>
                  <div className="small">Duguje</div>
                  <div style={{ fontWeight: 950 }}>{fmtMoney(r.Duguje)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="small">Potražuje</div>
                  <div style={{ fontWeight: 950 }}>{fmtMoney(r.Potrazuje)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !err && !filtered.length && (
        <div className="card" style={{ marginTop: 10, opacity: 0.9 }}>
          <div className="small">Nema stavki za odabrani period.</div>
        </div>
      )}
    </main>
  );
}
