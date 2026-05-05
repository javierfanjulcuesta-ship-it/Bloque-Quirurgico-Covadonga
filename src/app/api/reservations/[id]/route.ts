/**
 * GET /api/reservations/[id] - Detalle de una reserva (con control de acceso).
 * PATCH /api/reservations/[id] - Añadir pacientes a reserva existente.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requireAnyPermission } from "@/lib/auth";
import { canAccessBooking } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { updateReservationSchema } from "@/lib/validations/reservation";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";
import { patientFieldsForCreate } from "@/lib/reservations/createReservationInDb";
import { applyAndLogPatientCircuitPhase2 } from "@/lib/reservations/patientCircuitPhase2";
import { fetchReservationForAccess, toApiReservation, toBookingLike } from "@/lib/reservations/reservationApiHelpers";
import { getEffectiveTotalMinutes } from "@/lib/utils";
import {
  findOverflowConflictAgainstOccupiedSlots,
  findOverflowInvaderForTargetSlot,
  getActiveReservationsInContext,
} from "@/lib/reservations/overflowConflicts";

export const dynamic = "force-dynamic";

function hasFullReservationView(role: string): boolean {
  const r = role?.trim().toLowerCase().replace(/_/g, "-") ?? "";
  return r === "gestor" || r === "gestor-anestesista" || r === "anestesista";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
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

    const canView = hasFullReservationView(session!.role) || canAccessBooking(session, toBookingLike(reservation), "booking:view:own");
    if (!canView) {
      return NextResponse.json({ error: "No tiene permiso para ver esta reserva" }, { status: 403 });
    }

    const apiReservation = toApiReservation(reservation as Parameters<typeof toApiReservation>[0]);
    return NextResponse.json({ reservation: apiReservation });
  } catch (err) {
    console.error("[reservations GET id]", err);
    return NextResponse.json({ error: "Error al cargar reserva" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["patient:create", "booking:view:all"]);
    if (denyPerm) return denyPerm;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID de reserva requerido" }, { status: 400 });

    const reservation = await fetchReservationForAccess(id);
    if (!reservation) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

    if (!canAccessBooking(session!, toBookingLike(reservation), "booking:view:own")) {
      return NextResponse.json({ error: "No tiene permiso para añadir pacientes a esta reserva" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
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
    const activeInContext = await getActiveReservationsInContext(prisma, {
      date: dateStr,
      resourceId: reservation.resourceId,
      shift,
    });
    const invader = findOverflowInvaderForTargetSlot({
      reservations: activeInContext,
      shift,
      targetSlotIndex: reservation.slotIndex,
      targetSurgeonId: reservation.surgeonId,
      excludeReservationId: reservation.id,
    });
    if (invader) {
      return NextResponse.json(
        {
          error: "El hueco base está invadido por la prolongación de otra reserva con pacientes",
          code: "overflow_conflict",
        },
        { status: 409 }
      );
    }

    const combinedPatients = [
      ...(reservation.patients ?? []).map((p) => ({ estimatedDurationMinutes: p.estimatedDurationMinutes })),
      ...patients.map((p) => ({ estimatedDurationMinutes: p.estimatedDurationMinutes })),
    ];
    const usedMinutesCandidate = Math.max(0, getEffectiveTotalMinutes(combinedPatients));
    const overflowConflict = findOverflowConflictAgainstOccupiedSlots({
      reservations: activeInContext,
      shift,
      ownerReservationId: reservation.id,
      ownerSlotIndex: reservation.slotIndex,
      ownerUsedMinutes: usedMinutesCandidate,
    });
    if (overflowConflict) {
      return NextResponse.json(
        {
          error: "La duración total invade un tramo ya ocupado por otra reserva con pacientes",
          code: "overflow_conflict",
        },
        { status: 409 }
      );
    }

    const addedMeta: { id: string; orderIndex: number }[] = [];
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < patients.length; i++) {
        const p = patients[i]!;
        const row = await tx.patientInBlock.create({
          data: {
            reservationId: id,
            ...patientFieldsForCreate(
              {
                ...p,
                orderIndex: (p as { orderIndex?: number }).orderIndex ?? i,
              } as Parameters<typeof patientFieldsForCreate>[0],
              i,
            ),
          },
        });
        addedMeta.push({ id: row.id, orderIndex: row.orderIndex });
      }

      await tx.reservation.update({
        where: { id },
        data: {
          status: "CONFIRMED",
          updatedByUserId: session!.userId,
        },
      });
    });

    const surgeryYmd =
      reservation.date instanceof Date
        ? reservation.date.toISOString().slice(0, 10)
        : String(reservation.date).slice(0, 10);
    const pSorted = [...patients].sort((a, b) => ((a as { orderIndex?: number }).orderIndex ?? 0) - ((b as { orderIndex?: number }).orderIndex ?? 0));
    const cSorted = [...addedMeta].sort((a, b) => a.orderIndex - b.orderIndex);
    await applyAndLogPatientCircuitPhase2(prisma, {
      reservationId: id,
      surgeryYmd,
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
    });

    await logReservationEvent({
      eventType: "RESERVATION_UPDATED",
      reservationId: id,
      actorUserId: session!.userId,
      origin: "app",
      detailsJson: { action: "add_patients", count: patients.length },
    });

    const updated = await fetchReservationForAccess(id);
    if (!updated) return NextResponse.json({ error: "Reserva actualizada pero no encontrada" }, { status: 500 });

    const apiReservation = toApiReservation(updated as Parameters<typeof toApiReservation>[0]);
    return NextResponse.json({ reservation: apiReservation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al actualizar";
    console.error("[reservations PATCH id]", err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
