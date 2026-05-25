import sql from "mssql";

export async function objectExists(pool, fullName) {
  const r = await pool
    .request()
    .input("name", sql.NVarChar, fullName)
    .query(`SELECT CASE WHEN OBJECT_ID(@name) IS NULL THEN 0 ELSE 1 END AS ok`);
  return !!r.recordset?.[0]?.ok;
}

export function isAppEnabledValue(value) {
  if (value === true) return true;
  if (value === false) return false;
  return String(value ?? "").trim() === "1";
}

export async function checkAppAccess(pool, username) {
  const cleanUser = String(username || "").trim();

  if (!cleanUser) {
    return { ok: false, error: "Session nije validna. Prijavite se ponovo." };
  }

  const hasViewUsers = await objectExists(pool, "dbo.View_users");

  if (!hasViewUsers) {
    return { ok: false, configured: false, error: "Aplikacija nije aktivna za ovog korisnika." };
  }

  const q = await pool
    .request()
    .input("username", sql.NVarChar, cleanUser)
    .query(`
      SELECT TOP 1 [Users], [APP]
      FROM dbo.View_users
      WHERE LTRIM(RTRIM(CONVERT(nvarchar(255), [Users]))) = @username
    `);

  const row = q.recordset?.[0];

  if (!row || !isAppEnabledValue(row.APP)) {
    return { ok: false, configured: true, error: "Aplikacija nije aktivna za ovog korisnika." };
  }

  return { ok: true, configured: true };
}
