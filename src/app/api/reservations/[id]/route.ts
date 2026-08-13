/**
 * GET /api/reservations/[id] - Detalle de una reserva (con control de acceso).
 * PATCH /api/reservations/[id] - Añadir pacientes a reserva existente.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requireAnyPermission } from "@/lib/auth";
import { canAccessBooking } from "@/lib/auth";
import { updateReservationSchema } from "@/lib/validations/reservation";
import { writeReservationEvent } from "@/lib/reservations/logReservationEvent";
import { patientFieldsForCreate } from "@/lib/reservations/createReservationInDb";
import { applyAndLogPatientCircuitPhase2InTransaction } from "@/lib/reservations/patientCircuitPhase2";
import { getAdminNotificationEmail } from "@/lib/reservations/surgicalPatientCircuit";
import { fetchReservationForAccess, toApiReservation, toBookingLike } from "@/lib/reservations/reservationApiHelpers";
import { getReservationDetailAccess } from "@/lib/reservations/reservationAccessPolicy";
import { getEffectiveTotalMinutes } from "@/lib/utils";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import {
  findOverflowConflictAgainstOccupiedSlots,
  findOverflowInvaderForTargetSlot,
  getActiveReservationsInContext,
} from "@/lib/reservations/overflowConflicts";
import { withSchedulingContextLock } from "@/lib/reservations/bookingContextLock";

export const dynamic = "force-dynamic";

const RESERVATION_PATCH_BODY_MAX_BYTES = 1024 * 1024;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["booking:view:all", "booking:view:own", "schedule:view:all", "schedule:view:own"]);
    if (denyPerm) return denyPerm;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    const reservation = await fetchReservationForAccess(id);
    if (!reservation) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

    const access = getReservationDetailAccess(session, reservation);
    if (access === "denied") {
      return NextResponse.json({ error: "No tiene permiso para ver esta reserva" }, { status: 403 });
    }

    const apiReservation = toApiReservation(reservation as Parameters<typeof toApiReservation>[0]);
    if (access === "schedule-only") {
      return NextResponse.json({
        reservation: {
          ...apiReservation,
          surgeonId: "[otro]",
          patients: [],
        },
      });
    }

    return NextResponse.json({ reservation: apiReservation });
  } catch {
    console.error("[reservations GET id] Failed to load reservation");
    return NextResponse.json({ error: "Error al cargar reserva" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["patient:create", "booking:view:all"]);
    if (denyPerm) return denyPerm;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID de reserva requerido" }, { status: 400 });

    // Primera lectura: solo autorización y resolución del contexto de lock.
    const reservation = await fetchReservationForAccess(id);
    if (!reservation) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

    if (!canAccessBooking(session!, toBookingLike(reservation), "booking:view:own")) {
      return NextResponse.json({ error: "No tiene permiso para añadir pacientes a esta reserva" }, { status: 403 });
    }

    const limitedBody = await readTextBodyWithLimit(request, RESERVATION_PATCH_BODY_MAX_BYTES);
    if (!limitedBody.ok) {
      return NextResponse.json({ error: "Solicitud demasiado grande" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(limitedBody.text);
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const parsed = updateReservationSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? "Datos inválidos";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { patients } = parsed.data;
    if (!patients?.length) return NextResponse.json({ error: "Indique al menos un paciente" }, { status: 400 });

    const dateStr = reservation.date instanceof Date
      ? reservation.date.toISOString().slice(0, 10)
      : String(reservation.date).slice(0, 10);
    const shift = reservation.shift === "MORNING" ? "morning" : "afternoon";
    const pSorted = [...patients].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

    // Se resuelve antes de abrir la transacción para no usar una segunda conexión
    // mientras el lock de programación está retenido.
    const adminEmail = await getAdminNotificationEmail();

    const lockedResult = await withSchedulingContextLock(
      { date: dateStr, resourceId: reservation.resourceId, shift },
      async (tx) => {
        // Relectura dentro del lock elimina TOCTOU con cancelación/reutilización.
        const live = await tx.reservation.findUnique({
          where: { id },
          include: { patients: true },
        });
        if (!live) return { kind: "not_found" as const };
        if (!canAccessBooking(session!, toBookingLike(live), "booking:view:own")) {
          return { kind: "forbidden" as const };
        }
        if (live.status !== "PENDING" && live.status !== "CONFIRMED") {
          return { kind: "inactive" as const };
        }

        const activeInContext = await getActiveReservationsInContext(tx, {
          date: dateStr,
          resourceId: live.resourceId,
          shift,
        });
        const invader = findOverflowInvaderForTargetSlot({
          reservations: activeInContext,
          shift,
          targetSlotIndex: live.slotIndex,
          targetSurgeonId: live.surgeonId,
          excludeReservationId: live.id,
        });
        if (invader) return { kind: "overflow_invader" as const };

        const combinedPatients = [
          ...live.patients.map((p) => ({ estimatedDurationMinutes: p.estimatedDurationMinutes })),
          ...patients.map((p) => ({ estimatedDurationMinutes: p.estimatedDurationMinutes })),
        ];
        const usedMinutesCandidate = Math.max(0, getEffectiveTotalMinutes(combinedPatients));
        const overflowConflict = findOverflowConflictAgainstOccupiedSlots({
          reservations: activeInContext,
          shift,
          ownerReservationId: live.id,
          ownerSlotIndex: live.slotIndex,
          ownerUsedMinutes: usedMinutesCandidate,
        });
        if (overflowConflict) return { kind: "overflow_conflict" as const };

        const addedMeta: Array<{ id: string; orderIndex: number }> = [];
        for (let i = 0; i < patients.length; i++) {
          const p = patients[i]!;
          const row = await tx.patientInBlock.create({
            data: {
              reservationId: id,
              ...patientFieldsForCreate({ ...p, orderIndex: p.orderIndex ?? i }, i),
            },
          });
          addedMeta.push({ id: row.id, orderIndex: row.orderIndex });
        }

        await tx.reservation.update({
          where: { id },
          data: { status: "CONFIRMED", updatedByUserId: session!.userId },
        });

        const cSorted = [...addedMeta].sort((a, b) => a.orderIndex - b.orderIndex);
        await applyAndLogPatientCircuitPhase2InTransaction(
          tx,
          {
            reservationId: id,
            surgeryYmd: dateStr,
            actorUserId: session!.userId,
            origin: "app",
            patients: cSorted.map((row, i) => {
              const src = pSorted[i]!;
              return {
                patientId: row.id,
                isDeferredUrgency: !!src.isDeferredUrgency,
                specialCircuitReason: src.isDeferredUrgency ? (src.specialCircuitReason?.trim() || null) : null,
                patientEmail: src.patientEmail,
                patientPhone: src.patientPhone,
              };
            }),
          },
          adminEmail,
        );

        await writeReservationEvent(tx, {
          eventType: "RESERVATION_UPDATED",
          reservationId: id,
          actorUserId: session!.userId,
          origin: "app",
          detailsJson: { action: "add_patients", count: patients.length },
        });

        return { kind: "updated" as const };
      },
    );

    if (lockedResult.kind === "not_found") {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }
    if (lockedResult.kind === "forbidden") {
      return NextResponse.json({ error: "No tiene permiso para añadir pacientes a esta reserva" }, { status: 403 });
    }
    if (lockedResult.kind === "inactive") {
      return NextResponse.json(
        { error: "No se pueden añadir pacientes a una reserva cancelada o liberada", code: "reservation_not_active" },
        { status: 409 },
      );
    }
    if (lockedResult.kind === "overflow_invader" || lockedResult.kind === "overflow_conflict") {
      const message = lockedResult.kind === "overflow_invader"
        ? "El hueco base está invadido por la prolongación de otra reserva con pacientes"
        : "La duración total invade un tramo ya ocupado por otra reserva con pacientes";
      return NextResponse.json({ error: message, code: "overflow_conflict" }, { status: 409 });
    }

    const updated = await fetchReservationForAccess(id);
    if (!updated) return NextResponse.json({ error: "Reserva actualizada pero no encontrada" }, { status: 500 });

    return NextResponse.json({ reservation: toApiReservation(updated as Parameters<typeof toApiReservation>[0]) });
  } catch {
    console.error("[reservations PATCH id] Failed to update reservation");
    return NextResponse.json({ error: "Error interno al actualizar la reserva" }, { status: 500 });
  }
}
