/** PATCH /api/users/[id]/deactivate */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { deactivateUser } from "@/lib/users/userLifecycleService";

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
    if (id === session!.userId) {
      return NextResponse.json({ error: "No puede desactivar su propio usuario" }, { status: 400 });
    }

    const result = await deactivateUser(prisma, { targetUserId: id, actorUserId: session!.userId });
    if (result.ok) return NextResponse.json({ ok: true });
    if (result.code === "NOT_FOUND") return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (result.code === "ALREADY_INACTIVE") return NextResponse.json({ error: "El usuario ya está desactivado" }, { status: 400 });
    if (result.code === "LAST_MANAGER") {
      return NextResponse.json({ error: "No se puede desactivar el último gestor activo del sistema" }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo desactivar el usuario" }, { status: 409 });
  } catch (err) {
    console.error("[users deactivate]", err);
    return NextResponse.json({ error: "Error al desactivar" }, { status: 500 });
  }
}
