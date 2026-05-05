/**
 * Lógica compartida para crear reservas en la base de datos.
 * Usada por la API de reservas y por el webhook de correo.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createReservationSchema } from "@/lib/validations/reservation";
import type { CreateReservationInput } from "@/lib/validations/reservation";
import { logReservationEvent } from "./logReservationEvent";
import { defaultPatientCircuitColumns } from "./surgicalPatientCircuit";
import { applyAndLogPatientCircuitPhase2, type Phase2PatientInput } from "./patientCircuitPhase2";
import {
  findOverflowConflictAgainstOccupiedSlots,
  findOverflowInvaderForTargetSlot,
  getActiveReservationsInContext,
} from "./overflowConflicts";
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
  prisma: typeof prisma;
  reservationId: string;
  surgeryYmd: string;
  actorUserId: string;
  origin: "app" | "email" | "gestor";
  createdRows: Array<{ id: string; orderIndex: number }>;
  inputPatients: NonNullable<CreateReservationInput["patients"]>;
}) {
  if (params.inputPatients.length === 0) return;
  await applyAndLogPatientCircuitPhase2(params.prisma, {
    reservationId: params.reservationId,
    surgeryYmd: params.surgeryYmd,
    actorUserId: params.actorUserId,
    origin: params.origin,
    patients: alignPatientsForPhase2(params.createdRows, params.inputPatients),
  });
}

export async function createReservationInDb(
  data: CreateReservationInput,
  surgeonId: string,
  options?: CreateReservationOptions
): Promise<CreateReservationResult> {
  const parsed = createReservationSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      ok: false,
      error: "invalid_data",
      message: first?.message ?? "Datos inválidos",
    };
  }

  const { date, resourceId, shift, slotIndex, patients } = parsed.data;
  const dateObj = new Date(date + "T00:00:00.000Z");
  const shiftEnum = shift === "morning" ? "MORNING" : "AFTERNOON";
  const origin = options?.origin ?? "APP";
  const originPrisma = origin === "EMAIL" ? "EMAIL" : origin === "GESTOR" ? "GESTOR" : "APP";
  const contextReservations = await getActiveReservationsInContext(prisma, { date, resourceId, shift });
  const invader = findOverflowInvaderForTargetSlot({
    reservations: contextReservations,
    shift,
    targetSlotIndex: slotIndex,
    targetSurgeonId: surgeonId,
  });
  if (invader) {
    return {
      ok: false,
      error: "overflow_conflict",
      message: "El hueco está invadido por la prolongación de otra reserva con pacientes",
    };
  }

  const existing = await prisma.reservation.findFirst({
    where: {
      date: dateObj,
      resourceId,
      shift: shiftEnum,
      slotIndex,
    },
  });

  const actorUserId = options?.actorUserId ?? surgeonId;
  const hasPatients = (patients?.length ?? 0) > 0;

  if (existing) {
    if (existing.status === "PENDING" || existing.status === "CONFIRMED") {
      const patientCount = await prisma.patientInBlock.count({
        where: { reservationId: existing.id },
      });
      /**
       * Completar programación sobre hueco ya reservado sin pacientes (mismo cirujano titular).
       * Sin esto, POST devolvía "ocupado" y el cirujano/gestor no podían añadir pacientes tras "solo reservar".
       * Cuerpo sin pacientes + 0 pacientes en BD → idempotente (p. ej. varios slots en un mismo guardado).
       */
      if (patientCount === 0 && existing.surgeonId === surgeonId) {
        if (!hasPatients) {
          return { ok: true, reservationId: existing.id };
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
          return {
            ok: false,
            error: "overflow_conflict",
            message: "La duración total invade un tramo ya ocupado por otra reserva con pacientes",
          };
        }
        const circuitMeta: { id: string; orderIndex: number }[] = [];
        await prisma.$transaction(async (tx) => {
          for (let i = 0; i < patients.length; i++) {
            const p = patients[i]!;
            const row = await tx.patientInBlock.create({
              data: {
                reservationId: existing.id,
                ...patientFieldsForCreate(p, i),
              },
            });
            circuitMeta.push({ id: row.id, orderIndex: row.orderIndex });
          }
          await tx.reservation.update({
            where: { id: existing.id },
            data: {
              status: "CONFIRMED",
              updatedByUserId: actorUserId,
            },
          });
        });
        const originLower = origin.toLowerCase() as "app" | "email" | "gestor";
        await runPhase2AfterPatientCreates({
          prisma,
          reservationId: existing.id,
          surgeryYmd: date,
          actorUserId,
          origin: originLower,
          createdRows: circuitMeta,
          inputPatients: patients,
        });
        await logReservationEvent({
          eventType: "RESERVATION_UPDATED",
          reservationId: existing.id,
          actorUserId,
          origin: origin.toLowerCase() as "app" | "email" | "gestor",
          detailsJson: {
            action: "add_patients_to_empty_hold",
            date,
            resourceId,
            shift,
            slotIndex,
            patientCount: patients.length,
          },
        });
        return { ok: true, reservationId: existing.id };
      }
      return {
        ok: false,
        error: "slot_occupied",
        code: "slot_occupied",
        message: "Hueco ocupado",
      };
    }
    if (existing.status === "CANCELLED" || existing.status === "RELEASED") {
      const reusedMeta: { id: string; orderIndex: number }[] = [];
      await prisma.$transaction(async (tx) => {
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
            data: {
              reservationId: existing.id,
              ...patientFieldsForCreate(p, i),
            },
          });
          reusedMeta.push({ id: row.id, orderIndex: row.orderIndex });
        }
      });
      const originLowerReuse = origin.toLowerCase() as "app" | "email" | "gestor";
      if (hasPatients) {
        await runPhase2AfterPatientCreates({
          prisma,
          reservationId: existing.id,
          surgeryYmd: date,
          actorUserId,
          origin: originLowerReuse,
          createdRows: reusedMeta,
          inputPatients: patients,
        });
      }
      const eventType = origin === "EMAIL" ? "RESERVATION_CREATED_FROM_EMAIL" : "RESERVATION_CREATED";
      await logReservationEvent({
        eventType,
        reservationId: existing.id,
        actorUserId,
        origin: origin.toLowerCase() as "app" | "email" | "gestor",
        detailsJson: { date, resourceId, shift, slotIndex, reusedFrom: existing.status },
      });
      return { ok: true, reservationId: existing.id };
    }
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
      return {
        ok: false,
        error: "overflow_conflict",
        message: "La duración total invade un tramo ya ocupado por otra reserva con pacientes",
      };
    }
  }

  let reservation;
  try {
    reservation = await prisma.reservation.create({
      data: {
        date: dateObj,
        resourceId,
        shift: shiftEnum,
        slotIndex,
        surgeonId,
        status: hasPatients ? "CONFIRMED" : "PENDING",
        origin: originPrisma,
        createdByUserId: actorUserId,
        patients: {
          create: patients.map((p, i) => patientFieldsForCreate(p, i)),
        },
      },
      include: { patients: true },
    });
  } catch (e) {
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

  const eventType = origin === "EMAIL" ? "RESERVATION_CREATED_FROM_EMAIL" : "RESERVATION_CREATED";
  await logReservationEvent({
    eventType,
    reservationId: reservation.id,
    actorUserId,
    origin: origin.toLowerCase() as "app" | "email" | "gestor",
    detailsJson: { date, resourceId, shift, slotIndex },
  });

  const originLowerNew = origin.toLowerCase() as "app" | "email" | "gestor";
  if (reservation.patients.length > 0) {
    await runPhase2AfterPatientCreates({
      prisma,
      reservationId: reservation.id,
      surgeryYmd: date,
      actorUserId,
      origin: originLowerNew,
      createdRows: reservation.patients.map((row) => ({ id: row.id, orderIndex: row.orderIndex })),
      inputPatients: patients,
    });
  }

  return { ok: true, reservationId: reservation.id };
}
