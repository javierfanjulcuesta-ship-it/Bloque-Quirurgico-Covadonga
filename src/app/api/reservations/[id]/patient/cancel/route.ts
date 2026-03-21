/**
 * PATCH /api/reservations/[id]/patient/cancel
 * Cancelar un paciente de la reserva. Borra el paciente.
 * Si quedan 0 pacientes:
 *   - Antes del cierre (jueves 00:00 semana objetivo): status PENDING (mantiene retención).
 *   - Pasado el cierre: status RELEASED (libera a bolsa común).
 * Permisos: CIRUJANO, GESTOR, GESTOR_ANESTESISTA. ANESTESISTA no tiene patient:cancel.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission, canModifyPatientInBooking } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { cancelPatientSchema } from "@/lib/validations/reservation";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";
import { fetchReservationForAccess, toApiReservation, toBookingLike } from "@/lib/reservations/reservationApiHelpers";
import { isReservationRetentionStillAllowed } from "@/lib/utils";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "patient:cancel");
    if (denyPerm) return denyPerm;

    const { id: reservationId } = await context.params;
    if (!reservationId) {
      return NextResponse.json({ error: "ID de reserva requerido" }, { status: 400 });
    }

    const reservation = await fetchReservationForAccess(reservationId);
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
    if (!canModifyPatientInBooking(session!, booking, "patient:cancel")) {
      return NextResponse.json({ error: "No tiene permisos para cancelar pacientes en esta reserva" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = cancelPatientSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      return NextResponse.json({ error: first?.message ?? "Datos inválidos" }, { status: 400 });
    }

    const { patientId, reason } = parsed.data;

    const patient = await prisma.patientInBlock.findFirst({
      where: { id: patientId, reservationId },
    });
    if (!patient) {
      return NextResponse.json({ error: "Paciente no encontrado en esta reserva" }, { status: 404 });
    }

    await prisma.patientInBlock.delete({
      where: { id: patientId },
    });

    const remainingCount = await prisma.patientInBlock.count({
      where: { reservationId },
    });

    const dateStr = reservation.date instanceof Date ? reservation.date.toISOString().slice(0, 10) : String(reservation.date).slice(0, 10);
    const retentionAllowed = remainingCount === 0 ? isReservationRetentionStillAllowed(dateStr) : false;

    if (remainingCount === 0) {
      if (retentionAllowed) {
        await prisma.reservation.update({
          where: { id: reservationId },
          data: {
            status: "PENDING",
            updatedByUserId: session!.userId,
          },
        });
      } else {
        await prisma.reservation.update({
          where: { id: reservationId },
          data: {
            status: "RELEASED",
            releasedAt: new Date(),
            releaseReason: "cierre_programacion_semana_objetivo",
            updatedByUserId: session!.userId,
          },
        });
        await logReservationEvent({
          eventType: "RESERVATION_RELEASED",
          reservationId,
          actorUserId: session!.userId,
          origin: "app",
          detailsJson: {
            trigger: "patient_cancel_last_after_deadline",
            patientId,
            patientHistoryNumber: patient.historyNumber,
            reason,
          },
        });
      }
    } else {
      await prisma.reservation.update({
        where: { id: reservationId },
        data: { updatedByUserId: session!.userId },
      });
    }

    await logReservationEvent({
      eventType: "RESERVATION_PATIENT_CANCELLED",
      reservationId,
      actorUserId: session!.userId,
      origin: "app",
      detailsJson: {
        patientId,
        patientHistoryNumber: patient.historyNumber,
        reason,
        remainingPatients: remainingCount,
      },
    });

    const updated = await fetchReservationForAccess(reservationId);
    let slotOutcome: "retained" | "released" | null = null;
    if (remainingCount === 0) {
      slotOutcome = retentionAllowed ? "retained" : "released";
    }
    return NextResponse.json({
      reservation: toApiReservation(updated!),
      slotOutcome,
    });
  } catch (err) {
    console.error("[reservations patient cancel]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
