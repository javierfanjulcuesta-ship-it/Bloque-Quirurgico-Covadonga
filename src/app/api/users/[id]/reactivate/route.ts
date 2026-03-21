/**
 * PATCH /api/users/[id]/reactivate
 * Reactiva un usuario (isActive=true). Solo GESTOR y GESTOR_ANESTESISTA.
 *
 * NOTA: Desactivado temporalmente porque User no tiene isActive en schema.prisma
 * del proyecto desplegado.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";

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

    // Campo isActive no existe en User del schema desplegado.
    return NextResponse.json(
      { error: "Reactivación de usuarios no disponible temporalmente" },
      { status: 503 }
    );
  } catch (err) {
    console.error("[users reactivate]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
