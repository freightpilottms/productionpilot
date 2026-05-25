import sql from "mssql";
import { buildDynamicDbConfig } from "@/lib/db";
import { createSessionCookie } from "@/lib/session";
import { checkAppAccess } from "@/lib/appAccess";
import { normalizeKontaSettings } from "@/lib/konta";
import { getUserPermissions } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeConnectionMode(v) {
  return String(v || "online").toLowerCase() === "offline" ? "offline" : "online";
}

function friendlyLoginError(e, connectionMode) {
  const raw = String(e?.message || e || "Prijava nije uspjela.");
  if (connectionMode === "offline") {
    return "Lokalni SQL server ili baza nisu pronađeni. Provjeri da je aplikacija pokrenuta lokalno, da je SQL Server dostupan i da je server adresa ispravna.";
  }
  return raw;
}

export async function POST(req) {
  let pool = null;
  let connectionMode = "online";

  try {
    const body = await req.json();
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    const database = String(body?.database || "").trim();
    const serverInput = String(body?.serverInput || body?.server || "").trim();
    connectionMode = normalizeConnectionMode(body?.connectionMode);
    const konta = normalizeKontaSettings(body?.konta || {});

    if (!username || !password || !database) {
      return Response.json(
        { ok: false, error: "Korisnik, lozinka i baza su obavezni." },
        { status: 400 }
      );
    }

    if (connectionMode === "offline" && !serverInput) {
      return Response.json(
        {
          ok: false,
          error:
            "Offline/local mode zahtijeva SQL server adresu, npr. localhost\\SQLEXPRESS ili 192.168.1.50\\SQLEXPRESS.",
        },
        { status: 400 }
      );
    }

    const cfg = buildDynamicDbConfig({
      username,
      password,
      database,
      serverInput: serverInput || undefined,
      connectionMode,
    });

    pool = await new sql.ConnectionPool(cfg).connect();
    await pool.request().query(`SELECT 1 AS ok`);

    const access = await checkAppAccess(pool, username);
    if (!access.ok) {
      return Response.json(
        { ok: false, error: access.error || "Aplikacija nije aktivna za ovog korisnika." },
        { status: 403 }
      );
    }
    const permissions = await getUserPermissions(pool, username);

    await createSessionCookie({
      username,
      password,
      database,
      serverInput,
      connectionMode,
      konta,
    });

    return Response.json({
      ok: true,
      token: `becleven-${Date.now()}`,
      username,
      database,
      connectionMode,
      konta,
      permissions,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: friendlyLoginError(e, connectionMode) },
      { status: 401 }
    );
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch {}
    }
  }
}
