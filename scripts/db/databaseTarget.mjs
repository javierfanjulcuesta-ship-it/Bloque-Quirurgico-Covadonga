/**
 * Distingue una base de prueba de una base que no debemos tocar.
 * No crea proyectos ni bases en Vercel. Solo mira la URL que ya está en el entorno.
 */

const SAFE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SAFE_MARK = /preview|test|ci|local|dev/i;

export function describeDatabaseTarget(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return null;
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("?")[0] ?? "");
  return { host: parsed.hostname, database };
}

export function assertPreviewDatabase(databaseUrl, productionUrl = process.env.PRODUCTION_DATABASE_URL) {
  if (!databaseUrl || !databaseUrl.trim()) {
    throw new Error("Falta DATABASE_URL. No se usa la base de producción de Vercel.");
  }
  if (productionUrl && productionUrl.trim() === databaseUrl.trim()) {
    throw new Error("DATABASE_URL coincide con PRODUCTION_DATABASE_URL. No se aplica nada.");
  }
  const target = describeDatabaseTarget(databaseUrl);
  if (!target?.host || !target.database) {
    throw new Error("DATABASE_URL no es una URL de Postgres reconocible.");
  }
  const local = SAFE_HOSTS.has(target.host);
  const marked = SAFE_MARK.test(`${target.host} ${target.database}`);
  if (!local && !marked) {
    throw new Error(
      `La base ${target.database} en ${target.host} no está marcada como prueba. Use localhost o un nombre con preview, test, ci o local.`,
    );
  }
  return target;
}
