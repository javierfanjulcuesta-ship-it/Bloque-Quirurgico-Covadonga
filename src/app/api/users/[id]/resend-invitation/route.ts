/**
 * POST /api/users/[id]/resend-invitation
 * Reenvía invitación al usuario existente (nueva contraseña temporal).
 * Requiere user:create.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { roleToFrontend } from "@/lib/roleMapping";
import { getAppUrl } from "@/lib/appUrl";
import { sendNewUserInvitationEmail } from "@/lib/email/outlookService";
import { getNormasTextoCompleto } from "@/lib/programmingRules";
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
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "user:create");
    if (denyPerm) return denyPerm;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    let appUrl: string;
    try {
      appUrl = getAppUrl();
    } catch (e) {
      console.error("[resend-invitation] URL no configurada:", e instanceof Error ? e.message : e);
      return NextResponse.json(
        { error: "La URL de la aplicación no está configurada." },
        { status: 503 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    const role = roleToFrontend(user.role);
    const normasTexto = ["CIRUJANO", "ENDOSCOPISTA"].includes(user.role)
      ? await getNormasTextoCompleto()
      : undefined;

    await sendNewUserInvitationEmail({
      toEmail: user.email,
      role,
      recipientName: user.name || undefined,
      invitedByName: session?.name,
      accessLink: appUrl,
      initialPassword: tempPassword,
      normasTexto,
    });

    await logUserAuditEvent({
      userId: id,
      eventType: "USER_INVITATION_RESENT",
      actorUserId: session?.userId,
      detailsJson: { targetEmail: user.email, targetRole: user.role },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[resend-invitation]", err);
    return NextResponse.json(
      { error: "Error al reenviar invitación" },
      { status: 500 }
    );
  }
}
