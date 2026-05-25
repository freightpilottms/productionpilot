"use client";

export const CACHE_TTL_MS = 5 * 60 * 1000;
export const AUTH_SESSION_CACHE_KEY = "becleven:auth:session";
export const AUTH_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const AUTH_DATABASES_TTL_MS = 12 * 60 * 60 * 1000;
const DATA_CACHE_PREFIX = "becleven:data:";
const ACTIVE_SCOPE_KEY = "becleven:cache:activeScope";
const FETCH_INFLIGHT_KEY = "__becleven_fetch_json_inflight__";
const AUTH_SYNC_KEY = "__becleven_auth_session_sync__";
const fetchInflight = globalThis[FETCH_INFLIGHT_KEY] || new Map();
globalThis[FETCH_INFLIGHT_KEY] = fetchInflight;
const authSessionSync = globalThis[AUTH_SYNC_KEY] || { promise: null, checked: false };
globalThis[AUTH_SYNC_KEY] = authSessionSync;
const LEGACY_DATA_PREFIXES = [
  "becleven:home",
  "becleven:kupci:",
  "becleven:dobavljaci:",
  "becleven:zalihe:",
  "becleven:izdani-racuni:",
];

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeScopePart(value) {
  const clean = String(value || "none").trim().toLowerCase() || "none";
  return encodeURIComponent(clean);
}

export function buildCacheScope({ username, database, connectionMode } = {}) {
  return [
    normalizeScopePart(username),
    normalizeScopePart(database),
    normalizeScopePart(connectionMode || "online"),
  ].join("|");
}

export function setActiveCacheScope(session) {
  if (!canUseStorage()) return "";

  const nextScope = buildCacheScope(session);
  try {
    const previousScope = window.localStorage.getItem(ACTIVE_SCOPE_KEY) || "";
    window.localStorage.setItem(ACTIVE_SCOPE_KEY, nextScope);
    return previousScope !== nextScope ? previousScope : "";
  } catch {
    return "";
  }
}

export function getActiveCacheScope() {
  if (!canUseStorage()) return "none|none|online";

  try {
    return window.localStorage.getItem(ACTIVE_SCOPE_KEY) || "none|none|online";
  } catch {
    return "none|none|online";
  }
}

export function scopedCacheKey(key) {
  return `${DATA_CACHE_PREFIX}${getActiveCacheScope()}:${key}`;
}

export function readCachedJson(key, maxAgeMs = CACHE_TTL_MS) {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt || 0);
    if (!savedAt) return null;

    const age = Date.now() - savedAt;
    return {
      data: parsed.data,
      savedAt,
      stale: age < 0 || age > maxAgeMs,
    };
  } catch {
    return null;
  }
}

export function writeCachedJson(key, data) {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        data,
        savedAt: Date.now(),
      })
    );
  } catch {}
}

export function normalizeAuthSession(payload = {}) {
  return {
    authenticated: Boolean(payload.authenticated ?? payload.ok ?? payload.username),
    username: payload.username || payload.session?.username || null,
    database: payload.database || payload.session?.database || null,
    companyName: payload.companyName || payload.session?.companyName || null,
    connectionMode: payload.connectionMode || payload.session?.connectionMode || "online",
    konta: payload.konta || payload.session?.konta || {},
    permissions: payload.permissions || payload.session?.permissions || {},
  };
}

export function readAuthSession(maxAgeMs = AUTH_SESSION_TTL_MS) {
  return readCachedJson(AUTH_SESSION_CACHE_KEY, maxAgeMs);
}

export function writeAuthSession(payload = {}) {
  const data = normalizeAuthSession(payload);
  writeCachedJson(AUTH_SESSION_CACHE_KEY, data);
  if (data.authenticated) setActiveCacheScope(data);
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("becleven-auth-session-updated", { detail: data }));
    } catch {}
  }
  return data;
}

export async function refreshAuthSession({ force = false } = {}) {
  if (!force && authSessionSync.checked) {
    return readAuthSession()?.data || null;
  }

  if (authSessionSync.promise) return authSessionSync.promise;

  authSessionSync.promise = (async () => {
    const previousScope = getActiveCacheScope();
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok || !payload?.authenticated) {
      const error = new Error(payload?.error || "Sesija nije dostupna.");
      error.status = response.status;
      throw error;
    }

    const session = writeAuthSession(payload);
    const nextScope = buildCacheScope(session);
    if (
      previousScope &&
      previousScope !== "none|none|online" &&
      previousScope !== nextScope
    ) {
      clearDataCache();
    }
    authSessionSync.checked = true;
    return session;
  })();

  try {
    return await authSessionSync.promise;
  } finally {
    authSessionSync.promise = null;
  }
}

