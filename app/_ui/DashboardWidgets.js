"use client";

import { useLayoutEffect, useRef } from "react";
import { amountFitClass, fmtMoney, fmtMoneyFull } from "@/lib/format";
import { PERMISSION_DENIED_SUBTEXT, PERMISSION_DENIED_TEXT } from "@/app/_ui/permissions";

function cleanNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function getChartLabel(row) {
  return String(row?.label ?? row?.period ?? row?.name ?? row?.Subjekt ?? row?.NazivArtikla ?? row?.SifraArtikla ?? "—");
}

function getChartValue(row) {
  return cleanNumber(row?.value ?? row?.total ?? row?.Saldo ?? row?.Kolicina ?? 0);
}

export function percentParts(values = []) {
  const nums = values.map((value) => Math.max(0, cleanNumber(value)));
  const total = nums.reduce((sum, value) => sum + value, 0);
  if (!total) return nums.map(() => 0);

  const exact = nums.map((value) => (value / total) * 100);
  const rounded = exact.map(Math.floor);
  let remainder = 100 - rounded.reduce((sum, value) => sum + value, 0);

  exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ index }) => {
      if (remainder <= 0) return;
      rounded[index] += 1;
      remainder -= 1;
    });

  return rounded;
}

export function PermissionDeniedOverlay() {
  return (
    <div className="permissionDeniedOverlay" aria-hidden="true">
      <div className="permissionDeniedText">{PERMISSION_DENIED_TEXT}</div>
      <div className="permissionDeniedSubtext">{PERMISSION_DENIED_SUBTEXT}</div>
    </div>
  );
}

export function DashboardPanel({ title, subtitle, meta, children, className = "", roomy = false, locked = false }) {
  return (
    <section
      className={`dashboardPanel equalGroup ${roomy ? "dashboardPanelRoomy" : ""} ${locked ? "permissionLocked" : ""} ${className}`.trim()}
    >
      <div className={locked ? "permissionLockedBlur" : ""}>
        <div className="dashboardPanelHead">
          <div>
            <div className="dashboardTitle">{title}</div>
            {subtitle && <div className="dashboardSubtitle">{subtitle}</div>}
          </div>
          {meta && <div className="dashboardPanelMeta">{meta}</div>}
        </div>
        <div className="dashboardPanelBody">{children}</div>
      </div>
      {locked && <PermissionDeniedOverlay />}
    </section>
  );
}

export function StatStrip({ items, className = "" }) {
  return (
    <div className={`statStrip ${className}`.trim()}>
      {(items || []).map((item) => (
        <div className="statTile" key={item.label}>
          <div className="statLabel">{item.label}</div>
          <AutoFitStatValue
            className={`statValue ${amountFitClass(item.value)} ${item.tone || ""}`.trim()}
            value={item.value}
          />
          {item.sub && <div className="statSub">{item.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function AutoFitStatValue({ value, className = "" }) {
  const ref = useRef(null);
  const text = value === null || value === undefined ? "" : String(value);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    let frame = 0;

    function fit() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        node.style.fontSize = "";
        node.removeAttribute("data-fit-scaled");

        const available = node.clientWidth;
        const needed = node.scrollWidth;
        if (!available || !needed || needed <= available) return;

        const baseSize = Number.parseFloat(window.getComputedStyle(node).fontSize) || 16;
        const nextSize = Math.max(9, Math.min(baseSize, baseSize * (available / needed) * 0.96));
        node.style.fontSize = `${nextSize.toFixed(2)}px`;
        node.setAttribute("data-fit-scaled", "true");
      });
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    if (node.parentElement) observer.observe(node.parentElement);
    window.addEventListener("resize", fit);
    document.fonts?.ready?.then(fit).catch(() => {});

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [text]);

  return (
    <div ref={ref} className={className} title={text}>
      {text}
    </div>
  );
}

export function BarChart({ rows, formatValue = fmtMoney, maxRows = 8, className = "", scrollAfter = 6 }) {
  const data = (rows || []).filter(Boolean).slice(0, maxRows);
  const signature = data.map((x) => `${getChartLabel(x)}:${getChartValue(x)}`).join("|");
  const max = Math.max(1, ...data.map((x) => Math.abs(getChartValue(x))));
  const chartClasses = String(className || "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((name) => name !== "barChartScrollable" || data.length > scrollAfter)
    .join(" ");

  if (!data.length) {
    return <div className="chartEmpty">Nema dovoljno podataka za prikaz.</div>;
  }

  return (
    <div className={`barChart ${chartClasses}`.trim()} key={signature}>
      {data.map((x, index) => {
        const label = getChartLabel(x);
        const value = getChartValue(x);
        const formattedValue = formatValue(value);
        const titleValue = formatValue === fmtMoney ? fmtMoneyFull(value) : formattedValue;
        const pct = Math.max(5, Math.round((Math.abs(value) / max) * 100));
        return (
          <div className="barRow" key={`${label}_${value}_${index}`} style={{ "--chart-delay": `${index * 70}ms` }}>
            <div className="barLabel" title={label}>{label}</div>
            <div className="barTrack" aria-hidden="true">
              <div className={`barFill tone${index % 5}`} style={{ width: `${pct}%` }} />
            </div>
            <div className={`barAmount ${amountFitClass(formattedValue)} ${value < 0 ? "bad" : "good"}`.trim()} title={titleValue}>
              {formattedValue}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RingMetric({ label, value = 0, detail, tone = "blue" }) {
  const safe = Math.max(0, Math.min(100, cleanNumber(value)));
  return (
    <div className="ringMetric">
      <div key={`${label}_${safe}`} className={`ringChart ring-${tone}`} style={{ "--ring-value": `${safe}%` }}>
        <div className="ringInner">{Math.round(safe)}%</div>
      </div>
      <div className="ringLabel">{label}</div>
      {detail && <div className="ringDetail">{detail}</div>}
    </div>
  );
}

export function LineChart({ rows, formatValue = fmtMoney }) {
  const data = (rows || []).filter(Boolean).slice(-10);
  if (data.length < 2) {
    return <div className="chartEmpty">Nema dovoljno tačaka za linijski grafikon.</div>;
  }

  const values = data.map(getChartValue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = data.map((x, index) => {
    const xPos = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
    const yPos = 32 - ((getChartValue(x) - min) / span) * 24;
    return { ...x, x: xPos, y: yPos };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const last = points[points.length - 1];
  const signature = data.map((x) => `${getChartLabel(x)}:${getChartValue(x)}`).join("|");
  const lastValue = getChartValue(last);
  const lastFormattedValue = formatValue(lastValue);
  const titleValue = formatValue === fmtMoney ? fmtMoneyFull(lastValue) : lastFormattedValue;

  return (
    <div className="lineChart" key={signature}>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        <path className="lineGrid" d="M 0 35 L 100 35" />
        <path className="linePath" d={path} />
        {points.map((p, i) => (
          <circle key={`${getChartLabel(p)}_${getChartValue(p)}_${i}`} className="linePoint" cx={p.x} cy={p.y} r="1.2" style={{ "--chart-delay": `${360 + i * 55}ms` }} />
        ))}
      </svg>
      <div className="lineChartMeta">
        <span>{getChartLabel(data[0])}</span>
        <b className={amountFitClass(lastFormattedValue)} title={titleValue}>{lastFormattedValue}</b>
        <span>{getChartLabel(last)}</span>
      </div>
    </div>
  );
}
