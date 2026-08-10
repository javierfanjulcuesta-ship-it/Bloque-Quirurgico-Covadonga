/**
 * Seed de usuarios ficticios para desarrollo/piloto controlado.
 *
 * Seguridad:
 * - no contiene contraseñas en el repositorio;
 * - no imprime contraseñas;
 * - está bloqueado en producción/Vercel;
 * - requiere confirmación y password por variables de entorno.
 *
 * Ejemplo PowerShell (solo entorno no productivo):
 *   $env:ALLOW_PILOT_SEED="I_UNDERSTAND_PILOT_SEED"
 *   $env:PILOT_SEED_PASSWORD="una-contraseña-larga-y-unica"
 *   npx prisma db seed
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { assertSeedAllowed, requireSeedConfirmation, requireSecretEnv } from "../scripts/lib/seedSafety";

const prisma = new PrismaClient();

const USERS = [
  { email: "gestor@hospital.es", name: "Gestor Piloto", role: "GESTOR" as const },
  { email: "anestesista1@hospital.es", name: "Anestesista 1", role: "ANESTESISTA" as const },
  { email: "anestesista2@hospital.es", name: "Anestesista 2", role: "ANESTESISTA" as const },
  { email: "cirujano@hospital.es", name: "Cirujano piloto", role: "CIRUJANO" as const },
];

async function main() {
  assertSeedAllowed("prisma seed de usuarios piloto");
  requireSeedConfirmation("ALLOW_PILOT_SEED", "I_UNDERSTAND_PILOT_SEED");
  const password = requireSecretEnv("PILOT_SEED_PASSWORD", 12);

  const count = await prisma.user.count();
  if (count > 0) {
    console.log("Ya hay usuarios en la BD. No se ejecuta seed de usuarios piloto.");
    return;
  }

  const passwordHash = await hash(password, 12);

  for (const u of USERS) {
    await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        name: u.name,
        role: u.role,
        approved: true,
      },
    });
    console.log(`Creado usuario ficticio: ${u.email} (${u.role})`);
  }

  console.log(`Seed completado: ${USERS.length} usuarios ficticios creados. La contraseña no se muestra en logs.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
