"use client";
import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import DocumentExportActions, { printReport } from "@/app/_ui/DocumentExportActions";
import { CACHE_TTL_MS, fetchJsonWithAuth, readCachedJson, scopedCacheKey, writeCachedJson } from "@/app/_ui/clientCache";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney } from "@/lib/format";

export default function ZaduzenjaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("…");
  const [rows, setRows] = useState([]);
  const [totalSaldo, setTotalSaldo] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer = null;
    const cacheKey = scopedCacheKey("zaduzenja:v2");
    const cached = readCachedJson(cacheKey);

    if (cached?.data) {
      setRows(cached.data.rows || []);
      setTotalSaldo(Number(cached.data.totalSaldo || 0));
      setMode("UČITANO");
      setLoading(false);
    }

    async function load({ silent = false } = {}) {
      if (!silent) {
        setLoading(true);
        setMode("…");
      }

      try {
        const j = await fetchJsonWithAuth("/api/zaduzenja");

        if (!alive) return;

        writeCachedJson(cacheKey, j);
        setRows(j.rows || []);
        setTotalSaldo(Number(j.totalSaldo || 0));
        setMode("UČITANO");
      } catch {
        if (!alive) return;
        if (!cached?.data) {
          setRows([]);
          setTotalSaldo(0);
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
  }, []);

  function openKonto(konto) {
    const clean = String(konto || "").trim();
    if (!clean) return;
    router.push(`/zaduzenja/${encodeURIComponent(clean)}`);
  }

  function printZaduzenja() {
    printReport({
      title: "Zaduženja",
      subject: "Zaduženja",
      subtitle: "Krediti/Pozajmice (banke)",
      meta: [
        { label: "Ukupno zaduženja", value: rows.length.toLocaleString("bs-BA") },
      ],
      totals: [
        { label: "Ukupno stanje", value: fmtMoney(totalSaldo) },
      ],
      columns: [
        { key: "subjekt", label: "Subjekt" },
        { key: "konto", label: "Kreditni račun" },
        { key: "saldo", label: "Saldo" },
      ],
      rows: rows.map((row) => ({
        subjekt: row.Subjekt || "Nepoznato",
        konto: row.Konto || "",
        saldo: fmtMoney(row.Saldo || 0),
      })),
    });
  }

  return (
    <main className="container page">
      <DesktopAppHeader title="Zaduženja" subtitle="Krediti/Pozajmice (banke)" status={loading ? "Učitavanje…" : mode} />
      <div className="topbar mobileOnlyHeader">
  <div>
    <div className="brand">Zaduženja</div>
    <div className="subtitle">Krediti/Pozajmice (banke)</div>
  </div>

  <div className="pill clickable" role="button" tabIndex={0} title="Status">
    {loading ? "Učitavanje…" : mode}
  </div>
</div>
      <div className="card" style={{ marginTop: 10 }}>
        <div className="cardTitle">Ukupno stanje</div>
        <div className="big bad">{fmtMoney(totalSaldo)}</div>
        <div className="small">Zbir stanja svih unešenih (kreditnih) dugovanja.</div>
      </div>

      <div className="sectionActionRow">
        <div className="sectionTitle" style={{ margin: 0 }}>Zaduženja:</div>
        <DocumentExportActions onPrint={printZaduzenja} disabled={loading || !rows.length} compact />
      </div>
      <div className="list">
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
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft">
              <div className="itemTitle">Nema zaduženja</div>
              <div className="itemSub">
                Podaci nisu dostupni. Najvjerovatnije dugovanja nisu unešena.
              </div>
            </div>
            <div className="amount">—</div>
          </div>
        )}

        {rows.map((x, idx) => (
          <div
            key={(x.Konto || x.Subjekt || "") + "_" + idx}
            className={`item ${x.Konto ? "clickable" : ""}`.trim()}
            role={x.Konto ? "button" : undefined}
            tabIndex={x.Konto ? 0 : undefined}
            onClick={() => openKonto(x.Konto)}
            onKeyDown={(e) => {
              if (!x.Konto) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openKonto(x.Konto);
              }
            }}
            title={x.Subjekt || "Nepoznato"}
          >
            <div className="itemLeft" style={{ minWidth: 0 }}>
              <div
                className="itemTitle"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {x.Subjekt || "Nepoznato"}
              </div>

              <div
                className="itemSub"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Kreditni račun: {x.Konto || "—"}
              </div>
            </div>

            <div className="amount bad">
              {fmtMoney(x.Saldo)}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
