/**
 * POST /api/auth/change-password
 * Cambiar contraseña del usuario autenticado.
 * Requiere: currentPassword, newPassword, confirmPassword.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { validatePasswordStrength } from "@/lib/auth/passwordValidation";

export async function POST(request: Request) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json(
        { error: "Sesión expirada o no autenticado. Inicie sesión de nuevo." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

    if (!currentPassword) {
      return NextResponse.json(
        { error: "La contraseña actual es obligatoria." },
        { status: 400 }
      );
    }

    if (!newPassword) {
      return NextResponse.json(
        { error: "La nueva contraseña es obligatoria." },
        { status: 400 }
      );
    }

    const pwdValidation = validatePasswordStrength(newPassword);
    if (!pwdValidation.valid) {
      return NextResponse.json(
        { error: pwdValidation.error },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "La nueva contraseña y la confirmación no coinciden." },
        { status: 400 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, passwordHash: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: "Usuario no encontrado." },
        { status: 404 }
      );
    }

    const validCurrent = await verifyPassword(currentPassword, dbUser.passwordHash);
    if (!validCurrent) {
      return NextResponse.json(
        { error: "La contraseña actual no es correcta." },
        { status: 400 }
      );
    }

    const newPasswordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: dbUser.id },
      data: { passwordHash: newPasswordHash },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/change-password]", err);
    return NextResponse.json(
      { error: "Error interno al cambiar la contraseña." },
      { status: 500 }
    );
  }
}
