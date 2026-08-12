/**
 * Lógica compartida para crear reservas en la base de datos.
 * Usada por la API de reservas y por el webhook de correo.
 *
 * Las decisiones de ocupación se toman bajo un advisory lock transaccional por
 * (fecha, recurso, turno), evitando el patrón inseguro read-then-write.
 */

import { Prisma } from "@prisma/client";
import { canReserveSlot } from "@/lib/blockOpeningPlan";
import { createReservationSchema } from "@/lib/validations/reservation";
import type { CreateReservationInput } from "@/lib/validations/reservation";
import { writeReservationEvent } from "./logReservationEvent";
import { defaultPatientCircuitColumns, getAdminNotificationEmail } from "./surgicalPatientCircuit";
import {
  applyAndLogPatientCircuitPhase2InTransaction,
  type Phase2PatientInput,
} from "./patientCircuitPhase2";
import {
  findOverflowConflictAgainstOccupiedSlots,
  findOverflowInvaderForTargetSlot,
  getActiveReservationsInContext,
} from "./overflowConflicts";
import { withSchedulingContextLock } from "./bookingContextLock";
import { getEffectiveTotalMinutes } from "@/lib/utils";

export type ReservationOrigin = "APP" | "EMAIL" | "GESTOR";
export type CreateReservationError =
  | "slot_occupied"
  | "overflow_conflict"
  | "block_closed"
  | "block_urgent_reserved"
  | "invalid_data";

export type CreateReservationResult =
  | { ok: true; reservationId: string }
  | {
      ok: false;
      error: CreateReservationError;
      code?: CreateReservationError;
      message: string;
    };

export interface CreateReservationOptions {
  origin?: ReservationOrigin;
  actorUserId?: string;
}

export function patientFieldsForCreate(
  p: CreateReservationInput["patients"][number],
  fallbackOrderIndex: number,
) {
  return {
    ...defaultPatientCircuitColumns(),
    historyNumber: p.historyNumber,
    fullName: p.fullName ?? null,
    procedure: p.procedure,
    estimatedDurationMinutes: p.estimatedDurationMinutes,
    anesthesiaType: p.anesthesiaType,
    insuranceType: p.insuranceType,
    admissionType: p.admissionType ?? null,
    orderIndex: p.orderIndex ?? fallbackOrderIndex,
    notes: p.notes ?? null,
    solicitudRecursos: p.solicitudRecursos ?? null,
    patientEmail: p.patientEmail ?? null,
    patientPhone: p.patientPhone ?? null,
    isDeferredUrgency: p.isDeferredUrgency ?? false,
    specialCircuitReason: p.isDeferredUrgency ? (p.specialCircuitReason?.trim() || null) : null,
  };
}

function alignPatientsForPhase2(
  created: Array<{ id: string; orderIndex: number }>,
  input: NonNullable<CreateReservationInput["patients"]>,
): Phase2PatientInput[] {
  const cSorted = [...created].sort((a, b) => a.orderIndex - b.orderIndex);
  const pSorted = [...input].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  return cSorted.map((row, i) => {
    const src = pSorted[i]!;
    return {
      patientId: row.id,
      isDeferredUrgency: !!src.isDeferredUrgency,
      specialCircuitReason: src.isDeferredUrgency ? (src.specialCircuitReason?.trim() || null) : null,
      patientEmail: src.patientEmail,
      patientPhone: src.patientPhone,
    };
  });
}

function overflowFailure(message: string): CreateReservationResult {
  return {
    ok: false,
    error: "overflow_conflict",
    code: "overflow_conflict",
    message,
  };
}

