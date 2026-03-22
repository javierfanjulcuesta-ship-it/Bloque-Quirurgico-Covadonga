/**
 * GET /api/email/preview?role=anestesista|gestor|gestor-anestesista
 * Previsualiza el contenido del correo de invitación sin enviar.
 * Solo gestores (user:list o user:create).
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requireAnyPermission } from "@/lib/auth";
import { buildInvitationEmail } from "@/lib/email/invitationEmail";
import type { UserRole } from "@/lib/types";

const PREVIEW_ROLES: UserRole[] = ["anestesista", "gestor", "gestor-anestesista"];

const EXAMPLE = {
  name: "María García",
  email: "maria.garcia@hospital.local",
  invitedByName: "Javier Fanjul",
  appUrl: "https://mi-app.vercel.app",
  temporaryPassword: "Temp-2026-Acceso",
};

export async function GET(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["user:list", "user:create"]);
    if (denyPerm) return denyPerm;

    const { searchParams } = new URL(request.url);
    const roleParam = searchParams.get("role") ?? "anestesista";
    if (!PREVIEW_ROLES.includes(roleParam as UserRole)) {
      return NextResponse.json(
        { error: `role inválido. Use: ${PREVIEW_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    const role = roleParam as UserRole;
    const { subject, text, html } = buildInvitationEmail({
      name: EXAMPLE.name,
      email: EXAMPLE.email,
      role,
      invitedByName: EXAMPLE.invitedByName,
      appUrl: EXAMPLE.appUrl,
      temporaryPassword: EXAMPLE.temporaryPassword,
    });

    return NextResponse.json({
      role,
      exampleData: EXAMPLE,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error("[email preview]", err);
    return NextResponse.json({ error: "Error al generar vista previa" }, { status: 500 });
  }
}
