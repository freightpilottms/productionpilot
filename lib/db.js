import sql from "mssql";
import crypto from "crypto";
import { clearSessionCookie, getSessionFromRequest } from "@/lib/session";
import { checkAppAccess } from "@/lib/appAccess";

export class ApiRequestError extends Error {
  constructor(message, status = 500, code = "API_ERROR") {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

export function apiErrorResponse(error) {
  const status = Number(error?.status || 500);
  const body = {
    ok: false,
    error: String(error?.message || error || "Greska u zahtjevu."),
  };

  if (status === 401 || status === 403) {
    body.authenticated = false;
    body.redirectTo = "/login";
  }

  return Response.json(body, { status });
}

function toBool(v, def = false) {
  if (v === undefined || v === null || v === "") return def;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function toInt(v, def) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}

function normalizeConnectionMode(v) {
  return String(v || "online").toLowerCase() === "offline" ? "offline" : "online";
}

function normalizeOnlineServerInput(serverInput) {
  const clean = String(serverInput || "").trim();
  const key = clean.toLowerCase();

  if (
    key === "localhost\\beclevencloud,4263" ||
    key === "127.0.0.1\\beclevencloud,4263" ||
    key === "localhost,4263" ||
    key === "127.0.0.1,4263"
  ) {
    return "";
  }

  return clean;
}

const SQL_POOL_CACHE_KEY = "__becleven_sql_pool_cache__";
const sqlPoolCache = globalThis[SQL_POOL_CACHE_KEY] || new Map();
globalThis[SQL_POOL_CACHE_KEY] = sqlPoolCache;

function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function buildPoolCacheKey(config) {
  return hashSecret(
    JSON.stringify({
      server: config.server || "",
      port: config.port || "",
      instanceName: config.options?.instanceName || "",
      database: config.database || "",
      user: config.user || "",
      passwordHash: hashSecret(config.password || ""),
      encrypt: !!config.options?.encrypt,
      trustServerCertificate: !!config.options?.trustServerCertificate,
    })
  );
}

function pruneSqlPoolCache() {
  const maxIdleMs = toInt(process.env.DB_POOL_CACHE_IDLE_MS, 5 * 60 * 1000);
  const now = Date.now();

  for (const [key, entry] of sqlPoolCache.entries()) {
    if (entry?.promise) continue;
    if (now - Number(entry?.lastUsed || 0) <= maxIdleMs) continue;

    sqlPoolCache.delete(key);
    entry?.pool?.close?.().catch?.(() => {});
  }
}

async function getCachedSqlPool(config) {
  pruneSqlPoolCache();

  const key = buildPoolCacheKey(config);
  const existing = sqlPoolCache.get(key);

  if (existing?.pool?.connected) {
    existing.lastUsed = Date.now();
    return { key, pool: existing.pool };
  }

  if (existing?.promise) {
    const pool = await existing.promise;
    const entry = sqlPoolCache.get(key);
    if (entry) entry.lastUsed = Date.now();
    return { key, pool };
  }

  const promise = new sql.ConnectionPool(config)
    .connect()
    .then((pool) => {
      sqlPoolCache.set(key, { pool, lastUsed: Date.now() });
      return pool;
    })
    .catch((error) => {
      sqlPoolCache.delete(key);
      throw error;
    });

  sqlPoolCache.set(key, { promise, lastUsed: Date.now() });
  const pool = await promise;
  return { key, pool };
}

function createPoolLease(pool, key) {
  return {
    request(...args) {
      const entry = sqlPoolCache.get(key);
      if (entry) entry.lastUsed = Date.now();
      return pool.request(...args);
    },
    close: async () => {},
    get connected() {
      return pool.connected;
    },
  };
}

function parseServerInput(raw) {
  const input = String(raw || "").trim();
  if (!input) throw new Error("DB_SERVER is not configured");

  let hostPart = input;
  let port;

  const commaIndex = input.lastIndexOf(",");
  if (commaIndex > -1) {
    const possiblePort = input.slice(commaIndex + 1).trim();
    if (/^\d+$/.test(possiblePort)) {
      port = Number.parseInt(possiblePort, 10);
      hostPart = input.slice(0, commaIndex).trim();
    }
  }

  let server = hostPart;
  let instanceName;

  const slashIndex = hostPart.indexOf("\\");
  if (slashIndex > -1) {
    server = hostPart.slice(0, slashIndex).trim();
    instanceName = hostPart.slice(slashIndex + 1).trim() || undefined;
  }

  return {
    server,
    port,
    instanceName,
    original: input,
  };
}

function getOfflineServerError() {
  return "Offline/local mode zahtijeva lokalni SQL server. Provjeri da je aplikacija pokrenuta lokalno i da je SQL server dostupan.";
}

function buildBaseConfig(serverInput, connectionMode = "online") {
  const mode = normalizeConnectionMode(connectionMode);
  const cleanServerInput =
    mode === "online"
      ? normalizeOnlineServerInput(serverInput)
      : String(serverInput || "").trim();

  if (mode === "offline" && !cleanServerInput) {
    throw new Error(getOfflineServerError());
  }

  const parsed = parseServerInput(
    mode === "offline" ? cleanServerInput : cleanServerInput || process.env.DB_SERVER
  );

  const config = {
    server: parsed.server,
    options: {
      encrypt:
        mode === "offline"
          ? toBool(process.env.DB_LOCAL_ENCRYPT, false)
          : toBool(process.env.DB_ENCRYPT, true),
      trustServerCertificate:
        mode === "offline"
          ? toBool(process.env.DB_LOCAL_TRUST_CERT, true)
          : toBool(process.env.DB_TRUST_CERT, true),
      enableArithAbort: true,
    },
    pool: {
      max: toInt(process.env.DB_POOL_MAX, 10),
      min: 0,
      idleTimeoutMillis: toInt(process.env.DB_POOL_IDLE_MS, 30000),
    },
    connectionTimeout: toInt(process.env.DB_CONNECTION_TIMEOUT, 15000),
    requestTimeout: toInt(process.env.DB_REQUEST_TIMEOUT, 120000),
  };

  if (parsed.port) {
    config.port = parsed.port;
  } else if (parsed.instanceName) {
    config.options.instanceName = parsed.instanceName;
  }

  return config;
}

/**
 * Kompatibilni export za auth rute:
 * buildDynamicDbConfig({ username, password, database, serverInput, connectionMode })
 */
export function buildDynamicDbConfig({
  username,
  password,
  database,
  serverInput,
  connectionMode = "online",
}) {
  if (!username || !password || !database) {
    throw new Error("Missing dynamic DB credentials");
  }

  return {
    ...buildBaseConfig(serverInput, connectionMode),
    user: username,
    password,
    database,
  };
}

export function getSqlConfig(databaseName, serverInput, connectionMode = "online") {
  return {
    ...buildBaseConfig(serverInput, connectionMode),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName || process.env.DB_NAME || "master",
  };
}

export async function getPool() {
  const config = getSqlConfig(process.env.DB_NAME || "master");
  const { key, pool } = await getCachedSqlPool(config);
  return createPoolLease(pool, key);
}

export async function getPoolForDatabase(databaseName) {
  const config = getSqlConfig(databaseName);
  const { key, pool } = await getCachedSqlPool(config);
  return createPoolLease(pool, key);
}

export async function getPoolFromRequest(req) {
  const session = await getSessionFromRequest(req);

  if (!session?.username || !session?.password || !session?.database) {
    throw new ApiRequestError("Session nije validna. Prijavite se ponovo.", 401, "UNAUTHORIZED");
  }

  const config = buildDynamicDbConfig({
    username: session.username,
    password: session.password,
    database: session.database,
    serverInput: session.serverInput || undefined,
    connectionMode: session.connectionMode || "online",
  });

  let pool = null;
  let poolKey = "";

  try {
    const cached = await getCachedSqlPool(config);
    pool = cached.pool;
    poolKey = cached.key;
    const access = await checkAppAccess(pool, session.username);

    if (!access.ok) {
      try {
        await clearSessionCookie();
      } catch {}

      throw new ApiRequestError(
        access.error || "Aplikacija nije aktivna za ovog korisnika.",
        403,
        "APP_DISABLED"
      );
    }

    return createPoolLease(pool, poolKey);
  } catch (error) {
    if (pool && error instanceof ApiRequestError) {
      try {
        sqlPoolCache.delete(poolKey);
        await pool.close();
      } catch {}
    }
    throw error;
  }
}

export { sql };
