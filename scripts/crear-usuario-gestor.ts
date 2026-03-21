/**
 * Crea un usuario gestor real (GESTOR o GESTOR_ANESTESISTA).
 * No hardcodear contraseñas ni emails en el repositorio.
 *
 * Uso (Linux/Mac):
 *   GESTOR_EMAIL=nuevo@hospital.es GESTOR_NAME="Nombre" GESTOR_ROLE=GESTOR GESTOR_PASSWORD=contraseña-segura npx tsx scripts/crear-usuario-gestor.ts
 *
 * Uso (Windows PowerShell):
 *   $env:GESTOR_EMAIL="nuevo@hospital.es"; $env:GESTOR_NAME="Nombre"; $env:GESTOR_ROLE="GESTOR"; $env:GESTOR_PASSWORD="contraseña-segura"; npx tsx scripts/crear-usuario-gestor.ts
 *
 * Variables de entorno:
 *   GESTOR_EMAIL  - Obligatorio. Email del nuevo gestor.
 *   GESTOR_NAME   - Obligatorio. Nombre completo.
 *   GESTOR_ROLE   - GESTOR o GESTOR_ANESTESISTA (por defecto: GESTOR)
 *   GESTOR_PASSWORD - Obligatorio. Mínimo 8 caracteres.
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const VALID_ROLES = ["GESTOR", "GESTOR_ANESTESISTA"] as const;

async function main() {
  const email = process.env.GESTOR_EMAIL?.trim().toLowerCase();
  const name = process.env.GESTOR_NAME?.trim();
  const roleInput = (process.env.GESTOR_ROLE ?? "GESTOR").toUpperCase();
  const password = process.env.GESTOR_PASSWORD;

  if (!email || !email.includes("@")) {
    console.error("ERROR: GESTOR_EMAIL obligatorio y válido.");
    process.exit(1);
  }
  if (!name) {
    console.error("ERROR: GESTOR_NAME obligatorio.");
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error("ERROR: GESTOR_PASSWORD obligatorio, mínimo 8 caracteres.");
    process.exit(1);
  }
  const role = VALID_ROLES.includes(roleInput as (typeof VALID_ROLES)[number])
    ? (roleInput as "GESTOR" | "GESTOR_ANESTESISTA")
    : "GESTOR";

  const existing = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await hash(password, 12);

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { passwordHash, role, approved: true, name },
    });
    console.log(`Usuario actualizado: ${email} (${role})`);
    console.log("Contraseña reemplazada.");
  } else {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role,
        approved: true,
      },
    });
    console.log(`Usuario creado: ${email} (${role})`);
  }

  console.log("\nPuede iniciar sesión con ese email y la contraseña indicada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
