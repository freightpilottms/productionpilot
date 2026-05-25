"use client";

import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import DocumentExportActions, { mailReport, printReport } from "@/app/_ui/DocumentExportActions";
import { fetchJsonWithAuth, preloadJsonWithAuth, readAuthSession, readCachedJson, refreshAuthSession, runWhenIdle, scopedCacheKey, writeCachedJson } from "@/app/_ui/clientCache";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { asRows, fmtMoney, fmtDate } from "@/lib/format";
import { cachedPermissions, firstAllowedIzdaniTab, moduleAllowed, normalizePermissions } from "@/app/_ui/permissions";

const TABS = [
  { key: "racuni", label: "Fakture" },
  { key: "predracuni", label: "Predračuni" },
  { key: "pos", label: "POS" },
];
const PAGE_SIZE = 80;
const IZDANI_LOCAL_CACHE_TTL_MS = 20 * 60 * 1000;
const IZDANI_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

function tabAllowed(permissions, tabKey) {
  if (tabKey === "racuni") return moduleAllowed(permissions, "fakture");
  return moduleAllowed(permissions, tabKey);
}

function normalizeText(v) {
  return String(v || "").toLowerCase().trim();
}

function isPageVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function posDocumentParts(displayBroj, fallbackLocation, fallbackDate) {
  const raw = String(displayBroj || "").trim();
  const separatorIndex = raw.indexOf(" - ");
  const title = separatorIndex > 0 ? raw.slice(0, separatorIndex).trim() : raw || fallbackDate;
  const location = separatorIndex > 0 ? raw.slice(separatorIndex + 3).trim() : String(fallbackLocation || "").trim();
  const skladisteBroj = location.match(/^\s*(\d+)/)?.[1] || "";
  return { title, skladisteBroj };
}

