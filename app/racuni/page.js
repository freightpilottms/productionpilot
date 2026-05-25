"use client";
import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import DocumentExportActions, { printReport } from "@/app/_ui/DocumentExportActions";
import { fetchJsonWithAuth, readCachedJson, runWhenIdle, scopedCacheKey, writeCachedJson } from "@/app/_ui/clientCache";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { asRows, fmtMoney, fmtDate } from "@/lib/format";

const RACUNI_LOCAL_CACHE_TTL_MS = 20 * 60 * 1000;
const RACUNI_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

function pickAccountValue(row) {
  return (
    row?.TekuciRacun ||
    row?.["Tekući račun"] ||
    row?.BrojRacuna ||
    row?.BrojRacunaSaCrtama ||
    row?.Racun ||
    row?.Konto ||
    ""
  );
}

function isPageVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export default function RacuniPage() {
  const router = useRouter();
  const loadRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("…");
  const [rows, setRows] = useState([]);
  const [totalSaldo, setTotalSaldo] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer = null;
    const cacheKey = scopedCacheKey("racuni:v4");
    const cached = readCachedJson(cacheKey, RACUNI_LOCAL_CACHE_TTL_MS);

    if (cached?.data) {
      setRows(asRows(cached.data.rows));
      setTotalSaldo(Number(cached.data.totalSaldo || 0));
      setMode("UČITANO");
      setLoading(false);
    }

    async function load({ silent = false } = {}) {
      if (loadRef.current) return loadRef.current;

      if (!silent) {
        setLoading(true);
        setMode("…");
      }

      const promise = (async () => {
        try {
          const j = await fetchJsonWithAuth("/api/racuni?refresh=1", {
            dedupeKey: "racuni:list",
            timeoutMs: 45000,
          });

          if (!alive) return;

          writeCachedJson(cacheKey, j);
          setRows(asRows(j.rows));
          setTotalSaldo(Number(j.totalSaldo || 0));
          setMode("UČITANO");
        } catch {
          if (!alive) return;
          if (!readCachedJson(cacheKey, RACUNI_LOCAL_CACHE_TTL_MS)?.data) {
            setRows([]);
            setTotalSaldo(0);
            setMode("GREŠKA");
          }
        } finally {
          if (alive) setLoading(false);
          loadRef.current = null;
        }
      })();

      loadRef.current = promise;
      return promise;
    }

    if (!cached?.data || cached.stale) {
      load({ silent: !!cached?.data });
    }

    timer = window.setInterval(() => {
      if (isPageVisible()) load({ silent: true });
    }, RACUNI_REFRESH_INTERVAL_MS);

    function refreshIfStale() {
      if (!isPageVisible()) return;
      const latest = readCachedJson(cacheKey, RACUNI_LOCAL_CACHE_TTL_MS);
      if (!latest?.data || latest.stale) load({ silent: true });
    }

    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);

    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, []);

  useEffect(() => {
    if (!rows.length) return undefined;

    return runWhenIdle(() => {
      rows.slice(0, 8).forEach((row) => {
        const raw = pickAccountValue(row);
        const racun = String(raw || "").trim();
        if (racun) router.prefetch(`/racuni/${encodeURIComponent(racun)}`);
      });
    }, 1200);
  }, [router, rows]);

  function openKonto(row) {
    const raw = pickAccountValue(row);
    const racun = String(raw || "").trim();

    if (!racun) return;

    router.push(`/racuni/${encodeURIComponent(racun)}`);
  }

  function printRacuni() {
    printReport({
      title: "Računi",
      subject: "Računi",
      subtitle: "Lista računa (banke)",
      meta: [
        { label: "Ukupno računa", value: rows.length.toLocaleString("bs-BA") },
      ],
      totals: [
        { label: "Ukupno stanje", value: fmtMoney(totalSaldo) },
      ],
      columns: [
        { key: "naziv", label: "Naziv" },
        { key: "racun", label: "Račun" },
        { key: "konto", label: "Konto" },
        { key: "zadnje", label: "Zadnje knjiženje" },
        { key: "saldo", label: "Saldo" },
      ],
      rows: rows.map((row) => ({
        naziv: row.Naziv || pickAccountValue(row) || row.Konto || "",
        racun: pickAccountValue(row),
        konto: row.Konto || "",
        zadnje: fmtDate(row.ZadnjiDatumKnjizenja),
        saldo: fmtMoney(row.Saldo || 0),
      })),
    });
  }

  return (
    <main className="container page">
      <DesktopAppHeader title="Računi" subtitle="Lista računa (banke)" status={loading ? "Učitavanje…" : mode} />
      <div className="topbar mobileOnlyHeader">
  <div>
    <div className="brand">Računi</div>
    <div className="subtitle">Lista računa (banke)</div>
  </div>

  <div className="pill clickable" role="button" tabIndex={0} title="Status">
    {loading ? "Učitavanje…" : mode}
  </div>
</div>
      <div className="card clickable" role="button" tabIndex={0} style={{ marginTop: 10 }}>
        <div className="cardTitle">Ukupno stanje:</div>
        <div className="big">{fmtMoney(totalSaldo)}</div>
        <div className="small">Zbir stanja svih unešenih bankovnih računa.</div>
      </div>

      <div className="sectionActionRow">
        <div className="sectionTitle" style={{ margin: 0 }}>Računi:</div>
        <DocumentExportActions onPrint={printRacuni} disabled={loading || !rows.length} compact />
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
              <div className="itemTitle">Nema računa</div>
              <div className="itemSub">
                Podaci nisu dostupni. Najvjerovatnije nisu unešeni računi.
              </div>
            </div>
            <div className="amount">—</div>
          </div>
        )}

        {rows.map((x, idx) => {
          const racunPrikaz = pickAccountValue(x);

          return (
            <div
              key={(racunPrikaz || x.Konto || "") + "_" + idx}
              className="item clickable"
              role="button"
              tabIndex={0}
              onClick={() => openKonto(x)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openKonto(x);
                }
              }}
              title={racunPrikaz ? `Račun ${racunPrikaz}` : `Konto ${x.Konto || ""}`}
            >
              <div className="itemLeft" style={{ minWidth: 0 }}>
                <div
                  className="itemTitle"
                  title={x.Naziv || racunPrikaz || x.Konto}
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {x.Naziv || racunPrikaz || x.Konto}
                </div>

                <div
                  className="itemSub"
                  title={racunPrikaz || x.Konto}
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  Račun: {racunPrikaz || "—"}
                </div>

                <div
                  className="itemSub"
                  title={fmtDate(x.ZadnjiDatumKnjizenja)}
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  Zadnje knjiženje: {fmtDate(x.ZadnjiDatumKnjizenja)}
                </div>
              </div>

              <div className={"amount " + (Number(x.Saldo) < 0 ? "bad" : "good")}>
                {fmtMoney(x.Saldo)}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
