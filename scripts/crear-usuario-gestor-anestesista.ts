/**
 * Crea el usuario gestor-anestesista real.
 * La contraseña se lee de la variable de entorno GESTOR_ANESTESISTA_PASSWORD.
 * No hardcodear contraseñas en el repositorio.
 *
 * Uso:
 *   GESTOR_ANESTESISTA_PASSWORD=tu-contraseña-segura npx tsx scripts/crear-usuario-gestor-anestesista.ts
 *
 * En Windows (PowerShell):
 *   $env:GESTOR_ANESTESISTA_PASSWORD="tu-contraseña-segura"; npx tsx scripts/crear-usuario-gestor-anestesista.ts
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL = "javier.fanjul.cuesta@gmail.com";
const ROLE = "GESTOR_ANESTESISTA" as const;
const NAME = "Javier Fanjul";

async function main() {
  const password = process.env.GESTOR_ANESTESISTA_PASSWORD;
  if (!password || password.length < 8) {
    console.error("ERROR: Debe definir GESTOR_ANESTESISTA_PASSWORD con al menos 8 caracteres.");
    console.error("");
    console.error("Ejemplo (Linux/Mac):");
    console.error("  GESTOR_ANESTESISTA_PASSWORD=tu-contraseña-segura npx tsx scripts/crear-usuario-gestor-anestesista.ts");
    console.error("");
    console.error("Ejemplo (Windows PowerShell):");
    console.error('  $env:GESTOR_ANESTESISTA_PASSWORD="tu-contraseña-segura"; npx tsx scripts/crear-usuario-gestor-anestesista.ts');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  const passwordHash = await hash(password, 12);

  if (existing) {
    await prisma.user.update({
      where: { email: EMAIL },
      data: { passwordHash, role: ROLE, approved: true, name: NAME },
    });
    console.log(`Usuario actualizado: ${EMAIL} (${ROLE})`);
    console.log("La contraseña ha sido reemplazada por la que indicaste.");
  } else {
    await prisma.user.create({
      data: {
        email: EMAIL,
        passwordHash,
        name: NAME,
        role: ROLE,
        approved: true,
      },
    });
    console.log(`Usuario creado: ${EMAIL} (${ROLE})`);
  }

  console.log("\nPuedes iniciar sesión con ese email y la contraseña que definiste.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
