/** DELETE /api/users/[id] - baja lógica segura. */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { softDeleteUser } from "@/lib/users/userLifecycleService";

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
      return NextResponse.json({ error: "No puede eliminar su propio usuario" }, { status: 400 });
    }

    const result = await softDeleteUser(prisma, { targetUserId: id, actorUserId: session!.userId });
    if (result.ok) return NextResponse.json({ ok: true, alreadyDeleted: result.alreadyDeleted ?? false });
    if (result.code === "NOT_FOUND") return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (result.code === "LAST_MANAGER") {
      return NextResponse.json({ error: "No se puede eliminar el último gestor activo del sistema" }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo eliminar el usuario" }, { status: 409 });
  } catch {
    console.error("[users DELETE] Failed to delete user");
    return NextResponse.json({ error: "Error al eliminar usuario" }, { status: 500 });
  }
}
