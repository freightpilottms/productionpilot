export const SESSION_COOKIE_NAME = "becleven_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;
export const SESSION_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function isSessionPayloadValid(payload, now = Date.now()) {
  if (!payload || typeof payload !== "object") return false;
  if (!payload.username || !payload.password || !payload.database) return false;

  const issuedAt = Number(payload.iat);
  if (!Number.isFinite(issuedAt)) return false;
  if (issuedAt > now + SESSION_CLOCK_SKEW_MS) return false;
  if (now - issuedAt > SESSION_MAX_AGE_MS) return false;

  return true;
}
