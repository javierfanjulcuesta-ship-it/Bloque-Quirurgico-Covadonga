/**
 * POST /api/users/[id]/resend-invitation
 * Reenvía invitación al usuario existente con una nueva contraseña temporal.
 * Requiere user:create.
 *
 * La contraseña solo queda rotada si el envío termina correctamente. Si el envío
 * falla, se restaura el hash anterior para no bloquear al usuario por un correo
 * que nunca recibió.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { generateTemporaryPassword } from "@/lib/auth/temporaryPassword";
import { roleToFrontend } from "@/lib/roleMapping";
import { getAppUrl } from "@/lib/appUrl";
import { sendNewUserInvitationEmail } from "@/lib/email/outlookService";
import { NORMAS_PROGRAMACION_BLOQUE } from "@/lib/email/emailConstants";
import { logUserAuditEvent } from "@/lib/userAudit";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sessionPayload = await getSessionFromCookie();
    const session = toAuthSession(sessionPayload);
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "user:create");
    if (denyPerm) return denyPerm;

    const invitedByName = sessionPayload?.name?.trim() || undefined;
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    let appUrl: string;
    try {
      appUrl = getAppUrl();
    } catch (e) {
      console.error("[resend-invitation] URL no configurada", e instanceof Error ? e.message : "Unknown error");
      return NextResponse.json(
        { error: "La URL de la aplicación no está configurada" },
        { status: 503 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, deletedAt: true, passwordHash: true },
    });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (user.deletedAt != null) {
      return NextResponse.json({ error: "El usuario está eliminado del directorio" }, { status: 400 });
    }

    const tempPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(tempPassword);
    const previousPasswordHash = user.passwordHash;
    const role = roleToFrontend(user.role);
    const normasTexto = role === "cirujano" || role === "endoscopista" ? NORMAS_PROGRAMACION_BLOQUE : undefined;

    await prisma.user.update({ where: { id }, data: { passwordHash } });

    try {
      await sendNewUserInvitationEmail({
        toEmail: user.email,
        role,
        recipientName: user.name || undefined,
        accessLink: appUrl,
        initialPassword: tempPassword,
        invitedByName,
        normasTexto,
      });
    } catch (sendErr) {
      const sendMsg = sendErr instanceof Error ? sendErr.message : "Unknown email error";
      console.error("[resend-invitation] error de envío", sendMsg);
      try {
        await prisma.user.update({ where: { id }, data: { passwordHash: previousPasswordHash } });
      } catch (rollbackErr) {
        console.error(
          "[resend-invitation] CRITICAL: no se pudo restaurar el passwordHash anterior",
          rollbackErr instanceof Error ? rollbackErr.message : "Unknown rollback error",
        );
      }
      return NextResponse.json({ error: "No se pudo enviar el correo de invitación" }, { status: 502 });
    }

    try {
      await logUserAuditEvent({
        userId: id,
        eventType: "USER_INVITATION_RESENT",
        actorUserId: session?.userId,
        detailsJson: { targetEmail: user.email, targetRole: user.role },
      });
    } catch (auditErr) {
      console.error(
        "[resend-invitation] invitación enviada pero no se pudo registrar auditoría",
        auditErr instanceof Error ? auditErr.message : "Unknown audit error",
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[resend-invitation]", err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json({ error: "Error al reenviar invitación" }, { status: 500 });
  }
}
