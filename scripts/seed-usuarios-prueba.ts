/**
 * Añade usuarios de prueba para cada perfil (si no existen).
 * Uso: npx tsx scripts/seed-usuarios-prueba.ts  (o npm run usuarios:prueba)
 *
 * Emails @prueba.test para identificar como entorno de pruebas internas.
 * Contraseña inicial: 123
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const USUARIOS_PRUEBA = [
  { email: "gestor@prueba.test", password: "123", name: "Gestor Prueba", role: "GESTOR" as const },
  { email: "cirujano@prueba.test", password: "123", name: "Cirujano Prueba", role: "CIRUJANO" as const },
  { email: "anestesista@prueba.test", password: "123", name: "Anestesista Prueba", role: "ANESTESISTA" as const },
  { email: "endoscopista@prueba.test", password: "123", name: "Endoscopista Prueba", role: "ENDOSCOPISTA" as const },
  { email: "gestor-anest@prueba.test", password: "123", name: "Gestor Anest Prueba", role: "GESTOR_ANESTESISTA" as const },
];

async function main() {
  for (const u of USUARIOS_PRUEBA) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`  ⏭ ${u.email} (${u.role}) - ya existía`);
      continue;
    }
    const passwordHash = await hash(u.password, 12);
    await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        name: u.name,
        role: u.role,
        approved: true,
      },
    });
    console.log(`  ✓ ${u.email} (${u.role}) - creado`);
  }
  console.log("\nUsuarios de prueba disponibles:");
  console.log("| Perfil | Email | Contraseña |");
  console.log("|--------|-------|------------|");
  USUARIOS_PRUEBA.forEach((u) => console.log(`| ${u.role} | ${u.email} | ${u.password} |`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
