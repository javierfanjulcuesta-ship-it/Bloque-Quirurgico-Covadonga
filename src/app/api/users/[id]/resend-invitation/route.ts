/**
 * POST /api/users/[id]/resend-invitation
 * Reenvía invitación al usuario existente con una nueva contraseña temporal.
 * Requiere user:create.
 *
 * La rotación usa compare-and-set sobre passwordHash: dos reenvíos concurrentes no
 * pueden pisarse. Si el envío falla, el rollback solo restaura el hash anterior si
 * la credencial sigue siendo exactamente la generada por esta petición.
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
import {
  claimInvitationCredential,
  rollbackInvitationCredential,
} from "@/lib/users/invitationCredentialRotation";

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
    } catch {
      console.error("[resend-invitation] Application URL unavailable");
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

    const claimed = await claimInvitationCredential(prisma, id, previousPasswordHash, passwordHash);
    if (!claimed) {
      return NextResponse.json(
        {
          error: "La credencial del usuario cambió mientras se preparaba la invitación. Vuelva a intentarlo.",
          code: "INVITATION_CREDENTIAL_CHANGED",
        },
        { status: 409 },
      );
    }

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
    } catch {
      console.error("[resend-invitation] Invitation delivery failed");

      try {
        const rolledBack = await rollbackInvitationCredential(
          prisma,
          id,
          passwordHash,
          previousPasswordHash,
        );
        if (!rolledBack) {
          console.error(
            "[resend-invitation] rollback omitido: la credencial volvió a cambiar tras iniciar el envío",
          );
        }
      } catch {
        console.error(
          "[resend-invitation] CRITICAL: credential rollback failed",
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
    } catch {
      console.error(
        "[resend-invitation] Invitation sent but audit persistence failed",
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    console.error("[resend-invitation] Request failed");
    return NextResponse.json({ error: "Error al reenviar invitación" }, { status: 500 });
  }
}
