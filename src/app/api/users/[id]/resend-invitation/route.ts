/**
 * POST /api/users/[id]/resend-invitation
 * Reenvía invitación al usuario existente (nueva contraseña temporal).
 * Requiere user:create.
 * Usa sendNewUserInvitationEmail (SMTP/Graph real, o mock si no configurado).
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { roleToFrontend } from "@/lib/roleMapping";
import { getAppUrl } from "@/lib/appUrl";
import { sendNewUserInvitationEmail } from "@/lib/email/outlookService";
import { logUserAuditEvent } from "@/lib/userAudit";

const TEMP_PASSWORD_LENGTH = 10;
const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

function generateTempPassword(): string {
  let result = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log("[RESEND-INVITE] inicio", { id });
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "user:create");
    if (denyPerm) return denyPerm;

    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    let appUrl: string;
    try {
      appUrl = getAppUrl();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[RESEND-INVITE] URL no configurada:", msg);
      return NextResponse.json(
        { error: "La URL de la aplicación no está configurada. Configure NEXT_PUBLIC_APP_URL o NEXTAUTH_URL en Vercel." },
        { status: 503 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) {
      console.log("[RESEND-INVITE] usuario no encontrado", { id });
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    console.log("[RESEND-INVITE] usuario encontrado", { id: user.id, email: user.email, role: user.role });

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    console.log("[RESEND-INVITE] contraseña regenerada");

    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    const role = roleToFrontend(user.role);
    console.log("[RESEND-INVITE] intento envío", { to: user.email });

    try {
      await sendNewUserInvitationEmail({
        toEmail: user.email,
        role,
        recipientName: user.name || undefined,
        accessLink: appUrl,
        initialPassword: tempPassword,
      });
      console.log("[RESEND-INVITE] envío ok", { to: user.email });
    } catch (sendErr) {
      const sendMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error("[RESEND-INVITE] error envío", { to: user.email, error: sendMsg });
      return NextResponse.json(
        {
          error: "No se pudo enviar el correo de invitación",
          detail: sendMsg,
        },
        { status: 500 }
      );
    }

    await logUserAuditEvent({
      userId: id,
      eventType: "USER_INVITATION_RESENT",
      actorUserId: session?.userId,
      detailsJson: { targetEmail: user.email, targetRole: user.role },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[RESEND-INVITE] ERROR", err);
    return NextResponse.json(
      { error: "Error al reenviar invitación", detail: msg },
      { status: 500 }
    );
  }
}
