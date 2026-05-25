import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";

export async function GET(req) {
  try {
    const pool = await getPoolFromRequest(req);
    const r = await pool.request().query("SELECT 1 AS ok");
    return Response.json({ ok: true, db: r.recordset?.[0]?.ok === 1 });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
