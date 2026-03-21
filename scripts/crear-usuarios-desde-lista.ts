/**
 * Script para crear usuarios desde listas de correos.
 * Uso:
 *   npx tsx scripts/crear-usuarios-desde-lista.ts cirujanos
 *   npx tsx scripts/crear-usuarios-desde-lista.ts anestesistas
 *
 * Lee emails de scripts/emails-cirujanos.txt o scripts/emails-anestesistas.txt
 * Crea usuarios con contraseña temporal y los imprime para incluir en el documento.
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const TEMP_PASSWORD_LENGTH = 10;
const CHARS = "abcdefghjkmnpqrstuvwxyz23456789"; // sin caracteres ambiguos

function generateTempPassword(): string {
  let result = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

function emailToDisplayName(email: string): string {
  const local = email.split("@")[0] ?? "Usuario";
  return local
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || "Usuario";
}

function parseEmailList(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return content
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith("#") && line.includes("@"));
}

async function main() {
  const channel = process.argv[2];
  if (channel !== "cirujanos" && channel !== "anestesistas") {
    console.error("Uso: npx tsx scripts/crear-usuarios-desde-lista.ts cirujanos|anestesistas");
    process.exit(1);
  }

  const role = channel === "cirujanos" ? "CIRUJANO" : "ANESTESISTA";
  const fileName = channel === "cirujanos" ? "emails-cirujanos.txt" : "emails-anestesistas.txt";
  const filePath = path.join(process.cwd(), "scripts", fileName);

  if (!fs.existsSync(filePath)) {
    console.error(`No existe el archivo ${filePath}`);
    process.exit(1);
  }

  const emails = parseEmailList(filePath);
  if (emails.length === 0) {
    console.error(`No hay correos válidos en ${fileName}`);
    process.exit(1);
  }

  console.log(`\nCreando usuarios ${role} (${emails.length} correos)...\n`);

  const results: { email: string; password: string; status: "creado" | "ya_existia" }[] = [];

  for (const email of emails) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      results.push({ email, password: "(ya existía)", status: "ya_existia" });
      console.log(`  ⏭ ${email} - ya existía`);
      continue;
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hash(tempPassword, 12);
    const name = emailToDisplayName(email);

    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role,
        approved: true,
      },
    });

    results.push({ email, password: tempPassword, status: "creado" });
    console.log(`  ✓ ${email} - creado (contraseña: ${tempPassword})`);
  }

  console.log("\n--- Resumen para el documento ---\n");
  const creados = results.filter((r) => r.status === "creado");
  if (creados.length > 0) {
    console.log("Copiar esta tabla al documento o correo:\n");
    console.log("| Email | Contraseña temporal |");
    console.log("|-------|---------------------|");
    creados.forEach((r) => {
      console.log(`| ${r.email} | ${r.password} |`);
    });
    console.log("\nRecuerde: el usuario puede cambiar la contraseña en Mi perfil.");
  }
  console.log(`\nTotal: ${creados.length} creados, ${results.length - creados.length} ya existían.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
