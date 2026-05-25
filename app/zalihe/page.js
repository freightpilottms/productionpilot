"use client";
import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import DocumentExportActions, { printReport } from "@/app/_ui/DocumentExportActions";
import { BarChart, DashboardPanel, RingMetric, StatStrip, percentParts } from "@/app/_ui/DashboardWidgets";
import { fetchJsonWithAuth, readCachedJson, scopedCacheKey, writeCachedJson } from "@/app/_ui/clientCache";
import { useEqualHeights } from "@/app/_ui/useEqualHeights";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney } from "@/lib/format";
import { cachedPermissions } from "@/app/_ui/permissions";

function SkeletonRow({ i }) {
  return (
    <div key={"sk_" + i} className="item" style={{ opacity: 0.7 }}>
      <div className="itemLeft" style={{ minWidth: 0 }}>
        <div className="itemTitle" style={{ opacity: 0.9 }}>
          Učitavanje…
        </div>
        <div className="itemSub">Molimo sačekajte</div>
      </div>
      <div className="amount">—</div>
    </div>
  );
}

function mapScanItem(item) {
  if (!item) return null;

  return {
    SifraArtikla: item.SifraArtikla || item.sifraArtikla || "",
    NazivArtikla: item.NazivArtikla || item.nazivArtikla || "",
    Kolicina:
      item.Kolicina ??
      item.Zaliha ??
      item.KnjigovodstvenaKolicina ??
      item.kolicina ??
      0,
    Barcode: item.Barcode || item.Barkod || item.barcode || "",
    NC: item.NC ?? item.ProsjecnaNabavna ?? item.prosjecnaNabavna ?? 0,
    MPC: item.MPC ?? item.mpc ?? 0,
    VPC: item.VPC ?? item.vpc ?? 0,
  };
}

const STOCK_SCAN_STORAGE_KEY = "becleven:pending-stock-scan";
const ZALIHE_PAGE_SIZE = 250;
const ZALIHE_LOCAL_CACHE_TTL_MS = 8 * 60 * 1000;
const ZALIHE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function normalizeScanPayload(raw) {
  if (raw && typeof raw === "object") {
    return {
      code: String(raw.code || raw.value || "").trim(),
      token: String(raw.token || raw.id || "").trim(),
    };
  }

  return {
    code: String(raw || "").trim(),
    token: "",
  };
}

function consumePendingStockScan() {
  if (typeof window === "undefined") return { code: "", token: "" };

  try {
    const raw = sessionStorage.getItem(STOCK_SCAN_STORAGE_KEY);
    if (!raw) return { code: "", token: "" };

    sessionStorage.removeItem(STOCK_SCAN_STORAGE_KEY);
    const parsed = JSON.parse(raw);
    const code = String(parsed?.code || "").trim();
    const token = String(parsed?.token || "").trim();
    const at = Number(parsed?.at || 0);

    if (!code) return { code: "", token: "" };
    if (at && Date.now() - at > 30000) return { code: "", token: "" };

    return { code, token };
  } catch {
    try {
      sessionStorage.removeItem(STOCK_SCAN_STORAGE_KEY);
    } catch {}
    return { code: "", token: "" };
  }
}

