/**
 * Lógica compartida para crear reservas en la base de datos.
 * Usada por la API de reservas y por el webhook de correo.
 *
 * Las decisiones de ocupación se toman bajo un advisory lock transaccional por
 * (fecha, recurso, turno), evitando el patrón inseguro read-then-write.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createReservationSchema } from "@/lib/validations/reservation";
import type { CreateReservationInput } from "@/lib/validations/reservation";
import { logReservationEvent, type ReservationEventType } from "./logReservationEvent";
import { defaultPatientCircuitColumns } from "./surgicalPatientCircuit";
import { applyAndLogPatientCircuitPhase2, type Phase2PatientInput } from "./patientCircuitPhase2";
import {
  findOverflowConflictAgainstOccupiedSlots,
  findOverflowInvaderForTargetSlot,
  getActiveReservationsInContext,
} from "./overflowConflicts";
import { withSchedulingContextLock } from "./bookingContextLock";
import { getEffectiveTotalMinutes } from "@/lib/utils";

export type ReservationOrigin = "APP" | "EMAIL" | "GESTOR";

export type CreateReservationResult =
  | { ok: true; reservationId: string }
  | {
      ok: false;
      error: "slot_occupied" | "overflow_conflict" | "invalid_data";
      code?: "slot_occupied" | "overflow_conflict" | "invalid_data";
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

async function runPhase2AfterPatientCreates(params: {
  reservationId: string;
  surgeryYmd: string;
  actorUserId: string;
  origin: "app" | "email" | "gestor";
  createdRows: Array<{ id: string; orderIndex: number }>;
  inputPatients: NonNullable<CreateReservationInput["patients"]>;
}) {
  if (params.inputPatients.length === 0) return;
  await applyAndLogPatientCircuitPhase2(prisma, {
    reservationId: params.reservationId,
    surgeryYmd: params.surgeryYmd,
    actorUserId: params.actorUserId,
    origin: params.origin,
    patients: alignPatientsForPhase2(params.createdRows, params.inputPatients),
  });
}

type LockedSuccess = {
  result: { ok: true; reservationId: string };
  phase2Rows?: Array<{ id: string; orderIndex: number }>;
  event?: {
    eventType: ReservationEventType;
    detailsJson: Record<string, unknown>;
  };
};

type LockedOutcome = LockedSuccess | { result: Exclude<CreateReservationResult, { ok: true }> };

function overflowFailure(message: string): LockedOutcome {
  return {
    result: {
      ok: false,
      error: "overflow_conflict",
      code: "overflow_conflict",
      message,
    },
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

  let locked: LockedOutcome;
  try {
    locked = await withSchedulingContextLock({ date, resourceId, shift }, async (tx) => {
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
            return { result: { ok: true, reservationId: existing.id } };
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

          const phase2Rows: Array<{ id: string; orderIndex: number }> = [];
          for (let i = 0; i < patients.length; i++) {
            const p = patients[i]!;
            const row = await tx.patientInBlock.create({
              data: { reservationId: existing.id, ...patientFieldsForCreate(p, i) },
            });
            phase2Rows.push({ id: row.id, orderIndex: row.orderIndex });
          }
          await tx.reservation.update({
            where: { id: existing.id },
            data: { status: "CONFIRMED", updatedByUserId: actorUserId },
          });

          return {
            result: { ok: true, reservationId: existing.id },
            phase2Rows,
            event: {
              eventType: "RESERVATION_UPDATED",
              detailsJson: {
                action: "add_patients_to_empty_hold",
                date,
                resourceId,
                shift,
                slotIndex,
                patientCount: patients.length,
              },
            },
          };
        }

        return {
          result: {
            ok: false,
            error: "slot_occupied",
            code: "slot_occupied",
            message: "Hueco ocupado",
          },
        };
      }

      if (existing && (existing.status === "CANCELLED" || existing.status === "RELEASED")) {
        const reusedFrom = existing.status;
        const phase2Rows: Array<{ id: string; orderIndex: number }> = [];

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
          phase2Rows.push({ id: row.id, orderIndex: row.orderIndex });
        }

        return {
          result: { ok: true, reservationId: existing.id },
          phase2Rows,
          event: {
            eventType: origin === "EMAIL" ? "RESERVATION_CREATED_FROM_EMAIL" : "RESERVATION_CREATED",
            detailsJson: { date, resourceId, shift, slotIndex, reusedFrom },
          },
        };
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

      return {
        result: { ok: true, reservationId: reservation.id },
        phase2Rows: reservation.patients.map((row) => ({ id: row.id, orderIndex: row.orderIndex })),
        event: {
          eventType: origin === "EMAIL" ? "RESERVATION_CREATED_FROM_EMAIL" : "RESERVATION_CREATED",
          detailsJson: { date, resourceId, shift, slotIndex },
        },
      };
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

  if (!locked.result.ok) return locked.result;

  if (locked.phase2Rows?.length) {
    await runPhase2AfterPatientCreates({
      reservationId: locked.result.reservationId,
      surgeryYmd: date,
      actorUserId,
      origin: originLower,
      createdRows: locked.phase2Rows,
      inputPatients: patients,
    });
  }

  if (locked.event) {
    await logReservationEvent({
      eventType: locked.event.eventType,
      reservationId: locked.result.reservationId,
      actorUserId,
      origin: originLower,
      detailsJson: locked.event.detailsJson,
    });
  }

  return locked.result;
}
