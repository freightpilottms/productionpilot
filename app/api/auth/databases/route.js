import sql from "mssql";
import { buildDynamicDbConfig } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeConnectionMode(v) {
  return String(v || "online").toLowerCase() === "offline" ? "offline" : "online";
}

function friendlyDbError(e, connectionMode) {
  const raw = String(e?.message || e || "Greška pri učitavanju baza.");
  if (connectionMode === "offline") {
    return "Lokalni SQL server ili baza nisu pronađeni. Provjeri da je aplikacija pokrenuta lokalno, da je SQL Server dostupan i da je server adresa ispravna.";
  }
  return raw;
}

export async function POST(req) {
  let pool = null;
  let connectionModeForError = "online";

  try {
    const body = await req.json();
    let username = String(body?.username || "").trim();
    let password = String(body?.password || "");
    let serverInput = String(body?.serverInput || body?.server || "").trim();
    let connectionMode = normalizeConnectionMode(body?.connectionMode);
    connectionModeForError = connectionMode;

    if (!username || !password || password === "__session__") {
      const session = await getSessionFromRequest();
      if (session?.username && session?.password) {
        username = session.username;
        password = session.password;
        serverInput = serverInput || String(session.serverInput || "").trim();
        connectionMode = normalizeConnectionMode(session.connectionMode);
        connectionModeForError = connectionMode;
      }
    }

    if (!username || !password) {
      return Response.json(
        { ok: false, error: "Unesi korisnika i lozinku." },
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

    try {
      const cfg = buildDynamicDbConfig({
        username,
        password,
        database: "master",
        serverInput: serverInput || undefined,
        connectionMode,
      });
      pool = await new sql.ConnectionPool(cfg).connect();
    } catch {
      const cfg = buildDynamicDbConfig({
        username,
        password,
        database: "tempdb",
        serverInput: serverInput || undefined,
        connectionMode,
      });
      pool = await new sql.ConnectionPool(cfg).connect();
    }

    const result = await pool.request().query(`
      SELECT name
      FROM master.sys.databases
      WHERE HAS_DBACCESS(name) = 1
        AND state_desc = 'ONLINE'
        AND name NOT IN ('master', 'tempdb', 'model', 'msdb')
      ORDER BY name
    `);

    return Response.json({
      ok: true,
      connectionMode,
      databases: (result.recordset || []).map((x) => String(x.name)),
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: friendlyDbError(e, connectionModeForError) },
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
