"use client";

import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import { BarChart, DashboardPanel, LineChart, PermissionDeniedOverlay } from "@/app/_ui/DashboardWidgets";
import LogoHomeButton from "@/app/_ui/LogoHomeButton";
import { fetchJsonWithAuth, preloadJsonWithAuth, readAuthSession, readCachedJson, refreshAuthSession, runWhenIdle, scopedCacheKey, setActiveCacheScope, writeCachedJson } from "@/app/_ui/clientCache";
import { useEqualHeights } from "@/app/_ui/useEqualHeights";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { amountFitClass, fmtMoney, fmtDate } from "@/lib/format";
import { moduleAllowed, normalizePermissions } from "@/app/_ui/permissions";

const HOME_LOCAL_CACHE_TTL_MS = 20 * 60 * 1000;
const HOME_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

function ModuleIcon({ name }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
  };

  if (name === "receipt") {
    return (
      <svg {...props}>
        <path d="M6 3h12v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L6 21z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </svg>
    );
  }

  if (name === "quote") {
    return (
      <svg {...props}>
        <path d="M5 5h14v14H5z" />
        <path d="M8 9h8" />
        <path d="M8 13h5" />
        <path d="M15 16l2 2" />
      </svg>
    );
  }

  if (name === "pos") {
    return (
      <svg {...props}>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8 7h8" />
        <path d="M8 11h8" />
        <path d="M9 16h.01" />
        <path d="M12 16h.01" />
        <path d="M15 16h.01" />
      </svg>
    );
  }

  return (
    <svg {...props}>
      <path d="M3 7.5 8 5l5 2.5-5 2.5z" />
      <path d="M8 10v6l-5-2.5v-6" />
      <path d="m8 16 5-2.5v-6" />
      <path d="m11 12.5 5-2.5 5 2.5-5 2.5z" />
      <path d="M16 15v6l-5-2.5v-6" />
      <path d="m16 21 5-2.5v-6" />
    </svg>
  );
}

function normalizeHome(payload) {
  const t = payload?.totals || {};
  return {
    ok: !!payload?.ok,
    totals: {
      racuni: t.racuni ?? 0,
      zaduzenja: t.zaduzenja ?? 0,
      dobavljaci: t.dobavljaci ?? t.saldoDobavljaci ?? 0,
      kupci: t.kupci ?? t.saldoKupci ?? 0,
      preplateKupci: t.preplateKupci ?? 0,
      preplateDobavljaci: t.preplateDobavljaci ?? 0,
    },
    top5: payload?.top5 || payload?.top3 || { kupci: [], dobavljaci: [] },
    meta: payload?.meta || null,
    permissions: payload?.permissions || null,
    partial: Boolean(payload?.partial),
  };
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

function LockableCard({ allowed, onClick, children }) {
  return (
    <div
      className={`card ${allowed ? "clickable" : "permissionLocked"}`}
      role={allowed ? "button" : "group"}
      tabIndex={allowed ? 0 : -1}
      onClick={allowed ? onClick : undefined}
      aria-disabled={allowed ? undefined : "true"}
    >
      <div className={allowed ? "" : "permissionLockedBlur"}>{children}</div>
      {!allowed && <PermissionDeniedOverlay />}
    </div>
  );
}

function LockableModuleItem({ allowed, onClick, item }) {
  return (
    <div
      className={`moduleOverviewItem ${allowed ? "clickable" : "permissionLocked permissionLockedInline"}`}
      role={allowed ? "button" : "group"}
      tabIndex={allowed ? 0 : -1}
      onClick={allowed ? onClick : undefined}
      aria-disabled={allowed ? undefined : "true"}
    >
      <div className={allowed ? "moduleOverviewContent" : "moduleOverviewContent permissionLockedBlur"}>
        <div className="moduleOverviewIcon"><ModuleIcon name={item.icon} /></div>
        <div className="moduleOverviewText">
          <div className="itemTitle">{item.label}</div>
          <div className="itemSub">{item.sub}</div>
        </div>
        <div className="amount good">{item.value}</div>
      </div>
      {!allowed && <PermissionDeniedOverlay />}
    </div>
  );
}

function setThemeOnHtml(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("theme", theme);
  } catch {}
}

