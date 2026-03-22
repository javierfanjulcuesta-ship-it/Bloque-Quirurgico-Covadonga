/**
 * POST /api/email/send-invitation
 * Envía invitación de nuevo usuario desde jfanjul@riberacare.com.
 * Usa outlookService (mock o Microsoft Graph según configuración).
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import type { UserRole } from "@/lib/types";
import { sendNewUserInvitationEmail } from "@/lib/email/outlookService";
import { getAppUrl } from "@/lib/appUrl";

const VALID_ROLES: UserRole[] = ["cirujano", "anestesista", "gestor", "gestor-anestesista", "endoscopista"];

export async function POST(request: Request) {
  try {
    const sessionPayload = await getSessionFromCookie();
    const session = toAuthSession(sessionPayload);
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "user:create");
    if (denyPerm) return denyPerm;

    const body = await request.json();
    const toEmail = typeof body.toEmail === "string" ? body.toEmail.trim().toLowerCase() : "";
    const role = typeof body.role === "string" && VALID_ROLES.includes(body.role as UserRole) ? body.role : "";
    const recipientName = typeof body.recipientName === "string" ? body.recipientName.trim() : undefined;
    const initialPassword = typeof body.initialPassword === "string" ? body.initialPassword : "";

    if (!toEmail || !role || !initialPassword) {
      return NextResponse.json(
        { error: "toEmail, role e initialPassword son obligatorios" },
        { status: 400 }
      );
    }

    let appUrl: string;
    try {
      appUrl = getAppUrl();
    } catch (e) {
      console.error("[email send-invitation] URL no configurada:", e instanceof Error ? e.message : e);
      return NextResponse.json(
        { error: "La URL de la aplicación no está configurada. Configure NEXT_PUBLIC_APP_URL o NEXTAUTH_URL en Vercel." },
        { status: 503 }
      );
    }

    await sendNewUserInvitationEmail({
      toEmail,
      role: role as UserRole,
      recipientName: recipientName || undefined,
      accessLink: appUrl,
      initialPassword,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email send-invitation]", err);
    return NextResponse.json(
      { error: "Error al enviar invitación" },
      { status: 500 }
    );
  }
}
