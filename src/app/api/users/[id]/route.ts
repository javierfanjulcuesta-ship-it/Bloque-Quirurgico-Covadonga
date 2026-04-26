/**
 * DELETE /api/users/[id]
 * Baja lógica: deletedAt + approved=false. No borra filas ni relaciones.
 * Requiere user:deactivate (misma familia que desactivar).
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { logUserAuditEvent } from "@/lib/userAudit";

export async function DELETE(
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
    if (id === session!.userId) {
      return NextResponse.json(
        { error: "No puede eliminar su propio usuario" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (user.deletedAt) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }

    await prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        approved: false,
        deletedByUserId: session!.userId,
      },
    });

    await logUserAuditEvent({
      userId: id,
      eventType: "USER_DELETED",
      actorUserId: session!.userId,
      detailsJson: { soft: true },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[users DELETE]", err);
    return NextResponse.json({ error: "Error al eliminar usuario" }, { status: 500 });
  }
}