export default function IzdaniRacuniPage() {
  const loadRef = useRef(null);
  const [active, setActive] = useState("racuni");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("…");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [permissions, setPermissions] = useState(() => cachedPermissions());
  const visibleTabs = useMemo(() => TABS.filter((tab) => tabAllowed(permissions, tab.key)), [permissions]);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    const firstAllowed = firstAllowedIzdaniTab(permissions);
    const nextTab = requestedTab && tabAllowed(permissions, requestedTab) ? requestedTab : firstAllowed;
    if (nextTab && nextTab !== active) setActive(nextTab);
    if (!nextTab) {
      setActive("");
      setLoading(false);
      setMode("ZABRANJENO");
    }
  }, [active, permissions]);

  useEffect(() => {
    let alive = true;

    async function loadSessionPermissions() {
      const cached = readAuthSession();
      if (cached?.data?.permissions) {
        setPermissions(normalizePermissions(cached.data.permissions));
      }

      try {
        const session = await refreshAuthSession({ force: !cached?.data?.authenticated });
        if (!alive || !session?.authenticated) return;
        setPermissions(normalizePermissions(session.permissions));
      } catch {}
    }

    loadSessionPermissions();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(searchInput);
    }, 260);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const buildUrl = useCallback((tab = active, search = active === "pos" ? "" : q.trim(), offset = 0, options = {}) => {
    const params = new URLSearchParams({
      pageSize: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (options.fast) params.set("fast", "1");
    if (options.refresh) params.set("refresh", "1");
    if (tab !== "pos" && search) params.set("q", search);
    if (tab === "pos") {
      params.set("mode", "pos");
    } else {
      params.set("type", tab);
    }
    return `/api/izdani-racuni?${params.toString()}`;
  }, [active, q]);

  const cacheKeyFor = useCallback((tab = active, search = active === "pos" ? "" : q.trim()) => {
    return scopedCacheKey(`izdani-racuni:v7:${tab}:${search || "all"}`);
  }, [active, q]);

  useEffect(() => {
    let alive = true;
    let timer = null;
    if (!active) return undefined;
    const activeSearch = active === "pos" ? "" : q.trim();
    const cacheKey = cacheKeyFor(active, activeSearch);
    const cached = readCachedJson(cacheKey, IZDANI_LOCAL_CACHE_TTL_MS);

    if (cached?.data) {
      setRows(asRows(cached.data.rows));
      setTotal(Number(cached.data.total || 0));
      setHasMore(Boolean(cached.data.hasMore));
      setMode("UČITANO");
      setLoading(false);
    }

    async function load({ silent = false } = {}) {
      if (loadRef.current) return loadRef.current;

      if (!silent) {
        setLoading(true);
        setMode("…");
        if (!cached?.data) {
          setRows([]);
          setTotal(0);
        }
      }

      const promise = (async () => {
        try {
          if (!cached?.data && !silent) {
            try {
              const fastPayload = await fetchJsonWithAuth(buildUrl(active, activeSearch, 0, { fast: true }), {
                dedupeKey: `izdani:${active}:${activeSearch || "all"}:0:fast`,
                timeoutMs: 15000,
              });

              if (!alive) return;

              writeCachedJson(cacheKey, fastPayload);
              setRows(asRows(fastPayload.rows));
              setTotal(Number(fastPayload.total || 0));
              setHasMore(Boolean(fastPayload.hasMore));
              setMode("UČITANO");
              setLoading(false);
            } catch {}
          }

          const j = await fetchJsonWithAuth(buildUrl(active, activeSearch, 0, { refresh: true }), {
            dedupeKey: `izdani:${active}:${activeSearch || "all"}:0:full`,
            timeoutMs: 45000,
          });

          if (!alive) return;

          writeCachedJson(cacheKey, j);
          setRows(asRows(j.rows));
          setTotal(Number(j.total || 0));
          setHasMore(Boolean(j.hasMore));
          setMode("UČITANO");
        } catch {
          if (!alive) return;
          if (!readCachedJson(cacheKey, IZDANI_LOCAL_CACHE_TTL_MS)?.data) {
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

    if (!cached?.data || cached.stale || cached.data?.partial) {
      load({ silent: !!cached?.data });
    }

    timer = window.setInterval(() => {
      if (isPageVisible()) load({ silent: true });
    }, IZDANI_REFRESH_INTERVAL_MS);

    function refreshIfStale() {
      if (!isPageVisible()) return;
      const latest = readCachedJson(cacheKey, IZDANI_LOCAL_CACHE_TTL_MS);
      if (!latest?.data || latest.stale || latest.data?.partial) load({ silent: true });
    }

    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);

    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [active, buildUrl, cacheKeyFor, q]);

  useEffect(() => {
    return runWhenIdle(() => {
      TABS.filter((tab) => tab.key !== active).forEach((tab) => {
        if (!tabAllowed(permissions, tab.key)) return;
        preloadJsonWithAuth(buildUrl(tab.key, "", 0, { fast: true }), cacheKeyFor(tab.key, ""), {
          dedupeKey: `preload:izdani:${tab.key}`,
          timeoutMs: 22000,
        });
      });
    }, 1600);
  }, [active, buildUrl, cacheKeyFor, permissions]);

  async function loadMoreRows() {
    if (loading || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const activeSearch = active === "pos" ? "" : q.trim();
      const j = await fetchJsonWithAuth(buildUrl(active, activeSearch, rows.length), {
        dedupeKey: `izdani:${active}:${activeSearch || "all"}:${rows.length}`,
        timeoutMs: 35000,
      });
      const nextRows = asRows(j.rows);
      const mergedRows = [...rows, ...nextRows];
      setRows(mergedRows);
      setTotal((current) => Number(current || 0) + Number(j.total || 0));
      setHasMore(Boolean(j.hasMore));
      setMode("UČITANO");
      writeCachedJson(cacheKeyFor(active, activeSearch), {
        ...j,
        rows: mergedRows,
        total: Number(total || 0) + Number(j.total || 0),
      });
    } catch {
      setMode("GREŠKA");
    } finally {
      setLoadingMore(false);
    }
  }

  const filteredRows = useMemo(() => {
    const needle = active === "pos" ? "" : normalizeText(q);
    if (!needle) return rows;

    return rows.filter((x) => {
      return [x.racBroj, x.racBrojSaCrtama, x.racKupac, x.statusRac, x.racReferent, x.Lokacija]
        .map(normalizeText)
        .some((v) => v.includes(needle));
    });
  }, [active, q, rows]);

  const title = active === "pos" ? "POS promet" : active === "predracuni" ? "Predračuni" : "Fakture";

  function buildIzdaniReport() {
    const isPos = active === "pos";
    const reportTotal = filteredRows.reduce((sum, row) => sum + Number(row.sifRacArtikliZaPlatiti || 0), 0);
    const columns = isPos
      ? [
        { key: "datum", label: "Datum" },
        { key: "lokacija", label: "Trgovina / skladište" },
        { key: "brojRacuna", label: "Broj računa" },
        { key: "promet", label: "Promet" },
      ]
      : [
        { key: "kupac", label: "Kupac" },
        { key: "broj", label: "Broj" },
        { key: "datum", label: "Datum" },
        { key: "status", label: "Status" },
        { key: "referent", label: "Referent" },
        { key: "ukupno", label: "Ukupno" },
      ];

    const reportRows = filteredRows.map((x) => {
      if (isPos) {
        const displayBroj = String(x.racBrojSaCrtama || x.racBroj || "").trim() || "—";
        return {
          datum: fmtDate(x.racDatumRacuna),
          lokacija: x.Lokacija || "—",
          brojRacuna: displayBroj,
          promet: fmtMoney(x.sifRacArtikliZaPlatiti),
        };
      }

      return {
        kupac: x.racKupac || "—",
        broj: x.racBroj || "—",
        datum: fmtDate(x.racDatumRacuna),
        status: x.statusRac || "—",
        referent: x.racReferent || "—",
        ukupno: fmtMoney(x.sifRacArtikliZaPlatiti),
      };
    });

    return {
      title,
      subtitle: isPos ? "Tekuća godina, promet po dokumentima" : "Izdani računi",
      subject: title,
      meta: [
        ["Pregled", title],
        ["Pretraga", q || "Bez pretrage"],
        ["Broj stavki", filteredRows.length],
      ],
      columns,
      rows: reportRows,
      totals: [
        ["Ukupno", fmtMoney(reportTotal)],
      ],
    };
  }

  function printIzdani() {
    printReport(buildIzdaniReport());
  }

  function mailIzdani() {
    mailReport(buildIzdaniReport());
  }

  return (
    <main className="container page">
      <DesktopAppHeader title="Izdani računi" subtitle="Fakture, predračuni i POS promet" status={loading ? "Učitavanje…" : mode} />

      <div className="topbar mobileOnlyHeader">
        <div>
          <div className="brand">Izdani računi</div>
          <div className="subtitle">Fakture, predračuni i POS promet</div>
        </div>

        <div className="pill clickable" role="button" tabIndex={0} title="Status">
          {loading ? "Učitavanje…" : mode}
        </div>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {visibleTabs.map((x) => (
            <button
              key={x.key}
              className={"btn clickable" + (active === x.key ? " activeTabBtn" : "")}
              type="button"
              onClick={() => {
                setActive(x.key);
                window.history.replaceState(null, "", `/izdani-racuni?tab=${encodeURIComponent(x.key)}`);
              }}
              style={{ minHeight: 42 }}
            >
              {x.label}
            </button>
        ))}
        </div>

        {!visibleTabs.length && (
          <div className="small bad" style={{ marginTop: 10 }}>
            Nemate pristup fakturama, predračunima ili POS prometu.
          </div>
        )}

        {active !== "pos" && (
          <input
            className="input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Pretraga po broju, kupcu, statusu…"
            style={{ marginTop: 10 }}
          />
        )}
      </div>

      <div className="card clickable" role="button" tabIndex={0} style={{ marginTop: 10 }}>
        <div className="cardTitle">{title}:</div>
        <div className="big">{fmtMoney(total)}</div>
        <div className="small">
          {active === "pos"
            ? "Ukupan POS promet po dokumentima za tekuću godinu."
            : "Ukupan iznos prikazanih dokumenata."}
        </div>
      </div>

      <div className="sectionActionRow izdaniSectionActionRow">
        <div className="sectionTitle">{title}:</div>
        <DocumentExportActions onPrint={printIzdani} onMail={mailIzdani} disabled={loading || !filteredRows.length} compact />
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

        {!loading && filteredRows.length === 0 && (
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft">
              <div className="itemTitle">Nema podataka</div>
              <div className="itemSub">Podaci nisu dostupni za ovaj pregled.</div>
            </div>
            <div className="amount">—</div>
          </div>
        )}

        {!loading &&
          filteredRows.map((x, idx) => {
            const broj = String(x.racBroj || "").trim();
            const displayBroj = String(x.racBrojSaCrtama || broj || "").trim();
            if (active === "pos") {
              const datum = fmtDate(x.racDatumRacuna);
              const locationLabel = String(x.Lokacija || "").trim();
              const posParts = posDocumentParts(displayBroj, locationLabel, datum);
              const posTitle = posParts.title;
              return (
                <div key={`${posTitle}_${datum}_${idx}_pos`} className="item">
                  <div className="itemLeft" style={{ minWidth: 0 }}>
                    <div className="itemTitle" title={posTitle} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {posTitle}
                    </div>
                    {posParts.skladisteBroj && (
                      <div className="itemSub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Skladište: {posParts.skladisteBroj}
                      </div>
                    )}
                    <div className="itemSub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Datum: {datum}
                    </div>
                    <div className="itemSub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Tekuća godina, promet po dokumentu
                    </div>
                  </div>

                  <div className="amount good">{fmtMoney(x.sifRacArtikliZaPlatiti)}</div>
                </div>
              );
            }

            const content = (
              <>
                <div className="itemLeft" style={{ minWidth: 0 }}>
                  <div className="itemTitle" title={x.racKupac || broj} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {x.racKupac || "—"}
                  </div>
                  <div className="itemSub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Broj: {displayBroj || "—"}
                  </div>
                  {active !== "pos" && (
                    <div className="itemSub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Datum: {fmtDate(x.racDatumRacuna)} · Status: {x.statusRac || "—"}
                    </div>
                  )}
                </div>

                <div className="amount good">{fmtMoney(x.sifRacArtikliZaPlatiti)}</div>
              </>
            );

            return (
              <Link
                key={(broj || idx) + "_doc"}
                className="item clickable"
                href={`/izdani-racuni/${encodeURIComponent(active)}/${encodeURIComponent(broj)}?tab=${encodeURIComponent(active)}`}
              >
                {content}
              </Link>
            );
          })}
      </div>

      {!loading && hasMore && (
        <button
          className="btn clickable"
          type="button"
          onClick={loadMoreRows}
          disabled={loadingMore}
          style={{ width: "100%", marginTop: 10 }}
        >
          {loadingMore ? "Učitavanje…" : "Učitaj još"}
        </button>
      )}
    </main>
  );
}
