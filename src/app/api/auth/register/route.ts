/**
 * POST /api/auth/register
 * Registro de nuevo usuario. SOLO el gestor puede crear usuarios.
 * Requiere sesión de gestor o gestor-anestesista.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { roleToFrontend, roleToPrisma } from "@/lib/roleMapping";
import { hasGestorAccess } from "@/lib/types";
import type { UserRole } from "@/lib/types";

const VALID_ROLES: UserRole[] = ["cirujano", "anestesista", "gestor", "gestor-anestesista", "endoscopista"];

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
    const password = typeof body.password === "string" ? body.password : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const roleInput = typeof body.role === "string" && VALID_ROLES.includes(body.role as UserRole) ? body.role : "";
    const role = roleToPrisma(roleInput);

    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { error: "Email, contraseña, nombre y rol son obligatorios" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese email" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const dbUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: role!,
        approved: true,
      },
    });

    return NextResponse.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: roleToFrontend(dbUser.role),
        approved: dbUser.approved,
      },
    });
  } catch (err) {
    console.error("[auth/register]", err);
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
