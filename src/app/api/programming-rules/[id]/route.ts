/**
 * PATCH /api/programming-rules/[id]
 * Actualiza una regla. Solo GESTOR y GESTOR_ANESTESISTA.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, hasPermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ADMIN_NOTIFICATION_EMAIL_RULE_KEY } from "@/lib/reservations/surgicalCircuitConstants";

const patchBodySchema = z.object({
  valueJson: z.union([z.string(), z.null()]).optional(),
});

export async function PATCH(
  request: Request,
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? "Datos inválidos";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const existing = await prisma.programmingRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 });
    }

    const rawVal = parsed.data.valueJson;
    if (rawVal === undefined) {
      return NextResponse.json({ error: "valueJson requerido" }, { status: 400 });
    }

    let valueJson: string | null = rawVal;

    if (existing.key === ADMIN_NOTIFICATION_EMAIL_RULE_KEY) {
      const rawStr = rawVal === null ? "" : rawVal;
      let email = "";
      try {
        const j = JSON.parse(rawStr);
        email = typeof j === "string" ? j.trim() : "";
      } catch {
        email = rawStr.replace(/^"|"$/g, "").trim();
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Email de notificación no válido (o deje vacío)" }, { status: 400 });
      }
      valueJson = JSON.stringify(email);
    }

    const updated = await prisma.programmingRule.update({
      where: { id },
      data: {
        valueJson,
        updatedByUserId: session!.userId,
      },
    });

    return NextResponse.json({
      rule: {
        id: updated.id,
        key: updated.key,
        name: updated.name,
        description: updated.description,
        category: updated.category,
        valueJson: updated.valueJson,
        isActive: updated.isActive,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("[programming-rules PATCH]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
