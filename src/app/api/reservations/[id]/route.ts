/**
 * GET /api/reservations/[id] - Detalle de una reserva.
 * PATCH /api/reservations/[id] - Añadir pacientes a reserva existente (hueco reservado).
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission, canAccessBooking } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { updateReservationSchema } from "@/lib/validations/reservation";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";
import { fetchReservationForAccess, toApiReservation, toBookingLike } from "@/lib/reservations/reservationApiHelpers";


export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "ID de reserva requerido" }, { status: 400 });
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id },
      select: {
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
      },
    });

    if (!reservation) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    const bookingLike = {
      id: reservation.id,
      surgeonId: reservation.surgeonId,
      createdByUserId: reservation.createdByUserId,
    };

    if (!canAccessBooking(session!, bookingLike, "booking:view:own")) {
      return NextResponse.json({ error: "No tiene permisos para ver esta reserva" }, { status: 403 });
    }

    return NextResponse.json({
      reservation: toApiReservation(reservation),
    });
  } catch (err) {
    console.error("[reservations GET id]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "booking:update");
    if (denyPerm) return denyPerm;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "ID de reserva requerido" }, { status: 400 });
    }

    const reservation = await fetchReservationForAccess(id);
    if (!reservation) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    if (reservation.status === "CANCELLED") {
      return NextResponse.json({ error: "No se puede modificar una reserva cancelada" }, { status: 400 });
    }
    if (reservation.status === "RELEASED") {
      return NextResponse.json({ error: "No se puede modificar una reserva ya liberada a la bolsa común" }, { status: 400 });
    }

    const booking = toBookingLike(reservation);
    if (!canAccessBooking(session!, booking, "booking:update")) {
      return NextResponse.json({ error: "No tiene permisos para actualizar esta reserva" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateReservationSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      return NextResponse.json({ error: first?.message ?? "Datos inválidos" }, { status: 400 });
    }

    const { patients } = parsed.data;
    if (!patients || patients.length === 0) {
      return NextResponse.json({ error: "Proporcione al menos un paciente para añadir" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const maxOrder = await tx.patientInBlock.aggregate({
        where: { reservationId: id },
        _max: { orderIndex: true },
      });
      const startOrder = (maxOrder._max.orderIndex ?? -1) + 1;

      for (let i = 0; i < patients.length; i++) {
        const p = patients[i]!;
        await tx.patientInBlock.create({
          data: {
            reservationId: id,
            historyNumber: p.historyNumber,
            fullName: p.fullName ?? null,
            procedure: p.procedure,
            estimatedDurationMinutes: p.estimatedDurationMinutes,
            anesthesiaType: p.anesthesiaType,
            insuranceType: p.insuranceType,
            admissionType: p.admissionType ?? null,
            orderIndex: startOrder + i,
            notes: p.notes ?? null,
            solicitudRecursos: p.solicitudRecursos ?? null,
          },
        });
      }

      await tx.reservation.update({
        where: { id },
        data: {
          status: "CONFIRMED",
          updatedByUserId: session!.userId,
        },
      });
    });

    await logReservationEvent({
      eventType: "RESERVATION_UPDATED",
      reservationId: id,
      actorUserId: session!.userId,
      origin: "app",
      detailsJson: { patientsAdded: patients.length },
    });

    const updated = await fetchReservationForAccess(id);
    return NextResponse.json({
      reservation: toApiReservation(updated!),
    });
  } catch (err) {
    console.error("[reservations PATCH id]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
