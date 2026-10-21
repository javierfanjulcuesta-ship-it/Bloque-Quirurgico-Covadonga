/**
 * Aplica la cadena de migraciones en una base de prueba ya existente.
 * No crea recursos en Vercel, no ejecuta semillas y no arranca solo.
 *
 *   CONFIRM_PREVIEW_DATABASE=preparar node scripts/db/prepare-preview-database.mjs
 */

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assertPreviewDatabase } from "./databaseTarget.mjs";

const CONFIRM = "preparar";

export function previewMigrateAllowed(env = process.env) {
  try {
    assertPreviewDatabase(env.DATABASE_URL, env.PRODUCTION_DATABASE_URL);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Base no admitida" };
  }
  if (env.CONFIRM_PREVIEW_DATABASE !== CONFIRM) {
    return {
      ok: false,
      error: `Defina CONFIRM_PREVIEW_DATABASE=${CONFIRM} para aplicar migraciones en la base de prueba.`,
    };
  }
  return { ok: true };
}

function main() {
  const decision = previewMigrateAllowed();
  if (!decision.ok) {
    console.error(decision.error);
    process.exit(1);
  }
  if (!process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.DATABASE_URL;
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
