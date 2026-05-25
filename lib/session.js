import crypto from "crypto";
import { cookies } from "next/headers";
import {
  isSessionPayloadValid,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/sessionConfig";

const COOKIE_NAME = SESSION_COOKIE_NAME;

function normalizeConnectionMode(v) {
  return String(v || "online").toLowerCase() === "offline" ? "offline" : "online";
}

function getSecretKey() {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("APP_SESSION_SECRET must be set and be at least 32 chars");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptPayload(payload) {
  const key = getSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decryptPayload(token) {
  const key = getSecretKey();
  const raw = Buffer.from(token, "base64url");

  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}

export async function createSessionCookie({
  username,
  password,
  database,
  serverInput = "",
  connectionMode = "online",
  konta = {},
}) {
  const token = encryptPayload({
    username,
    password,
    database,
    serverInput: String(serverInput || "").trim(),
    connectionMode: normalizeConnectionMode(connectionMode),
    konta,
    iat: Date.now(),
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionFromRequest() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const payload = decryptPayload(token);
    return isSessionPayloadValid(payload) ? payload : null;
  } catch {
    return null;
  }
}

export async function getSessionSummary() {
  const session = await getSessionFromRequest();
  if (!session) return null;

  return {
    username: session.username || "",
    database: session.database || "",
    serverInput: session.serverInput || "",
    connectionMode: normalizeConnectionMode(session.connectionMode),
    konta: session.konta || {},
    loggedIn: !!(session.username && session.database),
  };
}

export { COOKIE_NAME };
