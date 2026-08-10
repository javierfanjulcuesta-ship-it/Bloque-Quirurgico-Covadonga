import { spawnSync } from "node:child_process";

const CONFIRMATION = "I_UNDERSTAND_DB_PUSH_IS_DEV_ONLY";

function fail(message: string): never {
  console.error(`[db:push] BLOQUEADO: ${message}`);
  process.exit(1);
}

if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1" || process.env.CI === "true") {
  fail("prisma db push no está permitido en producción, Vercel ni CI. Use migraciones revisadas.");
}

if (process.env.ALLOW_PRISMA_DB_PUSH !== CONFIRMATION) {
  fail(`para desarrollo local debe definir ALLOW_PRISMA_DB_PUSH=${CONFIRMATION}.`);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail("DATABASE_URL no está definida.");

let host = "";
try {
  host = new URL(databaseUrl).hostname;
} catch {
  fail("DATABASE_URL no es una URL válida.");
}

console.warn(`[db:push] Entorno local confirmado. Destino: ${host}`);
console.warn("[db:push] Este comando NO debe utilizarse para evolucionar producción.");

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(executable, ["prisma", "db", "push"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
