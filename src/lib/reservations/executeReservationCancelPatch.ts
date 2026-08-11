/**
 * Lógica compartida de PATCH cancelación completa de reserva.
 * Usada por /api/reservations/[id]/cancel y, si aplica, la ruta duplicada legacy.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requireAnyPermission } from "@/lib/auth";
import { canAccessBooking } from "@/lib/auth";
import { fetchReservationForAccess, toApiReservation, toBookingLike } from "@/lib/reservations/reservationApiHelpers";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";
import { cancelReservationSchema } from "@/lib/validations/reservation";
import { withSchedulingContextLock } from "@/lib/reservations/bookingContextLock";

export async function executeReservationCancelPatch(request: Request, id: string): Promise<NextResponse> {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["booking:cancel", "booking:view:all"]);
    if (denyPerm) return denyPerm;

    if (!id) return NextResponse.json({ error: "ID de reserva requerido" }, { status: 400 });

    const reservation = await fetchReservationForAccess(id);
    if (!reservation) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

    if (!canAccessBooking(session!, toBookingLike(reservation), "booking:cancel")) {
      return NextResponse.json({ error: "No tiene permiso para cancelar esta reserva" }, { status: 403 });
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const parsed = cancelReservationSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? "Datos inválidos";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const force = parsed.data.force === true;
    const reasonRaw = parsed.data.reason?.trim();
    const cancellationReason = reasonRaw && reasonRaw.length > 0 ? reasonRaw : null;
    const dateStr = reservation.date instanceof Date
      ? reservation.date.toISOString().slice(0, 10)
      : String(reservation.date).slice(0, 10);
    const shiftLabel = reservation.shift === "MORNING" ? "morning" : "afternoon";

    const lockedResult = await withSchedulingContextLock(
      { date: dateStr, resourceId: reservation.resourceId, shift: shiftLabel },
      async (tx) => {
        const live = await tx.reservation.findUnique({ where: { id }, include: { patients: true } });
        if (!live) return { kind: "not_found" as const };
        if (!canAccessBooking(session!, toBookingLike(live), "booking:cancel")) {
          return { kind: "forbidden" as const };
        }
        if (live.status === "CANCELLED") {
          return { kind: "already_cancelled" as const, patientsCount: live.patients.length };
        }

        const patientsCount = live.patients.length;
        if (patientsCount > 0 && !force) {
          return { kind: "has_patients" as const, patientsCount };
        }

        await tx.patientInBlock.deleteMany({ where: { reservationId: id } });
        await tx.reservation.update({
          where: { id },
          data: {
            status: "CANCELLED",
            updatedByUserId: session!.userId,
            cancelledAt: new Date(),
            cancellationReason,
            releasedAt: null,
            releaseReason: null,
          },
        });

        return { kind: "cancelled" as const, patientsCount };
      },
    );

    if (lockedResult.kind === "not_found") {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }
    if (lockedResult.kind === "forbidden") {
      return NextResponse.json({ error: "No tiene permiso para cancelar esta reserva" }, { status: 403 });
    }
    if (lockedResult.kind === "has_patients") {
      return NextResponse.json(
        {
          error: "La reserva tiene pacientes. Confirme la cancelación completa.",
          code: "reservation_has_patients",
          patientsCount: lockedResult.patientsCount,
        },
        { status: 409 },
      );
    }

    if (lockedResult.kind === "already_cancelled") {
      const updated = await fetchReservationForAccess(id);
      if (!updated) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
      return NextResponse.json({ reservation: toApiReservation(updated as Parameters<typeof toApiReservation>[0]) });
    }

    await logReservationEvent({
      eventType: "RESERVATION_CANCELLED",
      reservationId: id,
      actorUserId: session!.userId,
      origin: "app",
      detailsJson: {
        reason: cancellationReason ?? undefined,
        force,
        patientsCount: lockedResult.patientsCount,
        slot: {
          date: dateStr,
          resourceId: reservation.resourceId,
          shift: shiftLabel,
          slotIndex: reservation.slotIndex,
        },
      },
    });

    const updated = await fetchReservationForAccess(id);
    if (!updated) return NextResponse.json({ error: "Reserva cancelada pero no encontrada" }, { status: 500 });
    return NextResponse.json({ reservation: toApiReservation(updated as Parameters<typeof toApiReservation>[0]) });
  } catch (err) {
    console.error("[reservations cancel]", err);
    return NextResponse.json({ error: "Error al cancelar reserva" }, { status: 500 });
  }
}
