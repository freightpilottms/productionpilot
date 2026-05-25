"use client";
import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import DocumentExportActions, { printReport } from "@/app/_ui/DocumentExportActions";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { fmtDate } from "@/lib/format";

function statusChipStyle(status) {
  const s = String(status || "").toUpperCase();
  const base = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid var(--line)",
    background: "rgba(255,255,255,.04)",
    fontSize: 12,
    fontWeight: 900,
    color: "var(--pillText)",
    whiteSpace: "nowrap",
  };

  if (s.includes("ZAVR") || s.includes("CLOSE") || s.includes("DONE")) {
    return {
      ...base,
      background: "rgba(34,197,94,.14)",
      borderColor: "rgba(34,197,94,.28)",
      color: "var(--text)",
    };
  }

  if (s.includes("U TOKU") || s.includes("OPEN") || s.includes("ACTIVE") || s.includes("IZR")) {
    return {
      ...base,
      background: "rgba(96,165,250,.14)",
      borderColor: "rgba(96,165,250,.28)",
      color: "var(--text)",
    };
  }

  if (s.includes("GRE") || s.includes("ERR")) {
    return {
      ...base,
      background: "rgba(239,68,68,.12)",
      borderColor: "rgba(239,68,68,.26)",
      color: "var(--text)",
    };
  }

  return base;
}

export default function InventuraPage() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState("…");
  const [loading, setLoading] = useState(true);

  const loadInventure = useCallback(async (isAlive = () => true) => {
    setLoading(true);
    setMode("\u2026");

    try {
      const r = await fetch("/api/inventura", { cache: "no-store" });
      const j = await r.json();

      if (!isAlive()) return;

      if (r.ok && j?.ok) {
        setRows(j.rows || []);
        setMode("U\u010cITANO");
      } else {
        setRows([]);
        setMode("GRE\u0160KA");
      }
    } catch {
      if (!isAlive()) return;
      setRows([]);
      setMode("GRE\u0160KA");
    } finally {
      if (isAlive()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    loadInventure(() => alive);
    return () => {
      alive = false;
    };
  }, [loadInventure]);

  function openInventura(id) {
    router.push(`/inventura/${id}`);
  }

  function printInventure() {
    printReport({
      title: "Inventura",
      subject: "Inventura",
      subtitle: "Lista popisa",
      meta: [
        { label: "Ukupno", value: rows.length.toLocaleString("bs-BA") },
      ],
      columns: [
        { key: "id", label: "Inventura" },
        { key: "datum", label: "Datum" },
        { key: "skladiste", label: "Skladište" },
        { key: "status", label: "Status" },
      ],
      rows: rows.map((row) => ({
        id: row.Id || "",
        datum: fmtDate(row.Datum),
        skladiste: row.Skladiste || "",
        status: row.Status || "",
      })),
    });
  }

  return (
    <main className="container page">
      <DesktopAppHeader title="Inventura" subtitle="Lista popisa" status={loading ? "Učitavanje…" : mode} />
      <div className="topbar mobileOnlyHeader">
  <div>
    <div className="brand">Inventura</div>
    <div className="subtitle">Lista popisa</div>
  </div>

  <div className="pill clickable" role="button" tabIndex={0} title="Status">
    {loading ? "Učitavanje…" : mode}
  </div>
</div>
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div className="small" style={{ flex: 1, minWidth: 180 }}>
            Ukupno: <b>{rows.length}</b>
          </div>

          <DocumentExportActions onPrint={printInventure} disabled={loading || !rows.length} compact />

          <button
            className="btn clickable documentActionBtn"
            type="button"
            onClick={() => loadInventure()}
          >
            OSVJEŽI
          </button>
        </div>
      </div>

      <div className="sectionTitle">Inventure:</div>

      <div className={rows.length === 0 && !loading ? "" : "list"}>
        {loading && (
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft">
              <div className="itemTitle">Učitavanje…</div>
              <div className="itemSub">Molimo sačekajte</div>
            </div>
            <div className="amount">—</div>
          </div>
        )}

{!loading && rows.length === 0 && (
  <div
    className="card"
    style={{
    
      textAlign: "center",
      padding: 20,
      opacity: 0.9,
    }}
  >
    <div style={{ fontSize: 32 }}>📦</div>
    <div style={{ marginTop: 10, fontWeight: 900 }}>
      Nema inventura
    </div>
    <div className="small" style={{ marginTop: 6 }}>
      Ova baza trenutno nema unesenih inventura.
    </div>
  </div>
)}

        {rows.map((x) => (
          <div
            key={x.Id}
            className="item clickable"
            role="button"
            tabIndex={0}
            onClick={() => openInventura(x.Id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openInventura(x.Id);
              }
            }}
            title={`Inventura #${x.Id}`}
          >
            <div className="itemLeft">
              <div className="itemTitle">Inventura #{x.Id}</div>
              <div className="itemSub">
                {fmtDate(x.Datum)} · {x.Skladiste}
              </div>
            </div>

            <div style={statusChipStyle(x.Status)}>{x.Status}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
