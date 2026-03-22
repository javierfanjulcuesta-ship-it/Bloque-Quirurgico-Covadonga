/**
 * Script TEMPORAL para crear 3 usuarios de prueba directamente en la BD.
 * Usa la misma lógica de hash que la app. No modifica rutas ni frontend.
 * Eliminar cuando el formulario web funcione.
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const SALT_ROUNDS = 12;
const TEMP_PASSWORD_LENGTH = 10;
const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

function generateTempPassword(): string {
  let result = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

async function hashPassword(password: string): Promise<string> {
  return hash(password, SALT_ROUNDS);
}

const USUARIOS_A_CREAR = [
  { email: "gestor.prueba@hospital.es", name: "Gestor Prueba", role: "GESTOR" as const },
  { email: "anestesia1.prueba@hospital.es", name: "Anestesista Prueba 1", role: "ANESTESISTA" as const },
  { email: "anestesia2.prueba@hospital.es", name: "Anestesista Prueba 2", role: "ANESTESISTA" as const },
];

async function main() {
  const prisma = new PrismaClient();
  const resultados: Array<{
    email: string;
    name: string;
    role: string;
    tempPassword?: string;
    created: boolean;
  }> = [];

  try {
    for (const u of USUARIOS_A_CREAR) {
      const existing = await prisma.user.findUnique({
        where: { email: u.email },
        select: { id: true },
      });

      if (existing) {
        resultados.push({
          email: u.email,
          name: u.name,
          role: u.role,
          created: false,
        });
        continue;
      }

      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);

      await prisma.user.create({
        data: {
          email: u.email,
          passwordHash,
          name: u.name,
          role: u.role,
          approved: true,
          canSespa: false,
        },
      });

      resultados.push({
        email: u.email,
        name: u.name,
        role: u.role,
        tempPassword,
        created: true,
      });
    }

    console.log("\n=== USUARIOS CREADOS / EXISTENTES ===\n");
    for (const r of resultados) {
      console.log(`Email: ${r.email}`);
      console.log(`Nombre: ${r.name}`);
      console.log(`Rol: ${r.role}`);
      if (r.created && r.tempPassword) {
        console.log(`Contraseña temporal: ${r.tempPassword}`);
      } else {
        console.log(`Estado: ya existía`);
      }
      console.log("---");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
