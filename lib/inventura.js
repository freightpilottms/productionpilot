import sql from "mssql";

export function buildInventuraKeyCandidates(raw) {
  const id = String(raw || "").trim();
  if (!id) return [];

  const upper = id.toUpperCase();
  const digits = upper.replace(/\D/g, "");
  const candidates = [
    upper,
    digits ? `IN${digits}` : "",
    digits.length >= 3 ? `${digits.slice(0, 2)}INV${digits.slice(2)}` : "",
  ].filter(Boolean);

  return [...new Set(candidates)];
}

export function isLockedInventuraStatus(status) {
  const s = String(status || "").toUpperCase();
  return (
    s.includes("ZAKLJ") ||
    s.includes("ZATV") ||
    s.includes("CLOSED") ||
    s.includes("CLOSE") ||
    s.includes("DONE")
  );
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function addParams(request, values, prefix) {
  const clean = uniqueValues(values).slice(0, 8);
  clean.forEach((value, index) => {
    request.input(`${prefix}${index}`, sql.NVarChar, value);
  });

  return {
    values: clean,
    sql: clean.map((_, index) => `@${prefix}${index}`).join(", ") || "NULL",
  };
}

async function findInventuraHeader(pool, rawInventuraId) {
  const keys = buildInventuraKeyCandidates(rawInventuraId);
  if (!keys.length) return null;

  const digits = String(rawInventuraId || "").replace(/\D/g, "");
  const req = pool.request().input("digits", sql.NVarChar, digits || null);
  const keyParams = addParams(req, keys, "k");

  const result = await req.query(`
    SELECT TOP 1
      racBroj,
      racBrojSaCrtama,
      racDatum,
      racSkladiste,
      racSkladistePrijem,
      statusRac
    FROM dbo.racuniZaglavlje
    WHERE racDocType = 'INV'
      AND (
        LTRIM(RTRIM(CONVERT(nvarchar(100), racBroj))) IN (${keyParams.sql})
        OR LTRIM(RTRIM(CONVERT(nvarchar(100), racBrojSaCrtama))) IN (${keyParams.sql})
        OR (@digits IS NOT NULL AND LTRIM(RTRIM(CONVERT(nvarchar(100), racBroj))) = @digits)
      )
    ORDER BY racDatum DESC, racBroj DESC
  `);

  return result.recordset?.[0] || null;
}

async function findInventuraPopisKey(pool, rawInventuraId, header = null) {
  const keys = uniqueValues([
    ...buildInventuraKeyCandidates(rawInventuraId),
    header?.racBroj,
    header?.racBrojSaCrtama,
  ]);
  if (!keys.length) return "";

  const req = pool.request();
  const keyParams = addParams(req, keys, "p");
  const result = await req.query(`
    SELECT TOP 1 racArtikliPopisKey AS KeyValue
    FROM dbo.racuniArtikliPopis
    WHERE LTRIM(RTRIM(CONVERT(nvarchar(100), racArtikliPopisKey))) IN (${keyParams.sql})
    ORDER BY ID DESC
  `);

  return result.recordset?.[0]?.KeyValue || "";
}

function keyFromHeader(header) {
  return String(header?.racBroj || header?.racBrojSaCrtama || "").trim();
}

export async function resolveInventuraForRead(pool, rawInventuraId) {
  const header = await findInventuraHeader(pool, rawInventuraId);
  const existingKey = await findInventuraPopisKey(pool, rawInventuraId, header);
  const key = existingKey || keyFromHeader(header);

  return {
    ok: Boolean(key),
    key,
    header,
    locked: isLockedInventuraStatus(header?.statusRac),
  };
}

export async function resolveInventuraForWrite(pool, rawInventuraId) {
  const resolved = await resolveInventuraForRead(pool, rawInventuraId);

  if (!resolved.header) {
    return {
      ...resolved,
      ok: false,
      status: 404,
      error: "Inventura nije pronadjena u zaglavlju.",
    };
  }

  if (!resolved.key) {
    return {
      ...resolved,
      ok: false,
      status: 400,
      error: "Inventura nema validan kljuc za popis.",
    };
  }

  if (resolved.locked) {
    return {
      ...resolved,
      ok: false,
      status: 409,
      error: "Inventura je zakljucana i ne moze se mijenjati.",
    };
  }

  return { ...resolved, ok: true };
}

export function inventuraResolutionResponse(resolved) {
  return Response.json(
    { ok: false, error: resolved?.error || "Inventura nije validna." },
    { status: Number(resolved?.status || 400) }
  );
}
