/**
 * API de reservas.
 * POST /api/reservations - Crear reserva (solo cirujano/endoscopista, surgeonId = usuario autenticado)
 * GET /api/reservations - Listar reservas con filtros
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createReservationSchema, getReservationsQuerySchema } from "@/lib/validations/reservation";
import { hasGestorAccess, hasProgrammingAccess } from "@/lib/types";
import type { UserRole } from "@/lib/types";
import { createReservationInDb } from "@/lib/reservations/createReservationInDb";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";

function toApiReservation(r: {
  id: string;
  date: Date;
  resourceId: string;
  shift: string;
  slotIndex: number;
  surgeonId: string;
  status: string;
  anesthetistId: string | null;
  createdAt: Date;
  patients: Array<{
    id: string;
    historyNumber: string;
    fullName: string | null;
    procedure: string;
    estimatedDurationMinutes: number;
    anesthesiaType: string;
    insuranceType: string;
    admissionType: string | null;
    orderIndex: number;
    notes: string | null;
    solicitudRecursos: string | null;
  }>;
}) {
  const dateStr = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
  return {
    id: r.id,
    date: dateStr,
    resourceId: r.resourceId,
    shift: r.shift === "MORNING" ? "morning" : "afternoon",
    slotIndex: r.slotIndex,
    surgeonId: r.surgeonId,
    status: r.status.toLowerCase(),
    anesthetistId: r.anesthetistId ?? undefined,
    createdAt: r.createdAt.toISOString(),
    patients: r.patients.map((p) => ({
      id: p.id,
      historyNumber: p.historyNumber,
      fullName: p.fullName ?? undefined,
      procedure: p.procedure,
      estimatedDurationMinutes: p.estimatedDurationMinutes,
      anesthesiaType: p.anesthesiaType,
      insuranceType: p.insuranceType,
      admissionType: p.admissionType ?? undefined,
      orderIndex: p.orderIndex,
      notes: p.notes ?? undefined,
      solicitudRecursos: p.solicitudRecursos ?? undefined,
    })),
  };
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createReservationSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      return NextResponse.json(
        { error: first?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }
    const data = parsed.data;

    // Solo cirujano o endoscopista pueden crear reservas (surgeonId = usuario autenticado)
    const role = session.role as string;
    if (role !== "cirujano" && role !== "endoscopista") {
      return NextResponse.json(
        { error: "Solo cirujanos y endoscopistas pueden crear reservas" },
        { status: 403 }
      );
    }

    const surgeonId = session.userId;

    const result = await createReservationInDb(data, surgeonId, {
      origin: "APP",
      actorUserId: surgeonId,
    });

    if (!result.ok) {
      if (result.error === "slot_occupied") {
        await logReservationEvent({
          eventType: "RESERVATION_REJECTED_CONFLICT",
          actorUserId: surgeonId,
          origin: "app",
          detailsJson: {
            date: data.date,
            resourceId: data.resourceId,
            shift: data.shift,
            slotIndex: data.slotIndex,
          },
        });
        return NextResponse.json(
          { error: "El hueco ya está ocupado" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: result.reservationId },
      include: { patients: true },
    });
    if (!reservation) {
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    return NextResponse.json({
      reservation: toApiReservation(reservation),
    });
  } catch (err) {
    console.error("[reservations POST]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = {
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      resourceId: searchParams.get("resourceId") ?? undefined,
      surgeonId: searchParams.get("surgeonId") ?? undefined,
    };

    const parsed = getReservationsQuerySchema.safeParse(query);
    if (!parsed.success) {
      return NextResponse.json({ error: "Parámetros de filtro inválidos" }, { status: 400 });
    }
    const { dateFrom, dateTo, resourceId, surgeonId } = parsed.data;

    // Si es cirujano/endoscopista, solo ve sus reservas (a menos que sea gestor)
    const surgeonFilter = !hasGestorAccess(session.role as UserRole) && hasProgrammingAccess(session.role as UserRole)
      ? session.userId
      : surgeonId;

    const dateFromObj = dateFrom ? new Date(dateFrom + "T00:00:00.000Z") : undefined;
    const dateToObj = dateTo ? new Date(dateTo + "T23:59:59.999Z") : undefined;

    const reservations = await prisma.reservation.findMany({
      where: {
        status: { not: "CANCELLED" },
        ...(resourceId && { resourceId }),
        ...(surgeonFilter && { surgeonId: surgeonFilter }),
        ...(dateFromObj && dateToObj && { date: { gte: dateFromObj, lte: dateToObj } }),
        ...(dateFromObj && !dateToObj && { date: { gte: dateFromObj } }),
        ...(dateToObj && !dateFromObj && { date: { lte: dateToObj } }),
      },
      include: { patients: true },
      orderBy: [{ date: "asc" }, { shift: "asc" }, { slotIndex: "asc" }],
    });

    return NextResponse.json({
      reservations: reservations.map(toApiReservation),
    });
  } catch (err) {
    console.error("[reservations GET]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
