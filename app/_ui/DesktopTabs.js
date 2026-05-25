"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  clearDataCache,
  clearSessionCache,
  readAuthDatabases,
  readAuthSession,
  refreshAuthSession,
  setActiveCacheScope,
  writeAuthDatabases,
  writeAuthSession,
} from "@/app/_ui/clientCache";
import { formatDatabaseName } from "@/lib/format";
import { isNavItemActive, NavIcon } from "@/app/_ui/navItems";
import { announcePrijemNavigationBlocked, shouldBlockPrijemNavigation } from "@/app/_ui/prijemProcessingGuard";
import { moduleAllowedForHref, normalizePermissions, PERMISSION_DENIED_SUBTEXT, PERMISSION_DENIED_TEXT } from "@/app/_ui/permissions";

const desktopTabs = [
  { label: "Kupci", href: "/kupci", icon: "users" },
  { label: "Dobavljači", href: "/dobavljaci", icon: "truck" },
  { label: "Fakture", href: "/izdani-racuni", icon: "receipt" },
  { label: "Otvorene", href: "/otvorene-stavke", icon: "receipt" },
  { label: "Računi", href: "/racuni", icon: "bank" },
  { label: "Home", href: "/home", icon: "home" },
  { label: "Krediti", href: "/zaduzenja", icon: "credit" },
  { label: "Zalihe", href: "/zalihe", icon: "boxes" },
  { label: "Inventura", href: "/inventura", icon: "inventory" },
];

const APP_VERSION = "RAJ App v1.0";
const LAST_UPDATE = "12.05.2026";
const CONTACT_EMAIL = "support@beclevenapp.com";
const CONTACT_PHONE = "+387 62 767 003";

