/**
 * PATCH /api/programming-rules/[id]
 * Actualiza una regla. Solo GESTOR y GESTOR_ANESTESISTA.
 *
 * NOTA: Desactivado temporalmente porque ProgrammingRule no existe en schema.prisma
 * del proyecto desplegado.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, hasPermission } from "@/lib/auth";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    if (!hasPermission(session!.role, "rules:edit")) {
      return NextResponse.json({ error: "Sin permiso para editar reglas" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    // Modelo ProgrammingRule no existe en schema.prisma desplegado.
    return NextResponse.json(
      { error: "Edición de reglas no disponible temporalmente" },
      { status: 503 }
    );
  } catch (err) {
    console.error("[programming-rules PATCH]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