export function authDatabasesCacheKey(session = {}) {
  const cachedSession = session?.username ? null : readAuthSession()?.data;
  const username = session.username || cachedSession?.username || "anonymous";
  const mode = session.connectionMode || cachedSession?.connectionMode || "online";
  return `becleven:auth:databases:${normalizeScopePart(username)}:${normalizeScopePart(mode)}`;
}

export function readAuthDatabases(session = {}, maxAgeMs = AUTH_DATABASES_TTL_MS) {
  return readCachedJson(authDatabasesCacheKey(session), maxAgeMs);
}

export function writeAuthDatabases(session = {}, databases = []) {
  const rows = Array.isArray(databases) ? databases : [];
  writeCachedJson(authDatabasesCacheKey(session), { databases: rows });
  return rows;
}

export function removeCachedJson(key) {
  if (!canUseStorage()) return;

  try {
    window.localStorage.removeItem(key);
  } catch {}
}

export function clearDataCache() {
  if (!canUseStorage()) return;

  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith(DATA_CACHE_PREFIX) ||
        LEGACY_DATA_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix))
      ) {
        keys.push(key);
      }
    }

    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {}
}

export function clearSessionCache() {
  removeCachedJson(AUTH_SESSION_CACHE_KEY);
  authSessionSync.promise = null;
  authSessionSync.checked = false;
  if (!canUseStorage()) return;

  try {
    const authKeys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("becleven:auth:databases:")) authKeys.push(key);
    }
    authKeys.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.removeItem(ACTIVE_SCOPE_KEY);
  } catch {}
}

export async function fetchJsonWithAuth(url, options = {}) {
  const {
    dedupeKey,
    timeoutMs = 45000,
    ...fetchOptions
  } = options;
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const inflightKey = method === "GET" && dedupeKey !== false
    ? String(dedupeKey || url)
    : "";

  if (inflightKey && fetchInflight.has(inflightKey)) {
    return fetchInflight.get(inflightKey);
  }

  const promise = (async () => {
    const controller = new AbortController();
    let timeoutId = null;

    if (fetchOptions.signal?.aborted) {
      controller.abort();
    } else if (fetchOptions.signal) {
      fetchOptions.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    if (timeoutMs && Number(timeoutMs) > 0) {
      timeoutId = window.setTimeout(() => controller.abort(), Number(timeoutMs));
    }

    try {
      const response = await fetch(url, {
        cache: "no-store",
        ...fetchOptions,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);

      if (
        (response.status === 401 || response.status === 403) &&
        payload?.redirectTo &&
        typeof window !== "undefined"
      ) {
        clearSessionCache();
        clearDataCache();
        window.location.href = payload.redirectTo;
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `API error (${response.status})`);
      }

      return payload;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("Zahtjev je trajao predugo. Pokušajte ponovo.");
      }
      throw error;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  })();

  if (inflightKey) {
    fetchInflight.set(inflightKey, promise);
    promise.then(() => {
      if (fetchInflight.get(inflightKey) === promise) fetchInflight.delete(inflightKey);
    }, () => {
      if (fetchInflight.get(inflightKey) === promise) fetchInflight.delete(inflightKey);
    });
  }

  return promise;
}

export async function preloadJsonWithAuth(url, cacheKey, options = {}) {
  const cached = cacheKey ? readCachedJson(cacheKey, options.maxAgeMs || CACHE_TTL_MS) : null;
  if (cached?.data && !cached.stale) return cached.data;

  try {
    const payload = await fetchJsonWithAuth(url, {
      timeoutMs: options.timeoutMs || 30000,
      dedupeKey: options.dedupeKey || `preload:${url}`,
    });
    if (cacheKey) writeCachedJson(cacheKey, payload);
    return payload;
  } catch {
    return null;
  }
}

export function runWhenIdle(callback, timeout = 1500) {
  if (typeof window === "undefined") return () => {};

  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback?.(id);
  }

  const id = window.setTimeout(callback, Math.min(timeout, 500));
  return () => window.clearTimeout(id);
}
