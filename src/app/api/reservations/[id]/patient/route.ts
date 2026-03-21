/**
 * PATCH /api/reservations/[id]/patient
 * Actualizar o sustituir un paciente en la reserva.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission, canModifyPatientInBooking } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { updatePatientSchema } from "@/lib/validations/reservation";
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

    const denyPerm = requirePermission(session!, "patient:update");
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
    if (!canModifyPatientInBooking(session!, booking, "patient:update")) {
      return NextResponse.json({ error: "No tiene permisos para actualizar pacientes en esta reserva" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updatePatientSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      return NextResponse.json({ error: first?.message ?? "Datos inválidos" }, { status: 400 });
    }

    const { patientId, ...updates } = parsed.data;

    const patient = await prisma.patientInBlock.findFirst({
      where: { id: patientId, reservationId },
    });
    if (!patient) {
      return NextResponse.json({ error: "Paciente no encontrado en esta reserva" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (updates.historyNumber !== undefined) data.historyNumber = updates.historyNumber;
    if (updates.fullName !== undefined) data.fullName = updates.fullName;
    if (updates.procedure !== undefined) data.procedure = updates.procedure;
    if (updates.estimatedDurationMinutes !== undefined) data.estimatedDurationMinutes = updates.estimatedDurationMinutes;
    if (updates.anesthesiaType !== undefined) data.anesthesiaType = updates.anesthesiaType;
    if (updates.insuranceType !== undefined) data.insuranceType = updates.insuranceType;
    if (updates.admissionType !== undefined) data.admissionType = updates.admissionType;
    if (updates.orderIndex !== undefined) data.orderIndex = updates.orderIndex;
    if (updates.notes !== undefined) data.notes = updates.notes;
    if (updates.solicitudRecursos !== undefined) data.solicitudRecursos = updates.solicitudRecursos;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Proporcione al menos un campo a actualizar" }, { status: 400 });
    }

    await prisma.patientInBlock.update({
      where: { id: patientId },
      data,
    });

    await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: "CONFIRMED",
        updatedByUserId: session!.userId,
      },
    });

    const eventType = updates.procedure !== undefined || updates.historyNumber !== undefined
      ? "RESERVATION_PATIENT_REPLACED"
      : "RESERVATION_PATIENT_UPDATED";

    await logReservationEvent({
      eventType,
      reservationId,
      actorUserId: session!.userId,
      origin: "app",
      detailsJson: { patientId, updatedFields: Object.keys(data) },
    });

    const updated = await fetchReservationForAccess(reservationId);
    return NextResponse.json({
      reservation: toApiReservation(updated!),
    });
  } catch (err) {
    console.error("[reservations patient update]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
