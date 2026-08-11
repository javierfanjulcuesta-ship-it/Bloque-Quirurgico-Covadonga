/**
 * Crea o actualiza usuarios ficticios de prueba para desarrollo.
 * Uso: npm run usuarios:reset
 *
 * Requiere, en entorno NO productivo:
 *   ALLOW_TEST_USER_SEED=I_UNDERSTAND_TEST_USERS_ONLY
 *   TEST_USERS_PASSWORD=<password largo de prueba>
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { assertSeedAllowed, requireSeedConfirmation, requireSecretEnv } from "./lib/seedSafety";

const prisma = new PrismaClient();

const USUARIOS = [
  { email: "gestor@prueba.test", name: "Gestor Prueba", role: "GESTOR" as const },
  { email: "cirujano@prueba.test", name: "Cirujano Prueba", role: "CIRUJANO" as const },
  { email: "anestesista@prueba.test", name: "Anestesista Prueba", role: "ANESTESISTA" as const },
  { email: "endoscopista@prueba.test", name: "Endoscopista Prueba", role: "ENDOSCOPISTA" as const },
  { email: "gestor-anest@prueba.test", name: "Gestor Anest Prueba", role: "GESTOR_ANESTESISTA" as const },
];

async function main() {
  assertSeedAllowed("reset de usuarios de prueba");
  requireSeedConfirmation("ALLOW_TEST_USER_SEED", "I_UNDERSTAND_TEST_USERS_ONLY");
  const password = requireSecretEnv("TEST_USERS_PASSWORD", 12);
  const passwordHash = await hash(password, 12);

  for (const u of USUARIOS) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        passwordHash,
        name: u.name,
        role: u.role,
        approved: true,
      },
      update: {
        passwordHash,
        name: u.name,
        role: u.role,
        approved: true,
      },
    });
    console.log(`✓ ${u.email} (${u.role}) actualizado`);
  }
  console.log(`\nUsuarios de prueba preparados: ${USUARIOS.length}. La contraseña no se muestra en logs.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
