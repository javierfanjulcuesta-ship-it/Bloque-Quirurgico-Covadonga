/**
 * POST /api/auth/login
 * Autenticación real: email + contraseña.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, addSessionCookieToResponse } from "@/lib/auth/session";
import { roleToFrontend } from "@/lib/roleMapping";
import type { User } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña son obligatorios" },
        { status: 400 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!dbUser || !dbUser.approved) {
      return NextResponse.json(
        { error: "Credenciales inválidas o usuario no aprobado" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, dbUser.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const role = roleToFrontend(dbUser.role);
    const user: User = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role,
      approved: dbUser.approved,
    };

    const token = await createSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role,
      approved: user.approved,
    });

    const res = NextResponse.json({ user });
    return addSessionCookieToResponse(res, token);
  } catch (err) {
    console.error("[auth/login]", err);
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
