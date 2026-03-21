/**
 * PATCH /api/users/[id]/deactivate
 * Desactiva un usuario (isActive=false). Solo GESTOR y GESTOR_ANESTESISTA.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { logUserAuditEvent } from "@/lib/userAudit";

const GESTOR_ROLES = new Set(["GESTOR", "GESTOR_ANESTESISTA"]);

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "user:deactivate");
    if (denyPerm) return denyPerm;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    if (!targetUser.isActive) {
      return NextResponse.json({ error: "El usuario ya está desactivado" }, { status: 400 });
    }

    // No permitir desactivarse a sí mismo
    if (targetUser.id === session!.userId) {
      return NextResponse.json({ error: "No puede desactivar su propia cuenta" }, { status: 400 });
    }

    // Protección: no desactivar al último gestor activo
    if (GESTOR_ROLES.has(targetUser.role)) {
      const activeGestors = await prisma.user.count({
        where: {
          role: { in: ["GESTOR", "GESTOR_ANESTESISTA"] },
          isActive: true,
          id: { not: id },
        },
      });
      if (activeGestors === 0) {
        return NextResponse.json(
          { error: "No puede desactivar al último gestor activo. Debe haber al menos uno." },
          { status: 400 }
        );
      }
    }

    await prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        deletedByUserId: session!.userId ?? undefined,
      },
    });

    await logUserAuditEvent({
      userId: id,
      eventType: "USER_DEACTIVATED",
      actorUserId: session!.userId,
      detailsJson: {
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[users deactivate]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
