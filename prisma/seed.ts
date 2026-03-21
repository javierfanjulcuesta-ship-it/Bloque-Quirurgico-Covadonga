/**
 * Seed de usuarios de prueba para piloto.
 * Ejecutar: npx prisma db seed
 *
 * Usuarios creados (contraseña común: Piloto2024!):
 * - gestor@hospital.es     → Gestor (GESTOR)
 * - anestesista1@hospital.es → Anestesista 1
 * - anestesista2@hospital.es → Anestesista 2
 * - cirujano@hospital.es  → Cirujano piloto
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "Piloto2024!";

const USERS = [
  { email: "gestor@hospital.es", name: "Gestor Piloto", role: "GESTOR" as const },
  { email: "anestesista1@hospital.es", name: "Anestesista 1", role: "ANESTESISTA" as const },
  { email: "anestesista2@hospital.es", name: "Anestesista 2", role: "ANESTESISTA" as const },
  { email: "cirujano@hospital.es", name: "Cirujano Piloto", role: "CIRUJANO" as const },
];

async function main() {
  const count = await prisma.user.count();
  if (count > 0) {
    console.log("Ya hay usuarios en la BD. No se ejecuta seed.");
    console.log("Credenciales piloto (si se ejecutó antes): gestor@hospital.es / Piloto2024!");
    return;
  }

  const passwordHash = await hash(PASSWORD, 12);

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
    console.log(`Creado: ${u.email} (${u.role})`);
  }

  console.log("\n--- Usuarios piloto creados ---");
  console.log("Contraseña para todos: Piloto2024!");
  console.log("- gestor@hospital.es");
  console.log("- anestesista1@hospital.es");
  console.log("- anestesista2@hospital.es");
  console.log("- cirujano@hospital.es");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
