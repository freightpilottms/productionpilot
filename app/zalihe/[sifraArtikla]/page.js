"use client";
import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import DocumentExportActions, { printReport } from "@/app/_ui/DocumentExportActions";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney } from "@/lib/format";
import { cachedPermissions } from "@/app/_ui/permissions";

export default function ArtikalDetaljPage({ params }) {
  const router = useRouter();
  const sifraArtikla = decodeURIComponent(params.sifraArtikla || "");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState("…");
  const [err, setErr] = useState("");
  const [canViewStockCost, setCanViewStockCost] = useState(() => cachedPermissions().canViewStockCost);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setMode("…");
      setErr("");

      try {
        const r = await fetch(
          `/api/zalihe/artikal?sifraArtikla=${encodeURIComponent(sifraArtikla)}`,
          { cache: "no-store" }
        );
        const j = await r.json().catch(() => null);

        if (!alive) return;

        if (r.ok && j?.ok) {
          setRows(j.rows || []);
          setCanViewStockCost((current) => j.permissions?.canViewStockCost ?? current);
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
        setErr(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [sifraArtikla]);

  const nazivArtikla = useMemo(() => {
    return rows?.[0]?.NazivArtikla || "";
  }, [rows]);

  const barcode = useMemo(() => {
    return rows?.[0]?.Barcode || "";
  }, [rows]);

  function goBack() {
    router.back();
  }

  function printArtikal() {
    printReport({
      title: "Detalj artikla",
      subject: `Artikal ${sifraArtikla}`,
      subtitle: nazivArtikla || sifraArtikla,
      meta: [
        { label: "Šifra", value: sifraArtikla },
        { label: "Naziv", value: nazivArtikla || "-" },
        { label: "Barcode", value: barcode || "-" },
      ],
      columns: [
        { key: "skladiste", label: "Skladište" },
        { key: "kolicina", label: "Količina" },
        ...(canViewStockCost ? [{ key: "nc", label: "NC" }] : []),
        { key: "mpc", label: "MPC" },
        { key: "vpc", label: "VPC" },
      ],
      rows: rows.map((row) => ({
        skladiste: row.Skladiste || "",
        kolicina: Number(row.Kolicina ?? 0).toLocaleString("bs-BA"),
        ...(canViewStockCost ? { nc: fmtMoney(row.NC || 0) } : {}),
        mpc: fmtMoney(row.MPC || 0),
        vpc: fmtMoney(row.VPC || 0),
      })),
    });
  }

  return (
    <main className="container page">
      <DesktopAppHeader
        title="Detalj artikla"
        subtitle={`${sifraArtikla}${nazivArtikla ? ` — ${nazivArtikla}` : ""}`}
        status={loading ? "Učitavanje…" : mode}
      />

      <div className="topbar mobileOnlyHeader">
        <div>
          <div className="brand">Detalj artikla</div>
          <div className="subtitle">
            {sifraArtikla}
            {nazivArtikla ? ` — ${nazivArtikla}` : ""}
          </div>
        </div>
        <div className="pill clickable" role="button" tabIndex={0} title="Status">
          {loading ? "Učitavanje…" : mode}
        </div>
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        <div className="cardTitle">Osnovni podaci</div>
        <div className="small" style={{ marginTop: 6 }}>
          Šifra: <b>{sifraArtikla}</b>
        </div>
        <div className="small" style={{ marginTop: 6 }}>
          Naziv: <b>{nazivArtikla || "—"}</b>
        </div>
        <div className="small" style={{ marginTop: 6 }}>
          Barcode: <b>{barcode || "—"}</b>
        </div>
      </div>

      <div className="artikalSectionRow">
        <div className="sectionTitle" style={{ margin: 0 }}>
          Stanje po skladištima
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <DocumentExportActions onPrint={printArtikal} disabled={loading || !!err || !rows.length} compact />
          <button
            className="btn clickable documentActionBtn artikalBackBtn"
            type="button"
            onClick={goBack}
          >
            Nazad
          </button>
        </div>
      </div>

      <div className="list" style={{ marginTop: 10 }}>
        {loading && (
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft">
              <div className="itemTitle">Učitavanje…</div>
              <div className="itemSub">Molimo sačekajte</div>
            </div>
            <div className="amount">—</div>
          </div>
        )}

        {!loading && !!err && (
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft">
              <div className="itemTitle">Greška</div>
              <div className="itemSub">{err}</div>
            </div>
            <div className="amount">—</div>
          </div>
        )}

        {!loading && !err && rows.length === 0 && (
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft">
              <div className="itemTitle">Nema podataka</div>
              <div className="itemSub">Nema stanja za odabrani artikal.</div>
            </div>
            <div className="amount">—</div>
          </div>
        )}

        {!loading &&
          !err &&
          rows.map((x, i) => (
            <div key={`${x.Skladiste || ""}_${i}`} className="item">
              <div className="itemLeft" style={{ minWidth: 0 }}>
                <div className="itemTitle">
                  {x.SifraArtikla}
                  {x.NazivArtikla ? ` — ${x.NazivArtikla}` : ""}
                </div>

                <div className="itemSub">{x.Skladiste || "—"}</div>

                <div className="itemSub">
                  Barcode: {x.Barcode || "—"}
                </div>

                <div className="itemSub artikalPriceMeta">
                  {canViewStockCost && <span>NC: {fmtMoney(x.NC || 0)}</span>}
                  <span>MPC: {fmtMoney(x.MPC || 0)}</span>
                  <span>VPC: {fmtMoney(x.VPC || 0)}</span>
                </div>
              </div>

              <div
                className="amount"
                style={{
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  color: Number(x.Kolicina ?? 0) < 0 ? "#ff4d4f" : undefined,
                  fontWeight: Number(x.Kolicina ?? 0) < 0 ? 700 : undefined,
                }}
              >
                {Number(x.Kolicina ?? 0).toLocaleString()}
              </div>
            </div>
          ))}
      </div>

      <style jsx>{`
        .artikalSectionRow {
          margin-top: 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .artikalBackBtn {
          min-width: 62px;
          width: auto;
          font-size: 11px;
          padding: 5px 9px;
          min-height: 30px;
          line-height: 1;
          white-space: nowrap;
          flex: 0 0 auto;
        }

        .artikalPriceMeta {
          display: flex;
          flex-wrap: wrap;
          gap: 3px 10px;
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
          line-height: 1.28;
        }

        .artikalPriceMeta span {
          min-width: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        @media (max-width: 760px) {
          .artikalBackBtn {
            min-width: 58px;
            width: auto;
            font-size: 10.5px;
            padding: 4px 8px;
            min-height: 28px;
          }

          .artikalPriceMeta {
            font-size: 10px;
            gap: 2px 8px;
          }
        }
      `}</style>
    </main>
  );
}
