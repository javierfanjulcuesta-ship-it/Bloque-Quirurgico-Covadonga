/**
 * PATCH /api/programming-rules/[id]
 * Actualiza una regla. Solo GESTOR y GESTOR_ANESTESISTA.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, hasPermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const patchSchema = z.object({
  valueJson: z.string().optional(),
  isActive: z.boolean().optional(),
});

/** Validadores por key para valueJson */
const valueValidators: Record<string, (val: unknown) => boolean> = {
  normas_texto_completo: (v) => typeof v === "object" && v !== null && "text" in v && typeof (v as { text: unknown }).text === "string",
  scheduling_deadline_day: (v) => typeof v === "number" && v >= 0 && v <= 6,
  scheduling_deadline_hour: (v) => typeof v === "number" && v >= 0 && v <= 23,
  scheduling_deadline_minute: (v) => typeof v === "number" && v >= 0 && v <= 59,
  transition_minutes: (v) => typeof v === "number" && v >= 0 && v <= 60,
  max_weeks_ahead: (v) => typeof v === "number" && v >= 1 && v <= 12,
};

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

    const body = await _req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
    }

    const rule = await prisma.programmingRule.findUnique({ where: { id } });
    if (!rule) return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 });

    const updates: { valueJson?: string; isActive?: boolean; updatedByUserId?: string } = {};

    if (parsed.data.valueJson !== undefined) {
      let parsedValue: unknown;
      try {
        parsedValue = JSON.parse(parsed.data.valueJson);
      } catch {
        return NextResponse.json({ error: "valueJson debe ser JSON válido" }, { status: 400 });
      }
      const validator = valueValidators[rule.key];
      if (validator && !validator(parsedValue)) {
        return NextResponse.json({ error: `Valor inválido para ${rule.key}` }, { status: 400 });
      }
      updates.valueJson = parsed.data.valueJson;
    }

    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

    updates.updatedByUserId = session!.userId ?? undefined;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(rule);
    }

    const updated = await prisma.programmingRule.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json({
      id: updated.id,
      key: updated.key,
      name: updated.name,
      valueJson: updated.valueJson,
      isActive: updated.isActive,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error("[programming-rules PATCH]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
