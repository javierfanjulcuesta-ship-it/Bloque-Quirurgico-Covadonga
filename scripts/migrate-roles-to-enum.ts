/**
 * Migra roles de usuarios existentes al formato enum (gestor -> GESTOR, etc.).
 * Ejecutar una vez tras actualizar el schema con enums.
 * npx tsx scripts/migrate-roles-to-enum.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MIGRATIONS: [string, string][] = [
  ["gestor", "GESTOR"],
  ["anestesista", "ANESTESISTA"],
  ["cirujano", "CIRUJANO"],
  ["endoscopista", "ENDOSCOPISTA"],
  ["gestor-anestesista", "GESTOR_ANESTESISTA"],
];

async function main() {
  for (const [oldVal, newVal] of MIGRATIONS) {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE User SET role = ? WHERE role = ?`,
      newVal,
      oldVal
    );
    if (result > 0) {
      console.log(`  Migrado ${result} usuarios: ${oldVal} -> ${newVal}`);
    }
  }
  console.log("Migración de roles completada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
