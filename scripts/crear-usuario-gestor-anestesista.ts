/**
 * Crea o actualiza un usuario GESTOR_ANESTESISTA real.
 * No contiene identidad ni credenciales reales en el repositorio.
 *
 * Variables obligatorias:
 *   GESTOR_ANESTESISTA_EMAIL
 *   GESTOR_ANESTESISTA_NAME
 *   GESTOR_ANESTESISTA_PASSWORD (mínimo 12 caracteres)
 *
 * Ejemplo PowerShell:
 *   $env:GESTOR_ANESTESISTA_EMAIL="usuario@hospital.es"
 *   $env:GESTOR_ANESTESISTA_NAME="Nombre Apellidos"
 *   $env:GESTOR_ANESTESISTA_PASSWORD="contraseña-larga-y-unica"
 *   npx tsx scripts/crear-usuario-gestor-anestesista.ts
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const ROLE = "GESTOR_ANESTESISTA" as const;

async function main() {
  const email = process.env.GESTOR_ANESTESISTA_EMAIL?.trim().toLowerCase();
  const name = process.env.GESTOR_ANESTESISTA_NAME?.trim();
  const password = process.env.GESTOR_ANESTESISTA_PASSWORD;

  if (!email || !email.includes("@")) {
    throw new Error("GESTOR_ANESTESISTA_EMAIL es obligatorio y debe ser válido.");
  }
  if (!name) {
    throw new Error("GESTOR_ANESTESISTA_NAME es obligatorio.");
  }
  if (!password || password.length < 12) {
    throw new Error("GESTOR_ANESTESISTA_PASSWORD es obligatorio y debe tener al menos 12 caracteres.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await hash(password, 12);

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { passwordHash, role: ROLE, approved: true, name },
    });
    console.log(`Usuario gestor-anestesista actualizado: ${email}`);
  } else {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: ROLE,
        approved: true,
      },
    });
    console.log(`Usuario gestor-anestesista creado: ${email}`);
  }

  console.log("La contraseña no se muestra en logs.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
