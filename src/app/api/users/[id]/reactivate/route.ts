/**
 * PATCH /api/users/[id]/reactivate
 * Reactiva un usuario (isActive=true). Solo GESTOR y GESTOR_ANESTESISTA.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { logUserAuditEvent } from "@/lib/userAudit";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "user:reactivate");
    if (denyPerm) return denyPerm;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    if (targetUser.isActive) {
      return NextResponse.json({ error: "El usuario ya está activo" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id },
      data: {
        isActive: true,
        deletedAt: null,
        deletedByUserId: null,
        deletionReason: null,
      },
    });

    await logUserAuditEvent({
      userId: id,
      eventType: "USER_REACTIVATED",
      actorUserId: session!.userId,
      detailsJson: {
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[users reactivate]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
