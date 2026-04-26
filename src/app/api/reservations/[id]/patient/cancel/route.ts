/**
 * PATCH /api/reservations/[id]/patient/cancel
 * Cancelar un paciente de la reserva. Solo owner o gestor.
 * Si era el último paciente: retained (PENDING) o released (RELEASED) según scheduling deadline.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requireAnyPermission } from "@/lib/auth";
import { canModifyPatientInBooking } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";
import { fetchReservationForAccess, toApiReservation, toBookingLike } from "@/lib/reservations/reservationApiHelpers";
import { isReservationRetentionStillAllowed } from "@/lib/schedulingDeadline";
import { cancelPatientSchema } from "@/lib/validations/reservation";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["patient:cancel", "booking:view:all"]);
    if (denyPerm) return denyPerm;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID de reserva requerido" }, { status: 400 });

    const reservation = await fetchReservationForAccess(id);
    if (!reservation) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

    const booking = toBookingLike(reservation);
    if (!canModifyPatientInBooking(session, booking, "patient:cancel")) {
      return NextResponse.json({ error: "No tiene permiso para cancelar pacientes en esta reserva" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const parsed = cancelPatientSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? "Datos inválidos";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { patientId, reason } = parsed.data;
    const reasonTrimmed = reason?.trim() || undefined;

    const patient = await prisma.patientInBlock.findFirst({
      where: { id: patientId, reservationId: id },
    });
    if (!patient) return NextResponse.json({ error: "Paciente no encontrado en esta reserva" }, { status: 404 });

    const patientsBefore = await prisma.patientInBlock.count({ where: { reservationId: id } });
    if (patientsBefore <= 0) return NextResponse.json({ error: "No hay pacientes en esta reserva" }, { status: 400 });

    const dateStr =
      reservation.date instanceof Date ? reservation.date.toISOString().slice(0, 10) : String(reservation.date).slice(0, 10);
    const shiftLabel = reservation.shift === "MORNING" ? "morning" : "afternoon";

    let slotOutcome: "retained" | "released" | null = null;

    await prisma.$transaction(async (tx) => {
      await tx.patientInBlock.delete({ where: { id: patientId } });

      const remainingCount = await tx.patientInBlock.count({ where: { reservationId: id } });

      if (remainingCount === 0) {
        const retentionAllowed = isReservationRetentionStillAllowed(dateStr);

        if (retentionAllowed) {
          await tx.reservation.update({
            where: { id },
            data: { status: "PENDING", updatedByUserId: session!.userId },
          });
          slotOutcome = "retained";
        } else {
          await tx.reservation.update({
            where: { id },
            data: {
              status: "RELEASED",
              releasedAt: new Date(),
              releaseReason: "ultimo_paciente_cancelado_post_cierre",
              updatedByUserId: session!.userId,
            },
          });
          slotOutcome = "released";
        }
      } else {
        await tx.reservation.update({
          where: { id },
          data: { updatedByUserId: session!.userId },
        });
      }
    });

    const message =
      slotOutcome === "retained"
        ? "Paciente eliminado. El hueco de este tramo sigue reservado (sin pacientes) para poder programar otro caso."
        : slotOutcome === "released"
          ? "Paciente eliminado. Era el último del tramo y, tras el cierre de programación, el hueco ha pasado a bolsa común (liberado)."
          : "Paciente eliminado correctamente. Siguen otros pacientes en este mismo tramo.";

    await logReservationEvent({
      eventType: "RESERVATION_PATIENT_CANCELLED",
      reservationId: id,
      actorUserId: session!.userId,
      origin: "app",
      detailsJson: {
        patientId,
        historyNumber: patient.historyNumber,
        procedure: patient.procedure,
        reason: reasonTrimmed,
        slotOutcome,
        slot: {
          date: dateStr,
          resourceId: reservation.resourceId,
          shift: shiftLabel,
          slotIndex: reservation.slotIndex,
        },
      },
    });

    const updated = await fetchReservationForAccess(id);
    if (!updated) return NextResponse.json({ error: "Reserva actualizada pero no encontrada" }, { status: 500 });

    const apiReservation = toApiReservation(updated as Parameters<typeof toApiReservation>[0]);
    return NextResponse.json({ reservation: apiReservation, slotOutcome, message });
  } catch (err) {
    console.error("[reservations patient/cancel]", err);
    return NextResponse.json({ error: "Error al cancelar paciente" }, { status: 500 });
  }
}
