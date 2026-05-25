"use client";
import { clearDataCache, readCachedJson, setActiveCacheScope, writeAuthDatabases, writeAuthSession, writeCachedJson } from "@/app/_ui/clientCache";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

const SERVER_STORAGE_KEY = "becleven_server_input";
const CONNECTION_MODE_STORAGE_KEY = "becleven_connection_mode";
const KONTA_RACUNI_STORAGE_KEY = "becleven_konta_racuni";
const KONTA_KUPCI_STORAGE_KEY = "becleven_konta_kupci";
const KONTA_DOBAVLJACI_STORAGE_KEY = "becleven_konta_dobavljaci";

function normalizeConnectionMode(v) {
  return String(v || "online").toLowerCase() === "offline" ? "offline" : "online";
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [database, setDatabase] = useState("");
  const [databases, setDatabases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [logining, setLogining] = useState(false);
  const [msg, setMsg] = useState("");
  const [showDbModal, setShowDbModal] = useState(false);

  const [logoClicks, setLogoClicks] = useState([]);
  const [showServerModal, setShowServerModal] = useState(false);
  const [serverInput, setServerInput] = useState("");
  const [connectionMode, setConnectionMode] = useState("online");
  const [kontaRacuniInput, setKontaRacuniInput] = useState("");
  const [kontaKupciInput, setKontaKupciInput] = useState("");
  const [kontaDobavljaciInput, setKontaDobavljaciInput] = useState("");

  const canStart = useMemo(() => {
    return username.trim() !== "" && password.trim() !== "";
  }, [username, password]);

  const canFinish = useMemo(() => {
    return canStart && database.trim() !== "";
  }, [canStart, database]);

  function formatLoginMessage(rawMessage, currentUsername) {
    const raw = String(rawMessage || "").trim();
    const safeUser = String(currentUsername || "").trim();

    if (!raw) return "";

    if (raw.toLowerCase().includes("login failed for user")) {
      return safeUser
        ? `Prijava nije uspjela za korisnika: ${safeUser}`
        : "Prijava nije uspjela za korisnika.";
    }

    return raw;
  }

  function handleLogoClick() {
    const now = Date.now();
    const next = [...logoClicks, now].filter((t) => now - t <= 2000);

    if (next.length >= 5) {
      setShowServerModal(true);
      setLogoClicks([]);
      return;
    }

    setLogoClicks(next);
  }

  function saveServerSettings() {
    const cleanServer = String(serverInput || "").trim();
    const cleanMode = normalizeConnectionMode(connectionMode);

    try {
      localStorage.setItem(CONNECTION_MODE_STORAGE_KEY, cleanMode);
      localStorage.setItem(KONTA_RACUNI_STORAGE_KEY, kontaRacuniInput.trim());
      localStorage.setItem(KONTA_KUPCI_STORAGE_KEY, kontaKupciInput.trim());
      localStorage.setItem(KONTA_DOBAVLJACI_STORAGE_KEY, kontaDobavljaciInput.trim());

      if (cleanServer) {
        localStorage.setItem(SERVER_STORAGE_KEY, cleanServer);
      } else {
        localStorage.removeItem(SERVER_STORAGE_KEY);
      }
    } catch {}

    setShowServerModal(false);
    setMsg(
      cleanMode === "offline"
        ? "Offline/local postavke su sačuvane."
        : cleanServer
        ? "Online server postavke su sačuvane."
        : "Server postavke su vraćene na zadane."
    );
  }

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem("becleven_last_username") || "";
      const savedDatabase = localStorage.getItem("becleven_last_database") || "";
      const savedServer = localStorage.getItem(SERVER_STORAGE_KEY) || "";
      const savedMode = normalizeConnectionMode(
        localStorage.getItem(CONNECTION_MODE_STORAGE_KEY) || "online"
      );
      const savedKontaRacuni = localStorage.getItem(KONTA_RACUNI_STORAGE_KEY) || "";
      const savedKontaKupci = localStorage.getItem(KONTA_KUPCI_STORAGE_KEY) || "";
      const savedKontaDobavljaci = localStorage.getItem(KONTA_DOBAVLJACI_STORAGE_KEY) || "";

      if (savedUser) setUsername(savedUser);
      if (savedDatabase) setDatabase(savedDatabase);
      if (savedServer) setServerInput(savedServer);
      setKontaRacuniInput(savedKontaRacuni);
      setKontaKupciInput(savedKontaKupci);
      setKontaDobavljaciInput(savedKontaDobavljaci);
      setConnectionMode(savedMode);
    } catch {}

    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/auth/session", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (r.ok && j?.ok) {
          window.location.href = "/home";
        }
      } catch {}
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setDatabase("");
    setDatabases([]);
    setShowDbModal(false);
    setMsg("");
  }, [username, password]);

  useEffect(() => {
    document.documentElement.classList.add("loginNoScroll");
    document.body.classList.add("loginNoScroll");

    return () => {
      document.documentElement.classList.remove("loginNoScroll");
      document.body.classList.remove("loginNoScroll");
    };
  }, []);

  async function beginLogin(e) {
    e?.preventDefault?.();
    if (!canStart || loading) return;

    const cleanMode = normalizeConnectionMode(connectionMode);
    const cleanServer = String(serverInput || "").trim();

    if (cleanMode === "offline" && !cleanServer) {
      setMsg("Offline/local mode zahtijeva SQL server adresu.");
      setShowServerModal(true);
      return;
    }

    const dbCacheKey = `becleven:login:dbs:${cleanMode}:${cleanServer}:${username.trim().toLowerCase()}`;
    const cached = readCachedJson(dbCacheKey);
    if (cached?.data?.databases?.length) {
      const cachedRows = cached.data.databases;
      let savedDatabase = "";
      try {
        savedDatabase = localStorage.getItem("becleven_last_database") || "";
      } catch {}

      setDatabases(cachedRows);
      setDatabase(cachedRows.includes(savedDatabase) ? savedDatabase : cachedRows[0] || "");
      setShowDbModal(true);
      setMsg("Provjeravam pristup i osvježavam baze...");
    }

    setLoading(true);
    if (!cached?.data?.databases?.length) setMsg("");

    try {
      const r = await fetch("/api/auth/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          serverInput: cleanServer,
          connectionMode: cleanMode,
        }),
      });
      const j = await r.json();

      if (!r.ok || !j?.ok) {
        setShowDbModal(false);
        setDatabases([]);
        setDatabase("");
        setMsg(formatLoginMessage(j?.error || "Prijava nije uspjela.", username));
        return;
      }

      const rows = Array.isArray(j?.databases) ? j.databases : [];
      let savedDatabase = "";
      try {
        savedDatabase = localStorage.getItem("becleven_last_database") || "";
      } catch {}

      writeCachedJson(dbCacheKey, { databases: rows });
      setDatabases(rows);
      setDatabase(rows.includes(savedDatabase) ? savedDatabase : rows[0] || "");
      setShowDbModal(true);
      setMsg(rows.length ? "Odaberi bazu za nastavak." : "Nema dostupnih baza za ovog korisnika.");
    } catch (e) {
      setShowDbModal(false);
      setDatabases([]);
      setDatabase("");
      setMsg(formatLoginMessage(String(e?.message || e || "Greška pri prijavi."), username));
    } finally {
      setLoading(false);
    }
  }

  async function finishLogin(e) {
    e?.preventDefault?.();
    if (!canFinish || logining) return;

    const cleanMode = normalizeConnectionMode(connectionMode);
    const cleanServer = String(serverInput || "").trim();

    if (cleanMode === "offline" && !cleanServer) {
      setMsg("Offline/local mode zahtijeva SQL server adresu.");
      setShowServerModal(true);
      return;
    }

    setLogining(true);
    setMsg("");

    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          database,
          serverInput: cleanServer,
          connectionMode: cleanMode,
          konta: {
            racuni: kontaRacuniInput,
            kupci: kontaKupciInput,
            dobavljaci: kontaDobavljaciInput,
          },
        }),
      });
      const j = await r.json();

      if (!r.ok || !j?.ok) {
        setMsg(formatLoginMessage(j?.error || "Prijava nije uspjela.", username));
        return;
      }

      try {
        localStorage.setItem("becleven_last_username", username);
        localStorage.setItem("becleven_last_database", database);
        localStorage.setItem(CONNECTION_MODE_STORAGE_KEY, cleanMode);
        localStorage.setItem(KONTA_RACUNI_STORAGE_KEY, kontaRacuniInput.trim());
        localStorage.setItem(KONTA_KUPCI_STORAGE_KEY, kontaKupciInput.trim());
        localStorage.setItem(KONTA_DOBAVLJACI_STORAGE_KEY, kontaDobavljaciInput.trim());
        clearDataCache();
        setActiveCacheScope({
          username,
          database,
          connectionMode: cleanMode,
          konta: j.konta || {
            racuni: kontaRacuniInput,
            kupci: kontaKupciInput,
            dobavljaci: kontaDobavljaciInput,
          },
        });
        const nextSession = writeAuthSession({
          authenticated: true,
          username,
          database,
          companyName: j.companyName || database,
          connectionMode: cleanMode,
          konta: j.konta || {
            racuni: kontaRacuniInput,
            kupci: kontaKupciInput,
            dobavljaci: kontaDobavljaciInput,
          },
          permissions: j.permissions || {},
        });
        writeAuthDatabases(nextSession, databases);

        if (cleanServer) {
          localStorage.setItem(SERVER_STORAGE_KEY, cleanServer);
        } else {
          localStorage.removeItem(SERVER_STORAGE_KEY);
        }
      } catch {}

      window.location.href = "/home";
    } catch (e) {
      setMsg(formatLoginMessage(String(e?.message || e || "Greška pri prijavi."), username));
    } finally {
      setLogining(false);
    }
  }

  return (
    <main className="container page loginPage">
      <div className="loginCenter">
        <div className="login-logo-wrap">
          <Image
            src="/raj-logo.png"
            alt="RAJ App"
            width={240}
            height={160}
            className="login-logo"
            unoptimized
            onClick={handleLogoClick}
            role="button"
            tabIndex={0}
          />
        </div>

        <div className="card loginCard">
          <div className="loginTitle">Prijava:</div>

          <form onSubmit={beginLogin} className="loginForm">
            <input
              className="input"
              placeholder="Korisnik"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />

            <input
              className="input"
              placeholder="Lozinka"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              className="btn clickable"
              type="submit"
              disabled={!canStart || loading}
              style={{ marginTop: 4, opacity: canStart ? 1 : 0.6 }}
            >
              {loading ? "Provjera..." : "Prijavi se"}
            </button>
          </form>

          <div className="muted loginMsg">{msg}</div>
        </div>

        <div className="app-footer loginFooter">
          © {new Date().getFullYear()} BeCleven App | AK Solutions • Sva prava pridržana
        </div>
      </div>

      {showDbModal && (
        <div className="modalBack" onClick={() => !logining && setShowDbModal(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle">Odabir baze</div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <select
                className="input"
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                disabled={logining || databases.length === 0}
              >
                <option value="">Odaberi bazu</option>
                {databases.map((db) => (
                  <option key={db} value={db}>
                    {db}
                  </option>
                ))}
              </select>

              <button
                className="btn clickable"
                type="button"
                onClick={finishLogin}
                disabled={!canFinish || logining}
              >
                {logining ? "Prijava..." : "Prijavi se"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showServerModal && (
        <div className="modalBack" onClick={() => setShowServerModal(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle" style={{ textAlign: "center" }}>
              Server postavke
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  className="btn clickable"
                  onClick={() => setConnectionMode("online")}
                  style={{
                    opacity: connectionMode === "online" ? 1 : 0.65,
                    border:
                      connectionMode === "online"
                        ? "1px solid var(--accent)"
                        : "1px solid var(--line)",
                  }}
                >
                  Online
                </button>

                <button
                  type="button"
                  className="btn clickable"
                  onClick={() => setConnectionMode("offline")}
                  style={{
                    opacity: connectionMode === "offline" ? 1 : 0.65,
                    border:
                      connectionMode === "offline"
                        ? "1px solid var(--accent)"
                        : "1px solid var(--line)",
                  }}
                >
                  OFFLINE
                </button>
              </div>

              <input
                className="input"
                placeholder={
                  connectionMode === "offline"
                    ? "npr. localhost\\SQLEXPRESS ili 192.168.1.50\\SQLEXPRESS"
                    : "npr. 144.76.219.4\\BECLEVENCLOUD,4263"
                }
                value={serverInput}
                onChange={(e) => setServerInput(e.target.value)}
              />

              <div className="muted" style={{ fontSize: 12, lineHeight: 1.4, textAlign: "center" }}>
                {connectionMode === "offline"
                  ? "Offline/local mode radi samo kada je aplikacija pokrenuta lokalno na računaru/serveru koji vidi lokalni SQL. Mobiteli aplikaciji pristupaju preko lokalne Wi‑Fi IP adrese."
                  : "Ako je polje prazno, koristi se zadani server iz podešavanja."}
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <input
                  className="input"
                  placeholder="Konta računa (default: 1000, 1010, 1020, 1030, 1040)"
                  value={kontaRacuniInput}
                  onChange={(e) => setKontaRacuniInput(e.target.value)}
                />

                <input
                  className="input"
                  placeholder="Konta kupaca (default: 2110, 2120)"
                  value={kontaKupciInput}
                  onChange={(e) => setKontaKupciInput(e.target.value)}
                />

                <input
                  className="input"
                  placeholder="Konta dobavljača (default: 4320, 4330)"
                  value={kontaDobavljaciInput}
                  onChange={(e) => setKontaDobavljaciInput(e.target.value)}
                />

                <div className="muted" style={{ fontSize: 11, lineHeight: 1.35, textAlign: "center" }}>
                  Unesi više konta odvojeno zarezom ili razmakom. Ako polje ostane prazno, koristi se postojeći default.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn clickable"
                  type="button"
                  onClick={saveServerSettings}
                  style={{ flex: 1 }}
                >
                  Sačuvaj
                </button>

                <button
                  className="btn clickable"
                  type="button"
                  onClick={() => setShowServerModal(false)}
                  style={{ flex: 1 }}
                >
                  Zatvori
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
