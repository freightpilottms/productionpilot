import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { formatDatabaseName } from "@/lib/format";
import { getPoolFromRequest } from "@/lib/db";
import { getUserPermissions } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const session = await getSessionFromRequest(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, authenticated: false, redirectTo: "/login" },
        { status: 401 }
      );
    }

    const database = session.database || null;

    let pool = null;
    let permissions = null;
    try {
      pool = await getPoolFromRequest(req);
      permissions = await getUserPermissions(pool, session.username);
    } finally {
      if (pool) {
        try {
          await pool.close();
        } catch {}
      }
    }

    return NextResponse.json({
      ok: true,
      authenticated: true,
      username: session.username || null,
      database,
      companyName: formatDatabaseName(database),
      connectionMode: session.connectionMode || "online",
      konta: session.konta || {},
      permissions,
    });
  } catch (error) {
    const status = Number(error?.status || 401);
    return NextResponse.json(
      {
        ok: false,
        authenticated: false,
        redirectTo: "/login",
        error: error?.message || "Session error",
      },
      { status: status === 403 ? 403 : 401 }
    );
  }
}
