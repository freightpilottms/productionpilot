"use client";

import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import DocumentExportActions, { printReport } from "@/app/_ui/DocumentExportActions";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate, fmtMoney } from "@/lib/format";

function statusChipStyle(status) {
  const s = String(status || "").toUpperCase();

  const base = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid var(--line)",
    background: "rgba(255,255,255,.04)",
    fontSize: 12,
    fontWeight: 900,
    color: "var(--pillText)",
    whiteSpace: "nowrap",
  };

  if (
    s.includes("ZAKLJ") ||
    s.includes("ZATV") ||
    s.includes("CLOSED") ||
    s.includes("DONE")
  ) {
    return {
      ...base,
      background: "rgba(239,68,68,.12)",
      borderColor: "rgba(239,68,68,.26)",
      color: "var(--text)",
    };
  }

  if (s.includes("OTV") || s.includes("OPEN") || s.includes("IZR")) {
    return {
      ...base,
      background: "rgba(96,165,250,.14)",
      borderColor: "rgba(96,165,250,.28)",
      color: "var(--text)",
    };
  }

  return base;
}

export default function InventuraDetalj({ params }) {
  const id = String(params.id || "").trim();
  const router = useRouter();

  const sifraInputRef = useRef(null);
  const hiddenScanInputRef = useRef(null);
  const scanBufferRef = useRef("");
  const scanTimerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [modalErr, setModalErr] = useState("");
  const [form, setForm] = useState({
    sifra: "",
    naziv: "",
    sk: "",
    kk: "",
    mpc: "",
    skladiste: "",
    barcode: "",
    napomena: "Prvi unos",
  });

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const r = await fetch(`/api/inventura/${id}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        setData(null);
        setErr(j?.error || `API error (${r.status})`);
        return;
      }

      setData(j);
    } catch (e) {
      setData(null);
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // load is intentionally tied to route id; it refreshes mutable inventory data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const inventura = data?.inventura || null;
  const items = useMemo(() => data?.items || [], [data?.items]);
  const isLocked = Boolean(inventura?.Locked);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) =>
      String(a.SifraArtikla || "").localeCompare(String(b.SifraArtikla || ""))
    );
  }, [items]);

  function goBack() {
    router.push("/inventura");
  }

  function buildInventuraReport() {
    return {
      title: `Inventura ${id}`,
      subject: `Inventura ${id}`,
      subtitle: "Artikli inventure",
      meta: [
        { label: "Status", value: inventura?.Status || "OTVORENA" },
        { label: "Skladište", value: inventura?.Skladiste || "-" },
        { label: "Datum", value: fmtDate(inventura?.Datum) },
        { label: "Unio", value: inventura?.Unio || "-" },
        { label: "Stavki", value: sortedItems.length.toLocaleString("bs-BA") },
      ],
      columns: [
        { key: "sifra", label: "Šifra" },
        { key: "naziv", label: "Naziv" },
        { key: "sk", label: "SK" },
        { key: "kk", label: "KK" },
        { key: "mpc", label: "MPC" },
      ],
      rows: sortedItems.map((item) => ({
        sifra: item.SifraArtikla || "",
        naziv: item.NazivArtikla || "",
        sk: Number(item.StvarnaKolicina ?? 0).toLocaleString("bs-BA"),
        kk: Number(item.KnjigovodstvenaKolicina ?? 0).toLocaleString("bs-BA"),
        mpc: fmtMoney(item.MPC ?? 0),
      })),
    };
  }

  function printInventura() {
    printReport(buildInventuraReport());
  }

  function focusHiddenScanner() {
    if (showModal) return;
    const el = hiddenScanInputRef.current;
    if (!el) return;
    try {
      el.focus();
      el.select?.();
    } catch {}
  }

  function openNewItem(prefillSifra = "") {
    if (isLocked) return;

    setForm({
      sifra: prefillSifra || "",
      naziv: "",
      sk: "",
      kk: "",
      mpc: "",
      skladiste: inventura?.Skladiste || "",
      barcode: "",
      napomena: "Prvi unos",
    });
    setModalErr("");
    setShowModal(true);
  }

  function openEditItem(item) {
    if (isLocked) return;

    setForm({
      sifra: item?.SifraArtikla || "",
      naziv: item?.NazivArtikla || "",
      sk:
        item?.StvarnaKolicina !== undefined && item?.StvarnaKolicina !== null
          ? String(item.StvarnaKolicina)
          : "",
      kk:
        item?.KnjigovodstvenaKolicina !== undefined &&
        item?.KnjigovodstvenaKolicina !== null
          ? String(item.KnjigovodstvenaKolicina)
          : "",
      mpc:
        item?.MPC !== undefined && item?.MPC !== null
          ? String(item.MPC)
          : "",
      skladiste: item?.Skladiste || inventura?.Skladiste || "",
      barcode: item?.Barcode || "",
      napomena: item?.Napomena || "Prvi unos",
    });
    setModalErr("");
    setShowModal(true);
  }

  async function lookupBySifra(rawSifra) {
    const sifra = String(rawSifra || "").trim();
    if (!sifra) return;

    setLookupBusy(true);
    setModalErr("");

    try {
      const r = await fetch(
        `/api/zalihe/scan?code=${encodeURIComponent(sifra)}`,
        { cache: "no-store" }
      );
      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        setModalErr(j?.error || `API error (${r.status})`);
        return;
      }

      const item = j.item || {};
      const knjigovodstvenaKolicina =
        item.KnjigovodstvenaKolicina ??
        item.Kolicina ??
        item.Zaliha ??
        "";

      setForm((f) => ({
        ...f,
        sifra: item.SifraArtikla || sifra,
        naziv: item.NazivArtikla || "",
        sk:
          item.StvarnaKolicina !== undefined && item.StvarnaKolicina !== null
            ? String(item.StvarnaKolicina)
            : "",
        kk:
          knjigovodstvenaKolicina !== undefined &&
          knjigovodstvenaKolicina !== null &&
          knjigovodstvenaKolicina !== ""
            ? String(knjigovodstvenaKolicina)
            : "",
        mpc:
          item.MPC !== undefined && item.MPC !== null
            ? String(item.MPC)
            : "",
        skladiste: item.Skladiste || inventura?.Skladiste || "",
        barcode: item.Barcode || item.Barkod || "",
        napomena: item.Napomena || f.napomena || "Prvi unos",
      }));
    } catch (e) {
      setModalErr(String(e?.message || e));
    } finally {
      setLookupBusy(false);
    }
  }

  async function handleScannedCode(rawCode) {
    const code = String(rawCode || "").trim();
    if (!code || isLocked) return;

    setModalErr("");

    const existing = sortedItems.find((x) => {
      const sifra = String(x?.SifraArtikla || "").trim();
      const barcode = String(x?.Barcode || "").trim();
      return code === sifra || (barcode && code === barcode);
    });

    if (existing) {
      openEditItem(existing);
      return;
    }

    openNewItem(code);
    setTimeout(() => {
      lookupBySifra(code);
    }, 0);
  }

  async function saveItem() {
    if (isLocked) {
      setModalErr("Inventura je zaključena. Uređivanje nije dozvoljeno.");
      return;
    }

    setSaving(true);
    setModalErr("");

    try {
      const payload = {
        inventuraId: id,
        sifraArtikla: String(form.sifra || "").trim(),
        nazivArtikla: String(form.naziv || "").trim(),
        stvarnaKolicina: Number(form.sk || 0),
        knjigovodstvenaKolicina: Number(form.kk || 0),
        mpc: Number(form.mpc || 0),
        skladiste: String(form.skladiste || "").trim(),
        barcode: String(form.barcode || "").trim(),
        napomena: String(form.napomena || "").trim(),
        unio: "Admin",
      };

      if (!payload.sifraArtikla) {
        setModalErr("Šifra je obavezna.");
        return;
      }

      const r = await fetch("/api/inventura/item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        setModalErr(j?.error || `API error (${r.status})`);
        return;
      }

      setShowModal(false);
      await load();
    } catch (e) {
      setModalErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!showModal) return;
    const t = setTimeout(() => {
      sifraInputRef.current?.focus();
      sifraInputRef.current?.select?.();
    }, 40);
    return () => clearTimeout(t);
  }, [showModal]);

  useEffect(() => {
    if (showModal) return;
    const t = setTimeout(() => {
      focusHiddenScanner();
    }, 60);
    return () => clearTimeout(t);
    // scanner focus depends on the latest modal state through focusHiddenScanner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, loading]);

  useEffect(() => {
    function onPointerDown() {
      if (!showModal) {
        setTimeout(() => {
          focusHiddenScanner();
        }, 0);
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
    // scanner focus depends on the latest modal state through focusHiddenScanner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal]);

  useEffect(() => {
    function onGlobalScan(e) {
      if (showModal || isLocked) return;
      const code = String(e?.detail?.code || "").trim();
      if (code) handleScannedCode(code);
    }

    window.addEventListener("becleven-scan", onGlobalScan);
    return () => window.removeEventListener("becleven-scan", onGlobalScan);
    // handleScannedCode reads current inventory state; dependencies below refresh the listener when that state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, isLocked, sortedItems, inventura?.Skladiste]);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, []);

  const mode = loading ? "Učitavanje…" : data?.ok ? "UČITANO" : "GREŠKA";

  return (
    <main className="container page">
      {!showModal && (
        <input
          ref={hiddenScanInputRef}
          type="text"
          inputMode="none"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-hidden="true"
          data-scanner-sink="true"
          tabIndex={-1}
          onBlur={() => {
            if (!showModal) {
              setTimeout(() => {
                focusHiddenScanner();
              }, 0);
            }
          }}
          onKeyDown={(e) => {
            if (showModal || isLocked) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            if (e.key === "Enter") {
              const code = String(scanBufferRef.current || "").trim();
              scanBufferRef.current = "";
              if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
              if (code) {
                e.preventDefault();
                handleScannedCode(code);
              }
              return;
            }

            if (e.key.length === 1) {
              scanBufferRef.current += e.key;
              if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
              scanTimerRef.current = setTimeout(() => {
                scanBufferRef.current = "";
              }, 220);
            }
          }}
          style={{
            position: "fixed",
            opacity: 0,
            pointerEvents: "none",
            width: 1,
            height: 1,
            left: -9999,
            top: -9999,
          }}
        />
      )}

      <DesktopAppHeader title={`Inventura ${id}`} subtitle="Detalj inventure" status={mode} />

      <div className="topbar mobileOnlyHeader">
        <div>
          <div className="brand">Inventura {id}</div>
          <div className="subtitle">Detalj inventure</div>
        </div>

        <div className="pill clickable" role="button" tabIndex={0} title="Status">
          {mode}
        </div>
      </div>

      {!!err && !loading && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="small bad">{err}</div>
        </div>
      )}

      {inventura && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div className="small">Status:</div>
              <span style={statusChipStyle(inventura.Status || "")}>
                {String(inventura.Status || "OTVORENA")}
              </span>
              {isLocked && (
                <div className="small" style={{ opacity: 0.9 }}>
                  Inventura je zaključena — uređivanje je onemogućeno.
                </div>
              )}
            </div>

            <div className="small">
              Skladište: <b>{inventura.Skladiste || "—"}</b>
            </div>

            <div className="small">
              Stavki: <b>{sortedItems.length}</b>
            </div>
          </div>
        </div>
      )}

      <div className="sectionActionRow">
        <div className="sectionTitle" style={{ margin: 0 }}>
          Artikli inventure
        </div>

        <div className="sectionActionControls">
          <DocumentExportActions
            onPrint={printInventura}
            disabled={loading || !sortedItems.length}
            compact
          />

          <button
            className="btn clickable"
            type="button"
            onClick={goBack}
            style={{
              width: "auto",
              padding: "4px 10px",
              fontSize: 11,
              minHeight: 26,
            }}
          >
            Nazad
          </button>

          <button
            className="btn clickable"
            type="button"
            onClick={() => openNewItem()}
            disabled={isLocked}
            style={{
              width: "auto",
              padding: "4px 10px",
              fontSize: 11,
              minHeight: 26,
              opacity: isLocked ? 0.6 : 1,
            }}
          >
            Dodaj artikl
          </button>
        </div>
      </div>

      {loading ? (
        <div className="list">
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft">
              <div className="itemTitle">Učitavanje…</div>
              <div className="itemSub">Molimo sačekajte</div>
            </div>
            <div className="amount">—</div>
          </div>
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="list">
          <div className="item" style={{ opacity: 0.75 }}>
            <div className="itemLeft">
              <div className="itemTitle">Nema artikala</div>
              <div className="itemSub">Za ovu inventuru još nema unesenih stavki.</div>
            </div>
            <div className="amount">—</div>
          </div>
        </div>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Šifra</th>
                <th>Naziv</th>
                <th style={{ width: 120, textAlign: "right" }}>SK</th>
                <th style={{ width: 120, textAlign: "right" }}>KK</th>
                <th style={{ width: 120, textAlign: "right" }}>MPC</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((x) => (
                <tr
                  key={x.ID}
                  onClick={() => !isLocked && openEditItem(x)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !isLocked) {
                      e.preventDefault();
                      openEditItem(x);
                    }
                  }}
                  role="button"
                  tabIndex={isLocked ? -1 : 0}
                  title={isLocked ? "Inventura je zaključena" : "Klikni za uređivanje"}
                  style={{ cursor: isLocked ? "default" : "pointer" }}
                >
                  <td style={{ fontWeight: 900 }}>{x.SifraArtikla}</td>
                  <td>{x.NazivArtikla || ""}</td>
                  <td style={{ textAlign: "right", fontWeight: 900 }}>
                    {Number(x.StvarnaKolicina ?? 0).toLocaleString()}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 900 }}>
                    {Number(x.KnjigovodstvenaKolicina ?? 0).toLocaleString()}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 900 }}>
                    {fmtMoney(x.MPC ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div
          className="modalBack"
          onClick={() => !saving && setShowModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(3,8,20,.68)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            className="modalCard"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              borderRadius: 24,
              border: "1px solid var(--line)",
              background: "var(--card)",
              boxShadow: "0 20px 60px rgba(0,0,0,.35)",
              padding: 20,
            }}
          >
            <div
              className="modalTitle"
              style={{
                fontSize: 18,
                fontWeight: 900,
                marginBottom: 6,
              }}
            >
              Dodaj / uredi artikl
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div className="small">Šifra</div>
                <input
                  ref={sifraInputRef}
                  className="input"
                  value={form.sifra}
                  onChange={(e) => setForm((f) => ({ ...f, sifra: e.target.value }))}
                  onPaste={(e) => {
                    const pasted = String(e.clipboardData?.getData("text") || "").trim();
                    if (!pasted || isLocked) return;
                    setForm((f) => ({ ...f, sifra: pasted }));
                    setTimeout(() => lookupBySifra(pasted), 0);
                  }}
                  onBlur={(e) => lookupBySifra(e.target.value)}
                  placeholder="Unesi ili skeniraj šifru"
                  disabled={isLocked}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div className="small">Naziv</div>
                <input
                  className="input"
                  value={form.naziv}
                  onChange={(e) => setForm((f) => ({ ...f, naziv: e.target.value }))}
                  placeholder="Naziv artikla"
                  disabled={isLocked}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div className="small">Stvarna količina (SK)</div>
                <input
                  className="input"
                  type="number"
                  step="0.001"
                  value={form.sk}
                  onChange={(e) => setForm((f) => ({ ...f, sk: e.target.value }))}
                  disabled={isLocked}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div className="small">Knjigovodstvena količina (KK)</div>
                <input
                  className="input"
                  type="number"
                  step="0.001"
                  value={form.kk}
                  onChange={(e) => setForm((f) => ({ ...f, kk: e.target.value }))}
                  disabled={isLocked}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div className="small">MPC</div>
                <input
                  className="input"
                  type="number"
                  step="0.001"
                  value={form.mpc}
                  onChange={(e) => setForm((f) => ({ ...f, mpc: e.target.value }))}
                  disabled={isLocked}
                />
              </label>

              {lookupBusy && <div className="small">Provjera artikla…</div>}
              {!!modalErr && <div className="small bad">{modalErr}</div>}

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 6,
                }}
              >
                <button
                  className="btn clickable"
                  type="button"
                  onClick={saveItem}
                  disabled={saving || isLocked}
                  style={{
                    minWidth: 130,
                    width: 130,
                    textAlign: "center",
                  }}
                >
                  {saving ? "Čuvam…" : "Sačuvaj"}
                </button>

                <button
                  className="btn clickable"
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                  style={{
                    minWidth: 130,
                    width: 130,
                    textAlign: "center",
                  }}
                >
                  Nazad
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
