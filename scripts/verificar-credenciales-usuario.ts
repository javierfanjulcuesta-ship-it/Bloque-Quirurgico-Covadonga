import { PrismaClient } from "@prisma/client";
import { compare } from "bcryptjs";

const prisma = new PrismaClient();

function getDbHost(url?: string): string {
  if (!url) return "desconocido";
  try {
    return new URL(url).host;
  } catch {
    return "invalido";
  }
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.argv[3] ?? "";
  if (!email || !password) {
    console.error("Uso: npx tsx scripts/verificar-credenciales-usuario.ts <email> <password>");
    process.exit(1);
  }

  const dbHost = getDbHost(process.env.DATABASE_URL);
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      approved: true,
      canSespa: true,
      passwordHash: true,
    },
  });

  if (!user) {
    console.log(`Base de datos: ${dbHost}`);
    console.log(`Usuario no encontrado: ${email}`);
    process.exit(2);
  }

  const passwordOk = await compare(password, user.passwordHash);
  console.log(`Base de datos: ${dbHost}`);
  console.log(`Email: ${user.email}`);
  console.log(`Nombre: ${user.name}`);
  console.log(`Rol: ${user.role}`);
  console.log(`Approved: ${user.approved}`);
  console.log(`CanSespa: ${user.canSespa}`);
  console.log(`Password válida: ${passwordOk}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

