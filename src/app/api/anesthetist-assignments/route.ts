/**
 * GET - Listar asignaciones (schedule:view:own | anesthetist:assign). Sin assign → solo propias.
 * PUT - Reemplazar el snapshot completo con control de revisión optimista (solo gestores).
 */

import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/auth/session";
import {
  toAuthSession,
  requireAuth,
  requirePermission,
  requireAnyPermission,
  hasPermission,
} from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import { isRealDateOnly } from "@/lib/reservations/bookingPolicy";
import {
  assignmentSnapshotRevision,
  replaceAssignmentSnapshot,
  type AssignmentSnapshotRow,
} from "@/lib/reservations/anesthetistAssignmentSnapshot";

const VALID_RESOURCES = new Set([
  "Q1",
  "Q2",
  "Q3",
  "procedimientos-menores",
  "tecnicas-dolor",
]);
const PREANESTHESIA = "__preanestesia__";
const FULL_SHIFT = "__full_shift__";
// The manager PUT is a complete snapshot and can legitimately be much larger than
// ordinary API payloads. Keep a generous finite ceiling so malformed/hostile bodies
// cannot consume unbounded server memory while normal multi-month snapshots remain valid.
const MAX_ASSIGNMENT_BODY_BYTES = 4 * 1024 * 1024;

