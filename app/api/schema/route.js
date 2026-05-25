import { NextResponse } from "next/server";
import { apiErrorResponse, getPoolFromRequest } from "@/lib/db";

export async function GET(req) {
  let pool;

  try {
    pool = await getPoolFromRequest(req);

    const result = await pool.request().query(`
      SELECT
        DB_NAME() AS databaseName,
        SUSER_SNAME() AS sqlLogin
    `);

    const row = result.recordset?.[0] || {};

    return NextResponse.json({
      ok: true,
      mode: "live",
      database: row.databaseName || null,
      sqlLogin: row.sqlLogin || null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch {}
    }
  }
}
