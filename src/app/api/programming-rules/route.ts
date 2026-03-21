/**
 * GET /api/programming-rules
 * Reglas de programación.
 * - Cirujano/Endoscopista: solo advisory (normas texto) para lectura.
 * - Gestor/GestorAnestesista: todas las reglas para ver y editar.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, hasPermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NORMAS_PROGRAMACION_BLOQUE } from "@/lib/email/emailConstants";

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

function ruleToContent(valueJson: string | null): string {
  if (!valueJson) return "";
  try {
    const parsed = JSON.parse(valueJson);
    if (typeof parsed === "object" && parsed !== null && "text" in parsed) return String(parsed.text ?? "");
    if (typeof parsed === "number" || typeof parsed === "string") return String(parsed);
    return valueJson;
  } catch {
    return valueJson;
  }
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

    const isGestor = hasPermission(session!.role, "rules:edit");

    try {
      const rules = await prisma.programmingRule.findMany({
        where: { isActive: true },
        orderBy: { key: "asc" },
      });

      if (isGestor) {
        return NextResponse.json({
          rules: rules.map((r) => ({
            id: r.id,
            key: r.key,
            name: r.name,
            description: r.description,
            category: r.category,
            valueJson: r.valueJson,
            isActive: r.isActive,
            updatedAt: r.updatedAt.toISOString(),
          })),
          canEdit: true,
        });
      }

      // Cirujano/Endoscopista: solo advisory para mostrar en Normas
      const advisory = rules.filter((r) => r.category === "informational");
      return NextResponse.json({
        rules: advisory.map((r) => ({
          key: r.key,
          name: r.name,
          content: ruleToContent(r.valueJson),
        })),
        canEdit: false,
      });
    } catch (dbErr) {
      // Tabla puede no existir aún (migración pendiente)
      console.warn("[programming-rules GET] DB error, fallback a constantes:", dbErr);
      const rules: ProgrammingRulePublic[] = [
        {
          key: "normas_texto_completo",
          name: "Normas de programación del bloque quirúrgico",
          content: NORMAS_PROGRAMACION_BLOQUE,
        },
      ];
      return NextResponse.json(
        isGestor
          ? {
              rules: rules.map((r) => ({
                id: "fallback",
                key: r.key,
                name: r.name,
                description: null,
                category: "informational",
                valueJson: JSON.stringify({ text: r.content }),
                isActive: true,
                updatedAt: new Date().toISOString(),
              })),
              canEdit: false,
            }
          : { rules, canEdit: false }
      );
    }
  } catch (err) {
    console.error("[programming-rules GET]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
