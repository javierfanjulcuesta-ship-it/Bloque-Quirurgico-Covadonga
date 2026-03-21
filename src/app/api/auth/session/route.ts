/**
 * GET /api/auth/session
 * Devuelve el usuario actual si hay sesión válida.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { roleToFrontend } from "@/lib/roleMapping";
import type { User } from "@/lib/types";

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!dbUser || !dbUser.approved) {
      return NextResponse.json(
        { error: "Usuario no encontrado o no aprobado" },
        { status: 401 }
      );
    }

    const user: User = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: roleToFrontend(dbUser.role),
      approved: dbUser.approved,
    };

    return NextResponse.json({ user });
  } catch (err) {
    console.error("[auth/session]", err);
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
