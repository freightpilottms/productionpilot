"use client";

import Link from "next/link";
import LogoHomeButton from "@/app/_ui/LogoHomeButton";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
import { isNavItemActive, NavIcon } from "@/app/_ui/navItems";
import {
  moduleAllowedForHref,
  normalizePermissions,
  PERMISSION_DENIED_SUBTEXT,
  PERMISSION_DENIED_TEXT,
} from "@/app/_ui/permissions";
import { announcePrijemNavigationBlocked, shouldBlockPrijemNavigation } from "@/app/_ui/prijemProcessingGuard";
import { formatDatabaseName } from "@/lib/format";

function setThemeOnHtml(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
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

const desktopSidebarItems = [
  { label: "Home", href: "/home", icon: "home" },
  { label: "Kupci", href: "/kupci", icon: "users" },
  { label: "Dobavljači", href: "/dobavljaci", icon: "truck" },
  { label: "Fakture", href: "/izdani-racuni", icon: "receipt" },
  { label: "Otvorene stavke", href: "/otvorene-stavke", icon: "receipt" },
  { label: "Računi", href: "/racuni", icon: "bank" },
  { label: "Krediti", href: "/zaduzenja", icon: "credit" },
  { label: "Zalihe", href: "/zalihe", icon: "boxes" },
  { label: "Prijem robe", href: "/prijem-robe", icon: "scan" },
  { label: "Inventura", href: "/inventura", icon: "inventory" },
  { label: "Restaurant App", href: "/restaurant-app", icon: "restaurant" },
];

export default function DesktopSidebar() {
  const pathname = usePathname() || "";
  const [profileOpen, setProfileOpen] = useState(false);
  const [session, setSession] = useState(() => readAuthSession()?.data || null);
  const [permissions, setPermissions] = useState(() => normalizePermissions(readAuthSession()?.data?.permissions));
  const [databases, setDatabases] = useState(() => {
    const cachedSession = readAuthSession()?.data || {};
    return readAuthDatabases(cachedSession)?.data?.databases || [];
  });
  const [selectedDb, setSelectedDb] = useState(() => readAuthSession()?.data?.database || "");
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState("");
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState(() => getSavedTheme());

  useEffect(() => {
    const saved = getSavedTheme();
    setTheme(saved);
    setThemeOnHtml(saved);
  }, []);

  useEffect(() => {
    let alive = true;

    async function hydrate() {
      const cached = readAuthSession();
      if (cached?.data?.authenticated) {
        setSession(cached.data);
        setPermissions(normalizePermissions(cached.data.permissions));
        setSelectedDb(cached.data.database || "");

        const cachedDatabases = readAuthDatabases(cached.data);
        if (cachedDatabases?.data?.databases?.length && !cachedDatabases.stale) {
          setDatabases(cachedDatabases.data.databases);
        }
      }

      try {
        const nextSession = await refreshAuthSession({ force: !cached?.data?.authenticated });
        if (!alive || !nextSession?.authenticated) return;
        setSession(nextSession);
        setPermissions(normalizePermissions(nextSession.permissions));
        setSelectedDb(nextSession.database || "");
      } catch {}
    }

    hydrate();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!profileOpen || databases.length) return;

    let alive = true;

    async function loadDatabases() {
      const cached = readAuthSession()?.data || session;
      if (!cached?.authenticated) return;

      try {
        const response = await fetch("/api/auth/databases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: cached.username,
            password: "__session__",
          }),
        });
        const json = await response.json().catch(() => null);
        if (!alive || !response.ok || !json?.ok) return;

        const dbList = Array.isArray(json.databases) ? json.databases : [];
        setDatabases(dbList);
        writeAuthDatabases(cached, dbList);
      } catch {}
    }

    loadDatabases();
    return () => {
      alive = false;
    };
  }, [databases.length, profileOpen, session]);

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

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeOnHtml(next);
  }

  const companyName = session?.companyName || formatDatabaseName(session?.database) || "BeCleven";
  const username = session?.username || "Korisnik";
  const activeDatabase = session?.database || "-";
  const modeLabel = session?.connectionMode === "offline" ? "Offline" : "Online";

  return (
    <aside className="desktopSidebar" aria-label="Desktop navigacija">
      <div className="desktopSidebarBrand">
        <LogoHomeButton
          slotClassName="desktopSidebarLogoSlot"
          imageClassName="desktopSidebarLogoImg"
          width={101}
          height={67}
        />
        <div>
          <strong>BeCleven</strong>
          <span>Business Management</span>
        </div>
      </div>

      <nav className="desktopSidebarNav" aria-label="Glavna navigacija">
        {desktopSidebarItems.map((item) => {
          const active = isNavItemActive(pathname, item);
          const allowed = moduleAllowedForHref(permissions, item.href);
          const title = allowed ? item.label : `${PERMISSION_DENIED_TEXT} ${PERMISSION_DENIED_SUBTEXT}`;

          if (!allowed) {
            return (
              <span key={item.href} className="desktopSidebarItem disabled" aria-disabled="true" title={title}>
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`desktopSidebarItem clickable ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
              title={title}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="desktopSidebarFooter">
        <button
          type="button"
          className={`desktopSidebarItem desktopSidebarProfileButton clickable ${profileOpen ? "active" : ""}`}
          onClick={() => setProfileOpen((open) => !open)}
          aria-expanded={profileOpen}
        >
          <NavIcon name="info" />
          <span>Profil</span>
        </button>

        {profileOpen && (
          <div className="desktopSidebarProfile">
            <div className="desktopSidebarProfileTop">
              <strong title={companyName}>{companyName}</strong>
              <span>{username} · {modeLabel}</span>
              <small title={activeDatabase}>{activeDatabase}</small>
            </div>

            <select
              className="desktopSidebarSelect"
              value={selectedDb}
              onChange={(event) => setSelectedDb(event.target.value)}
              disabled={busy || databases.length === 0}
            >
              <option value="">Odaberi bazu</option>
              {databases.map((db) => (
                <option key={db} value={db}>
                  {formatDatabaseName(db)}
                </option>
              ))}
            </select>

            <button className="desktopSidebarSmallBtn clickable" type="button" onClick={switchDatabase} disabled={busy || !selectedDb}>
              {busy && activeAction === "switch" ? "Promjena..." : "Promijeni bazu"}
            </button>
            <button className="desktopSidebarSmallBtn secondary clickable" type="button" onClick={logout} disabled={busy}>
              {busy && activeAction === "logout" ? "Odjava..." : "Odjavi se"}
            </button>
            {message && <div className="desktopSidebarMessage">{message}</div>}
          </div>
        )}

        <div className="desktopSidebarThemePanel">
          <div className="desktopSidebarThemeCopy">
            <span>Tema</span>
            <strong>{theme === "dark" ? "Tamno" : "Svijetlo"}</strong>
          </div>
          <button
            type="button"
            className="desktopSidebarThemeButton clickable"
            onClick={toggleTheme}
            aria-label="Promijeni temu"
            aria-pressed={theme === "light"}
            title="Tema"
          >
            <NavIcon name={theme === "dark" ? "moon" : "sun"} />
            <span>{theme === "dark" ? "Tamno" : "Svijetlo"}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
