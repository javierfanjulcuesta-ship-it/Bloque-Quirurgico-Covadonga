/**
 * PATCH /api/programming-rules/[id]
 * Actualiza una regla. Solo GESTOR y GESTOR_ANESTESISTA.
 *
 * El cliente debe enviar la versión (`expectedUpdatedAt`) que cargó. La escritura
 * usa compare-and-set para impedir que dos gestores sobrescriban silenciosamente
 * cambios del otro desde pantallas desactualizadas.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, hasPermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import { ADMIN_NOTIFICATION_EMAIL_RULE_KEY } from "@/lib/reservations/surgicalCircuitConstants";

const MAX_PATCH_BODY_BYTES = 64 * 1024;

const patchBodySchema = z.object({
  valueJson: z.union([z.string(), z.null()]),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
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

    const bodyResult = await readTextBodyWithLimit(request, MAX_PATCH_BODY_BYTES);
    if (!bodyResult.ok) {
      return NextResponse.json({ error: "Solicitud demasiado grande" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(bodyResult.text);
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

    const expectedUpdatedAt = new Date(parsed.data.expectedUpdatedAt);
    const result = await prisma.programmingRule.updateMany({
      where: {
        id,
        updatedAt: expectedUpdatedAt,
      },
      data: {
        valueJson,
        updatedByUserId: session!.userId,
      },
    });

    if (result.count !== 1) {
      const stillExists = await prisma.programmingRule.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!stillExists) {
        return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "La regla ha cambiado desde que se cargó. Revise la versión actual antes de volver a guardar." },
        { status: 409 }
      );
    }

    const updated = await prisma.programmingRule.findUniqueOrThrow({ where: { id } });

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
  } catch {
    console.error("[programming-rules PATCH] request failed");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
