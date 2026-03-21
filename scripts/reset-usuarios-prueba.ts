/**
 * Crea o actualiza usuarios de prueba para desarrollo en modo real.
 * Ejecutar: npx tsx scripts/reset-usuarios-prueba.ts  (o npm run usuarios:reset)
 *
 * Emails @prueba.test para identificar claramente como entorno de pruebas internas.
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const USUARIOS = [
  { email: "gestor@prueba.test", password: "123", name: "Gestor Prueba", role: "GESTOR" as const },
  { email: "cirujano@prueba.test", password: "123", name: "Cirujano Prueba", role: "CIRUJANO" as const },
  { email: "anestesista@prueba.test", password: "123", name: "Anestesista Prueba", role: "ANESTESISTA" as const },
  { email: "endoscopista@prueba.test", password: "123", name: "Endoscopista Prueba", role: "ENDOSCOPISTA" as const },
  { email: "gestor-anest@prueba.test", password: "123", name: "Gestor Anest Prueba", role: "GESTOR_ANESTESISTA" as const },
];

async function main() {
  const passwordHash = await hash("123", 12);
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
    console.log(`✓ ${u.email} (${u.role}) - contraseña: 123`);
  }
  console.log("\n--- CREDENCIALES (contraseña: 123) ---");
  USUARIOS.forEach((u) => console.log(`  ${u.email}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
