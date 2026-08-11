/**
 * PATCH /api/reservations/[id]/patient
 * Actualizar o sustituir un paciente en la reserva. Solo owner o gestor.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requireAnyPermission } from "@/lib/auth";
import { canModifyPatientInBooking } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";
import {
  defaultPatientCircuitColumns,
  logPatientContactDryRunEvents,
} from "@/lib/reservations/surgicalPatientCircuit";
import { fetchReservationForAccess, toApiReservation, toBookingLike } from "@/lib/reservations/reservationApiHelpers";
import { updatePatientSchema } from "@/lib/validations/reservation";
import { getEffectiveTotalMinutes } from "@/lib/utils";
import {
  findOverflowConflictAgainstOccupiedSlots,
  findOverflowInvaderForTargetSlot,
  getActiveReservationsInContext,
} from "@/lib/reservations/overflowConflicts";
import { withSchedulingContextLock } from "@/lib/reservations/bookingContextLock";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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
    const contactOnlyUpdate = updates.patientEmail !== undefined || updates.patientPhone !== undefined;
    const shouldReinitCircuitStatuses =
      contactOnlyUpdate &&
      updates.historyNumber === undefined &&
      updates.fullName === undefined &&
      updates.procedure === undefined &&
      updates.estimatedDurationMinutes === undefined &&
      updates.anesthesiaType === undefined &&
      updates.insuranceType === undefined &&
      updates.admissionType === undefined &&
      updates.orderIndex === undefined &&
      updates.notes === undefined &&
      updates.solicitudRecursos === undefined;

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
    if (updates.patientEmail !== undefined) data.patientEmail = updates.patientEmail ?? null;
    if (updates.patientPhone !== undefined) data.patientPhone = updates.patientPhone ?? null;
    if (shouldReinitCircuitStatuses) Object.assign(data, defaultPatientCircuitColumns());

    const dateStr = reservation.date instanceof Date
      ? reservation.date.toISOString().slice(0, 10)
      : String(reservation.date).slice(0, 10);
    const shift = reservation.shift === "MORNING" ? "morning" : "afternoon";

    const lockedResult = await withSchedulingContextLock(
      { date: dateStr, resourceId: reservation.resourceId, shift },
      async (tx) => {
        const live = await tx.reservation.findUnique({
          where: { id },
          include: { patients: true },
        });
        if (!live) return { kind: "not_found" as const };
        if (!canModifyPatientInBooking(session!, toBookingLike(live), "patient:update")) {
          return { kind: "forbidden" as const };
        }
        if (live.status !== "PENDING" && live.status !== "CONFIRMED") {
          return { kind: "inactive" as const };
        }

        const livePatient = live.patients.find((p) => p.id === patientId);
        if (!livePatient) return { kind: "patient_not_found" as const };

        if (updates.estimatedDurationMinutes !== undefined) {
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

          const simulatedPatients = live.patients.map((p) => ({
            estimatedDurationMinutes: p.id === patientId
              ? updates.estimatedDurationMinutes ?? p.estimatedDurationMinutes
              : p.estimatedDurationMinutes,
          }));
          const usedMinutesCandidate = Math.max(0, getEffectiveTotalMinutes(simulatedPatients));
          const overflowConflict = findOverflowConflictAgainstOccupiedSlots({
            reservations: activeInContext,
            shift,
            ownerReservationId: live.id,
            ownerSlotIndex: live.slotIndex,
            ownerUsedMinutes: usedMinutesCandidate,
          });
          if (overflowConflict) return { kind: "overflow_conflict" as const };
        }

        await tx.patientInBlock.update({
          where: { id: patientId },
          data: data as Prisma.PatientInBlockUpdateInput,
        });
        await tx.reservation.update({
          where: { id },
          data: { updatedByUserId: session!.userId },
        });

        return {
          kind: "updated" as const,
          oldEmail: livePatient.patientEmail,
          oldPhone: livePatient.patientPhone,
        };
      },
    );

    if (lockedResult.kind === "not_found") {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }
    if (lockedResult.kind === "forbidden") {
      return NextResponse.json({ error: "No tiene permiso para modificar pacientes en esta reserva" }, { status: 403 });
    }
    if (lockedResult.kind === "patient_not_found") {
      return NextResponse.json({ error: "Paciente no encontrado en esta reserva" }, { status: 404 });
    }
    if (lockedResult.kind === "inactive") {
      return NextResponse.json(
        { error: "No se puede modificar un paciente de una reserva cancelada o liberada", code: "reservation_not_active" },
        { status: 409 },
      );
    }
    if (lockedResult.kind === "overflow_invader" || lockedResult.kind === "overflow_conflict") {
      const message = lockedResult.kind === "overflow_invader"
        ? "El hueco base está invadido por la prolongación de otra reserva con pacientes"
        : "La duración total invade un tramo ya ocupado por otra reserva con pacientes";
      return NextResponse.json({ error: message, code: "overflow_conflict" }, { status: 409 });
    }

    await logReservationEvent({
      eventType: "RESERVATION_PATIENT_UPDATED",
      reservationId: id,
      actorUserId: session!.userId,
      origin: "app",
      detailsJson: { patientId, fields: Object.keys(updates) },
    });

    if (updates.patientEmail !== undefined || updates.patientPhone !== undefined) {
      const emailAfter = updates.patientEmail !== undefined ? updates.patientEmail ?? null : lockedResult.oldEmail;
      const phoneAfter = updates.patientPhone !== undefined ? updates.patientPhone ?? null : lockedResult.oldPhone;
      await logPatientContactDryRunEvents({
        reservationId: id,
        patientId,
        actorUserId: session!.userId,
        origin: "app",
        patientEmail: emailAfter,
        patientPhone: phoneAfter,
      });
    }

    const updated = await fetchReservationForAccess(id);
    if (!updated) return NextResponse.json({ error: "Reserva actualizada pero no encontrada" }, { status: 500 });

    return NextResponse.json({ reservation: toApiReservation(updated as Parameters<typeof toApiReservation>[0]) });
  } catch (err) {
    console.error("[reservations patient PATCH]", err);
    return NextResponse.json({ error: "Error al actualizar paciente" }, { status: 500 });
  }
}