export async function createReservationInDb(
  data: CreateReservationInput,
  surgeonId: string,
  options?: CreateReservationOptions,
): Promise<CreateReservationResult> {
  const parsed = createReservationSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      ok: false,
      error: "invalid_data",
      code: "invalid_data",
      message: first?.message ?? "Datos inválidos",
    };
  }

  const { date, resourceId, shift, slotIndex, patients } = parsed.data;
  const dateObj = new Date(date + "T00:00:00.000Z");
  const shiftEnum = shift === "morning" ? "MORNING" : "AFTERNOON";
  const origin = options?.origin ?? "APP";
  const originPrisma = origin === "EMAIL" ? "EMAIL" : origin === "GESTOR" ? "GESTOR" : "APP";
  const originLower = origin.toLowerCase() as "app" | "email" | "gestor";
  const actorUserId = options?.actorUserId ?? surgeonId;
  const hasPatients = patients.length > 0;

  // Se resuelve antes de abrir la transacción para no hacer una consulta global
  // desde dentro de una transacción que ya retiene locks de programación.
  const adminEmail = hasPatients ? await getAdminNotificationEmail() : null;

  try {
    return await withSchedulingContextLock({ date, resourceId, shift }, async (tx) => {
      // El plan de apertura se lee DESPUÉS del lock. Su PUT usa el mismo lock,
      // por lo que cerrar el bloque y crear una reserva no pueden cruzarse por TOCTOU.
      const opening = await canReserveSlot(date, resourceId, shift, origin === "GESTOR", tx);
      if (!opening.ok) {
        return {
          ok: false,
          error: opening.reason,
          code: opening.reason,
          message: opening.message,
        } as CreateReservationResult;
      }

      // Todas las lecturas que deciden ocupación ocurren DESPUÉS del lock.
      const contextReservations = await getActiveReservationsInContext(tx, { date, resourceId, shift });
      const invader = findOverflowInvaderForTargetSlot({
        reservations: contextReservations,
        shift,
        targetSlotIndex: slotIndex,
        targetSurgeonId: surgeonId,
      });
      if (invader) {
        return overflowFailure("El hueco está invadido por la prolongación de otra reserva con pacientes");
      }

      const existing = await tx.reservation.findFirst({
        where: { date: dateObj, resourceId, shift: shiftEnum, slotIndex },
      });

      if (existing && (existing.status === "PENDING" || existing.status === "CONFIRMED")) {
        const patientCount = await tx.patientInBlock.count({ where: { reservationId: existing.id } });

        // Completar un hold vacío del mismo titular. POST sin pacientes es idempotente.
        if (patientCount === 0 && existing.surgeonId === surgeonId) {
          if (!hasPatients) {
            return { ok: true, reservationId: existing.id } as const;
          }

          const usedMinutesCandidate = Math.max(0, getEffectiveTotalMinutes(patients));
          const overflowConflict = findOverflowConflictAgainstOccupiedSlots({
            reservations: contextReservations,
            shift,
            ownerReservationId: existing.id,
            ownerSlotIndex: slotIndex,
            ownerUsedMinutes: usedMinutesCandidate,
          });
          if (overflowConflict) {
            return overflowFailure("La duración total invade un tramo ya ocupado por otra reserva con pacientes");
          }

          const createdRows: Array<{ id: string; orderIndex: number }> = [];
          for (let i = 0; i < patients.length; i++) {
            const p = patients[i]!;
            const row = await tx.patientInBlock.create({
              data: { reservationId: existing.id, ...patientFieldsForCreate(p, i) },
            });
            createdRows.push({ id: row.id, orderIndex: row.orderIndex });
          }
          await tx.reservation.update({
            where: { id: existing.id },
            data: { status: "CONFIRMED", updatedByUserId: actorUserId },
          });

          await applyAndLogPatientCircuitPhase2InTransaction(
            tx,
            {
              reservationId: existing.id,
              surgeryYmd: date,
              actorUserId,
              origin: originLower,
              patients: alignPatientsForPhase2(createdRows, patients),
            },
            adminEmail,
          );
          await writeReservationEvent(tx, {
            eventType: "RESERVATION_UPDATED",
            reservationId: existing.id,
            actorUserId,
            origin: originLower,
            detailsJson: {
              action: "add_patients_to_empty_hold",
              date,
              resourceId,
              shift,
              slotIndex,
              patientCount: patients.length,
            },
          });

          return { ok: true, reservationId: existing.id } as const;
        }

        return {
          ok: false,
          error: "slot_occupied",
          code: "slot_occupied",
          message: "Hueco ocupado",
        } as const;
      }

      if (existing && (existing.status === "CANCELLED" || existing.status === "RELEASED")) {
        const reusedFrom = existing.status;
        const createdRows: Array<{ id: string; orderIndex: number }> = [];

        if (hasPatients) {
          const usedMinutesCandidate = Math.max(0, getEffectiveTotalMinutes(patients));
          const overflowConflict = findOverflowConflictAgainstOccupiedSlots({
            reservations: contextReservations,
            shift,
            ownerSlotIndex: slotIndex,
            ownerUsedMinutes: usedMinutesCandidate,
          });
          if (overflowConflict) {
            return overflowFailure("La duración total invade un tramo ya ocupado por otra reserva con pacientes");
          }
        }

        // Mantiene el comportamiento legacy de reutilización, ahora serializado para evitar carreras.
        await tx.patientInBlock.deleteMany({ where: { reservationId: existing.id } });
        await tx.reservation.update({
          where: { id: existing.id },
          data: {
            surgeonId,
            status: hasPatients ? "CONFIRMED" : "PENDING",
            origin: originPrisma,
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
            cancelledAt: null,
            cancellationReason: null,
            releasedAt: null,
            releaseReason: null,
          },
        });
        for (let i = 0; i < patients.length; i++) {
          const p = patients[i]!;
          const row = await tx.patientInBlock.create({
            data: { reservationId: existing.id, ...patientFieldsForCreate(p, i) },
          });
          createdRows.push({ id: row.id, orderIndex: row.orderIndex });
        }

        if (createdRows.length > 0) {
          await applyAndLogPatientCircuitPhase2InTransaction(
            tx,
            {
              reservationId: existing.id,
              surgeryYmd: date,
              actorUserId,
              origin: originLower,
              patients: alignPatientsForPhase2(createdRows, patients),
            },
            adminEmail,
          );
        }
        await writeReservationEvent(tx, {
          eventType: origin === "EMAIL" ? "RESERVATION_CREATED_FROM_EMAIL" : "RESERVATION_CREATED",
          reservationId: existing.id,
          actorUserId,
          origin: originLower,
          detailsJson: { date, resourceId, shift, slotIndex, reusedFrom },
        });

        return { ok: true, reservationId: existing.id } as const;
      }

      if (hasPatients) {
        const usedMinutesCandidate = Math.max(0, getEffectiveTotalMinutes(patients));
        const overflowConflict = findOverflowConflictAgainstOccupiedSlots({
          reservations: contextReservations,
          shift,
          ownerSlotIndex: slotIndex,
          ownerUsedMinutes: usedMinutesCandidate,
        });
        if (overflowConflict) {
          return overflowFailure("La duración total invade un tramo ya ocupado por otra reserva con pacientes");
        }
      }

      const reservation = await tx.reservation.create({
        data: {
          date: dateObj,
          resourceId,
          shift: shiftEnum,
          slotIndex,
          surgeonId,
          status: hasPatients ? "CONFIRMED" : "PENDING",
          origin: originPrisma,
          createdByUserId: actorUserId,
          patients: { create: patients.map((p, i) => patientFieldsForCreate(p, i)) },
        },
        include: { patients: true },
      });

      if (reservation.patients.length > 0) {
        await applyAndLogPatientCircuitPhase2InTransaction(
          tx,
          {
            reservationId: reservation.id,
            surgeryYmd: date,
            actorUserId,
            origin: originLower,
            patients: alignPatientsForPhase2(
              reservation.patients.map((row) => ({ id: row.id, orderIndex: row.orderIndex })),
              patients,
            ),
          },
          adminEmail,
        );
      }
      await writeReservationEvent(tx, {
        eventType: origin === "EMAIL" ? "RESERVATION_CREATED_FROM_EMAIL" : "RESERVATION_CREATED",
        reservationId: reservation.id,
        actorUserId,
        origin: originLower,
        detailsJson: { date, resourceId, shift, slotIndex },
      });

      return { ok: true, reservationId: reservation.id } as const;
    });
  } catch (e) {
    // Defensa adicional frente a escritores antiguos/no cooperativos que no usen el advisory lock.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        ok: false,
        error: "slot_occupied",
        code: "slot_occupied",
        message: "Hueco ocupado",
      };
    }
    throw e;
  }
}
