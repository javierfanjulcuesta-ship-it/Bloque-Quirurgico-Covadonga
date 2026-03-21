/**
 * Planes de apertura del bloque.
 * GET - Listar planes (schedule:view:own | schedule:view:all). Rango max 93 días.
 * PUT - Crear/actualizar plan (or:open_close, solo gestores)
 *
 * NOTA: Desactivado temporalmente porque BlockOpeningPlan no existe en schema.prisma
 * del proyecto desplegado. La ruta responde sin usar Prisma hasta que el modelo se añada.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission, requireAnyPermission } from "@/lib/auth";
import { RESOURCES } from "@/lib/constants";

const VALID_RESOURCE_IDS = new Set(RESOURCES.map((r) => r.id));

/** Ver planes de apertura (agenda). Requiere schedule:view:own o schedule:view:all. */
export async function GET(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["schedule:view:own", "schedule:view:all"]);
    if (denyPerm) return denyPerm;

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: "dateFrom y dateTo requeridos" }, { status: 400 });
    }

    const from = new Date(dateFrom + "T00:00:00.000Z");
    const to = new Date(dateTo + "T23:59:59.999Z");

    const maxDays = 93;
    const diffMs = to.getTime() - from.getTime();
    if (diffMs < 0 || diffMs > maxDays * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: `Rango máximo ${maxDays} días` }, { status: 400 });
    }

    // Modelo BlockOpeningPlan no existe en schema.prisma desplegado. Respuesta vacía segura.
    return NextResponse.json({ plans: [] });
  } catch (err) {
    console.error("[block-opening-plan GET]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "or:open_close");
    if (denyPerm) return denyPerm;

    // Modelo BlockOpeningPlan no existe en schema.prisma desplegado.
    return NextResponse.json(
      { error: "Plan de apertura no disponible temporalmente" },
      { status: 503 }
    );
  } catch (err) {
    console.error("[block-opening-plan PUT]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
