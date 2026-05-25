"use client";
import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import DocumentExportActions, { printReport } from "@/app/_ui/DocumentExportActions";
import { BarChart, DashboardPanel, RingMetric, StatStrip, percentParts } from "@/app/_ui/DashboardWidgets";
import { CACHE_TTL_MS, fetchJsonWithAuth, readCachedJson, scopedCacheKey, writeCachedJson } from "@/app/_ui/clientCache";
import { useEqualHeights } from "@/app/_ui/useEqualHeights";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { asRows, fmtMoney, fmtDate } from "@/lib/format";

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

function dueAmount(row) {
  return Math.max(0, Number(row?.Dospjelo || 0));
}

function overdueDays(row) {
  return Math.max(0, Number(row?.DanaKasni || 0));
}

function hasDueInfo(row) {
  return row?.Dospjelo !== null && row?.Dospjelo !== undefined && (dueAmount(row) > 0 || overdueDays(row) > 0);
}

export default function KupciPage() {
  const [mode, setMode] = useState("…");
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("saldo_desc");
  const [q, setQ] = useState("");

  const router = useRouter();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  const title = useMemo(() => `Kupci`, []);

  useEffect(() => {
    let alive = true;
    let timer = null;

    const apiSort =
      sort === "saldo_asc" || sort === "saldo_desc" ? "saldo" : "subjekt";
    const apiDir =
      sort === "name_desc" || sort === "saldo_desc" ? "desc" : "asc";
    const url =
      `/api/kupci?q=${encodeURIComponent(q)}` +
      `&sort=${apiSort}&dir=${apiDir}`;
    const cacheKey = scopedCacheKey(`kupci:v2:${apiSort}:${apiDir}:${q.trim().toLowerCase()}`);
    const cached = readCachedJson(cacheKey);

    if (cached?.data) {
      setRows(asRows(cached.data.rows));
      setTotal(Number(cached.data.total || 0));
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
        setRows(asRows(j.rows));
        setTotal(Number(j.total || 0));
        setMode("UČITANO");
      } catch {
        if (!alive) return;
        if (!cached?.data) {
          setRows([]);
          setTotal(0);
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
  }, [q, sort]);

  function openKupac(subjekt) {
    router.push(`/kupci/${encodeURIComponent(subjekt)}`);
  }

  const showSkeleton = loading && rows.length === 0;

  const sortedRows = [...rows].sort((a, b) => {
    if (sort === "name_asc") {
      return (a.Subjekt || "").localeCompare(b.Subjekt || "");
    }
    if (sort === "name_desc") {
      return (b.Subjekt || "").localeCompare(a.Subjekt || "");
    }
    if (sort === "saldo_asc") {
      return Number(a.Saldo || 0) - Number(b.Saldo || 0);
    }
    if (sort === "saldo_desc") {
      return Number(b.Saldo || 0) - Number(a.Saldo || 0);
    }
    return 0;
  });
  const saldoPozitivno = rows.reduce((a, x) => a + Math.max(0, Number(x.Saldo || 0)), 0);
  const preplate = rows.reduce((a, x) => a + Math.abs(Math.min(0, Number(x.Saldo || 0))), 0);
  const dospjelo = rows.reduce((a, x) => a + Math.max(0, Number(x.Dospjelo || 0)), 0);
  const kasniCount = rows.filter((x) => Number(x.DanaKasni || 0) > 0 || Number(x.Dospjelo || 0) > 0).length;
  const activeCount = rows.filter((x) => Number(x.Saldo || 0) > 0).length;
  const preplateCount = rows.filter((x) => Number(x.Saldo || 0) < 0).length;
  const zeroCount = rows.filter((x) => Number(x.Saldo || 0) === 0).length;
  const topChartRows = [...rows]
    .sort((a, b) => Math.abs(Number(b.Saldo || 0)) - Math.abs(Number(a.Saldo || 0)))
    .slice(0, 30)
    .map((x) => ({ label: x.Subjekt || "—", value: Number(x.Saldo || 0) }));
  const [positiveShare, preplateShare, zeroShare] = percentParts([activeCount, preplateCount, zeroCount]);
  const listScrollable = sortedRows.length > 7;
  const totalCountLabel = Number(total || rows.length).toLocaleString("bs-BA");

  function printKupci() {
    printReport({
      title,
      subject: title,
      subtitle: "Lista kupaca",
      meta: [
        { label: "Pretraga", value: q.trim() || "Sve" },
        { label: "Ukupno kupaca", value: totalCountLabel },
      ],
      totals: [
        { label: "Potraživanja", value: fmtMoney(saldoPozitivno) },
        { label: "Dospjelo", value: fmtMoney(dospjelo) },
        { label: "Preplate", value: fmtMoney(preplate) },
      ],
      columns: [
        { key: "subjekt", label: "Kupac" },
        { key: "zadnje", label: "Zadnje knjiženje" },
        { key: "dospjelo", label: "Dospjelo" },
        { key: "kasni", label: "Dana kasni" },
        { key: "saldo", label: "Saldo" },
      ],
      rows: sortedRows.map((row) => ({
        subjekt: row.Subjekt || "",
        zadnje: fmtDate(row.ZadnjiDatumKnjizenja),
        dospjelo: fmtMoney(row.Dospjelo || 0),
        kasni: row.DanaKasni ?? "",
        saldo: fmtMoney(row.Saldo || 0),
      })),
    });
  }

  useEqualHeights(".equalGroup", [rows.length, loading, sort, q]);

  return (
    <main className="container page">
      <DesktopAppHeader title={title} subtitle="Lista kupaca" status={loading ? "Učitavanje…" : mode} />

      <div className="topbar mobileOnlyHeader">
        <div>
          <div className="brand">{title}</div>
          <div className="subtitle">Lista kupaca</div>
        </div>

        <div className="pill clickable" role="button" tabIndex={0} title="Status">
          {loading ? "Učitavanje…" : mode}
        </div>
      </div>

      <div className="dashboardGrid pageDashboardGrid">
        <DashboardPanel
          title="Sažetak kupaca"
          subtitle="Stanje i preplate"
          meta={
            <div className="dashboardHeadMetric" title="Ukupan broj kupaca">
              <span>Ukupno kupaca:</span>
              <strong>{totalCountLabel}</strong>
            </div>
          }
        >
          <StatStrip
            className="summaryStatStrip"
            items={[
              { label: "Potraživanja", value: fmtMoney(saldoPozitivno), tone: "good", sub: `${activeCount} aktivnih salda` },
              { label: "Dospjelo", value: fmtMoney(dospjelo), tone: dospjelo > 0 ? "bad" : "good", sub: `${kasniCount} kasni` },
              { label: "Preplate", value: fmtMoney(preplate), tone: "bad", sub: `${preplateCount} negativnih salda` },
            ]}
          />
        </DashboardPanel>

        <DashboardPanel title="Najveća salda" subtitle="Top po apsolutnom iznosu">
          <BarChart rows={topChartRows} maxRows={30} className="barChartTextWide barChartScrollable" />
        </DashboardPanel>

        <DashboardPanel title="Struktura" subtitle="Omjer kupaca po saldu">
          <div className="ringMetricGrid">
            <RingMetric label="Aktivni" value={positiveShare} detail={`${activeCount} kupaca`} tone="green" />
            <RingMetric label="Preplate" value={preplateShare} detail={`${preplateCount} kupaca`} tone="warn" />
            <RingMetric label="Nula" value={zeroShare} detail={`${zeroCount} kupaca`} tone="blue" />
          </div>
        </DashboardPanel>
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        <div className="cardTitle">Pretraga</div>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
          }}
          placeholder="Traži po nazivu kupca…"
          className="input"
        />
        <div className="small" style={{ marginTop: 8 }}>
          Ukupno: {total}
        </div>
      </div>

      <div className="sectionActionRow partnerListActionRow">
        <div className="sectionTitle" style={{ margin: 0 }}>
          Lista kupaca:
        </div>

        <div className="sectionActionControls partnerListActions">
          <DocumentExportActions onPrint={printKupci} disabled={loading || !sortedRows.length} compact />
          <select
            className="input"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            style={{ width: 88 }}
          >
            <option value="name_asc">Ime A–Z</option>
            <option value="name_desc">Ime Z–A</option>
            <option value="saldo_asc">Iznos ↑</option>
            <option value="saldo_desc">Iznos ↓</option>
          </select>
        </div>
      </div>

      <div
        className="list"
        style={listScrollable ? {
          maxHeight: "540px",
          overflowY: "auto",
          overflowX: "hidden",
        } : undefined}
      >
        {showSkeleton && (
          <>
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow i={i} key={i} />
            ))}
          </>
        )}

        {!showSkeleton && sortedRows.length === 0 && (
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft" style={{ minWidth: 0 }}>
              <div className="itemTitle">Nema rezultata</div>
              <div className="itemSub">Pokušaj drugačiju pretragu</div>
            </div>
            <div className="amount">—</div>
          </div>
        )}

        {!showSkeleton &&
          sortedRows.map((x, idx) => (
            <div
              key={(x.Subjekt || "") + "_" + idx}
              className="item clickable"
              role="button"
              tabIndex={0}
              onClick={() => openKupac(x.Subjekt)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openKupac(x.Subjekt);
                }
              }}
              title={x.Subjekt}
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
                  {x.Subjekt}
                </div>
                <div
                  className="itemSub"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  Zadnje knjiženje: {fmtDate(x.ZadnjiDatumKnjizenja)}
                </div>
                {hasDueInfo(x) && (
                  <div className="itemSub partnerDueLine">
                    <span>Dospjelo: {fmtMoney(dueAmount(x))}</span>
                    <span className="partnerDelayText">· Kasni: {overdueDays(x)} dana</span>
                  </div>
                )}
              </div>

              <div
                className={"amount " + (Number(x.Saldo) < 0 ? "bad" : "good")}
                style={{ whiteSpace: "nowrap", flexShrink: 0 }}
              >
                {fmtMoney(x.Saldo)}
              </div>
            </div>
          ))}
      </div>
    </main>
  );
}
