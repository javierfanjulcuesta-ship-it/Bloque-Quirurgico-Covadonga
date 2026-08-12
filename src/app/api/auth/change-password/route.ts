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
import { changePasswordWithAudit } from "@/lib/users/userPasswordChangeService";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";

const CHANGE_PASSWORD_REQUEST_MAX_BYTES = 8_192;

export async function POST(request: Request) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json(
        { error: "Sesión expirada o no autenticado. Inicie sesión de nuevo." },
        { status: 401 }
      );
    }

    const rawBody = await readTextBodyWithLimit(request, CHANGE_PASSWORD_REQUEST_MAX_BYTES);
    if (!rawBody.ok) {
      return NextResponse.json({ error: "Solicitud demasiado grande." }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody.text);
    } catch {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const currentPassword = typeof input.currentPassword === "string" ? input.currentPassword : "";
    const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
    const confirmPassword = typeof input.confirmPassword === "string" ? input.confirmPassword : "";

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
      select: { id: true, passwordHash: true, approved: true, deletedAt: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: "Usuario no encontrado." },
        { status: 404 }
      );
    }

    if (!dbUser.approved || dbUser.deletedAt != null) {
      return NextResponse.json(
        { error: "Su cuenta ya no está disponible." },
        { status: 403 }
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
    const changed = await changePasswordWithAudit(prisma, {
      userId: dbUser.id,
      expectedPasswordHash: dbUser.passwordHash,
      nextPasswordHash: newPasswordHash,
    });

    if (!changed.ok) {
      return NextResponse.json(
        {
          error: "La credencial cambió mientras se procesaba la solicitud. Vuelva a iniciar sesión e inténtelo de nuevo.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    console.error("[auth/change-password] request failed");
    return NextResponse.json(
      { error: "Error interno al cambiar la contraseña." },
      { status: 500 }
    );
  }
}
