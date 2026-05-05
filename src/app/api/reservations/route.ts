/**
 * API de reservas.
 * GET: listar reservas con filtros. Sanitiza por rol (cirujano/endoscopista no ven pacientes ajenos).
 * POST: crear reserva (reservar hueco).
 */

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission, requireAnyPermission, hasPermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { createReservationInDb } from "@/lib/reservations/createReservationInDb";
import { fetchReservationForAccess } from "@/lib/reservations/reservationApiHelpers";
import { toApiReservation } from "@/lib/reservations/reservationApiHelpers";
import { createReservationSchema, getReservationsQuerySchema } from "@/lib/validations/reservation";

export const dynamic = "force-dynamic";

const RESERVATION_SELECT = {
  id: true,
  date: true,
  resourceId: true,
  shift: true,
  slotIndex: true,
  surgeonId: true,
  status: true,
  anesthetistId: true,
  createdByUserId: true,
  createdAt: true,
  patients: {
    select: {
      id: true,
      historyNumber: true,
      fullName: true,
      procedure: true,
      estimatedDurationMinutes: true,
      anesthesiaType: true,
      insuranceType: true,
      admissionType: true,
      orderIndex: true,
      notes: true,
      solicitudRecursos: true,
      patientEmail: true,
      patientPhone: true,
      workflowStatus: true,
      preanesthesiaStatus: true,
      financingStatus: true,
      preanesthesiaAppointmentAt: true,
      isDeferredUrgency: true,
      specialCircuitReason: true,
    },
  },
} as const;

/** Vista completa solo para gestión/métricas; resto de perfiles reciben agenda propia. */
function hasFullReservationView(role: string): boolean {
  const r = role?.trim().toLowerCase().replace(/_/g, "-") ?? "";
  if (r === "gestor" || r === "gestor-anestesista") return true;
  // Endurecimiento backend: full dataset solo para roles/permisos de gestión/métricas.
  return hasPermission(role, "metrics:view") || hasPermission(role, "booking:view:all");
}

export async function GET(request: Request) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;

  const denyPerm = requireAnyPermission(session!, ["booking:view:all", "booking:view:own", "schedule:view:all", "schedule:view:own"]);
  if (denyPerm) return denyPerm;

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;
  const resourceId = searchParams.get("resourceId") ?? undefined;

  const parsed = getReservationsQuerySchema.safeParse({ dateFrom, dateTo, resourceId });
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg =
      parsed.error.errors[0]?.message ??
      (Object.keys(first).length ? JSON.stringify(first) : "Parámetros de consulta inválidos");
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const filters = parsed.data;
  if (!filters.dateFrom || !filters.dateTo) {
    return NextResponse.json(
      {
        error:
          "Indique dateFrom y dateTo (YYYY-MM-DD) para acotar la consulta. Ejemplo: ?dateFrom=2026-01-05&dateTo=2026-02-01",
      },
      { status: 400 }
    );
  }

  const where: Prisma.ReservationWhereInput = {};
  const dateFilter: Prisma.DateTimeFilter = {};
  if (filters.dateFrom) {
    dateFilter.gte = new Date(filters.dateFrom + "T00:00:00.000Z");
  }
  if (filters.dateTo) {
    dateFilter.lte = new Date(filters.dateTo + "T23:59:59.999Z");
  }
  if (dateFilter.gte || dateFilter.lte) {
    where.date = dateFilter;
  }
  if (filters.resourceId) {
    where.resourceId = filters.resourceId;
  }

  const fullView = hasFullReservationView(session!.role);
  const myId = session!.userId;
  if (!fullView) {
    // No gestión: solo datos estrictamente necesarios para agenda propia.
    where.OR = [{ surgeonId: myId }, { createdByUserId: myId }, { anesthetistId: myId }];
  }

  const list = await prisma.reservation.findMany({
    where,
    select: RESERVATION_SELECT,
    orderBy: [{ date: "asc" }, { shift: "asc" }, { slotIndex: "asc" }],
  });

  const reservations = list.map((r) => {
    const api = toApiReservation(r as Parameters<typeof toApiReservation>[0]);
    if (fullView) return api;
    const isMine = r.surgeonId === myId || r.createdByUserId === myId;
    if (isMine) return api;
    return {
      ...api,
      surgeonId: "[otro]",
      patients: [],
    };
  });

  return NextResponse.json({ reservations });
}

export async function POST(request: Request) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;

  const denyPerm = requirePermission(session!, "booking:create");
  if (denyPerm) return denyPerm;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const { surgeonId: rawSurgeonId, ...reservationFields } = raw;
  const parsed = createReservationSchema.safeParse(reservationFields);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "Datos inválidos";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const responsibleSurgeonFromBody =
    typeof rawSurgeonId === "string" && rawSurgeonId.trim().length > 0 ? rawSurgeonId.trim() : undefined;
  const reservationPayload = parsed.data;
  const roleNorm = session!.role?.trim().toLowerCase().replace(/_/g, "-") ?? "";
  const isCoordinator = roleNorm === "gestor" || roleNorm === "gestor-anestesista";

  let effectiveSurgeonId = session!.userId;
  if (isCoordinator) {
    if (!responsibleSurgeonFromBody) {
      return NextResponse.json(
        { error: "Debe indicar el cirujano o endoscopista responsable (campo surgeonId)." },
        { status: 400 }
      );
    }
    const surgeonUser = await prisma.user.findFirst({
      where: {
        id: responsibleSurgeonFromBody,
        approved: true,
        deletedAt: null,
        role: { in: [UserRole.CIRUJANO, UserRole.ENDOSCOPISTA] },
      },
      select: { id: true },
    });
    if (!surgeonUser) {
      return NextResponse.json(
        { error: "El cirujano responsable no es válido, no está aprobado o no tiene perfil cirujano/endoscopista." },
        { status: 400 }
      );
    }
    effectiveSurgeonId = surgeonUser.id;
  }

  const result = await createReservationInDb(reservationPayload, effectiveSurgeonId, {
    origin: isCoordinator ? "GESTOR" : "APP",
    actorUserId: session!.userId,
  });

  if (!result.ok) {
    if (result.error === "slot_occupied" || result.code === "slot_occupied") {
      return NextResponse.json({ code: "slot_occupied", message: "Hueco ocupado" }, { status: 409 });
    }
    if (result.error === "overflow_conflict") {
      return NextResponse.json(
        { error: result.message ?? "Conflicto por desbordamiento de otra reserva", code: "overflow_conflict" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: result.message ?? "Datos inválidos" }, { status: 400 });
  }

  const reservation = await fetchReservationForAccess(result.reservationId);
  if (!reservation) {
    return NextResponse.json({ error: "Reserva creada pero no encontrada" }, { status: 500 });
  }

  const apiReservation = toApiReservation(reservation as Parameters<typeof toApiReservation>[0]);
  return NextResponse.json({ reservation: apiReservation });
}
