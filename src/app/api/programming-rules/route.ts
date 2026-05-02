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

    const rules: ProgrammingRuleFull[] = rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      category: r.category,
      valueJson: r.valueJson,
      isActive: r.isActive,
      updatedAt: r.updatedAt.toISOString(),
    }));

    return NextResponse.json({ rules });
  } catch (err) {
    console.error("[programming-rules GET]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
