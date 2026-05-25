"use client";
import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import { PermissionDeniedOverlay } from "@/app/_ui/DashboardWidgets";
import {
  clearDataCache,
  clearSessionCache,
  readAuthDatabases,
  readAuthSession,
  setActiveCacheScope,
  writeAuthDatabases,
  writeAuthSession,
} from "@/app/_ui/clientCache";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDatabaseName } from "@/lib/format";
import { moduleAllowedForHref, normalizePermissions } from "@/app/_ui/permissions";

function ScanModuleIcon() {
  return (
    <svg className="moduleSvgIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M4 8V5.8C4 4.8 4.8 4 5.8 4H8" />
      <path d="M16 4h2.2C19.2 4 20 4.8 20 5.8V8" />
      <path d="M20 16v2.2c0 1-.8 1.8-1.8 1.8H16" />
      <path d="M8 20H5.8C4.8 20 4 19.2 4 18.2V16" />
      <path d="M6 12h12" />
      <path d="M8 9h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

export default function Vise() {
  const [session, setSession] = useState(() => readAuthSession()?.data || null);
  const [databases, setDatabases] = useState(() => {
    const cachedSession = readAuthSession()?.data || {};
    return readAuthDatabases(cachedSession)?.data?.databases || [];
  });
  const [selectedDb, setSelectedDb] = useState(() => readAuthSession()?.data?.database || "");
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState("");
  const [msg, setMsg] = useState("");
  const [permissions, setPermissions] = useState(() => normalizePermissions(readAuthSession()?.data?.permissions));

  const items = [
    { title: "Računi", desc: "Banke (Računi)", href: "/racuni", icon: "🏦" },
    { title: "Krediti", desc: "Zaduženja/Pozajmice", href: "/zaduzenja", icon: "💳" },
    { title: "Izdani računi", desc: "Fakture, predračuni i POS promet", href: "/izdani-racuni", icon: "🧾" },
    { title: "Inventura", desc: "Popis – Pregled inventura", href: "/inventura", icon: "📦" },
    { title: "Prijem robe", desc: "Mobile OCR skeniranje dokumenta", href: "/prijem-robe", icon: <ScanModuleIcon /> },
    { title: "Otvorene stavke", desc: "Neplaćeni i nenaplaćeni računi", href: "/otvorene-stavke", icon: "📄" },
    { title: "Restaurant App", desc: "Demo narudžbe i stolovi", href: "/restaurant-app", icon: "🍽️" },
  ];

  useEffect(() => {
    document.body.classList.add("viseBody");
    return () => {
      document.body.classList.remove("viseBody");
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function init() {
      try {
        setMsg("");

        const cachedSession = readAuthSession();
        let j = cachedSession?.data || null;

        if (j?.authenticated && !cachedSession.stale) {
          setSession(j);
          setPermissions(normalizePermissions(j.permissions));
          setActiveCacheScope(j);
          setSelectedDb(j.database || "");

          const cachedDatabases = readAuthDatabases(j);
          if (cachedDatabases?.data?.databases?.length && !cachedDatabases.stale) {
            setDatabases(cachedDatabases.data.databases);
            return;
          }
        }

        setBusy(true);

        if (!j?.authenticated || cachedSession?.stale) {
          const r = await fetch("/api/auth/session", { cache: "no-store" });
          const rawSession = await r.json().catch(() => null);

          if (!alive) return;

          if (!r.ok || !rawSession?.ok) {
            window.location.href = "/login";
            return;
          }

          j = writeAuthSession(rawSession);
        }

        setSession(j);
        setPermissions(normalizePermissions(j.permissions));
        setActiveCacheScope(j);
        setSelectedDb(j.database || "");

        const cachedDatabases = readAuthDatabases(j);
        if (cachedDatabases?.data?.databases?.length && !cachedDatabases.stale) {
          setDatabases(cachedDatabases.data.databases);
          return;
        }

        const dbRes = await fetch("/api/auth/databases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: j.username,
            password: "__session__",
          }),
        });

        const dbJson = await dbRes.json().catch(() => null);

        if (!alive) return;

        if (!dbRes.ok || !dbJson?.ok) {
          setMsg(dbJson?.error || "Baze nije moguće učitati.");
          return;
        }

        const dbList = Array.isArray(dbJson.databases) ? dbJson.databases : [];
        setDatabases(dbList);
        writeAuthDatabases(j, dbList);

        if (!j.database && dbList.length > 0) {
          setSelectedDb(dbList[0]);
        }
      } catch (e) {
        if (!alive) return;
        window.location.href = "/login";
        return;
      } finally {
        if (alive) setBusy(false);
      }
    }

    init();

    return () => {
      alive = false;
    };
  }, []);

  async function switchDatabase() {
    if (!selectedDb) return;

    setBusy(true);
    setActiveAction("switch");
    setMsg("");

    try {
      const r = await fetch("/api/auth/switch-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database: selectedDb }),
      });

      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        setMsg(j?.error || "Promjena baze nije uspjela.");
        return;
      }

      const nextDatabase = j.database || selectedDb;
      const nextConnectionMode = j.connectionMode || session?.connectionMode || "online";
      const nextKonta = j.konta || session?.konta || {};

      setSession((prev) => ({
        ...(prev || {}),
        database: nextDatabase,
        connectionMode: nextConnectionMode,
        konta: nextKonta,
        companyName: formatDatabaseName(nextDatabase),
        permissions: j.permissions || prev?.permissions || {},
      }));

      clearDataCache();
      setActiveCacheScope({
        username: j.username || session?.username,
        database: nextDatabase,
        connectionMode: nextConnectionMode,
      });
      writeAuthSession({
        authenticated: true,
        username: j.username || session?.username || null,
        database: nextDatabase,
        companyName: formatDatabaseName(nextDatabase),
        connectionMode: nextConnectionMode,
        konta: nextKonta,
        permissions: j.permissions || session?.permissions || {},
      });
      setPermissions(normalizePermissions(j.permissions || session?.permissions));
      try {
        localStorage.setItem("becleven_last_database", nextDatabase);
      } catch {}

      setMsg("Baza je uspješno promijenjena.");
      window.location.replace("/home");
    } catch (e) {
      setMsg(String(e?.message || e || "Greška pri promjeni baze."));
    } finally {
      setBusy(false);
      setActiveAction("");
    }
  }

  async function logoutOrLogin() {
    setBusy(true);
    setActiveAction("logout");
    try {
      clearSessionCache();
      clearDataCache();
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/login");
    }
  }

  const firma = session?.companyName || formatDatabaseName(session?.database) || "—";

  const vlasnik = session?.username || "—";
  const aktivnaBaza = session?.database || "—";

  const modeLabel = session?.connectionMode === "offline" ? "Offline (lokalno)" : "Online";
  const verzija = "RAJ App v1.0";
  const kontaktEmail = "support@beclevenapp.com";
  const kontaktTel = "+387 62 767 003";

  const databaseDisabled = busy || databases.length === 0;
  const visibleItems = items.map((item) => ({
    ...item,
    allowed: moduleAllowedForHref(permissions, item.href),
  }));

  return (
    <main className="container page">
      <DesktopAppHeader title="Više" subtitle="Dodatni moduli i postavke" status={busy || !session ? "Učitavanje…" : "UČITANO"} />

      <div className="topbar mobileOnlyHeader">
        <div>
          <div className="brand">Više</div>
          <div className="subtitle">Dodatni moduli i postavke</div>
        </div>

        <div style={{ width: 96 }} />
      </div>

      <div className="modulesGrid" style={{ marginTop: 12 }}>
        {visibleItems.map((x) => {
          const inner = (
            <div className={`moduleInner ${x.allowed ? "" : "permissionLockedBlur"}`.trim()}>
              <div className="moduleLeft">
                <div className="moduleIconBox" aria-hidden="true">
                  <div className="moduleIcon">{x.icon}</div>
                </div>
                <div className="moduleText">
                  <div className="moduleTitle">{x.title}</div>
                  <div className="small moduleDesc">{x.desc}</div>
                </div>
              </div>
              <div className="pill pillAction">Otvori</div>
            </div>
          );

          if (!x.allowed) {
            return (
              <div
                key={x.href}
                className={`card moduleCard permissionLocked ${x.href === "/prijem-robe" ? "moduleCardPrijem" : ""}`.trim()}
                aria-disabled="true"
              >
                {inner}
                <PermissionDeniedOverlay />
              </div>
            );
          }

          return (
            <Link
              key={x.href}
              href={x.href}
              className={`card clickable moduleCard ${x.href === "/prijem-robe" ? "moduleCardPrijem" : ""}`.trim()}
              aria-label="Otvori"
            >
              {inner}
            </Link>
          );
        })}
      </div>

      <div className="sectionTitle">Informacije:</div>

      <div className="card viseInfoCard">
        <div className="viseDesktopInfoGrid">
          <div className="viseProfileColumn">
            <div className="viseCompanySummary">
        <div className="cardTitle" style={{ margin: 0 }}>Profil firme:</div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 950, fontSize: 15, lineHeight: "18px" }}>{firma}</div>
          <div className="small" style={{ marginTop: 6 }}>
            Korisnik: <b>{vlasnik}</b>
          </div>
          <div className="small">
            Aktivna baza: <b>{aktivnaBaza}</b>
          </div>

          <div className="small">
            Mode: <b>{modeLabel}</b>
          </div>
        </div>
            </div>

        <div className="subCard viseDatabaseCard">
          <div className="viseDatabaseActions">
            <select
              className="input"
              value={selectedDb}
              onChange={(e) => setSelectedDb(e.target.value)}
              disabled={databaseDisabled}
            >
              <option value="">
                {"Odaberi bazu"}
              </option>
              {databases.map((db) => (
                <option key={db} value={db}>
                  {formatDatabaseName(db)}
                </option>
              ))}
            </select>

            <button
              className="btn clickable"
              type="button"
              onClick={switchDatabase}
              disabled={busy || !selectedDb}
              style={{ opacity: busy && activeAction !== "switch" ? 0.6 : undefined }}
            >
              {busy && activeAction === "switch" ? "Promjena..." : "Promijeni bazu"}
            </button>

            <button
              className="btn clickable"
              type="button"
              onClick={logoutOrLogin}
              disabled={busy}
              style={{ opacity: busy && activeAction !== "logout" ? 1 : undefined }}
            >
              {busy && activeAction === "logout" ? "Odjava..." : "Odjavi se"}
            </button>
          </div>

          <div className="small" style={{ marginTop: msg ? 8 : 4, minHeight: msg ? 18 : 0 }}>
            {msg}
          </div>
        </div>
          </div>

          <div className="viseSystemColumn">
        <div className="infoGrid2 viseSystemGrid">
          <div className="subCard">
            <div className="subCardTitle">Sistem</div>
            <div className="subCardValue">RAJ BeCleven</div>
            <div className="small" style={{ marginTop: 4 }}>Nema dostupnih ažuriranja.</div>
          </div>

          <div className="subCard">
            <div className="subCardTitle">Verzija</div>
            <div className="subCardValue">{verzija}</div>
            <div className="small" style={{ marginTop: 4 }}>Zadnja nadogradnja: 12.05.2026</div>
          </div>
        </div>

        <div className="subCard viseSupportCard">
          <div className="subCardTitle">Podrška / Kontakt</div>
          <div className="small" style={{ marginTop: 6 }}>
            E-mail: <b>{kontaktEmail}</b>
          </div>
          <div className="small">
            Telefon: <b>{kontaktTel}</b>
          </div>
          <div className="small" style={{ marginTop: 6, opacity: 0.8 }}>
            - Molimo da nam javite ukoliko imate bilo kakve smetnje.
          </div>
        </div>
          </div>
        </div>
      </div>

      <div className="app-footer homeCopyright">
        © {new Date().getFullYear()} BeCleven App | AK Solutions • Sva prava pridržana
      </div>
    </main>
  );
}
