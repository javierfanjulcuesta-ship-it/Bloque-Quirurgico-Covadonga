/**
 * PATCH /api/reservations/[id]/cancel
 * Anula (libera) una reserva propia cuando no tiene actividad clínica real.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requireAnyPermission, canAccessBooking } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { fetchReservationForAccess, toApiReservation, toBookingLike } from "@/lib/reservations/reservationApiHelpers";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";

export const dynamic = "force-dynamic";

function hasClinicalActivity(patient: {
  historyNumber: string;
  procedure: string;
  anesthesiaType: string;
  insuranceType: string;
  notes: string | null;
}): boolean {
  const history = patient.historyNumber.trim();
  const procedure = patient.procedure.trim();
  const anesthesia = patient.anesthesiaType.trim();
  const insurance = patient.insuranceType.trim();
  const notes = (patient.notes ?? "").trim();

  const hasMeaningfulHistory = history.length > 0 && !history.toUpperCase().startsWith("PEND-");
  const hasMeaningfulProcedure =
    procedure.length > 0 &&
    !procedure.toLowerCase().startsWith("procedimiento pendiente") &&
    !procedure.toLowerCase().includes("[pendiente");
  const hasMeaningfulAnesthesia = anesthesia.length > 0 && anesthesia.toLowerCase() !== "pendiente";
  const hasMeaningfulInsurance = insurance.length > 0 && insurance.toLowerCase() !== "pendiente";
  const hasMeaningfulNotes = notes.length > 0 && !notes.toLowerCase().includes("[pendiente");

  return hasMeaningfulHistory || hasMeaningfulProcedure || hasMeaningfulAnesthesia || hasMeaningfulInsurance || hasMeaningfulNotes;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["booking:cancel", "booking:update", "booking:view:all"]);
    if (denyPerm) return denyPerm;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID de reserva requerido." }, { status: 400 });

    const reservation = await fetchReservationForAccess(id);
    if (!reservation) return NextResponse.json({ error: "Reserva no encontrada." }, { status: 404 });

    const canCancel = canAccessBooking(session!, toBookingLike(reservation), "booking:cancel");
    if (!canCancel) {
      return NextResponse.json({ error: "No tiene permiso para anular esta reserva." }, { status: 403 });
    }

    if (reservation.status === "CANCELLED") {
      return NextResponse.json({ error: "La reserva ya está anulada." }, { status: 400 });
    }
    if (reservation.status === "RELEASED") {
      return NextResponse.json(
        { error: "Esta reserva no puede anularse porque ya contiene actividad asociada" },
        { status: 409 }
      );
    }

    const hasRealActivity =
      reservation.patients.length > 0 && reservation.patients.some((patient) => hasClinicalActivity(patient));
    if (hasRealActivity) {
      return NextResponse.json(
        { error: "Esta reserva no puede anularse porque ya contiene actividad asociada" },
        { status: 409 }
      );
    }

    let reason = "";
    try {
      const body = (await request.json().catch(() => ({}))) as { reason?: string };
      reason = typeof body.reason === "string" ? body.reason.trim() : "";
    } catch {
      reason = "";
    }

    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: reason || "Liberada por cirujano desde UI",
        updatedByUserId: session!.userId,
      },
    });

    await logReservationEvent({
      eventType: "RESERVATION_CANCELLED",
      reservationId: reservation.id,
      actorUserId: session!.userId,
      origin: "app",
      detailsJson: {
        action: "cancel_empty_or_non_clinical_reservation",
        reason: reason || undefined,
      },
    });

    const updated = await fetchReservationForAccess(id);
    if (!updated) return NextResponse.json({ error: "No se pudo recargar la reserva anulada." }, { status: 500 });
    return NextResponse.json({ reservation: toApiReservation(updated) });
  } catch (err) {
    console.error("[reservations PATCH cancel]", err);
    return NextResponse.json({ error: "No se pudo anular la reserva" }, { status: 500 });
  }
}
