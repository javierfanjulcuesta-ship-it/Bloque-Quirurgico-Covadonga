/**
 * GET /api/anesthetist-assignments - Listar asignaciones (filtros: anesthetistId, dateFrom, dateTo)
 * PUT /api/anesthetist-assignments - Guardar asignaciones en bulk (solo gestor)
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { hasGestorAccess } from "@/lib/types";

const VALID_RESOURCES = new Set([
  "Q1",
  "Q2",
  "Q3",
  "procedimientos-menores",
  "tecnicas-dolor",
]);
const PREANESTHESIA = "__preanestesia__";
const FULL_SHIFT = "__full_shift__";

/** Convierte slotType legacy a assignmentType + resourceId */
function parseAssignment(
  a: { date?: string; shift?: string; slotType?: string; assignmentType?: string; resourceId?: string; anesthetistId?: string }
): { date: string; shift: "MORNING" | "AFTERNOON"; assignmentType: "OR" | "PREANESTHESIA"; resourceId: string; anesthetistId: string } | null {
  const date = typeof a.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : null;
  const shift = a.shift === "morning" ? "MORNING" : a.shift === "afternoon" ? "AFTERNOON" : null;
  const anesthetistId = typeof a.anesthetistId === "string" && a.anesthetistId ? a.anesthetistId : null;
  if (!date || !shift || !anesthetistId) return null;

  if (a.assignmentType && a.resourceId) {
    const type = a.assignmentType === "PREANESTHESIA" ? "PREANESTHESIA" : "OR";
    const rid = String(a.resourceId);
    if (type === "PREANESTHESIA" && (rid === PREANESTHESIA || rid === "")) return { date, shift, assignmentType: "PREANESTHESIA", resourceId: PREANESTHESIA, anesthetistId };
    if (type === "OR" && (VALID_RESOURCES.has(rid) || rid === FULL_SHIFT)) return { date, shift, assignmentType: "OR", resourceId: rid, anesthetistId };
  }

  if (a.slotType) {
    if (a.slotType === "consulta-preanestesia") return { date, shift, assignmentType: "PREANESTHESIA", resourceId: PREANESTHESIA, anesthetistId };
    if (VALID_RESOURCES.has(a.slotType)) return { date, shift, assignmentType: "OR", resourceId: a.slotType, anesthetistId };
  }
  return null;
}

function toFrontend(a: { id: string; date: string; shift: string; assignmentType: string; resourceId: string; anesthetistId: string }) {
  const shift = a.shift === "MORNING" ? "morning" : "afternoon";
  const slotType = a.assignmentType === "PREANESTHESIA" ? "consulta-preanestesia" : a.resourceId;
  return {
    id: a.id,
    date: a.date,
    shift,
    assignmentType: a.assignmentType as "OR" | "PREANESTHESIA",
    resourceId: a.resourceId,
    anesthetistId: a.anesthetistId,
    slotType,
  };
}

export async function GET(request: Request) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const anesthetistId = searchParams.get("anesthetistId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const isGestor = hasGestorAccess(session.role as "gestor" | "gestor-anestesista");
    if (!anesthetistId && !isGestor) {
      return NextResponse.json({ error: "anesthetistId obligatorio para no gestores" }, { status: 400 });
    }

    const filterAnesthetist = anesthetistId || (!isGestor ? session.userId : undefined);

    const where: { anesthetistId?: string; date?: { gte?: string; lte?: string } } = {};
    if (filterAnesthetist) where.anesthetistId = filterAnesthetist;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = dateFrom;
      if (dateTo) where.date.lte = dateTo;
    }

    const list = await prisma.anesthetistAssignment.findMany({
      where,
      orderBy: [{ date: "asc" }, { shift: "asc" }, { assignmentType: "asc" }, { resourceId: "asc" }],
    });

    const items = list.map((a) => toFrontend(a));

    return NextResponse.json({ assignments: items });
  } catch (err) {
    console.error("[anesthetist-assignments GET]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!hasGestorAccess(session.role as "gestor" | "gestor-anestesista")) {
      return NextResponse.json({ error: "Solo gestores pueden guardar asignaciones" }, { status: 403 });
    }

    const body = await request.json();
    const assignments = Array.isArray(body.assignments) ? body.assignments : [];

    const toUpsert: Array<{ date: string; shift: "MORNING" | "AFTERNOON"; assignmentType: "OR" | "PREANESTHESIA"; resourceId: string; anesthetistId: string }> = [];

    for (const a of assignments) {
      const parsed = parseAssignment(a);
      if (!parsed) continue;
      toUpsert.push(parsed);
    }

    await prisma.$transaction(async (tx) => {
      await tx.anesthetistAssignment.deleteMany({});
      for (const a of toUpsert) {
        await tx.anesthetistAssignment.create({
          data: { date: a.date, shift: a.shift, assignmentType: a.assignmentType, resourceId: a.resourceId, anesthetistId: a.anesthetistId },
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[anesthetist-assignments PUT]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
