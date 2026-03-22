/**
 * PATCH /api/reservations/[id]/patient
 * Actualizar o sustituir un paciente en la reserva. Solo owner o gestor.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requireAnyPermission } from "@/lib/auth";
import { canModifyPatientInBooking } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";
import { fetchReservationForAccess, toApiReservation, toBookingLike } from "@/lib/reservations/reservationApiHelpers";
import { updatePatientSchema } from "@/lib/validations/reservation";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["patient:update", "booking:view:all"]);
    if (denyPerm) return denyPerm;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID de reserva requerido" }, { status: 400 });

    const reservation = await fetchReservationForAccess(id);
    if (!reservation) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

    if (!canModifyPatientInBooking(session!, toBookingLike(reservation), "patient:update")) {
      return NextResponse.json({ error: "No tiene permiso para modificar pacientes en esta reserva" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const parsed = updatePatientSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? "Datos inválidos";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { patientId, ...updates } = parsed.data;

    const patient = await prisma.patientInBlock.findFirst({
      where: { id: patientId, reservationId: id },
    });
    if (!patient) return NextResponse.json({ error: "Paciente no encontrado en esta reserva" }, { status: 404 });

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

    await prisma.patientInBlock.update({
      where: { id: patientId },
      data,
    });

    await prisma.reservation.update({
      where: { id },
      data: { updatedByUserId: session!.userId },
    });

    await logReservationEvent({
      eventType: "RESERVATION_PATIENT_UPDATED",
      reservationId: id,
      actorUserId: session!.userId,
      origin: "app",
      detailsJson: { patientId, fields: Object.keys(updates) },
    });

    const updated = await fetchReservationForAccess(id);
    if (!updated) return NextResponse.json({ error: "Reserva actualizada pero no encontrada" }, { status: 500 });

    const apiReservation = toApiReservation(updated as Parameters<typeof toApiReservation>[0]);
    return NextResponse.json({ reservation: apiReservation });
  } catch (err) {
    console.error("[reservations patient PATCH]", err);
    return NextResponse.json({ error: "Error al actualizar paciente" }, { status: 500 });
  }
}
