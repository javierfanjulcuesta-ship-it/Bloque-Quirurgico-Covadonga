/**
 * POST /api/email/send-invitation
 * Envía invitación de nuevo usuario desde jfanjul@riberacare.com.
 * Usa outlookService (mock o Microsoft Graph según configuración).
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { hasGestorAccess } from "@/lib/types";
import type { UserRole } from "@/lib/types";
import { sendNewUserInvitationEmail } from "@/lib/email/outlookService";

const VALID_ROLES: UserRole[] = ["cirujano", "anestesista", "gestor", "gestor-anestesista", "endoscopista"];

export async function POST(request: Request) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (!hasGestorAccess(session.role as UserRole)) {
      return NextResponse.json(
        { error: "Solo el gestor puede enviar invitaciones" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const toEmail = typeof body.toEmail === "string" ? body.toEmail.trim().toLowerCase() : "";
    const role = typeof body.role === "string" && VALID_ROLES.includes(body.role as UserRole) ? body.role : "";
    const recipientName = typeof body.recipientName === "string" ? body.recipientName.trim() : undefined;
    const accessLink = typeof body.accessLink === "string" ? body.accessLink.trim() : "";
    const initialPassword = typeof body.initialPassword === "string" ? body.initialPassword : "";

    if (!toEmail || !role || !initialPassword) {
      return NextResponse.json(
        { error: "toEmail, role e initialPassword son obligatorios" },
        { status: 400 }
      );
    }

    await sendNewUserInvitationEmail({
      toEmail,
      role: role as UserRole,
      recipientName: recipientName || undefined,
      accessLink: accessLink || (typeof process.env.NEXTAUTH_URL === "string" ? process.env.NEXTAUTH_URL : ""),
      initialPassword,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email send-invitation]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al enviar invitación" },
      { status: 500 }
    );
  }
}