export default function ZalihePage() {
  const router = useRouter();

  const scanLookupSeqRef = useRef(0);
  const handledScanTokenRef = useRef("");

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("…");
  const [rows, setRows] = useState([]);
  const [topKolicine, setTopKolicine] = useState([]);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState("sifra_asc");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalApproximate, setTotalApproximate] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [err, setErr] = useState("");
  const [canViewStockCost, setCanViewStockCost] = useState(() => cachedPermissions().canViewStockCost);
  const [scanModal, setScanModal] = useState({
    open: false,
    code: "",
    rows: [],
    loading: false,
    error: "",
  });

  const openScanLookup = useCallback(async (raw) => {
    const scan = String(raw || "").trim();

    if (!scan) return;

    const seq = scanLookupSeqRef.current + 1;
    scanLookupSeqRef.current = seq;
    setSearchInput(scan);
    setPage(1);
    setScanModal({
      open: true,
      code: scan,
      rows: [],
      loading: true,
      error: "",
    });

    try {
      const j = await fetchJsonWithAuth(`/api/zalihe/scan?code=${encodeURIComponent(scan)}`);
      if (scanLookupSeqRef.current !== seq) return;
      setCanViewStockCost((current) => j.permissions?.canViewStockCost ?? current);

      const rawRows = Array.isArray(j.rows)
        ? j.rows
        : j.item
          ? [j.item]
          : [];

      const mappedRows = rawRows
        .map(mapScanItem)
        .filter((item) => item && item.SifraArtikla);

      setScanModal({
        open: true,
        code: scan,
        rows: mappedRows,
        loading: false,
        error: mappedRows.length
          ? ""
          : `Artikal sa šifrom/barcode-om "${scan}" nije pronađen u zalihama.`,
      });
    } catch (e) {
      if (scanLookupSeqRef.current !== seq) return;

      setScanModal({
        open: true,
        code: scan,
        rows: [],
        loading: false,
        error: String(e?.message || e),
      });
    }
  }, []);

  const openUniqueScanLookup = useCallback((raw) => {
    const { code, token } = normalizeScanPayload(raw);
    if (!code) return;

    if (token) {
      const key = `${token}:${code}`;
      if (handledScanTokenRef.current === key) return;
      handledScanTokenRef.current = key;
    }

    openScanLookup(code);
  }, [openScanLookup]);

  function closeScanLookup() {
    setScanModal((current) => ({
      ...current,
      open: false,
      loading: false,
    }));
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, 300);

    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const pendingScan = consumePendingStockScan();
    openUniqueScanLookup(
      pendingScan.code
        ? pendingScan
        : { code: params.get("scan") || "", token: params.get("_") || "" }
    );

    function onBarcodeScan(e) {
      openUniqueScanLookup(e?.detail || "");
    }

    window.addEventListener("barcode-scan", onBarcodeScan);

    return () => {
      window.removeEventListener("barcode-scan", onBarcodeScan);
    };
  }, [openUniqueScanLookup]);

  useEffect(() => {
    if (!canViewStockCost && String(sort).startsWith("nc_")) {
      setSort("sifra_asc");
    }
  }, [canViewStockCost, sort]);

  useEffect(() => {
    let alive = true;
    let timer = null;

    const q = search.trim();
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("pageSize", String(ZALIHE_PAGE_SIZE));
    if (q) qs.set("q", q);

    const fastQs = new URLSearchParams(qs);
    fastQs.set("fast", "1");
    const fastUrl = `/api/zalihe?${fastQs.toString()}`;
    const refreshQs = new URLSearchParams(qs);
    refreshQs.set("refresh", "1");
    const refreshUrl = `/api/zalihe?${refreshQs.toString()}`;
    const cacheKey = scopedCacheKey(`zalihe:v4:${ZALIHE_PAGE_SIZE}:${page}:${q.toLowerCase()}`);
    const cached = readCachedJson(cacheKey, ZALIHE_LOCAL_CACHE_TTL_MS);

    if (cached?.data) {
      setRows(cached.data.rows || []);
      setTopKolicine(cached.data.topKolicine || []);
      setCanViewStockCost((current) => cached.data.permissions?.canViewStockCost ?? current);
      setTotal(Number(cached.data.total || 0));
      setTotalApproximate(Boolean(cached.data.totalApproximate));
      setTotalPages(Number(cached.data.totalPages || 1));
      setMode("UČITANO");
      setLoading(false);
      setErr("");
    }

    async function load({ silent = false } = {}) {
      if (!silent) {
        setLoading(true);
        setMode("…");
      }
      setErr("");

      try {
        if (!cached?.data && !silent) {
          try {
            const fastPayload = await fetchJsonWithAuth(fastUrl, {
              dedupeKey: `zalihe:fast:${page}:${q || "all"}`,
              timeoutMs: 12000,
            });

            if (!alive) return;

            writeCachedJson(cacheKey, fastPayload);
            setRows(fastPayload.rows || []);
            setTopKolicine(fastPayload.topKolicine || []);
            setCanViewStockCost((current) => fastPayload.permissions?.canViewStockCost ?? current);
            setTotal(Number(fastPayload.total || 0));
            setTotalApproximate(Boolean(fastPayload.totalApproximate));
            setTotalPages(Number(fastPayload.totalPages || 1));
            setMode("UČITANO");
            setLoading(false);
          } catch {}
        }

        const j = await fetchJsonWithAuth(refreshUrl, {
          dedupeKey: `zalihe:full:${page}:${q || "all"}`,
          timeoutMs: 45000,
        });

        if (!alive) return;

        writeCachedJson(cacheKey, j);
        setRows(j.rows || []);
        setTopKolicine(j.topKolicine || []);
        setCanViewStockCost((current) => j.permissions?.canViewStockCost ?? current);
        setTotal(Number(j.total || 0));
        setTotalApproximate(Boolean(j.totalApproximate));
        setTotalPages(Number(j.totalPages || 1));
        setMode("UČITANO");
      } catch (e) {
        if (!alive) return;
        if (!cached?.data) {
          setRows([]);
          setTopKolicine([]);
          setTotal(0);
          setTotalApproximate(false);
          setTotalPages(1);
          setMode("GREŠKA");
          setErr(String(e?.message || e));
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    if (!cached?.data || cached.stale || cached.data?.partial) {
      load({ silent: !!cached?.data });
    }

    timer = window.setInterval(() => {
      load({ silent: true });
    }, ZALIHE_REFRESH_INTERVAL_MS);

    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
    };
  }, [page, search]);

  function openArtikal(sifra) {
    router.push(`/zalihe/${encodeURIComponent(sifra)}`);
  }

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sort === "sifra_asc") {
        return String(a.SifraArtikla || "").localeCompare(String(b.SifraArtikla || ""));
      }
      if (sort === "sifra_desc") {
        return String(b.SifraArtikla || "").localeCompare(String(a.SifraArtikla || ""));
      }
      if (sort === "naziv_asc") {
        return String(a.NazivArtikla || "").localeCompare(String(b.NazivArtikla || ""));
      }
      if (sort === "naziv_desc") {
        return String(b.NazivArtikla || "").localeCompare(String(a.NazivArtikla || ""));
      }
      if (sort === "kolicina_asc") {
        return Number(a.Kolicina || 0) - Number(b.Kolicina || 0);
      }
      if (sort === "kolicina_desc") {
        return Number(b.Kolicina || 0) - Number(a.Kolicina || 0);
      }
      if (sort === "nc_asc") {
        if (!canViewStockCost) return 0;
        return (a.NC ?? 0) - (b.NC ?? 0);
      }
      if (sort === "nc_desc") {
        if (!canViewStockCost) return 0;
        return (b.NC ?? 0) - (a.NC ?? 0);
      }
      if (sort === "mpc_asc") {
        return Number(a.MPC || 0) - Number(b.MPC || 0);
      }
      if (sort === "mpc_desc") {
        return Number(b.MPC || 0) - Number(a.MPC || 0);
      }
      if (sort === "vpc_asc") {
        return Number(a.VPC || 0) - Number(b.VPC || 0);
      }
      if (sort === "vpc_desc") {
        return Number(b.VPC || 0) - Number(a.VPC || 0);
      }
      return 0;
    });
  }, [canViewStockCost, rows, sort]);

  const showSkeleton = loading && rows.length === 0;
  const totalLabel = `${Number(total || 0).toLocaleString("bs-BA")}${totalApproximate ? "+" : ""}`;
  const pagingActive = total > ZALIHE_PAGE_SIZE || totalPages > 1;
  const negativeCount = rows.filter((x) => Number(x.Kolicina || 0) < 0).length;
  const zeroCount = rows.filter((x) => Number(x.Kolicina || 0) === 0).length;
  const positiveCount = rows.filter((x) => Number(x.Kolicina || 0) > 0).length;
  const totalQtyLoaded = rows.reduce((a, x) => a + Number(x.Kolicina || 0), 0);
  const topStockRows = [...(topKolicine.length ? topKolicine : rows)]
    .sort((a, b) => Number(b.Kolicina || 0) - Number(a.Kolicina || 0))
    .slice(0, 30)
    .map((x) => ({ label: x.NazivArtikla || x.SifraArtikla || "—", value: Number(x.Kolicina || 0) }));
  const [positiveShare, zeroShare, negativeShare] = percentParts([positiveCount, zeroCount, negativeCount]);
  const listScrollable = sortedRows.length > 8;

  function printZalihe() {
    printReport({
      title: "Zalihe",
      subject: "Zalihe",
      subtitle: `Artikli - stranica ${page} od ${totalPages}`,
      meta: [
        { label: "Pretraga", value: search.trim() || "Sve" },
        { label: "Ukupno artikala", value: totalLabel },
        { label: "Prikazano", value: sortedRows.length.toLocaleString("bs-BA") },
      ],
      totals: [
        { label: "Količina na prikazu", value: Number(totalQtyLoaded || 0).toLocaleString("bs-BA") },
        { label: "Negativne", value: negativeCount.toLocaleString("bs-BA") },
      ],
      columns: [
        { key: "sifra", label: "Šifra" },
        { key: "naziv", label: "Naziv" },
        { key: "barcode", label: "Barcode" },
        { key: "kolicina", label: "Količina" },
        ...(canViewStockCost ? [{ key: "nc", label: "NC" }] : []),
        { key: "mpc", label: "MPC" },
        { key: "vpc", label: "VPC" },
      ],
      rows: sortedRows.map((row) => ({
        sifra: row.SifraArtikla || "",
        naziv: row.NazivArtikla || "",
        barcode: row.Barcode || "",
        kolicina: Number(row.Kolicina ?? 0).toLocaleString("bs-BA"),
        ...(canViewStockCost ? { nc: fmtMoney(row.NC || 0) } : {}),
        mpc: fmtMoney(row.MPC || 0),
        vpc: fmtMoney(row.VPC || 0),
      })),
    });
  }

  useEqualHeights(".equalGroup", [rows.length, topKolicine.length, loading, sort, search]);

  return (
    <main className="container page">
      <DesktopAppHeader title="Zalihe" subtitle="Trenutno stanje" status={loading ? "Učitavam…" : mode} />

      <div className="topbar mobileOnlyHeader">
        <div>
          <div className="brand">Zalihe</div>
          <div className="subtitle">Trenutno stanje</div>
        </div>

        <div className="pill clickable" role="button" tabIndex={0} title="Status">
          {loading ? "Učitavam…" : mode}
        </div>
      </div>

      <div className="dashboardGrid pageDashboardGrid">
        <DashboardPanel title="Sažetak zaliha" subtitle="Pregled učitane stranice">
          <StatStrip
            className="summaryStatStrip"
            items={[
              { label: "Artikala", value: totalLabel, sub: `${rows.length} prikazano` },
              { label: "Količina", value: Number(totalQtyLoaded || 0).toLocaleString("bs-BA"), tone: totalQtyLoaded < 0 ? "bad" : "good", sub: "Na stavkama" },
              { label: "Negativne", value: negativeCount.toLocaleString("bs-BA"), tone: negativeCount ? "bad" : "good", sub: "U prikazu" },
            ]}
          />
        </DashboardPanel>

        <DashboardPanel title="Količine" subtitle="Top po ukupnoj količini">
          <BarChart rows={topStockRows} maxRows={30} formatValue={(value) => Number(value || 0).toLocaleString("bs-BA")} className="barChartTextWide barChartInventory barChartScrollable" />
        </DashboardPanel>

        <DashboardPanel title="Struktura zaliha" subtitle="Omjer učitanih artikala">
          <div className="ringMetricGrid inventoryRingGrid">
            <RingMetric label="Pozitivne" value={positiveShare} detail={`${positiveCount} artikala`} tone="green" />
            <RingMetric label="Nula" value={zeroShare} detail={`${zeroCount} artikala`} tone="warn" />
            <RingMetric label="Negativne" value={negativeShare} detail={`${negativeCount} artikala`} tone="red" />
          </div>
        </DashboardPanel>
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        <div className="cardTitle">Pretraga</div>
        <input
          type="text"
          className="input"
          placeholder="Traži po šifri, nazivu ili barcode-u…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData?.getData("text") || "";
            const scan = String(pasted || "").trim();

            if (!scan) return;

            e.preventDefault();
            openScanLookup(scan);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const scan = String(searchInput || "").trim();
              if (scan) {
                e.preventDefault();
                setPage(1);
                setSearch(scan);
              }
            }
          }}
          style={{ marginTop: 8 }}
        />
        <div className="small" style={{ marginTop: 8 }}>
          Prikazano: <b>{sortedRows.length}</b> od <b>{rows.length}</b>
          {search.trim() ? (
            <>
              {" "}• Rezultata za pretragu: <b>{totalLabel}</b>
            </>
          ) : (
            <>
              {" "}• Ukupno: <b>{totalLabel}</b>
            </>
          )}
          {pagingActive && (
            <>
              {" "}• Str. <b>{page}</b> od <b>{totalPages}</b>
            </>
          )}
        </div>

        {!!err && (
          <div className="small bad" style={{ marginTop: 10 }}>
            {err}
          </div>
        )}
      </div>

      {scanModal.open && (
        <div className="scanModalBackdrop" role="dialog" aria-modal="true">
          <div className="scanModal">
            <div className="scanModalHead">
              <div>
                <div className="scanModalTitle">Skenirani artikal</div>
                <div className="scanModalCode">{scanModal.code}</div>
              </div>

              <button className="scanModalClose clickable" type="button" onClick={closeScanLookup} aria-label="Zatvori">
                ×
              </button>
            </div>

            {scanModal.loading && (
              <div className="scanModalEmpty">Učitavam podatke artikla…</div>
            )}

            {!scanModal.loading && scanModal.error && (
              <div className="scanModalEmpty bad">{scanModal.error}</div>
            )}

            {!scanModal.loading && !scanModal.error && (
              <div className="scanModalList">
                {scanModal.rows.map((item, index) => (
                  <button
                    key={`${item.SifraArtikla}_${index}`}
                    type="button"
                    className="scanModalItem clickable"
                    onClick={() => {
                      closeScanLookup();
                      openArtikal(item.SifraArtikla);
                    }}
                  >
                    <div className="scanModalItemMain">
                      <div className="scanModalItemTitle">{item.NazivArtikla || item.SifraArtikla}</div>
                      <div className="scanModalItemSub">Šifra: {item.SifraArtikla || "—"} • Barcode: {item.Barcode || "—"}</div>
                      <div className="scanModalMetaGrid">
                        {canViewStockCost && <span>NC: {fmtMoney(item.NC || 0)}</span>}
                        <span>MPC: {fmtMoney(item.MPC || 0)}</span>
                        <span>VPC: {fmtMoney(item.VPC || 0)}</span>
                      </div>
                    </div>

                    <div className={Number(item.Kolicina || 0) < 0 ? "scanModalQty bad" : "scanModalQty"}>
                      {Number(item.Kolicina || 0).toLocaleString("bs-BA")}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sectionActionRow">
        <div className="sectionTitle" style={{ margin: 0 }}>
          Artikli:
        </div>

        <div className="sectionActionControls">
          <DocumentExportActions onPrint={printZalihe} disabled={loading || !sortedRows.length} compact />
          <select
            className="input"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            style={{ maxWidth: 120 }}
          >
            <option value="sifra_asc">Šifra A–Z</option>
            <option value="sifra_desc">Šifra Z–A</option>
            <option value="naziv_asc">Naziv A–Z</option>
            <option value="naziv_desc">Naziv Z–A</option>
            <option value="kolicina_asc">Količina ↑</option>
            <option value="kolicina_desc">Količina ↓</option>
            {canViewStockCost && <option value="nc_asc">NC ↑</option>}
            {canViewStockCost && <option value="nc_desc">NC ↓</option>}
            <option value="mpc_asc">MPC ↑</option>
            <option value="mpc_desc">MPC ↓</option>
            <option value="vpc_asc">VPC ↑</option>
            <option value="vpc_desc">VPC ↓</option>
          </select>
        </div>
      </div>

      <div
        className="list"
        style={listScrollable ? {
          maxHeight: "530px",
          overflowY: "auto",
          overflowX: "hidden",
        } : undefined}
      >
        {showSkeleton && (
          <>
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonRow i={i} key={i} />
            ))}
          </>
        )}

        {!showSkeleton && !loading && sortedRows.length === 0 && (
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft" style={{ minWidth: 0 }}>
              <div className="itemTitle">
                {search.trim() ? "Nema rezultata" : "Nema artikala"}
              </div>
              <div className="itemSub">
                {search.trim()
                  ? "Nijedan artikal ne odgovara unesenoj pretrazi."
                  : "Podaci nisu dostupni."}
              </div>
            </div>
            <div className="amount">—</div>
          </div>
        )}

        {!showSkeleton &&
          sortedRows.map((x, i) => (
            <div
              key={`${x.SifraArtikla || ""}_${i}`}
              className="item clickable"
              role="button"
              tabIndex={0}
              onClick={() => openArtikal(x.SifraArtikla)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openArtikal(x.SifraArtikla);
                }
              }}
              title={String(x.SifraArtikla || "")}
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
                  Artikal: {x.SifraArtikla}
                </div>

                <div
                  className="itemSub"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {x.NazivArtikla || ""}
                </div>

                <div
                  className="itemSub"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  Barcode: {x.Barcode || "—"}
                </div>

                <div
                  className="itemSub"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {canViewStockCost ? <>NC: {fmtMoney(x.NC || 0)} • </> : null}MPC: {fmtMoney(x.MPC || 0)} • VPC: {fmtMoney(x.VPC || 0)}
                </div>
              </div>

              <div
                className="amount"
                style={{
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  color: Number(x.Kolicina ?? 0) < 0 ? "#ff4d4f" : undefined,
                  fontWeight: Number(x.Kolicina ?? 0) < 0 ? 600 : undefined,
                }}
              >
                {Number(x.Kolicina ?? 0).toLocaleString()}
              </div>
            </div>
          ))}
      </div>

      {pagingActive && (
        <div
          className="paginationRow"
        >
          <button
            className="btn clickable pagerBtn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            style={{ width: "auto", minWidth: 120 }}
          >
            ← Prethodna
          </button>

          <div className="small paginationStatus" style={{ marginTop: 0 }}>
            Stranica <b>{page}</b> od <b>{totalPages}</b>
          </div>

          <button
            className="btn clickable pagerBtn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            style={{ width: "auto", minWidth: 120 }}
          >
            Sljedeća →
          </button>
        </div>
      )}
    </main>
  );
}
