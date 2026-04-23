/**
 * Crea el usuario gestor-anestesista real.
 * Usa por defecto una contraseña de pruebas y permite override por variable de entorno.
 *
 * Uso:
 *   npx tsx scripts/crear-usuario-gestor-anestesista.ts
 *   GESTOR_ANESTESISTA_PASSWORD=tu-contraseña-segura npx tsx scripts/crear-usuario-gestor-anestesista.ts
 *
 * En Windows (PowerShell):
 *   npx tsx scripts/crear-usuario-gestor-anestesista.ts
 *   $env:GESTOR_ANESTESISTA_PASSWORD="tu-contraseña-segura"; npx tsx scripts/crear-usuario-gestor-anestesista.ts
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL = "javier.fanjul.cuesta@gmail.com";
const ROLE = "GESTOR_ANESTESISTA" as const;
const NAME = "Javier Fanjul";
const DEFAULT_PASSWORD = "Qxflow123!";

function getDbHost(url?: string): string {
  if (!url) return "desconocido";
  try {
    return new URL(url).host;
  } catch {
    return "invalido";
  }
}

async function main() {
  const password = process.env.GESTOR_ANESTESISTA_PASSWORD || DEFAULT_PASSWORD;
  const dbHost = getDbHost(process.env.DATABASE_URL);
  if (password.length < 8) {
    console.error("ERROR: La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL no está definida. No se puede ejecutar el upsert.");
    process.exit(1);
  }

  const passwordHash = await hash(password, 12);
  await prisma.user.upsert({
    where: { email: EMAIL },
    create: {
      email: EMAIL,
      passwordHash,
      name: NAME,
      role: ROLE,
      approved: true,
      canSespa: true,
    },
    update: {
      passwordHash,
      role: ROLE,
      approved: true,
      name: NAME,
      canSespa: true,
    },
  });

  console.log(`Base de datos destino: ${dbHost}`);
  console.log(`Usuario listo para login: ${EMAIL} (${ROLE})`);
  console.log(`Contraseña activa: ${password}`);
  console.log("Estado: approved=true, canSespa=true");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
