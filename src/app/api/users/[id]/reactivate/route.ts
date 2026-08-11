/** PATCH /api/users/[id]/reactivate */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { reactivateUser } from "@/lib/users/userLifecycleService";

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

    const result = await reactivateUser(prisma, { targetUserId: id, actorUserId: session!.userId });
    if (result.ok) return NextResponse.json({ ok: true });
    if (result.code === "NOT_FOUND") return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (result.code === "ALREADY_ACTIVE") return NextResponse.json({ error: "El usuario ya está activo" }, { status: 400 });
    return NextResponse.json({ error: "No se pudo reactivar el usuario" }, { status: 409 });
  } catch (err) {
    console.error("[users reactivate]", err);
    return NextResponse.json({ error: "Error al reactivar" }, { status: 500 });
  }
}
