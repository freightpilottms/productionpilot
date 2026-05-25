import sql from "mssql";
import { buildDynamicDbConfig } from "@/lib/db";
import { clearSessionCookie, createSessionCookie, getSessionFromRequest } from "@/lib/session";
import { checkAppAccess } from "@/lib/appAccess";
import { getUserPermissions } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  let pool = null;

  try {
    const body = await req.json();
    const database = String(body?.database || "").trim();
    const serverInputFromBody = String(body?.serverInput || body?.server || "").trim();
    const session = await getSessionFromRequest();

    if (!session?.username || !session?.password) {
      return Response.json(
        { ok: false, authenticated: false, redirectTo: "/login", error: "Nema aktivne prijave." },
        { status: 401 }
      );
    }

    if (!database) {
      return Response.json({ ok: false, error: "Odaberi bazu." }, { status: 400 });
    }

    const serverInput = serverInputFromBody || String(session.serverInput || "").trim();
    const connectionMode = session.connectionMode || "online";

    const cfg = buildDynamicDbConfig({
      username: session.username,
      password: session.password,
      database,
      serverInput: serverInput || undefined,
      connectionMode,
    });

    pool = await new sql.ConnectionPool(cfg).connect();
    await pool.request().query(`SELECT 1 AS ok`);

    const access = await checkAppAccess(pool, session.username);
    if (!access.ok) {
      await clearSessionCookie();
      return Response.json(
        {
          ok: false,
          authenticated: false,
          redirectTo: "/login",
          error: access.error || "Aplikacija nije aktivna za ovog korisnika.",
        },
        { status: 403 }
      );
    }
    const permissions = await getUserPermissions(pool, session.username);

    await createSessionCookie({
      username: session.username,
      password: session.password,
      database,
      serverInput,
      connectionMode,
      konta: session.konta || {},
    });

    return Response.json({
      ok: true,
      username: session.username,
      database,
      connectionMode,
      konta: session.konta || {},
      permissions,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: String(e?.message || e || "Promjena baze nije uspjela.") },
      { status: 400 }
    );
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch {}
    }
  }
}
