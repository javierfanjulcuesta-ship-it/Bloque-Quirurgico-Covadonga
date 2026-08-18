/**
 * POST /api/email/send-invitation
 * Envía invitación de un usuario ya creado.
 * Requiere user:create. El destinatario, rol, nombre y contraseña temporal deben
 * corresponder al usuario persistido; la URL de acceso solo procede del servidor.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import type { UserRole } from "@/lib/types";
import { prisma } from "@/lib/db/prisma";
import { roleToFrontend } from "@/lib/roleMapping";
import { verifyPassword } from "@/lib/auth/password";
import { sendNewUserInvitationEmail } from "@/lib/email/outlookService";
import { NORMAS_PROGRAMACION_BLOQUE } from "@/lib/email/emailConstants";
import { getAppUrl } from "@/lib/appUrl";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";

const VALID_ROLES: UserRole[] = ["cirujano", "anestesista", "gestor", "gestor-anestesista", "endoscopista", "gestion-citas"];
const SEND_INVITATION_BODY_MAX_BYTES = 16 * 1024;

export async function POST(request: Request) {
  try {
    const sessionPayload = await getSessionFromCookie();
    const session = toAuthSession(sessionPayload);
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "user:create");
    if (denyPerm) return denyPerm;

    const limitedBody = await readTextBodyWithLimit(request, SEND_INVITATION_BODY_MAX_BYTES);
    if (!limitedBody.ok) {
      return NextResponse.json({ error: "Solicitud demasiado grande" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(limitedBody.text);
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    const input = body as Record<string, unknown>;

    const invitedByName = sessionPayload?.name?.trim() || undefined;
    const toEmail = typeof input.toEmail === "string" ? input.toEmail.trim().toLowerCase() : "";
    const requestedRole = typeof input.role === "string" && VALID_ROLES.includes(input.role as UserRole)
      ? input.role as UserRole
      : null;
    const initialPassword = typeof input.initialPassword === "string" ? input.initialPassword : "";

    if (!toEmail || !requestedRole || initialPassword.length < 12 || initialPassword.length > 128) {
      return NextResponse.json({ error: "Datos de invitación inválidos" }, { status: 400 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: toEmail },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        approved: true,
        deletedAt: true,
        passwordHash: true,
      },
    });
    if (!dbUser || dbUser.deletedAt || !dbUser.approved) {
      return NextResponse.json({ error: "Usuario destinatario no encontrado o inactivo" }, { status: 404 });
    }

    const role = roleToFrontend(dbUser.role);
    if (role !== requestedRole) {
      return NextResponse.json({ error: "El rol de invitación no coincide con el usuario" }, { status: 409 });
    }

    const passwordMatches = await verifyPassword(initialPassword, dbUser.passwordHash);
    if (!passwordMatches) {
      return NextResponse.json(
        { error: "La contraseña temporal ya no coincide con la credencial actual del usuario" },
        { status: 409 },
      );
    }

    let appUrl: string;
    try {
      appUrl = getAppUrl();
    } catch {
      console.error("[email send-invitation] Application URL unavailable");
      return NextResponse.json({ error: "La URL de la aplicación no está configurada" }, { status: 503 });
    }

    const normasTexto = role === "cirujano" || role === "endoscopista" ? NORMAS_PROGRAMACION_BLOQUE : undefined;

    await sendNewUserInvitationEmail({
      toEmail: dbUser.email,
      role,
      recipientName: dbUser.name || undefined,
      accessLink: appUrl,
      initialPassword,
      invitedByName,
      normasTexto,
    });

    return NextResponse.json({ ok: true });
  } catch {
    console.error("[email send-invitation] Invitation delivery failed");
    return NextResponse.json({ error: "Error al enviar invitación" }, { status: 500 });
  }
}
