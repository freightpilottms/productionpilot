"use client";

import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import DocumentExportActions, { mailReport, printReport } from "@/app/_ui/DocumentExportActions";
import {
  CACHE_TTL_MS,
  fetchJsonWithAuth,
  preloadJsonWithAuth,
  readAuthSession,
  readCachedJson,
  refreshAuthSession,
  runWhenIdle,
  scopedCacheKey,
  writeCachedJson,
} from "@/app/_ui/clientCache";
import { cachedPermissions, normalizePermissions } from "@/app/_ui/permissions";
import { asRows, fmtDate, fmtMoney } from "@/lib/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TABS = [
  { key: "neplaceni", label: "Neplaćeni računi", subject: "Dobavljači", accountLabel: "Račun dobavljača", permission: "canViewDobavljaci" },
  { key: "neplaceniTabela", label: "Tabela računa", subject: "Detaljni pregled dobavljača", accountLabel: "Račun dobavljača", permission: "canViewDobavljaci", sourceType: "neplaceni", layout: "table" },
  { key: "nenaplaceni", label: "Nenaplaćeni računi", subject: "Kupci", accountLabel: "Račun kupca", permission: "canViewKupci" },
];

const PAGE_SIZE = 80;

function normalizeText(value) {
  return String(value || "").toLowerCase().trim();
}

function statusTone(status) {
  const clean = normalizeText(status);
  if (clean.includes("nepla")) return "bad";
  if (clean.includes("poslat")) return "good";
  if (clean.includes("priprem") || clean.includes("pla")) return "info";
  return "neutral";
}

function paymentPayload(row) {
  if (!row) return {};
  return {
    Broj: row.Broj,
    RedBr: row.RedBr,
    Subjekt: row.Subjekt,
    BrojSaCrtama: row.BrojSaCrtama,
    RacunDobavljaca: row.RacunDobavljaca || row.Racun,
    DatumDokumenta: row.DatumDokumenta,
    Referent: row.Referent,
  };
}

function missingPaymentFields(row) {
  const payload = paymentPayload(row);
  return ["Broj", "RedBr", "Subjekt", "BrojSaCrtama", "RacunDobavljaca", "DatumDokumenta"]
    .filter((key) => payload[key] === undefined || payload[key] === null || String(payload[key]).trim() === "");
}

function tabAllowed(permissions, tabKey) {
  const tab = TABS.find((item) => item.key === tabKey);
  if (!tab) return false;
  return permissions?.[tab.permission] !== false;
}

function firstAllowedTab(permissions) {
  return TABS.find((tab) => tabAllowed(permissions, tab.key))?.key || "";
}

function tabInfo(tabKey) {
  return TABS.find((item) => item.key === tabKey) || TABS[0];
}

function tabSourceType(tabKey) {
  const tab = tabInfo(tabKey);
  return tab.sourceType || tab.key;
}

function isPageVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export default function OtvoreneStavkePage() {
  const loadRef = useRef(null);
  const [active, setActive] = useState("neplaceni");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mode, setMode] = useState("...");
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({ totalRows: 0, totalIznosRacuna: 0, totalOtvoreno: 0, totalDospjelo: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [permissions, setPermissions] = useState(() => cachedPermissions());
  const [paymentRow, setPaymentRow] = useState(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");

  const visibleTabs = useMemo(() => TABS.filter((tab) => tabAllowed(permissions, tab.key)), [permissions]);
  const currentTab = tabInfo(active);
  const activeSourceType = tabSourceType(active);
  const isNeplaceniView = activeSourceType === "neplaceni";
  const tableMode = currentTab.layout === "table";

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    const nextTab = requestedTab && tabAllowed(permissions, requestedTab) ? requestedTab : firstAllowedTab(permissions);
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
    const timer = window.setTimeout(() => setQ(searchInput), 260);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const buildUrl = useCallback((tab = active, search = q.trim(), offset = 0, options = {}) => {
    const params = new URLSearchParams({
      type: tabSourceType(tab),
      pageSize: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (search) params.set("q", search);
    if (options.refresh) params.set("refresh", "1");
    return `/api/otvorene-stavke?${params.toString()}`;
  }, [active, q]);

  const cacheKeyFor = useCallback((tab = active, search = q.trim()) => {
    return scopedCacheKey(`otvorene-stavke:v2:${tab}:${search || "all"}`);
  }, [active, q]);

  function applyPayload(payload) {
    setRows(asRows(payload.rows));
    setTotals({
      totalRows: Number(payload.totalRows || 0),
      totalIznosRacuna: Number(payload.totalIznosRacuna || 0),
      totalOtvoreno: Number(payload.totalOtvoreno || 0),
      totalDospjelo: Number(payload.totalDospjelo || 0),
    });
    setHasMore(Boolean(payload.hasMore));
    setMode("UČITANO");
  }

  useEffect(() => {
    let alive = true;
    let timer = null;
    if (!active) return undefined;

    const activeSearch = q.trim();
    const cacheKey = cacheKeyFor(active, activeSearch);
    const cached = readCachedJson(cacheKey, CACHE_TTL_MS);

    if (cached?.data) {
      applyPayload(cached.data);
      setLoading(false);
    }

    async function load({ silent = false } = {}) {
      if (loadRef.current) return loadRef.current;

      if (!silent) {
        setLoading(true);
        setMode("...");
        if (!cached?.data) {
          setRows([]);
          setTotals({ totalRows: 0, totalIznosRacuna: 0, totalOtvoreno: 0, totalDospjelo: 0 });
          setHasMore(false);
        }
      }

      const promise = (async () => {
        try {
          const payload = await fetchJsonWithAuth(buildUrl(active, activeSearch, 0, { refresh: true }), {
            dedupeKey: `otvorene-stavke:${active}:${activeSearch || "all"}:0`,
            timeoutMs: 35000,
          });

          if (!alive) return;
          writeCachedJson(cacheKey, payload);
          applyPayload(payload);
        } catch {
          if (!alive) return;
          if (!readCachedJson(cacheKey, CACHE_TTL_MS)?.data) {
            setMode("GREŠKA");
            setRows([]);
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
    }, CACHE_TTL_MS);

    function refreshIfStale() {
      if (!isPageVisible()) return;
      const latest = readCachedJson(cacheKey, CACHE_TTL_MS);
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
  }, [active, buildUrl, cacheKeyFor, q]);

  useEffect(() => {
    return runWhenIdle(() => {
      TABS.filter((tab) => tab.key !== active && tabAllowed(permissions, tab.key)).forEach((tab) => {
        preloadJsonWithAuth(buildUrl(tab.key, "", 0), cacheKeyFor(tab.key, ""), {
          dedupeKey: `preload:otvorene-stavke:${tab.key}`,
          timeoutMs: 22000,
        });
      });
    }, 1600);
  }, [active, buildUrl, cacheKeyFor, permissions]);

  async function loadMoreRows() {
    if (loading || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const activeSearch = q.trim();
      const payload = await fetchJsonWithAuth(buildUrl(active, activeSearch, rows.length), {
        dedupeKey: `otvorene-stavke:${active}:${activeSearch || "all"}:${rows.length}`,
        timeoutMs: 35000,
      });
      const nextRows = asRows(payload.rows);
      const mergedRows = [...rows, ...nextRows];
      setRows(mergedRows);
      setTotals({
        totalRows: Number(payload.totalRows || 0),
        totalIznosRacuna: Number(payload.totalIznosRacuna || 0),
        totalOtvoreno: Number(payload.totalOtvoreno || 0),
        totalDospjelo: Number(payload.totalDospjelo || 0),
      });
      setHasMore(Boolean(payload.hasMore));
      setMode("UČITANO");
      writeCachedJson(cacheKeyFor(active, activeSearch), {
        ...payload,
        rows: mergedRows,
      });
    } catch {
      setMode("GREŠKA");
    } finally {
      setLoadingMore(false);
    }
  }

  const filteredRows = useMemo(() => {
    const needle = normalizeText(q);
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.Subjekt, row.Racun, row.Broj, row.BrojSaCrtama, row.Status, row.DatumDokumenta, row.DatumDospijeca, row.Referent]
        .map(normalizeText)
        .some((value) => value.includes(needle))
    );
  }, [q, rows]);

  function openPaymentDialog(row) {
    if (!isNeplaceniView || !row?.payable) return;
    setPaymentError("");
    setPaymentNotice("");
    setPaymentRow(row);
  }

  async function paySelectedRow() {
    if (!paymentRow || paymentBusy) return;

    const missing = missingPaymentFields(paymentRow);
    if (missing.length) {
      setPaymentError(`Nedostaju podaci iz view-a: ${missing.join(", ")}`);
      return;
    }

    setPaymentBusy(true);
    setPaymentError("");

    try {
      const result = await fetchJsonWithAuth("/api/otvorene-stavke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentPayload(paymentRow)),
        dedupeKey: false,
        timeoutMs: 60000,
      });

      setPaymentNotice(result.message || "Uplatnica je kreirana.");
      setPaymentRow(null);

      const activeSearch = q.trim();
      const payload = await fetchJsonWithAuth(buildUrl(active, activeSearch, 0, { refresh: true }), {
        dedupeKey: false,
        timeoutMs: 35000,
      });
      writeCachedJson(cacheKeyFor(active, activeSearch), payload);
      applyPayload(payload);
    } catch (error) {
      setPaymentError(String(error?.message || error || "Plaćanje nije uspjelo."));
    } finally {
      setPaymentBusy(false);
    }
  }

  function buildReport() {
    return {
      title: "Otvorene stavke",
      subject: currentTab.label,
      subtitle: currentTab.subject,
      meta: [
        { label: "Pregled", value: currentTab.label },
        { label: "Pretraga", value: q || "Bez pretrage" },
        { label: "Broj stavki", value: Number(totals.totalRows || 0).toLocaleString("bs-BA") },
      ],
      totals: [
        { label: "Otvoreno", value: fmtMoney(totals.totalOtvoreno) },
        { label: "Dospjelo", value: fmtMoney(totals.totalDospjelo) },
        { label: "Iznos računa", value: fmtMoney(totals.totalIznosRacuna) },
      ],
      columns: [
        { key: "subjekt", label: "Subjekt" },
        { key: "racun", label: currentTab.accountLabel },
        { key: "status", label: "Status" },
        { key: "datum", label: "Datum" },
        { key: "dospijece", label: "Dospijeće" },
        { key: "iznos", label: "Iznos računa" },
        { key: "otvoreno", label: "Otvoreno" },
        { key: "dospjelo", label: "Dospjelo" },
        { key: "referent", label: "Referent" },
      ],
      rows: filteredRows.map((row) => ({
        subjekt: row.Subjekt || "-",
        racun: row.Racun || "-",
        status: row.Status || "-",
        datum: fmtDate(row.DatumDokumenta),
        dospijece: fmtDate(row.DatumDospijeca),
        iznos: fmtMoney(row.IznosRacuna),
        otvoreno: fmtMoney(row.Otvoreno),
        dospjelo: fmtMoney(row.Dospjelo),
        referent: row.Referent || "-",
      })),
    };
  }

  return (
    <main className="container page">
      <DesktopAppHeader title="Otvorene stavke" subtitle="Neplaćeni i nenaplaćeni računi" status={loading ? "Učitavanje..." : mode} />

      <div className="topbar mobileOnlyHeader">
        <div>
          <div className="brand">Otvorene stavke</div>
          <div className="subtitle">Neplaćeni i nenaplaćeni računi</div>
        </div>

        <div className="pill clickable" role="button" tabIndex={0} title="Status">
          {loading ? "Učitavanje..." : mode}
        </div>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              className={"btn clickable" + (active === tab.key ? " activeTabBtn" : "")}
              type="button"
              onClick={() => {
                setActive(tab.key);
                window.history.replaceState(null, "", `/otvorene-stavke?tab=${encodeURIComponent(tab.key)}`);
              }}
              style={{ minHeight: 42 }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {!visibleTabs.length && (
          <div className="small bad" style={{ marginTop: 10 }}>
            Nemate pristup otvorenim stavkama kupaca ili dobavljača.
          </div>
        )}

        <input
          className="input"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Pretraga po subjektu, računu, datumu ili referentu..."
          style={{ marginTop: 10 }}
          disabled={!active}
        />
      </div>

      {paymentNotice && (
        <div className="card otvorenePaymentNotice" style={{ marginTop: 10 }} role="status">
          {paymentNotice}
        </div>
      )}

      <div className="card clickable" role="button" tabIndex={0} style={{ marginTop: 10 }}>
        <div className="cardTitle">Otvoreno:</div>
        <div className="big bad">{fmtMoney(totals.totalOtvoreno)}</div>
        <div className="small">{currentTab.label} - fokus je na otvorenom iznosu.</div>
      </div>

      <div className="grid2" style={{ marginTop: 10 }}>
        <div className="card">
          <div className="cardTitle">Dospjelo</div>
          <div className="big bad">{fmtMoney(totals.totalDospjelo)}</div>
          <div className="small">Ukupno dospjelo po trenutnoj pretrazi.</div>
        </div>
        <div className="card">
          <div className="cardTitle">Broj stavki</div>
          <div className="big">{Number(totals.totalRows || 0).toLocaleString("bs-BA")}</div>
          <div className="small">Računi u odabranom pregledu.</div>
        </div>
      </div>

      <div className="sectionActionRow">
        <div className="sectionTitle" style={{ margin: 0 }}>{currentTab.label}:</div>
        <DocumentExportActions
          onPrint={() => printReport(buildReport())}
          onMail={() => mailReport(buildReport())}
          disabled={loading || !filteredRows.length}
          compact
        />
      </div>

      {tableMode ? (
        <div className="tableWrap otvoreneDetailedTableWrap">
          <table className="table otvoreneDetailedTable">
            <thead>
              <tr>
                <th>Subjekt</th>
                <th>Dokument</th>
                <th>Interni broj</th>
                <th>Datum knjiženja</th>
                <th>Datum dokumenta</th>
                <th>Datum dospijeća</th>
                <th>Iznos računa</th>
                <th>Otvoreno</th>
                <th>Dospjelo</th>
                <th>Plati</th>
                <th>Status</th>
                <th>Dana kasni</th>
                <th>Do 30 dana</th>
                <th>Do 60 dana</th>
                <th>Do 90 dana</th>
                <th>Preko 90 dana</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={16}>Učitavanje...</td>
                </tr>
              )}

              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={16}>Nema podataka za odabrani pregled ili pretragu.</td>
                </tr>
              )}

              {!loading && filteredRows.map((row, index) => (
                <tr
                  key={`${row.Broj || row.Racun || ""}_${row.RedBr || index}_${row.Subjekt || ""}_table`}
                  className={row.payable ? "clickable" : ""}
                  onClick={() => openPaymentDialog(row)}
                >
                  <td title={row.Subjekt || "-"}>{row.Subjekt || "-"}</td>
                  <td title={row.RacunDobavljaca || row.Racun || "-"}>{row.RacunDobavljaca || row.Racun || "-"}</td>
                  <td title={row.BrojSaCrtama || row.Broj || "-"}>{row.BrojSaCrtama || row.Broj || "-"}</td>
                  <td>{fmtDate(row.DatumKnjizenja)}</td>
                  <td>{fmtDate(row.DatumDokumenta)}</td>
                  <td>{fmtDate(row.DatumDospijeca)}</td>
                  <td className="num">{fmtMoney(row.IznosRacuna)}</td>
                  <td className="num">{fmtMoney(row.Otvoreno)}</td>
                  <td className="num bad">{fmtMoney(row.Dospjelo)}</td>
                  <td>
                    {row.payable ? (
                      <button
                        className="btn clickable otvorenePayBtn"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openPaymentDialog(row);
                        }}
                      >
                        Plati
                      </button>
                    ) : "-"}
                  </td>
                  <td><span className={`otvoreneStatusChip ${statusTone(row.Status)}`}>{row.Status || "-"}</span></td>
                  <td className="num">{Number(row.DanaKasni || 0).toLocaleString("bs-BA")}</td>
                  <td className="num">{fmtMoney(row.KasniDO30dana)}</td>
                  <td className="num">{fmtMoney(row.KasniDO60dana)}</td>
                  <td className="num">{fmtMoney(row.KasniDO90dana)}</td>
                  <td className="num">{fmtMoney(row.KasniPreko90dana)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="list">
        {loading && (
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft">
              <div className="itemTitle">Učitavanje...</div>
              <div className="itemSub">Molimo sačekajte</div>
            </div>
            <div className="amount">-</div>
          </div>
        )}

        {!loading && filteredRows.length === 0 && (
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft">
              <div className="itemTitle">Nema otvorenih stavki</div>
              <div className="itemSub">Nema podataka za odabrani pregled ili pretragu.</div>
            </div>
            <div className="amount">-</div>
          </div>
        )}

        {!loading && filteredRows.map((row, index) => (
          <div
            key={`${row.Broj || row.Racun || ""}_${row.RedBr || index}_${row.Subjekt || ""}`}
            className={`item otvoreneItem ${isNeplaceniView && row.payable ? "clickable payable" : ""}`}
            role={isNeplaceniView && row.payable ? "button" : undefined}
            tabIndex={isNeplaceniView && row.payable ? 0 : undefined}
            onClick={() => openPaymentDialog(row)}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && isNeplaceniView && row.payable) {
                event.preventDefault();
                openPaymentDialog(row);
              }
            }}
          >
            <div className="itemLeft" style={{ minWidth: 0 }}>
              <div className="otvoreneItemHeader">
                <div className="itemTitle otvoreneItemTitle" title={row.Subjekt || "-"}>
                  {row.Subjekt || "-"}
                </div>
                {row.Status && (
                  <span className={`otvoreneStatusChip ${statusTone(row.Status)}`}>{row.Status}</span>
                )}
              </div>
              <div className="itemSub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentTab.accountLabel}: {row.Racun || "-"}
              </div>
              <div className="itemSub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Datum: {fmtDate(row.DatumDokumenta)} · Dospijeće: {fmtDate(row.DatumDospijeca || row.DatumDokumenta)} · Referent: {row.Referent || "-"}
              </div>
              <div className="itemSub">
                Iznos: {fmtMoney(row.IznosRacuna)} · Dospjelo: {fmtMoney(row.Dospjelo)}
              </div>
            </div>

            <div className="otvoreneItemRight">
              <div className="amount bad" title="Otvoreno">
                {fmtMoney(row.Otvoreno)}
              </div>
              {isNeplaceniView && row.payable && (
                <button
                  className="btn clickable otvorenePayBtn"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openPaymentDialog(row);
                  }}
                >
                  Plati
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      )}

      {!loading && hasMore && (
        <button
          className="btn clickable"
          type="button"
          onClick={loadMoreRows}
          disabled={loadingMore}
          style={{ width: "100%", marginTop: 10 }}
        >
          {loadingMore ? "Učitavanje..." : "Učitaj još"}
        </button>
      )}

      {paymentRow && (
        <div className="modalBack" role="dialog" aria-modal="true" aria-label="Potvrda plaćanja" onClick={() => !paymentBusy && setPaymentRow(null)}>
          <div className="modalCard otvorenePaymentDialog" onClick={(event) => event.stopPropagation()}>
            <div className="modalTitle">Plati račun?</div>
            <div className="small otvorenePaymentText">
              Kreira se uplatnica za odabrani neplaćeni račun.
            </div>

            <div className="otvorenePaymentSummary">
              <div><span>Dobavljač</span><b>{paymentRow.Subjekt || "-"}</b></div>
              <div><span>Račun</span><b>{paymentRow.RacunDobavljaca || paymentRow.Racun || "-"}</b></div>
              <div><span>Broj</span><b>{paymentRow.Broj || "-"}</b></div>
              <div><span>RedBr</span><b>{paymentRow.RedBr ?? "-"}</b></div>
              <div><span>Datum dokumenta</span><b>{fmtDate(paymentRow.DatumDokumenta)}</b></div>
              <div><span>Otvoreno</span><b>{fmtMoney(paymentRow.Otvoreno)}</b></div>
            </div>

            {paymentError && <div className="small bad otvorenePaymentError">{paymentError}</div>}

            <div className="otvorenePaymentActions">
              <button className="btn clickable" type="button" onClick={() => setPaymentRow(null)} disabled={paymentBusy}>
                Odustani
              </button>
              <button className="btn clickable activeTabBtn" type="button" onClick={paySelectedRow} disabled={paymentBusy}>
                {paymentBusy ? "Šaljem..." : "Plati"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
