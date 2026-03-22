/**
 * PATCH /api/users/[id]/reactivate
 * Reactiva un usuario (approved=true). Restaura el acceso al login. Solo GESTOR y GESTOR_ANESTESISTA.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

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

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, approved: true },
    });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (user.approved) return NextResponse.json({ error: "El usuario ya está activo" }, { status: 400 });

    await prisma.user.update({
      where: { id },
      data: { approved: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[users reactivate]", err);
    return NextResponse.json({ error: "Error al reactivar" }, { status: 500 });
  }
}
