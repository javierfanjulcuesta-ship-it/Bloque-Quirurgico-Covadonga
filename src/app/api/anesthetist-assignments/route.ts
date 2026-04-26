/**
 * GET - Listar asignaciones (schedule:view:own | anesthetist:assign). Sin assign → solo propias.
 * PUT - Guardar asignaciones (anesthetist:assign, solo gestores)
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import {
  toAuthSession,
  requireAuth,
  requirePermission,
  requireAnyPermission,
  hasPermission,
} from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

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
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["schedule:view:own", "anesthetist:assign"]);
    if (denyPerm) return denyPerm;

    const { searchParams } = new URL(request.url);
    const anesthetistId = searchParams.get("anesthetistId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const canAssign = hasPermission(session!.role, "anesthetist:assign");
    if (!anesthetistId && !canAssign) {
      return NextResponse.json({ error: "anesthetistId obligatorio para no gestores" }, { status: 400 });
    }

    // Anestesistas solo pueden ver sus propias asignaciones
    const filterAnesthetist = canAssign ? anesthetistId : session!.userId;

    const where: { anesthetistId?: string; date?: { gte?: string; lte?: string } } = {};
    if (filterAnesthetist) where.anesthetistId = filterAnesthetist;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = dateFrom;
      if (dateTo) where.date.lte = dateTo;
      // Límite: max 93 días
      if (dateFrom && dateTo) {
        const from = new Date(dateFrom);
        const to = new Date(dateTo);
        const diffDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
        if (diffDays < 0 || diffDays > 93) {
          return NextResponse.json({ error: "Rango máximo 93 días" }, { status: 400 });
        }
      }
    }

    const list = await prisma.anesthetistAssignment.findMany({
      where,
      select: { id: true, date: true, shift: true, assignmentType: true, resourceId: true, anesthetistId: true },
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
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "anesthetist:assign");
    if (denyPerm) return denyPerm;

    const body = await request.json();
    const assignments = Array.isArray(body.assignments) ? body.assignments : [];

    const toUpsert: Array<{ date: string; shift: "MORNING" | "AFTERNOON"; assignmentType: "OR" | "PREANESTHESIA"; resourceId: string; anesthetistId: string }> = [];

    for (const a of assignments) {
      const parsed = parseAssignment(a);
      if (!parsed) continue;
      toUpsert.push(parsed);
    }

    // Validar que los anesthetistId sean usuarios ANESTESISTA/GESTOR_ANESTESISTA (User no tiene isActive en schema)
    const distinctAnesthetistIds = [...new Set(toUpsert.map((a) => a.anesthetistId))];
    const anesthetists = await prisma.user.findMany({
      where: {
        id: { in: distinctAnesthetistIds },
        deletedAt: null,
        approved: true,
      },
      select: { id: true, role: true },
    });
    const validRoles = new Set(["ANESTESISTA", "GESTOR_ANESTESISTA"]);
    for (const aid of distinctAnesthetistIds) {
      const u = anesthetists.find((a) => a.id === aid);
      if (!u || !validRoles.has(u.role)) {
        return NextResponse.json(
          { error: "Solo se pueden asignar anestesistas o gestores-anestesistas activos a los turnos." },
          { status: 400 }
        );
      }
    }

    const orAssignments = toUpsert.filter((a) => a.assignmentType === "OR");
    if (orAssignments.length > 0) {
      const dates = [...new Set(orAssignments.map((a) => a.date))];
      const dateMin = dates.reduce((a, b) => (a < b ? a : b));
      const dateMax = dates.reduce((a, b) => (a > b ? a : b));
      const dateFromObj = new Date(dateMin + "T00:00:00.000Z");
      const dateToObj = new Date(dateMax + "T23:59:59.999Z");

      const [reservationsWithPatients, anesthetists] = await Promise.all([
        prisma.reservation.findMany({
          where: {
            status: { not: "CANCELLED" },
            date: { gte: dateFromObj, lte: dateToObj },
          },
          include: { patients: true },
        }),
        prisma.user.findMany({
          where: { id: { in: [...new Set(orAssignments.map((a) => a.anesthetistId))] } },
          select: { id: true, canSespa: true },
        }),
      ]);

      const canSespaByAnesthetist = new Map(anesthetists.map((u) => [u.id, !!u.canSespa]));

      function isSespaInsurance(s: string | null | undefined): boolean {
        return !!(s && typeof s === "string" && /^sespa$/i.test(s.trim()));
      }

      function slotHasSespa(dateStr: string, shift: "MORNING" | "AFTERNOON", resourceId: string): boolean {
        const resourceIds = resourceId === FULL_SHIFT ? Array.from(VALID_RESOURCES) : [resourceId];
        const shiftStr = shift === "MORNING" ? "morning" : "afternoon";
        for (const r of reservationsWithPatients) {
          const rDate = r.date.toISOString().slice(0, 10);
          const rShift = r.shift === "MORNING" ? "morning" : "afternoon";
          if (rDate !== dateStr || rShift !== shiftStr || !resourceIds.includes(r.resourceId)) continue;
          const hasSespa = r.patients?.some((p) => isSespaInsurance(p.insuranceType));
          if (hasSespa) return true;
        }
        return false;
      }

      for (const a of orAssignments) {
        if (!slotHasSespa(a.date, a.shift, a.resourceId)) continue;
        const canSespa = canSespaByAnesthetist.get(a.anesthetistId);
        if (!canSespa) {
          return NextResponse.json(
            {
              error: "Este bloque contiene pacientes SESPA; solo pueden asignarse anestesistas habilitados para SESPA.",
              code: "SESPA_ANESTHETIST_REQUIRED",
            },
            { status: 400 }
          );
        }
      }
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
