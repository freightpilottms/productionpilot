"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { asRows, fmtMoney, fmtMoneyNoCurrency, fmtDate } from "@/lib/format";
import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import DocumentExportActions, { mailReport, printReport } from "@/app/_ui/DocumentExportActions";

export default function RacunKartica({ params }) {
  const router = useRouter();
  const rawKonto = decodeURIComponent(params.konto || "");
  const konto = rawKonto.trim();

  const [loading, setLoading] = useState(false);
  const [broj, setBroj] = useState(null);
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({
    uplate: 0,
    isplate: 0,
    saldo: 0,
  });
  const [hasPrev, setHasPrev] = useState(false);
  const [hasNext, setHasNext] = useState(false);

  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  useEffect(() => {
    if (!konto) return;
    loadLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [konto]);

  async function loadLatest() {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/racuni?mode=izvod&racun=${encodeURIComponent(konto)}&action=latest`,
        { cache: "no-store" }
      );
      const j = await r.json();

      if (r.ok && j?.ok) {
        setBroj(j.broj ?? null);
        setRows(asRows(j.rows));
        setTotals(j.totals || { uplate: 0, isplate: 0, saldo: 0 });
        setHasPrev(!!j.hasPrev);
        setHasNext(!!j.hasNext);
      } else {
        resetState();
      }
    } catch {
      resetState();
    } finally {
      setLoading(false);
    }
  }

  async function loadPrev() {
    if (!broj || loading || !hasPrev) return;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/racuni?mode=izvod&racun=${encodeURIComponent(konto)}&broj=${encodeURIComponent(
          broj
        )}&action=prev`,
        { cache: "no-store" }
      );
      const j = await r.json();

      if (r.ok && j?.ok && j.broj) {
        applyResult(j);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadNext() {
    if (!broj || loading || !hasNext) return;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/racuni?mode=izvod&racun=${encodeURIComponent(konto)}&broj=${encodeURIComponent(
          broj
        )}&action=next`,
        { cache: "no-store" }
      );
      const j = await r.json();

      if (r.ok && j?.ok && j.broj) {
        applyResult(j);
      }
    } finally {
      setLoading(false);
    }
  }

  function applyResult(j) {
    setBroj(j.broj ?? null);
    setRows(asRows(j.rows));
    setTotals(j.totals || { uplate: 0, isplate: 0, saldo: 0 });
    setHasPrev(!!j.hasPrev);
    setHasNext(!!j.hasNext);
  }

  function resetState() {
    setBroj(null);
    setRows([]);
    setTotals({ uplate: 0, isplate: 0, saldo: 0 });
    setHasPrev(false);
    setHasNext(false);
  }

  function goBack() {
    router.back();
  }

  function buildIzvodReport() {
    const columns = [
      { key: "datum", label: "Datum" },
      { key: "subjekt", label: "Subjekt" },
      { key: "broj", label: "Broj izvoda" },
      { key: "uplate", label: "Uplate" },
      { key: "isplate", label: "Isplate" },
    ];
    const reportRows = rows.map((x) => ({
      datum: fmtDate(x.DatumDokumenta),
      subjekt: x.Subjekt || "Bez naziva",
      broj: x.Broj || broj || "—",
      uplate: fmtMoney(x.Uplate || 0),
      isplate: fmtMoney(x.Isplate || 0),
    }));

    return {
      title: "Izvod računa",
      subtitle: `Račun: ${konto}`,
      subject: `Izvod računa ${konto}${broj ? ` #${broj}` : ""}`,
      meta: [
        ["Račun", konto],
        ["Broj izvoda", broj || "—"],
      ],
      columns,
      rows: reportRows,
      totals: [
        ["Ukupno uplate", fmtMoney(totals.uplate)],
        ["Ukupno isplate", fmtMoney(totals.isplate)],
        ["Saldo izvoda", fmtMoney(totals.saldo)],
      ],
    };
  }

  function printIzvod() {
    printReport(buildIzvodReport());
  }

  function mailIzvod() {
    mailReport(buildIzvodReport());
  }

  function handleSwipeStart(e) {
    const t = e.changedTouches?.[0];
    if (!t) return;
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  }

  function handleSwipeEnd(e) {
    const t = e.changedTouches?.[0];
    if (!t) return;

    const startX = touchStartX.current;
    const startY = touchStartY.current;

    touchStartX.current = null;
    touchStartY.current = null;

    if (startX == null || startY == null) return;

    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (Math.abs(dx) < 45) return;
    if (Math.abs(dx) <= Math.abs(dy)) return;

    if (dx < 0) {
      if (hasNext) loadNext();
    } else {
      if (hasPrev) loadPrev();
    }
  }

  return (
    <main className="container page izvodPage">
      <DesktopAppHeader title="Izvod računa" subtitle={`Račun: ${konto}`} status={loading ? "Učitavanje…" : "UČITANO"} />

      <div className="topbar mobileOnlyHeader">
        <div>
          <div className="brand">Izvod računa</div>
          <div className="subtitle">Račun: {konto}</div>
        </div>
        <div className="pill clickable" role="button" tabIndex={0} title="Status">
          {loading ? "Učitavanje…" : "UČITANO"}
        </div>
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        <div
          className="izvodTopRow"
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
        >
          <button
            className="btn clickable pagerBtn desktopOnly"
            onClick={loadPrev}
            disabled={loading || !broj || !hasPrev}
            type="button"
            style={{
              opacity: loading || !broj || !hasPrev ? 0.45 : 1,
              pointerEvents: loading || !broj || !hasPrev ? "none" : "auto",
            }}
          >
            ◀ PRETHODNA
          </button>

          <div className="izvodBrojWrap">
            <div className="cardTitle">Broj izvoda</div>
            <div className="big">{broj || "—"}</div>
          </div>

          <button
            className="btn clickable pagerBtn desktopOnly"
            onClick={loadNext}
            disabled={loading || !broj || !hasNext}
            type="button"
            style={{
              opacity: loading || !broj || !hasNext ? 0.45 : 1,
              pointerEvents: loading || !broj || !hasNext ? "none" : "auto",
            }}
          >
            SLJEDEĆA ▶
          </button>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <div>
          <div className="small">Ukupno uplate</div>
          <div className="amount good">{fmtMoneyNoCurrency(totals.uplate)}</div>
        </div>

        <div>
          <div className="small">Ukupno isplate</div>
          <div className="amount bad">{fmtMoneyNoCurrency(totals.isplate)}</div>
        </div>

        <div>
          <div className="small">Saldo izvoda</div>
          <div className={"amount " + (Number(totals.saldo) < 0 ? "bad" : "good")}>
            {fmtMoneyNoCurrency(totals.saldo)}
          </div>
        </div>
      </div>

      <div className="izvodSectionRow">
        <div className="sectionTitle" style={{ margin: 0 }}>
          Stavke izvoda
        </div>

        <div className="izvodSectionActions">
          <DocumentExportActions onPrint={printIzvod} onMail={mailIzvod} disabled={loading || !broj} compact />

          <button
            className="btn clickable documentActionBtn izvodBackBtn"
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

        {!loading && rows.length === 0 && (
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft">
              <div className="itemTitle">Nema stavki</div>
              <div className="itemSub">
                Za ovaj račun trenutno nema dostupnog izvoda.
              </div>
            </div>
            <div className="amount">—</div>
          </div>
        )}

        {!loading &&
          rows.map((x, i) => {
            const uplata = Number(x.Uplate || 0);
            const isplata = Number(x.Isplate || 0);

            return (
              <div key={i} className="item">
                <div className="itemLeft">
                  <div className="itemTitle">{x.Subjekt || "Bez naziva"}</div>
                  <div className="itemSub">
                    {fmtDate(x.DatumDokumenta)} • Broj izvoda: {x.Broj || "—"}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  {uplata > 0 ? <div className="amount good">{fmtMoney(uplata)}</div> : null}
                  {isplata > 0 ? <div className="amount bad">{fmtMoney(isplata)}</div> : null}
                  {uplata <= 0 && isplata <= 0 ? (
                    <div className="amount">{fmtMoney(0)}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
      </div>

      <div
        className="mobileSwipeZone"
        onTouchStart={handleSwipeStart}
        onTouchEnd={handleSwipeEnd}
      >
        <div className="mobileSwipeLabel">
          Prevucite prst preko ekrana lijevo ili desno
          <br />
          kako biste pregledali izvode.
        </div>
      </div>

      <div className="mobilePagerRow">
        <button
          className="btn clickable pagerBtn mobileOnly"
          onClick={loadPrev}
          disabled={loading || !broj || !hasPrev}
          type="button"
          style={{
            opacity: loading || !broj || !hasPrev ? 0.45 : 1,
            pointerEvents: loading || !broj || !hasPrev ? "none" : "auto",
          }}
        >
          ◀ PRETHODNA
        </button>

        <button
          className="btn clickable pagerBtn mobileOnly"
          onClick={loadNext}
          disabled={loading || !broj || !hasNext}
          type="button"
          style={{
            opacity: loading || !broj || !hasNext ? 0.45 : 1,
            pointerEvents: loading || !broj || !hasNext ? "none" : "auto",
          }}
        >
          SLJEDEĆA ▶
        </button>
      </div>

      <style jsx>{`
        .izvodPage {
          display: flex;
          flex-direction: column;
          min-height: calc(100dvh - var(--bottomNavH));
        }

        .izvodTopRow {
          display: grid;
          grid-template-columns: 132px minmax(180px, 1fr) 132px;
          gap: 10px;
          align-items: center;
        }

        .izvodBrojWrap {
          text-align: center;
          min-width: 0;
        }

        .pagerBtn {
          white-space: nowrap;
          font-size: 11px;
          padding: 6px 10px;
          min-height: 34px;
          width: 132px;
          justify-content: center;
        }

        .izvodSectionRow {
          margin-top: 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 34px;
        }

        .izvodSectionRow .sectionTitle {
          display: flex;
          align-items: center;
          min-height: 34px;
        }

        .izvodSectionActions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          flex: 0 0 auto;
        }

        .izvodSectionActions :global(.documentActions) {
          flex-wrap: nowrap;
        }

        .list {
          flex: 0 0 auto;
        }

        .izvodBackBtn {
          min-width: 76px;
        }

        .mobilePagerRow {
          display: none;
        }

        @media (max-width: 760px) {
          .desktopOnly {
            display: none !important;
          }

          .mobileOnly {
            display: inline-flex !important;
          }

          .izvodPage {
            min-height: calc(100dvh - var(--bottomNavH) - env(safe-area-inset-bottom));
            padding-bottom: 0 !important;
          }

          .izvodTopRow {
            grid-template-columns: 1fr;
            gap: 0;
          }

          .izvodBrojWrap {
            width: 100%;
          }

          .izvodSectionRow {
            align-items: center;
            min-height: 30px;
          }

          .izvodSectionRow .sectionTitle {
            min-height: 30px;
          }

          .izvodSectionActions {
            gap: 5px;
          }

          .izvodSectionActions :global(.documentActionBtn),
          .izvodBackBtn {
            min-width: 58px;
            min-height: 30px;
            padding: 6px 7px;
            font-size: 10px;
          }

          .mobileSwipeZone {
            display: flex;
            flex: 1 1 auto;
            min-height: 120px;
            margin-top: 12px;
            margin-bottom: 0;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            align-items: center;
            justify-content: center;
            padding: 14px;
          }

          .mobileSwipeLabel {
            text-align: center;
            font-size: 12px;
            line-height: 1.45;
            opacity: 0.92;
            max-width: 320px;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            width: 100%;
          }

          .mobilePagerRow {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-top: 10px;
            margin-bottom: 0;
          }

          .mobilePagerRow .pagerBtn {
            width: 100%;
            min-width: 0;
          }
        }
      `}</style>
    </main>
  );
}
