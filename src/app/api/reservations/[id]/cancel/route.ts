/**
 * PATCH /api/reservations/[id]/cancel
 * Cancelar reserva completa. status → CANCELLED.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requireAnyPermission, canAccessBooking } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { cancelReservationSchema } from "@/lib/validations/reservation";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";
import { fetchReservationForAccess, toApiReservation, toBookingLike } from "@/lib/reservations/reservationApiHelpers";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["booking:cancel"]);
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
      return NextResponse.json({ error: "La reserva ya está cancelada" }, { status: 400 });
    }
    if (reservation.status === "RELEASED") {
      return NextResponse.json({ error: "No se puede cancelar una reserva ya liberada a la bolsa común" }, { status: 400 });
    }

    const booking = toBookingLike(reservation);
    if (!canAccessBooking(session!, booking, "booking:cancel")) {
      return NextResponse.json({ error: "No tiene permisos para cancelar esta reserva" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = cancelReservationSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      return NextResponse.json({ error: first?.message ?? "Datos inválidos" }, { status: 400 });
    }

    const [, updated] = await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancellationReason: parsed.data.reason ?? null,
          updatedByUserId: session!.userId,
        },
      }),
      prisma.reservation.findUnique({
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
      }),
    ]);

    await logReservationEvent({
      eventType: "RESERVATION_CANCELLED",
      reservationId: id,
      actorUserId: session!.userId,
      origin: "app",
      detailsJson: { reason: parsed.data.reason },
    });

    return NextResponse.json({
      reservation: toApiReservation(updated!),
    });
  } catch (err) {
    console.error("[reservations cancel]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
