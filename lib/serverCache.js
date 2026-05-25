import crypto from "crypto";
import { getSessionFromRequest } from "@/lib/session";

const CACHE_KEY = "__becleven_server_response_cache__";
const cache = globalThis[CACHE_KEY] || new Map();
globalThis[CACHE_KEY] = cache;

const MAX_ENTRIES = 400;

function hash(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex");
}

function normalizeParams(url, ignoredParams = ["refresh", "fast", "_"]) {
  const ignored = new Set(ignoredParams);
  const entries = Array.from(url.searchParams.entries())
    .filter(([key]) => !ignored.has(key))
    .sort(([a], [b]) => a.localeCompare(b));

  return entries.map(([key, value]) => `${key}=${value}`).join("&");
}

function pruneCache() {
  if (cache.size <= MAX_ENTRIES) return;

  const entries = Array.from(cache.entries())
    .sort((a, b) => Number(a[1]?.savedAt || 0) - Number(b[1]?.savedAt || 0));

  const removeCount = Math.max(1, entries.length - MAX_ENTRIES);
  entries.slice(0, removeCount).forEach(([key]) => cache.delete(key));
}

export async function requestCacheKey(req, namespace, variant = "default") {
  const session = await getSessionFromRequest(req);
  const url = new URL(req.url);

  return `${namespace}:${variant}:${hash(JSON.stringify({
    username: session?.username || "",
    database: session?.database || "",
    connectionMode: session?.connectionMode || "online",
    path: url.pathname,
    params: normalizeParams(url),
  }))}`;
}

export function readServerCache(key, { freshMs = 5 * 60 * 1000, staleMs = 60 * 60 * 1000 } = {}) {
  const entry = cache.get(key);
  if (!entry?.savedAt) return null;

  const ageMs = Date.now() - Number(entry.savedAt || 0);
  if (ageMs < 0 || ageMs > staleMs) {
    cache.delete(key);
    return null;
  }

  return {
    data: entry.data,
    ageMs,
    stale: ageMs > freshMs,
  };
}

export function writeServerCache(key, data) {
  cache.set(key, {
    data,
    savedAt: Date.now(),
  });
  pruneCache();
}

export function withServerCacheMeta(payload, cached) {
  if (!cached) return payload;

  return {
    ...payload,
    serverCache: {
      hit: true,
      stale: Boolean(cached.stale),
      ageMs: cached.ageMs,
    },
  };
}
