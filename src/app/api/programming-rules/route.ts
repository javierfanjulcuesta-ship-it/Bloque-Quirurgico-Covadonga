/**
 * GET /api/programming-rules
 * Reglas de programación.
 * - Cirujano/Endoscopista: normas_texto_completo y reglas category advisory (lectura, campo `content`).
 * - Gestor/GestorAnestesista (rules:edit): todas las reglas completas para ver y editar.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, hasPermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ADMIN_NOTIFICATION_EMAIL_RULE_KEY } from "@/lib/reservations/surgicalCircuitConstants";

export interface ProgrammingRulePublic {
  key: string;
  name: string;
  content: string;
}

export interface ProgrammingRuleFull {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  valueJson: string | null;
  isActive: boolean;
  updatedAt: string;
}

/** Texto legible para cirujano / endoscopista a partir de valueJson. */
function programmingRuleToPublicContent(row: { key: string; valueJson: string | null }): string {
  const raw = row.valueJson;
  if (raw == null || raw.trim() === "") return "";
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "text" in parsed) {
      const t = (parsed as { text: unknown }).text;
      if (typeof t === "string") return t;
    }
    if (typeof parsed === "string") return parsed;
  } catch {
    return raw;
  }
  return raw;
}

export async function GET() {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const canView = hasPermission(session!.role, "booking:view:own") || hasPermission(session!.role, "booking:view:all");
    if (!canView) {
      return NextResponse.json({ error: "Sin acceso a esta información" }, { status: 403 });
    }

    const rows = await prisma.programmingRule.findMany({
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });

    const rulesFull: ProgrammingRuleFull[] = rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      category: r.category,
      valueJson: r.valueJson,
      isActive: r.isActive,
      updatedAt: r.updatedAt.toISOString(),
    }));

    const canEditRules = hasPermission(session!.role, "rules:edit");
    if (canEditRules) {
      return NextResponse.json({ rules: rulesFull });
    }

    const publicRows = rows.filter(
      (r) =>
        r.isActive &&
        r.key !== ADMIN_NOTIFICATION_EMAIL_RULE_KEY &&
        (r.key === "normas_texto_completo" || r.category === "advisory"),
    );

    const publicRules: ProgrammingRulePublic[] = publicRows
      .map((r) => ({
        key: r.key,
        name: r.name,
        content: programmingRuleToPublicContent(r),
      }))
      .filter((r) => r.content.trim() !== "");

    return NextResponse.json({ rules: publicRules });
  } catch (err) {
    console.error("[programming-rules GET]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
