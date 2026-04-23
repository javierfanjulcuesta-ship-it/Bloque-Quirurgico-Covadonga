import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createReservationBatchSchema } from "@/lib/validations/reservation";
import type { CreateReservationBatchInput } from "@/lib/validations/reservation";
import { logReservationEvent } from "./logReservationEvent";
import type { ReservationOrigin } from "./createReservationInDb";

interface CreateReservationBatchOptions {
  origin?: ReservationOrigin;
  actorUserId?: string;
  externalSurgeonName?: string;
  isBatchCreation?: boolean;
}

type CreateReservationBatchResult =
  | { ok: true; reservationIds: string[] }
  | { ok: false; error: "slot_occupied" | "invalid_data"; message: string };

type SlotInput = CreateReservationBatchInput["slots"][number];

function slotKey(slot: SlotInput): string {
  return `${slot.date}__${slot.resourceId}__${slot.shift}__${slot.slotIndex}`;
}

function toShiftEnum(shift: "morning" | "afternoon"): "MORNING" | "AFTERNOON" {
  return shift === "morning" ? "MORNING" : "AFTERNOON";
}

function toDateObj(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export async function createReservationBatchInDb(
  data: CreateReservationBatchInput,
  surgeonId: string,
  options?: CreateReservationBatchOptions
): Promise<CreateReservationBatchResult> {
  const parsed = createReservationBatchSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { ok: false, error: "invalid_data", message: first?.message ?? "Datos inválidos" };
  }

  const { slots, patients } = parsed.data;
  const normalizedSlots = [...slots].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.shift !== b.shift) return a.shift.localeCompare(b.shift);
    if (a.resourceId !== b.resourceId) return a.resourceId.localeCompare(b.resourceId);
    return a.slotIndex - b.slotIndex;
  });

  const unique = new Set<string>();
  for (const slot of normalizedSlots) {
    const k = slotKey(slot);
    if (unique.has(k)) {
      return { ok: false, error: "invalid_data", message: "No puede repetir slots en la creación en bloque." };
    }
    unique.add(k);
  }

  const origin = options?.origin ?? "APP";
  const originPrisma = origin === "EMAIL" ? "EMAIL" : origin === "GESTOR" ? "GESTOR" : "APP";
  const actorUserId = options?.actorUserId ?? surgeonId;
  const externalSurgeonName = options?.externalSurgeonName?.trim() || null;
  const firstSlotKey = slotKey(normalizedSlots[0]!);
  const hasFirstSlotPatients = (patients?.length ?? 0) > 0;

  const reservationIds: string[] = [];
  const eventQueue: Array<{
    reservationId: string;
    eventType: "RESERVATION_CREATED" | "RESERVATION_UPDATED";
    detailsJson: Record<string, unknown>;
  }> = [];

  try {
    await prisma.$transaction(async (tx) => {
      // Phase 1: validate all target slots in one shot.
      const existingRows = await tx.reservation.findMany({
        where: {
          OR: normalizedSlots.map((s) => ({
            date: toDateObj(s.date),
            resourceId: s.resourceId,
            shift: toShiftEnum(s.shift),
            slotIndex: s.slotIndex,
          })),
        },
        select: {
          id: true,
          date: true,
          resourceId: true,
          shift: true,
          slotIndex: true,
          status: true,
          surgeonId: true,
          _count: { select: { patients: true } },
        },
      });

      const byKey = new Map<string, (typeof existingRows)[number]>();
      existingRows.forEach((r) => {
        const k = `${r.date.toISOString().slice(0, 10)}__${r.resourceId}__${r.shift === "MORNING" ? "morning" : "afternoon"}__${r.slotIndex}`;
        byKey.set(k, r);
      });

      for (const slot of normalizedSlots) {
        const existing = byKey.get(slotKey(slot));
        if (!existing) continue;
        if (existing.status === "PENDING" || existing.status === "CONFIRMED") {
          const reusableEmptyHold = existing.surgeonId === surgeonId && existing._count.patients === 0;
          if (!reusableEmptyHold) {
            throw new Error("SLOT_OCCUPIED");
          }
        }
      }

      // Phase 2: create/update every slot; any failure rolls back all block.
      for (const slot of normalizedSlots) {
        const k = slotKey(slot);
        const existing = byKey.get(k);

        if (!existing) {
          const created = await tx.reservation.create({
            data: {
              date: toDateObj(slot.date),
              resourceId: slot.resourceId,
              shift: toShiftEnum(slot.shift),
              slotIndex: slot.slotIndex,
              surgeonId,
              externalSurgeonName,
              status: k === firstSlotKey && hasFirstSlotPatients ? "CONFIRMED" : "PENDING",
              origin: originPrisma,
              createdByUserId: actorUserId,
              updatedByUserId: actorUserId,
              patients:
                k === firstSlotKey && hasFirstSlotPatients
                  ? {
                      create: patients.map((p, i) => ({
                        historyNumber: p.historyNumber,
                        fullName: p.fullName ?? null,
                        procedure: p.procedure,
                        estimatedDurationMinutes: p.estimatedDurationMinutes,
                        anesthesiaType: p.anesthesiaType,
                        insuranceType: p.insuranceType,
                        admissionType: p.admissionType ?? null,
                        orderIndex: p.orderIndex ?? i,
                        notes: p.notes ?? null,
                        solicitudRecursos: p.solicitudRecursos ?? null,
                      })),
                    }
                  : undefined,
            },
            select: { id: true },
          });
          reservationIds.push(created.id);
          eventQueue.push({
            reservationId: created.id,
            eventType: "RESERVATION_CREATED",
            detailsJson: {
              date: slot.date,
              resourceId: slot.resourceId,
              shift: slot.shift,
              slotIndex: slot.slotIndex,
              isBatchCreation: options?.isBatchCreation === true,
            },
          });
          continue;
        }

        if (existing.status === "CANCELLED" || existing.status === "RELEASED") {
          await tx.patientInBlock.deleteMany({ where: { reservationId: existing.id } });
          await tx.reservation.update({
            where: { id: existing.id },
            data: {
              surgeonId,
              externalSurgeonName,
              status: k === firstSlotKey && hasFirstSlotPatients ? "CONFIRMED" : "PENDING",
              origin: originPrisma,
              createdByUserId: actorUserId,
              updatedByUserId: actorUserId,
              cancelledAt: null,
              cancellationReason: null,
              releasedAt: null,
              releaseReason: null,
            },
          });
          if (k === firstSlotKey && hasFirstSlotPatients) {
            for (let i = 0; i < patients.length; i++) {
              const p = patients[i]!;
              await tx.patientInBlock.create({
                data: {
                  reservationId: existing.id,
                  historyNumber: p.historyNumber,
                  fullName: p.fullName ?? null,
                  procedure: p.procedure,
                  estimatedDurationMinutes: p.estimatedDurationMinutes,
                  anesthesiaType: p.anesthesiaType,
                  insuranceType: p.insuranceType,
                  admissionType: p.admissionType ?? null,
                  orderIndex: p.orderIndex ?? i,
                  notes: p.notes ?? null,
                  solicitudRecursos: p.solicitudRecursos ?? null,
                },
              });
            }
          }
          reservationIds.push(existing.id);
          eventQueue.push({
            reservationId: existing.id,
            eventType: "RESERVATION_CREATED",
            detailsJson: {
              date: slot.date,
              resourceId: slot.resourceId,
              shift: slot.shift,
              slotIndex: slot.slotIndex,
              reusedFrom: existing.status,
              isBatchCreation: options?.isBatchCreation === true,
            },
          });
          continue;
        }

        // existing pending/confirmed and reusable empty hold by same surgeon.
        if (k === firstSlotKey && hasFirstSlotPatients) {
          for (let i = 0; i < patients.length; i++) {
            const p = patients[i]!;
            await tx.patientInBlock.create({
              data: {
                reservationId: existing.id,
                historyNumber: p.historyNumber,
                fullName: p.fullName ?? null,
                procedure: p.procedure,
                estimatedDurationMinutes: p.estimatedDurationMinutes,
                anesthesiaType: p.anesthesiaType,
                insuranceType: p.insuranceType,
                admissionType: p.admissionType ?? null,
                orderIndex: p.orderIndex ?? i,
                notes: p.notes ?? null,
                solicitudRecursos: p.solicitudRecursos ?? null,
              },
            });
          }
          await tx.reservation.update({
            where: { id: existing.id },
            data: {
              status: "CONFIRMED",
              externalSurgeonName,
              updatedByUserId: actorUserId,
            },
          });
          eventQueue.push({
            reservationId: existing.id,
            eventType: "RESERVATION_UPDATED",
            detailsJson: {
              action: "add_patients_to_empty_hold",
              date: slot.date,
              resourceId: slot.resourceId,
              shift: slot.shift,
              slotIndex: slot.slotIndex,
              patientCount: patients.length,
              isBatchCreation: options?.isBatchCreation === true,
            },
          });
        } else {
          await tx.reservation.update({
            where: { id: existing.id },
            data: {
              externalSurgeonName,
              updatedByUserId: actorUserId,
            },
          });
        }
        reservationIds.push(existing.id);
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_OCCUPIED") {
      return { ok: false, error: "slot_occupied", message: "Uno o más huecos ya no están disponibles." };
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      (err.code === "P2002" || err.code === "P2034")
    ) {
      return { ok: false, error: "slot_occupied", message: "Conflicto concurrente al crear el bloque. Intente de nuevo." };
    }
    throw err;
  }

  for (const ev of eventQueue) {
    await logReservationEvent({
      eventType: ev.eventType,
      reservationId: ev.reservationId,
      actorUserId,
      origin: origin.toLowerCase() as "app" | "email" | "gestor",
      detailsJson: ev.detailsJson,
    });
  }

  return { ok: true, reservationIds };
}