function getSavedTheme() {
  if (typeof window === "undefined") return "dark";
  try {
    return localStorage.getItem("theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function isPageVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function WeekdayCompareChart({ rows = [] }) {
  const data = rows.length
    ? rows
    : [
        { label: "Ponedjeljak", pos: 0, fakture: 0, total: 0 },
        { label: "Utorak", pos: 0, fakture: 0, total: 0 },
        { label: "Srijeda", pos: 0, fakture: 0, total: 0 },
        { label: "Četvrtak", pos: 0, fakture: 0, total: 0 },
        { label: "Petak", pos: 0, fakture: 0, total: 0 },
        { label: "Subota", pos: 0, fakture: 0, total: 0 },
        { label: "Nedjelja", pos: 0, fakture: 0, total: 0 },
      ];
  const maxValue = Math.max(1, ...data.flatMap((x) => [Number(x.pos || 0), Number(x.fakture || 0)]));

  return (
    <div className="weekdayCompareChart">
      <div className="weekdayBars" aria-hidden="true">
        {data.map((day) => {
          const posPct = Math.max(4, Math.round((Math.abs(Number(day.pos || 0)) / maxValue) * 100));
          const fakturePct = Math.max(4, Math.round((Math.abs(Number(day.fakture || 0)) / maxValue) * 100));
          return (
            <div className="weekdayGroup" key={day.label} title={`${day.label}: POS ${fmtMoney(day.pos || 0)} | Fakture ${fmtMoney(day.fakture || 0)}`}>
              <div className="weekdayPair">
                <div className="weekdayBarTrack">
                  <div className="weekdayBarFill pos" style={{ height: `${posPct}%` }} />
                </div>
                <div className="weekdayBarTrack">
                  <div className="weekdayBarFill fakture" style={{ height: `${fakturePct}%` }} />
                </div>
              </div>
              <div className="weekdayLabel">{day.label}</div>
            </div>
          );
        })}
      </div>
      <div className="weekdayLegend">
        <span><i className="pos" /> POS</span>
        <span><i className="fakture" /> Fakture</span>
      </div>
    </div>
  );
}

function TrendSlideshowPanel({ monthlyRows = [], weeklyRows = [], dailyRows = [] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartRef = useRef(null);
  const swipedRef = useRef(false);
  const slides = [
    {
      key: "mjeseci",
      title: "Kretanje",
      subtitle: "Linijski prikaz trenda po mjesecima",
      content: <LineChart rows={monthlyRows} />,
    },
    {
      key: "sedmice",
      title: "Kretanje",
      subtitle: "Linijski prikaz trenda po sedmicama",
      content: <LineChart rows={weeklyRows} />,
    },
    {
      key: "dani",
      title: "Kretanje",
      subtitle: "Promet po danima - POS i Fakture",
      content: <WeekdayCompareChart rows={dailyRows} />,
    },
  ];
  const active = slides[Math.min(activeIndex, slides.length - 1)] || slides[0];

  useEffect(() => {
    if (activeIndex < slides.length) return;
    setActiveIndex(0);
  }, [activeIndex, slides.length]);

  useEffect(() => {
    if (paused || slides.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  function moveSlide(direction) {
    setActiveIndex((current) => (current + direction + slides.length) % slides.length);
  }

  function handleArrowClick(e, direction) {
    e.stopPropagation();
    setPaused(true);
    moveSlide(direction);
  }

  function togglePaused() {
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    setPaused((current) => !current);
  }

  function handleTouchStart(e) {
    touchStartRef.current = e.touches?.[0]?.clientX ?? null;
  }

  function handleTouchEnd(e) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (start === null) return;

    const end = e.changedTouches?.[0]?.clientX ?? start;
    const delta = end - start;
    if (Math.abs(delta) < 36) return;

    swipedRef.current = true;
    setPaused(true);
    moveSlide(delta < 0 ? 1 : -1);
  }

  return (
    <section
      className={`dashboardPanel equalGroup trendSliderPanel clickable ${paused ? "paused" : ""}`.trim()}
      role="button"
      tabIndex={0}
      onClick={togglePaused}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          togglePaused();
        }
        if (e.key === "ArrowRight") moveSlide(1);
        if (e.key === "ArrowLeft") moveSlide(-1);
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      title={paused ? "Pauzirano" : "Automatski prikaz"}
    >
      <div className="dashboardPanelHead trendSliderHead">
        <div>
          <div className="dashboardTitle">{active.title}</div>
          <div className="dashboardSubtitle">{active.subtitle}</div>
        </div>
      </div>

      <div className="dashboardPanelBody trendSliderBody" key={active.key}>
        {active.content}
      </div>

      <div className="trendSliderArrows" aria-hidden="false">
        <button
          className="trendSliderArrow clickable"
          type="button"
          onClick={(e) => handleArrowClick(e, -1)}
          aria-label="Prethodni slajd"
        >
          ‹
        </button>
        <button
          className="trendSliderArrow clickable"
          type="button"
          onClick={(e) => handleArrowClick(e, 1)}
          aria-label="Sljedeći slajd"
        >
          ›
        </button>
      </div>

      <div className="trendSliderDots" aria-hidden="true">
        {slides.map((slide, index) => (
          <span key={slide.key} className={index === activeIndex ? "active" : ""} />
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const router = useRouter();
  const loadRef = useRef(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("…");
  const [theme, setTheme] = useState("dark");
  const [firma, setFirma] = useState("—");

  useEffect(() => {
    const t = getSavedTheme();
    setTheme(t);
    setThemeOnHtml(t);
  }, []);

  useEffect(() => {
    document.body.classList.add("homeBody");
    return () => {
      document.body.classList.remove("homeBody");
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const cached = readAuthSession();
      if (cached?.data?.authenticated && !cached.stale) {
        setActiveCacheScope(cached.data);
        setFirma(cached.data.companyName || cached.data.database || "—");
      }

      try {
        const j = await refreshAuthSession({ force: !cached?.data?.authenticated });
        if (!alive) return;
        if (j?.authenticated) {
          setActiveCacheScope(j);
          setFirma(j.companyName || j.database || "—");
        }
      } catch {}
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let timer = null;
    const cacheKey = scopedCacheKey("home:v8");
    const cached = readCachedJson(cacheKey, HOME_LOCAL_CACHE_TTL_MS);

    if (cached?.data) {
      setData(normalizeHome(cached.data));
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
          if (!cached?.data && !silent) {
            try {
              const fast = await fetchJsonWithAuth("/api/home?fast=1", {
                dedupeKey: "home:summary:fast",
                timeoutMs: 12000,
              });

              if (!alive) return;

              writeCachedJson(cacheKey, fast);
              setData(normalizeHome(fast));
              setMode("UČITANO");
              setLoading(false);
            } catch {}
          }

          const j = await fetchJsonWithAuth("/api/home?refresh=1", {
            dedupeKey: "home:summary:full",
            timeoutMs: 60000,
          });

          if (!alive) return;

          writeCachedJson(cacheKey, j);
          setData(normalizeHome(j));
          setMode("UČITANO");
        } catch {
          if (!alive) return;
          if (!readCachedJson(cacheKey, HOME_LOCAL_CACHE_TTL_MS)?.data) {
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
    }, HOME_REFRESH_INTERVAL_MS);

    function refreshIfStale() {
      if (!isPageVisible()) return;
      const latest = readCachedJson(cacheKey, HOME_LOCAL_CACHE_TTL_MS);
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
  }, []);

  useEffect(() => {
    ["/racuni", "/izdani-racuni", "/otvorene-stavke", "/kupci", "/dobavljaci", "/zalihe", "/zaduzenja"].forEach((path) => {
      router.prefetch(path);
    });

    return runWhenIdle(() => {
      const issuedBase = { pageSize: "80", offset: "0" };
      preloadJsonWithAuth("/api/racuni", scopedCacheKey("racuni:v4"), {
        dedupeKey: "preload:racuni:list",
        timeoutMs: 20000,
      });
      preloadJsonWithAuth(`/api/izdani-racuni?${new URLSearchParams({ ...issuedBase, type: "racuni", fast: "1" })}`, scopedCacheKey("izdani-racuni:v7:racuni:all"), {
        dedupeKey: "preload:izdani:racuni",
        timeoutMs: 20000,
      });
      preloadJsonWithAuth(`/api/izdani-racuni?${new URLSearchParams({ ...issuedBase, type: "predracuni", fast: "1" })}`, scopedCacheKey("izdani-racuni:v7:predracuni:all"), {
        dedupeKey: "preload:izdani:predracuni",
        timeoutMs: 20000,
      });
      preloadJsonWithAuth(`/api/izdani-racuni?${new URLSearchParams({ ...issuedBase, mode: "pos", fast: "1" })}`, scopedCacheKey("izdani-racuni:v7:pos:all"), {
        dedupeKey: "preload:izdani:pos",
        timeoutMs: 20000,
      });
      preloadJsonWithAuth(`/api/otvorene-stavke?${new URLSearchParams({ type: "neplaceni", pageSize: "80", offset: "0" })}`, scopedCacheKey("otvorene-stavke:v2:neplaceni:all"), {
        dedupeKey: "preload:otvorene:neplaceni",
        timeoutMs: 20000,
      });
      preloadJsonWithAuth(`/api/otvorene-stavke?${new URLSearchParams({ type: "nenaplaceni", pageSize: "80", offset: "0" })}`, scopedCacheKey("otvorene-stavke:v2:nenaplaceni:all"), {
        dedupeKey: "preload:otvorene:nenaplaceni",
        timeoutMs: 20000,
      });
      preloadJsonWithAuth(`/api/zalihe?${new URLSearchParams({ page: "1", pageSize: "250", fast: "1" })}`, scopedCacheKey("zalihe:v4:250:1:"), {
        dedupeKey: "preload:zalihe:first",
        timeoutMs: 18000,
      });
    }, 2200);
  }, [router]);

  const topKupci = data?.top5?.kupci || [];
  const topDob = data?.top5?.dobavljaci || [];
  const permissions = normalizePermissions(data?.permissions);
  const canViewRacuni = moduleAllowed(permissions, "racuni");
  const canViewKupci = moduleAllowed(permissions, "kupci");
  const canViewDobavljaci = moduleAllowed(permissions, "dobavljaci");
  const canViewZalihe = moduleAllowed(permissions, "zalihe");
  const canViewZaduzenja = moduleAllowed(permissions, "zaduzenja");
  const issued = data?.meta?.issued || {};
  const monthlyPromet = Array.isArray(data?.meta?.monthlyPromet) ? data.meta.monthlyPromet : [];
  const weeklyPromet = Array.isArray(data?.meta?.weeklyPromet) ? data.meta.weeklyPromet : [];
  const dailyPromet = Array.isArray(data?.meta?.dailyPromet) ? data.meta.dailyPromet : [];
  const monthlyRows = monthlyPromet
    .map((x) => ({
      label: x.period || x.label || "—",
      value: Number(x.total ?? x.value ?? 0),
    }))
    .filter((x) => x.label && x.label !== "—")
    .sort((a, b) => String(a.label).localeCompare(String(b.label)))
    .slice(-12);
  const allowedChartRows = [
    ...(moduleAllowed(permissions, "fakture") ? [{ label: "Fakture", value: issued.fakture?.total || 0 }] : []),
    ...(moduleAllowed(permissions, "predracuni") ? [{ label: "Predračuni", value: issued.predracuni?.total || 0 }] : []),
    ...(moduleAllowed(permissions, "pos") ? [{ label: "POS", value: issued.pos?.total || 0 }] : []),
    ...(moduleAllowed(permissions, "kupci") ? [{ label: "Kupci", value: data?.totals?.kupci || 0 }] : []),
    ...(moduleAllowed(permissions, "dobavljaci") ? [{ label: "Dobavljači", value: data?.totals?.dobavljaci || 0 }] : []),
  ];
  const chartRows = monthlyRows.length
    ? monthlyRows
    : allowedChartRows.length
      ? allowedChartRows
      : [{ label: "Promet", value: 0 }];
  const weeklyRows = weeklyPromet
    .map((x) => ({
      label: x.period || x.label || "—",
      value: Number(x.total ?? x.value ?? 0),
    }))
    .filter((x) => x.label && x.label !== "—")
    .slice(-12);
  const dailyRows = dailyPromet
    .map((x) => ({
      label: x.period || x.label || "—",
      value: Number(x.total ?? x.value ?? 0),
    }))
    .filter((x) => x.label && x.label !== "—")
    .slice(-10);
  const dailySlideRows = dailyPromet
    .map((x) => ({
      label: x.period || x.label || "—",
      pos: Number(x.pos || 0),
      fakture: Number(x.fakture || 0),
      total: Number(x.total ?? x.value ?? 0),
    }))
    .filter((x) => x.label && x.label !== "—");
  const strongestDayRows = dailyRows;
  const zaliheMeta = data?.meta?.zalihe || { artikli: 0, bezZalihe: 0, negativne: 0, pozitivne: 0, topKolicine: [], topOdstupanja: [] };
  const topKupciSaldoRows = topKupci
    .slice()
    .sort((a, b) => Math.abs(Number(b.Saldo || 0)) - Math.abs(Number(a.Saldo || 0)))
    .slice(0, 30)
    .map((x) => ({ label: x.Subjekt || "—", value: Number(x.Saldo || 0) }));
  const topDobSaldoRows = topDob
    .slice()
    .sort((a, b) => Math.abs(Number(b.Saldo || 0)) - Math.abs(Number(a.Saldo || 0)))
    .slice(0, 30)
    .map((x) => ({ label: x.Subjekt || "—", value: Number(x.Saldo || 0) }));
  const topZaliheRows = (zaliheMeta.topKolicine || zaliheMeta.topOdstupanja || [])
    .slice(0, 30)
    .map((x) => ({ label: x.NazivArtikla || x.SifraArtikla || "—", value: Number(x.Kolicina || 0) }));
  const homeTotals = {
    racuni: data ? fmtMoney(data.totals.racuni) : "—",
    zaduzenja: data ? fmtMoney(data.totals.zaduzenja) : "—",
    kupci: data ? fmtMoney(data.totals.kupci) : "—",
    dobavljaci: data ? fmtMoney(data.totals.dobavljaci) : "—",
  };
  const moduleItems = [
    { label: "Fakture", module: "fakture", icon: "receipt", href: "/izdani-racuni?tab=racuni", value: fmtMoney(issued.fakture?.total || 0), sub: `${Number(issued.fakture?.count || 0).toLocaleString("bs-BA")} dok.` },
    { label: "Predračuni", module: "predracuni", icon: "quote", href: "/izdani-racuni?tab=predracuni", value: fmtMoney(issued.predracuni?.total || 0), sub: `${Number(issued.predracuni?.count || 0).toLocaleString("bs-BA")} dok.` },
    { label: "POS", module: "pos", icon: "pos", href: "/izdani-racuni?tab=pos", value: fmtMoney(issued.pos?.total || 0), sub: `${Number(issued.pos?.count || 0).toLocaleString("bs-BA")} rač.` },
    { label: "Zalihe", module: "zalihe", icon: "boxes", href: "/zalihe", value: Number(zaliheMeta.artikli || 0).toLocaleString("bs-BA"), sub: `Negativne: ${Number(zaliheMeta.negativne || 0).toLocaleString("bs-BA")}` },
  ].map((item) => ({ ...item, allowed: moduleAllowed(permissions, item.module) }));

  useEqualHeights(".equalGroup", [loading, data, chartRows.length, monthlyRows.length, weeklyRows.length, dailyRows.length, dailySlideRows.length]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeOnHtml(next);
  }

  function go(path) {
    router.push(path);
  }

  function openKupac(subjekt) {
    router.push(`/kupci/${encodeURIComponent(subjekt)}`);
  }

  function openDobavljac(subjekt) {
    router.push(`/dobavljaci/${encodeURIComponent(subjekt)}`);
  }

  const scrollListStyle = {
    maxHeight: "540px",
    overflowY: "auto",
    overflowX: "hidden",
  };
  const topKupciScrollable = topKupci.length > 4;
  const topDobScrollable = topDob.length > 4;

  return (
    <main className="container homePage">
      <DesktopAppHeader status={loading ? "Učitavanje…" : mode} />

      <div className="topbar homeTopbar homeMobileTopbar">
        <LogoHomeButton slotClassName="homeLogoSlot" imageClassName="homeLogoImg" />

        <div className="pill clickable pageStatusPill" role="button" tabIndex={0} title="Status">
          {loading ? "Učitavanje…" : mode}
        </div>
      </div>

      <div className="homeHeaderRow">
        <div className="firmaStack">
          <div className="firmaLabel">Firma:</div>
          <div className="firmaName" title={firma}>
            {firma}
          </div>
        </div>

        <button
          className="pill pillToggle clickable homeThemeToggle"
          type="button"
          onClick={toggleTheme}
          title="Tema"
        >
          <span className="themeIcon">{theme === "dark" ? "🌙" : "☀️"}</span>
          <span className="themeText">{theme === "dark" ? "Tamno" : "Svijetlo"}</span>
        </button>
      </div>

      <div className="grid2" style={{ marginTop: 10 }}>
        <LockableCard allowed={canViewRacuni} onClick={() => go("/racuni")}>
          <div className="cardTitle">Stanje svih računa:</div>
          <div className={`big homeMetric ${amountFitClass(homeTotals.racuni)}`.trim()} title={homeTotals.racuni}>
            {homeTotals.racuni}
          </div>
          <div className="small">Saldo računa (banke)</div>
        </LockableCard>

        <LockableCard allowed={canViewZaduzenja} onClick={() => go("/zaduzenja")}>
          <div className="cardTitle">Krediti/Pozajmice:</div>
          <div className={`big homeMetric ${amountFitClass(homeTotals.zaduzenja)}`.trim()} title={homeTotals.zaduzenja}>
            {homeTotals.zaduzenja}
          </div>
          <div className="small">Stanje zaduženja</div>
        </LockableCard>

        <LockableCard allowed={canViewKupci} onClick={() => go("/kupci")}>
          <div className="cardTitle">Potraživanja (kupci)</div>
          <div className={`big homeMetric ${amountFitClass(homeTotals.kupci)}`.trim()} title={homeTotals.kupci}>
            {homeTotals.kupci}
          </div>
          <div className="small">Preplate: {data ? fmtMoney(data.totals.preplateKupci) : "—"}</div>
        </LockableCard>

        <LockableCard allowed={canViewDobavljaci} onClick={() => go("/dobavljaci")}>
          <div className="cardTitle">Dugovanja (dobavljači)</div>
          <div className={`big homeMetric ${amountFitClass(homeTotals.dobavljaci)}`.trim()} title={homeTotals.dobavljaci}>
            {homeTotals.dobavljaci}
          </div>
          <div className="small">Preplate: {data ? fmtMoney(data.totals.preplateDobavljaci) : "—"}</div>
        </LockableCard>
      </div>

      <div className="dashboardGrid homeDashboardGrid">
        <DashboardPanel title={monthlyRows.length ? "Promet po mjesecima" : "Sažetak prometa"} subtitle={monthlyRows.length ? "Mjesečni trend" : "Dostupni total iznosi"}>
          <BarChart rows={chartRows} maxRows={12} />
        </DashboardPanel>

        <TrendSlideshowPanel
          monthlyRows={monthlyRows}
          weeklyRows={weeklyRows}
          dailyRows={dailySlideRows}
        />

        <DashboardPanel title="Najjači dani" subtitle="Poredak dana u sedmici" className="tabletHiddenPanel">
          <BarChart rows={strongestDayRows} maxRows={7} />
        </DashboardPanel>
      </div>

      <div className="dashboardGrid homeTabletStatsGrid">
        <DashboardPanel title="Najjači dani" subtitle="Poredak dana u sedmici">
          <BarChart rows={strongestDayRows} maxRows={7} />
        </DashboardPanel>

        <DashboardPanel title="Količine" subtitle="Top po ukupnoj količini" locked={!canViewZalihe}>
          <BarChart rows={topZaliheRows} maxRows={30} formatValue={(value) => Number(value || 0).toLocaleString("bs-BA")} className="barChartTextWide barChartInventory barChartScrollable" />
        </DashboardPanel>
      </div>

      <div className="dashboardGrid homeHighlightsGrid">
        <DashboardPanel title="Najveća salda kupaca" subtitle="Top po apsolutnom iznosu" locked={!canViewKupci}>
          <BarChart rows={topKupciSaldoRows} maxRows={30} className="barChartTextWide barChartScrollable" />
        </DashboardPanel>

        <DashboardPanel title="Najveća salda dobavljača" subtitle="Top po apsolutnom iznosu" locked={!canViewDobavljaci}>
          <BarChart rows={topDobSaldoRows} maxRows={30} className="barChartTextWide barChartScrollable" />
        </DashboardPanel>

        <DashboardPanel title="Količine" subtitle="Top po ukupnoj količini" className="tabletHiddenPanel" locked={!canViewZalihe}>
          <BarChart rows={topZaliheRows} maxRows={30} formatValue={(value) => Number(value || 0).toLocaleString("bs-BA")} className="barChartTextWide barChartInventory barChartScrollable" />
        </DashboardPanel>
      </div>

      <div className="homeInsightsGrid">
        <DashboardPanel title="Pregled modula" subtitle="Brzi pregled ključnih sekcija" className="homeModulePanel">
          <div className="moduleOverviewGrid">
            {moduleItems.map((item) => (
              <LockableModuleItem key={item.label} item={item} allowed={item.allowed} onClick={() => go(item.href)} />
            ))}
          </div>
        </DashboardPanel>

        <DashboardPanel title="Top partneri" subtitle="Kupci i dobavljači u jednom pregledu" className="homeTopPartnersPanel">
          <div className="topPartnersGrid">
            <div className={`homeListBlock ${canViewKupci ? "" : "permissionLocked"}`.trim()}>
              <div className={canViewKupci ? "" : "permissionLockedBlur"}>
                <div className="sectionTitle">Top kupci:</div>
                <div className={`list ${topKupciScrollable ? "compactScrollableList" : ""}`.trim()} style={topKupciScrollable ? scrollListStyle : undefined}>
                {loading &&
                  Array.from({ length: 12 }).map((_, i) => (
                    <div key={"sk_k_" + i} className="item" style={{ opacity: 0.7 }}>
                      <div className="itemLeft" style={{ minWidth: 0 }}>
                        <div className="itemTitle">Učitavanje…</div>
                        <div className="itemSub">Molimo sačekajte</div>
                      </div>
                      <div className="amount">—</div>
                    </div>
                  ))}

                {!loading && topKupci.length === 0 && (
                  <div className="item" style={{ opacity: 0.75 }}>
                    <div className="itemLeft" style={{ minWidth: 0 }}>
                      <div className="itemTitle">Nema podataka</div>
                      <div className="itemSub">Kupci nisu dostupni</div>
                    </div>
                    <div className="amount">—</div>
                  </div>
                )}

                {!loading &&
                  topKupci.map((x, i) => (
                    <div
                      key={(x.Subjekt || "") + "_" + i}
                      className="item clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => openKupac(x.Subjekt)}
                      title={x.Subjekt}
                    >
                      <div className="itemLeft">
                        <div className="itemTitle">{x.Subjekt}</div>
                        <div className="itemSub">Zadnje knjiženje: {fmtDate(x.ZadnjiDatumKnjizenja)}</div>
                        {hasDueInfo(x) && (
                          <div className="itemSub partnerDueLine">
                            <span>Dospjelo: {fmtMoney(dueAmount(x))}</span>
                            <span className="partnerDelayText">· Kasni: {overdueDays(x)} dana</span>
                          </div>
                        )}
                      </div>
                      <div className={"amount " + (Number(x.Saldo) < 0 ? "bad" : "good")}>{fmtMoney(x.Saldo)}</div>
                    </div>
                  ))}
                </div>
              </div>
              {!canViewKupci && <PermissionDeniedOverlay />}
            </div>

            <div className={`homeListBlock ${canViewDobavljaci ? "" : "permissionLocked"}`.trim()}>
              <div className={canViewDobavljaci ? "" : "permissionLockedBlur"}>
                <div className="sectionTitle">Top dobavljači:</div>
                <div className={`list ${topDobScrollable ? "compactScrollableList" : ""}`.trim()} style={topDobScrollable ? scrollListStyle : undefined}>
                {loading &&
                  Array.from({ length: 12 }).map((_, i) => (
                    <div key={"sk_d_" + i} className="item" style={{ opacity: 0.7 }}>
                      <div className="itemLeft" style={{ minWidth: 0 }}>
                        <div className="itemTitle">Učitavanje…</div>
                        <div className="itemSub">Molimo sačekajte</div>
                      </div>
                      <div className="amount">—</div>
                    </div>
                  ))}

                {!loading && topDob.length === 0 && (
                  <div className="item" style={{ opacity: 0.75 }}>
                    <div className="itemLeft" style={{ minWidth: 0 }}>
                      <div className="itemTitle">Nema podataka</div>
                      <div className="itemSub">Dobavljači nisu dostupni</div>
                    </div>
                    <div className="amount">—</div>
                  </div>
                )}

                {!loading &&
                  topDob.map((x, i) => (
                    <div
                      key={(x.Subjekt || "") + "_" + i}
                      className="item clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => openDobavljac(x.Subjekt)}
                      title={x.Subjekt}
                    >
                      <div className="itemLeft">
                        <div className="itemTitle">{x.Subjekt}</div>
                        <div className="itemSub">Zadnje knjiženje: {fmtDate(x.ZadnjiDatumKnjizenja)}</div>
                        {hasDueInfo(x) && (
                          <div className="itemSub partnerDueLine">
                            <span>Dospjelo: {fmtMoney(dueAmount(x))}</span>
                            <span className="partnerDelayText">· Kasni: {overdueDays(x)} dana</span>
                          </div>
                        )}
                      </div>
                      <div className={"amount " + (Number(x.Saldo) < 0 ? "good" : "bad")}>{fmtMoney(x.Saldo)}</div>
                    </div>
                  ))}
                </div>
              </div>
              {!canViewDobavljaci && <PermissionDeniedOverlay />}
            </div>
          </div>
        </DashboardPanel>
      </div>

      <div className="app-footer homeCopyright">
        © {new Date().getFullYear()} BeCleven App | AK Solutions • Sva prava pridržana
      </div>
    </main>
  );
}
