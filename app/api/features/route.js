import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function objectExists(pool, fullName) {
  const r = await pool
    .request()
    .input("name", fullName)
    .query(`SELECT CASE WHEN OBJECT_ID(@name) IS NULL THEN 0 ELSE 1 END AS ok`);
  return !!r.recordset?.[0]?.ok;
}

export async function GET(req) {
  try {
    const pool = await getPoolFromRequest(req);

    const hasRacuniZaglavlje = await objectExists(pool, "dbo.racuniZaglavlje");

    let inventura = false;

    if (hasRacuniZaglavlje) {
      const q = await pool.request().query(`
        SELECT TOP 1 1 AS ok
        FROM dbo.racuniZaglavlje
        WHERE racDocType = 'INV'
      `);

      inventura = !!q.recordset?.[0]?.ok;
    }

    return Response.json({
      ok: true,
      features: {
        inventura,
      },
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
