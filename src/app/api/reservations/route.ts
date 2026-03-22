/**
 * API de reservas.
 * GET: listar reservas con filtros. Sanitiza por rol (cirujano/endoscopista no ven pacientes ajenos).
 * POST: crear reserva (reservar hueco).
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission, requireAnyPermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { createReservationInDb } from "@/lib/reservations/createReservationInDb";
import { fetchReservationForAccess } from "@/lib/reservations/reservationApiHelpers";
import { toApiReservation } from "@/lib/reservations/reservationApiHelpers";
import { getReservationsQuerySchema } from "@/lib/validations/reservation";

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
    },
  },
} as const;

/** Gestor, gestor-anestesista y anestesista ven todo con detalle. Cirujano/endoscopista solo propios con detalle. */
function hasFullReservationView(role: string): boolean {
  const r = role?.trim().toLowerCase().replace(/_/g, "-") ?? "";
  return r === "gestor" || r === "gestor-anestesista" || r === "anestesista";
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
  const filters = parsed.success ? parsed.data : {};

  const where: { date?: { gte?: Date; lte?: Date }; resourceId?: string } = {};
  if (filters.dateFrom) {
    where.date = { ...where.date, gte: new Date(filters.dateFrom + "T00:00:00.000Z") };
  }
  if (filters.dateTo) {
    where.date = { ...where.date, lte: new Date(filters.dateTo + "T23:59:59.999Z") };
  }
  if (filters.resourceId) {
    where.resourceId = filters.resourceId;
  }

  const list = await prisma.reservation.findMany({
    where: Object.keys(where).length ? where : {},
    select: RESERVATION_SELECT,
    orderBy: [{ date: "asc" }, { shift: "asc" }, { slotIndex: "asc" }],
  });

  const fullView = hasFullReservationView(session!.role);
  const myId = session!.userId;

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

  const surgeonId = session!.userId;
  const result = await createReservationInDb(body as Parameters<typeof createReservationInDb>[0], surgeonId, { origin: "APP" });

  if (!result.ok) {
    if (result.error === "slot_occupied") {
      return NextResponse.json({ error: result.message ?? "El hueco ya está ocupado" }, { status: 409 });
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