export default function DesktopTabs({ className = "" }) {
  const pathname = usePathname() || "";
  const [infoOpen, setInfoOpen] = useState(false);
  const [session, setSession] = useState(() => readAuthSession()?.data || null);
  const [databases, setDatabases] = useState(() => {
    const cachedSession = readAuthSession()?.data || {};
    return readAuthDatabases(cachedSession)?.data?.databases || [];
  });
  const [selectedDb, setSelectedDb] = useState(() => readAuthSession()?.data?.database || "");
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState("");
  const [message, setMessage] = useState("");
  const [permissions, setPermissions] = useState(() => normalizePermissions(readAuthSession()?.data?.permissions));
  const infoRef = useRef(null);

  useEffect(() => {
    let alive = true;

    async function loadPermissions() {
      const cached = readAuthSession();
      if (cached?.data?.permissions) {
        setPermissions(normalizePermissions(cached.data.permissions));
        setSession((prev) => prev || cached.data);
        setSelectedDb((prev) => prev || cached.data.database || "");
      }

      try {
        const nextSession = await refreshAuthSession({ force: !cached?.data?.authenticated });
        if (!alive || !nextSession?.authenticated) return;
        setSession(nextSession);
        setSelectedDb(nextSession.database || "");
        setPermissions(normalizePermissions(nextSession.permissions));
      } catch {}
    }

    loadPermissions();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!infoOpen) return;

    function onPointerDown(event) {
      if (infoRef.current?.contains(event.target)) return;
      setInfoOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") setInfoOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [infoOpen]);

  useEffect(() => {
    if (!infoOpen || databases.length) return;

    let alive = true;

    async function loadInfo() {
      const cachedSession = readAuthSession();
      const cachedSessionData = cachedSession?.data || null;
      if (cachedSessionData?.authenticated) {
        setSession(cachedSessionData);
        setPermissions(normalizePermissions(cachedSessionData.permissions));
        setSelectedDb(cachedSessionData.database || "");

        const cachedDatabases = readAuthDatabases(cachedSessionData);
        if (cachedDatabases?.data?.databases?.length && !cachedDatabases.stale) {
          setDatabases(cachedDatabases.data.databases);
          setMessage("");
          return;
        }
      }

      setLoadingInfo(true);
      setMessage("");

      try {
        let sessionJson = cachedSessionData;

        if (!sessionJson?.authenticated || cachedSession?.stale) {
          const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
          const rawSessionJson = await sessionResponse.json().catch(() => null);

          if (!alive) return;

          if (!sessionResponse.ok || !rawSessionJson?.ok) {
            setMessage("Sesija nije dostupna.");
            return;
          }

          sessionJson = writeAuthSession(rawSessionJson);
        }

        setSession(sessionJson);
        setPermissions(normalizePermissions(sessionJson.permissions));
        setSelectedDb(sessionJson.database || "");

        const dbResponse = await fetch("/api/auth/databases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: sessionJson.username,
            password: "__session__",
          }),
        });
        const dbJson = await dbResponse.json().catch(() => null);

        if (!alive) return;

        if (!dbResponse.ok || !dbJson?.ok) {
          setMessage(dbJson?.error || "Baze nije moguće učitati.");
          return;
        }

        const dbList = Array.isArray(dbJson.databases) ? dbJson.databases : [];
        setDatabases(dbList);
        writeAuthDatabases(sessionJson, dbList);
        if (!sessionJson.database && dbList.length) setSelectedDb(dbList[0]);
        setMessage("");
      } catch {
        if (alive) setMessage("Informacije trenutno nisu dostupne.");
      } finally {
        if (alive) setLoadingInfo(false);
      }
    }

    loadInfo();

    return () => {
      alive = false;
    };
  }, [infoOpen, databases.length]);

  async function switchDatabase() {
    if (!selectedDb) return;
    if (shouldBlockPrijemNavigation("/home")) {
      announcePrijemNavigationBlocked();
      return;
    }

    setBusy(true);
    setActiveAction("switch");
    setMessage("");

    try {
      const response = await fetch("/api/auth/switch-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database: selectedDb }),
      });
      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.ok) {
        setMessage(json?.error || "Promjena baze nije uspjela.");
        return;
      }

      const nextDatabase = json.database || selectedDb;
      const nextConnectionMode = json.connectionMode || session?.connectionMode || "online";
      const nextKonta = json.konta || session?.konta || {};

      setSession((prev) => ({
        ...(prev || {}),
        database: nextDatabase,
        connectionMode: nextConnectionMode,
        konta: nextKonta,
        companyName: formatDatabaseName(nextDatabase),
        permissions: json.permissions || prev?.permissions || {},
      }));
      setPermissions(normalizePermissions(json.permissions || session?.permissions));

      clearDataCache();
      setActiveCacheScope({
        username: json.username || session?.username,
        database: nextDatabase,
        connectionMode: nextConnectionMode,
      });
      writeAuthSession({
        authenticated: true,
        username: json.username || session?.username || null,
        database: nextDatabase,
        companyName: formatDatabaseName(nextDatabase),
        connectionMode: nextConnectionMode,
        konta: nextKonta,
        permissions: json.permissions || session?.permissions || {},
      });

      try {
        localStorage.setItem("becleven_last_database", nextDatabase);
      } catch {}

      window.location.replace("/home");
    } catch (error) {
      setMessage(String(error?.message || error || "Greška pri promjeni baze."));
    } finally {
      setBusy(false);
      setActiveAction("");
    }
  }

  async function logout() {
    if (shouldBlockPrijemNavigation("/login")) {
      announcePrijemNavigationBlocked();
      return;
    }

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

  const companyName = session?.companyName || formatDatabaseName(session?.database) || "-";
  const username = session?.username || "-";
  const activeDatabase = session?.database || "-";
  const modeLabel = session?.connectionMode === "offline" ? "Offline (lokalno)" : "Online";
  const databaseDisabled = loadingInfo || busy || databases.length === 0;
  const actionDisabled = busy || loadingInfo || !selectedDb;

  return (
    <nav className={`desktopInlineTabs ${className}`.trim()} aria-label="Glavna navigacija">
      {desktopTabs.map((tab) => {
        const active = isNavItemActive(pathname, tab);
        const allowed = moduleAllowedForHref(permissions, tab.href);
        const title = allowed ? tab.label : `${PERMISSION_DENIED_TEXT} ${PERMISSION_DENIED_SUBTEXT}`;

        if (!allowed) {
          return (
            <span
              key={tab.href}
              className="desktopInlineTab permissionDisabledTab"
              aria-label={tab.label}
              aria-disabled="true"
              title={title}
            >
              <NavIcon name={tab.icon} />
              <span className="navText">{tab.label}</span>
            </span>
          );
        }

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`desktopInlineTab clickable ${active ? "active" : ""}`}
            aria-label={tab.label}
            aria-current={active ? "page" : undefined}
            title={title}
          >
            <NavIcon name={tab.icon} />
            <span className="navText">{tab.label}</span>
          </Link>
        );
      })}

      <div className="desktopInfoTabWrap" ref={infoRef}>
        <button
          className={`desktopInlineTab clickable desktopInfoTab ${infoOpen ? "active" : ""}`}
          type="button"
          aria-label="Profil"
          aria-expanded={infoOpen}
          title="Profil"
          onClick={() => setInfoOpen((open) => !open)}
        >
          <NavIcon name="info" />
          <span className="navText">PROFIL</span>
        </button>

        {infoOpen && (
          <div className="desktopInfoPopup" role="dialog" aria-label="Informacije">
            <div className="desktopInfoPopupHead">
              <div>
                <div className="desktopInfoKicker">Profil firme</div>
                <div className="desktopInfoCompany" title={companyName}>{companyName}</div>
              </div>
              <button className="desktopInfoClose clickable" type="button" onClick={() => setInfoOpen(false)} aria-label="Zatvori">
                ×
              </button>
            </div>

            <div className="desktopInfoMeta">
              <div>Korisnik: <b>{username}</b></div>
              <div>Aktivna baza: <b>{activeDatabase}</b></div>
              <div>Mode: <b>{modeLabel}</b></div>
            </div>

            <div className="desktopInfoControls">
              <select
                className="input"
                value={selectedDb}
                onChange={(event) => setSelectedDb(event.target.value)}
                disabled={databaseDisabled}
              >
                <option value="">{loadingInfo ? "Učitavanje baza..." : "Odaberi bazu"}</option>
                {databases.map((db) => (
                  <option key={db} value={db}>
                    {formatDatabaseName(db)}
                  </option>
                ))}
              </select>
              <button className="btn clickable" type="button" onClick={switchDatabase} disabled={actionDisabled}>
                {busy && activeAction === "switch" ? "Promjena..." : "Promijeni bazu"}
              </button>
              <button className="btn clickable" type="button" onClick={logout} disabled={busy}>
                {busy && activeAction === "logout" ? "Odjava..." : "Odjavi se"}
              </button>
              {message && (
                <div className="small desktopInfoMessage">
                  {message}
                </div>
              )}
            </div>

            <div className="desktopInfoGrid">
              <div className="subCard">
                <div className="subCardTitle">Sistem</div>
                <div className="subCardValue">RAJ BeCleven</div>
                <div className="small">Nema dostupnih ažuriranja.</div>
              </div>
              <div className="subCard">
                <div className="subCardTitle">Verzija</div>
                <div className="subCardValue">{APP_VERSION}</div>
                <div className="small">Zadnja nadogradnja: {LAST_UPDATE}</div>
              </div>
            </div>

            <div className="subCard desktopInfoSupport">
              <div className="subCardTitle">Podrška / Kontakt</div>
              <div className="small">E-mail: <b>{CONTACT_EMAIL}</b></div>
              <div className="small">Telefon: <b>{CONTACT_PHONE}</b></div>
              <div className="small desktopInfoNote">Molimo da nam javite ukoliko imate bilo kakve smetnje.</div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