/** Convierte slotType legacy a assignmentType + resourceId. Nunca corrige silenciosamente un valor inválido. */
function parseAssignment(
  a: { date?: unknown; shift?: unknown; slotType?: unknown; assignmentType?: unknown; resourceId?: unknown; anesthetistId?: unknown },
): AssignmentSnapshotRow | null {
  const date = typeof a.date === "string" && isRealDateOnly(a.date) ? a.date : null;
  const shift = a.shift === "morning" ? "MORNING" : a.shift === "afternoon" ? "AFTERNOON" : null;
  const anesthetistId = typeof a.anesthetistId === "string" && a.anesthetistId.trim() ? a.anesthetistId.trim() : null;
  if (!date || !shift || !anesthetistId) return null;

  if (typeof a.assignmentType === "string" && typeof a.resourceId === "string") {
    if (a.assignmentType === "PREANESTHESIA" && a.resourceId === PREANESTHESIA) {
      return { date, shift, assignmentType: "PREANESTHESIA", resourceId: PREANESTHESIA, anesthetistId };
    }
    if (a.assignmentType === "OR" && (VALID_RESOURCES.has(a.resourceId) || a.resourceId === FULL_SHIFT)) {
      return { date, shift, assignmentType: "OR", resourceId: a.resourceId, anesthetistId };
    }
    return null;
  }

  if (typeof a.slotType === "string") {
    if (a.slotType === "consulta-preanestesia") {
      return { date, shift, assignmentType: "PREANESTHESIA", resourceId: PREANESTHESIA, anesthetistId };
    }
    if (VALID_RESOURCES.has(a.slotType)) {
      return { date, shift, assignmentType: "OR", resourceId: a.slotType, anesthetistId };
    }
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

function snapshotRows(list: Array<{ date: string; shift: string; assignmentType: string; resourceId: string; anesthetistId: string }>): AssignmentSnapshotRow[] {
  return list.map((a) => ({
    date: a.date,
    shift: a.shift as "MORNING" | "AFTERNOON",
    assignmentType: a.assignmentType as "OR" | "PREANESTHESIA",
    resourceId: a.resourceId,
    anesthetistId: a.anesthetistId,
  }));
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

    if (dateFrom && !isRealDateOnly(dateFrom)) {
      return NextResponse.json({ error: "dateFrom inválido" }, { status: 400 });
    }
    if (dateTo && !isRealDateOnly(dateTo)) {
      return NextResponse.json({ error: "dateTo inválido" }, { status: 400 });
    }
    if (dateFrom && dateTo) {
      const diffDays = (new Date(`${dateTo}T00:00:00.000Z`).getTime() - new Date(`${dateFrom}T00:00:00.000Z`).getTime()) / 86_400_000;
      if (diffDays < 0 || diffDays > 93) {
        return NextResponse.json({ error: "Rango máximo 93 días" }, { status: 400 });
      }
    }

    const filterAnesthetist = canAssign ? anesthetistId : session!.userId;
    const where: { anesthetistId?: string; date?: { gte?: string; lte?: string } } = {};
    if (filterAnesthetist) where.anesthetistId = filterAnesthetist;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = dateFrom;
      if (dateTo) where.date.lte = dateTo;
    }

    const list = await prisma.anesthetistAssignment.findMany({
      where,
      select: { id: true, date: true, shift: true, assignmentType: true, resourceId: true, anesthetistId: true },
      orderBy: [{ date: "asc" }, { shift: "asc" }, { assignmentType: "asc" }, { resourceId: "asc" }],
    });

    // Solo una carga completa de gestor es un snapshot editable. Las vistas filtradas
    // son de lectura y no exponen una revisión que pudiera confundirse con el conjunto total.
    const isFullEditableSnapshot = canAssign && !anesthetistId && !dateFrom && !dateTo;
    const revision = isFullEditableSnapshot ? assignmentSnapshotRevision(snapshotRows(list)) : null;

    return NextResponse.json({ assignments: list.map(toFrontend), revision });
  } catch {
    console.error("[anesthetist-assignments GET] failed");
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

    const limitedBody = await readTextBodyWithLimit(request, MAX_ASSIGNMENT_BODY_BYTES);
    if (!limitedBody.ok) {
      return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(limitedBody.text);
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }

    const raw = body as { assignments?: unknown; expectedRevision?: unknown };
    if (!Array.isArray(raw.assignments)) {
      return NextResponse.json({ error: "assignments debe ser un array" }, { status: 400 });
    }
    if (typeof raw.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(raw.expectedRevision)) {
      return NextResponse.json(
        {
          error: "Falta la revisión del snapshot. Recargue las asignaciones antes de guardar.",
          code: "assignment_revision_required",
        },
        { status: 428 },
      );
    }

    const toUpsert: AssignmentSnapshotRow[] = [];
    for (let i = 0; i < raw.assignments.length; i++) {
      const item = raw.assignments[i];
      if (!item || typeof item !== "object") {
        return NextResponse.json({ error: `Asignación ${i + 1} inválida` }, { status: 400 });
      }
      const parsed = parseAssignment(item as Parameters<typeof parseAssignment>[0]);
      if (!parsed) {
        return NextResponse.json(
          { error: `Asignación ${i + 1} inválida. No se ha guardado ningún cambio.` },
          { status: 400 },
        );
      }
      toUpsert.push(parsed);
    }

    // El payload representa un snapshot completo: ningún slot lógico puede aparecer dos veces.
    const slotKeys = new Set<string>();
    for (const a of toUpsert) {
      const key = `${a.date}|${a.shift}|${a.assignmentType}|${a.resourceId}`;
      if (slotKeys.has(key)) {
        return NextResponse.json({ error: "Hay dos anestesistas asignados al mismo recurso/turno." }, { status: 400 });
      }
      slotKeys.add(key);
    }

    const distinctAnesthetistIds = [...new Set(toUpsert.map((a) => a.anesthetistId))];
    if (distinctAnesthetistIds.length > 0) {
      const anesthetists = await prisma.user.findMany({
        where: {
          id: { in: distinctAnesthetistIds },
          deletedAt: null,
          approved: true,
          role: { in: [UserRole.ANESTESISTA, UserRole.GESTOR_ANESTESISTA] },
        },
        select: { id: true },
      });
      const validIds = new Set(anesthetists.map((u) => u.id));
      if (distinctAnesthetistIds.some((id) => !validIds.has(id))) {
        return NextResponse.json(
          { error: "Solo se pueden asignar anestesistas o gestores-anestesistas activos a los turnos." },
          { status: 400 },
        );
      }
    }

    const orAssignments = toUpsert.filter((a) => a.assignmentType === "OR");
    if (orAssignments.length > 0) {
      const dates = [...new Set(orAssignments.map((a) => a.date))];
      const dateMin = dates.reduce((a, b) => (a < b ? a : b));
      const dateMax = dates.reduce((a, b) => (a > b ? a : b));
      const [reservationsWithPatients, anesthetists] = await Promise.all([
        prisma.reservation.findMany({
          where: {
            status: { in: ["PENDING", "CONFIRMED"] },
            date: {
              gte: new Date(`${dateMin}T00:00:00.000Z`),
              lte: new Date(`${dateMax}T23:59:59.999Z`),
            },
          },
          include: { patients: true },
        }),
        prisma.user.findMany({
          where: { id: { in: [...new Set(orAssignments.map((a) => a.anesthetistId))] } },
          select: { id: true, canSespa: true },
        }),
      ]);

      const canSespaByAnesthetist = new Map(anesthetists.map((u) => [u.id, !!u.canSespa]));
      const isSespaInsurance = (s: string | null | undefined) => !!(s && /^sespa$/i.test(s.trim()));
      const slotHasSespa = (dateStr: string, shift: "MORNING" | "AFTERNOON", resourceId: string): boolean => {
        const resourceIds = resourceId === FULL_SHIFT ? Array.from(VALID_RESOURCES) : [resourceId];
        return reservationsWithPatients.some((r) =>
          r.date.toISOString().slice(0, 10) === dateStr &&
          r.shift === shift &&
          resourceIds.includes(r.resourceId) &&
          r.patients.some((p) => isSespaInsurance(p.insuranceType)),
        );
      };

      for (const a of orAssignments) {
        if (slotHasSespa(a.date, a.shift, a.resourceId) && !canSespaByAnesthetist.get(a.anesthetistId)) {
          return NextResponse.json(
            {
              error: "Este bloque contiene pacientes SESPA; solo pueden asignarse anestesistas habilitados para SESPA.",
              code: "SESPA_ANESTHETIST_REQUIRED",
            },
            { status: 400 },
          );
        }
      }
    }

    const saved = await replaceAssignmentSnapshot(prisma, raw.expectedRevision, toUpsert);
    if (!saved.ok) {
      return NextResponse.json(
        {
          error: "Las asignaciones cambiaron desde que abrió la pantalla. Recargue antes de guardar para no sobrescribir el trabajo de otro gestor.",
          code: "assignment_snapshot_stale",
          currentRevision: saved.currentRevision,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, revision: saved.revision });
  } catch {
    console.error("[anesthetist-assignments PUT] failed");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
