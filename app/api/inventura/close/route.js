import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";
import { forbiddenResponse, getUserPermissionsFromRequest } from "@/lib/permissions";
import {
  buildInventuraKeyCandidates,
  resolveInventuraForRead,
} from "@/lib/inventura";

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export async function POST(req) {
  try {
    const { inventuraId } = await req.json();
    if (!String(inventuraId || "").trim()) {
      return Response.json(
        { ok: false, error: "Missing inventuraId" },
        { status: 400 }
      );
    }

    const pool = await getPoolFromRequest(req);
    const permissions = await getUserPermissionsFromRequest(pool, req);
    if (!permissions.canViewZalihe) {
      return forbiddenResponse("Nemate pristup inventuri.");
    }

    const resolved = await resolveInventuraForRead(pool, inventuraId);
    if (!resolved.header) {
      return Response.json(
        { ok: false, error: "Inventura nije pronadjena u zaglavlju." },
        { status: 404 }
      );
    }

    if (resolved.locked) {
      return Response.json({
        ok: true,
        rowsAffected: 0,
        action: "already-closed",
      });
    }

    const keys = uniqueValues([
      ...buildInventuraKeyCandidates(inventuraId),
      resolved.header.racBroj,
      resolved.header.racBrojSaCrtama,
    ]).slice(0, 8);
    const dbReq = pool.request();
    keys.forEach((key, index) => {
      dbReq.input(`k${index}`, key);
    });
    const keySql = keys.map((_, index) => `@k${index}`).join(", ") || "NULL";

    const result = await dbReq.query(`
      UPDATE dbo.racuniZaglavlje
      SET statusRac = 'CLOSED'
      WHERE racDocType = 'INV'
        AND (
          LTRIM(RTRIM(CONVERT(nvarchar(100), racBroj))) IN (${keySql})
          OR LTRIM(RTRIM(CONVERT(nvarchar(100), racBrojSaCrtama))) IN (${keySql})
        )
    `);

    return Response.json({
      ok: true,
      rowsAffected: result.rowsAffected?.[0] || 0,
      action: "closed",
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
