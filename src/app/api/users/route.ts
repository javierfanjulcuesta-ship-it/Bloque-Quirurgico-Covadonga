/**
 * GET /api/users - Lista de usuarios (requiere sesión).
 * POST /api/users - Crear usuario (solo gestor). Devuelve contraseña temporal.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { roleToFrontend, roleToPrisma } from "@/lib/roleMapping";
import { hasGestorAccess } from "@/lib/types";
import type { User, UserRole } from "@/lib/types";

const VALID_ROLES: UserRole[] = ["cirujano", "anestesista", "gestor", "gestor-anestesista", "endoscopista"];
const TEMP_PASSWORD_LENGTH = 10;
const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

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

export async function POST(request: Request) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (!hasGestorAccess(session.role as UserRole)) {
      return NextResponse.json(
        { error: "Solo el gestor puede crear usuarios" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const roleInput = typeof body.role === "string" && VALID_ROLES.includes(body.role as UserRole) ? body.role : "";
    const role = roleToPrisma(roleInput);
    const name = typeof body.name === "string" ? body.name.trim() : emailToDisplayName(email);

    if (!email || !role) {
      return NextResponse.json(
        { error: "Email y rol son obligatorios" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese email" },
        { status: 409 }
      );
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const canSespa = typeof body.canSespa === "boolean" ? body.canSespa : false;

    const dbUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: role!,
        approved: true,
        canSespa,
      },
    });

    return NextResponse.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: roleToFrontend(dbUser.role),
        approved: dbUser.approved,
        canSespa: dbUser.canSespa,
      },
      tempPassword,
    });
  } catch (err) {
    console.error("[users POST]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const dbUsers = await prisma.user.findMany({
      where: { approved: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        approved: true,
        canSespa: true,
      },
    });

    const users: User[] = dbUsers.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: roleToFrontend(u.role),
      approved: u.approved,
      canSespa: u.canSespa,
    }));

    return NextResponse.json({ users });
  } catch (err) {
    console.error("[users]", err);
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
