import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { acquireSchedulingContextLock, schedulingContextLockKey } from "./bookingContextLock";
import {
  findOverflowConflictAgainstOccupiedSlots,
  findOverflowInvaderForTargetSlot,
  getActiveReservationsInContext,
} from "./overflowConflicts";
import { getEffectiveTotalMinutes, getSlots } from "@/lib/utils";
import { recognizeResourceId } from "@/lib/program/recognizeResource";

export interface RescheduleInput {
  reservationId: string;
  actorUserId: string;
  date: string;
  resourceId: string;
  shift: "morning" | "afternoon";
  slotIndex: number;
}

export type RescheduleResult =
  | { ok: true }
  | { ok: false; status: number; error: string; code?: string };

export async function rescheduleReservation(input: RescheduleInput, db: PrismaClient = prisma): Promise<RescheduleResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !recognizeResourceId(input.resourceId)) {
    return { ok: false, status: 400, error: "Fecha o quirófano no válidos." };
  }
  if (!Number.isInteger(input.slotIndex) || input.slotIndex < 0 || input.slotIndex >= getSlots(input.shift).length) {
    return { ok: false, status: 400, error: "Tramo no válido." };
  }

  const current = await db.reservation.findUnique({
    where: { id: input.reservationId },
    include: { patients: true },
  });
  if (!current || (current.status !== "PENDING" && current.status !== "CONFIRMED")) {
    return { ok: false, status: 404, error: "Reserva no encontrada." };
  }

  const before = {
    date: current.date.toISOString().slice(0, 10),
    resourceId: current.resourceId,
    shift: current.shift === "AFTERNOON" ? "afternoon" : "morning",
    slotIndex: current.slotIndex,
  };
  const after = {
    date: input.date,
    resourceId: input.resourceId,
    shift: input.shift,
    slotIndex: input.slotIndex,
  };
  const same = before.date === after.date && before.resourceId === after.resourceId && before.shift === after.shift && before.slotIndex === after.slotIndex;
  if (same) return { ok: true };

  const targetShift = input.shift === "afternoon" ? "AFTERNOON" : "MORNING";
  const contexts = [
    { date: before.date, resourceId: before.resourceId, shift: before.shift as "morning" | "afternoon" },
    { date: after.date, resourceId: after.resourceId, shift: after.shift },
  ].sort((a, b) => schedulingContextLockKey(a).localeCompare(schedulingContextLockKey(b)));

  return db.$transaction(async (tx) => {
    for (const context of contexts) await acquireSchedulingContextLock(tx, context);
    const live = await tx.reservation.findUnique({ where: { id: input.reservationId }, include: { patients: true } });
    if (!live || (live.status !== "PENDING" && live.status !== "CONFIRMED")) {
      return { ok: false, status: 404, error: "Reserva no encontrada." } as const;
    }
    const occupied = await tx.reservation.findFirst({
      where: {
        id: { not: live.id },
        date: new Date(`${input.date}T00:00:00.000Z`),
        resourceId: input.resourceId,
        shift: targetShift,
        slotIndex: input.slotIndex,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      select: { id: true },
    });
    if (occupied) return { ok: false, status: 409, error: "El hueco ya está ocupado.", code: "slot_occupied" } as const;

    const active = await getActiveReservationsInContext(tx, {
      date: input.date,
      resourceId: input.resourceId,
      shift: input.shift,
    });
    const others = active.filter((reservation) => reservation.id !== live.id);
    const used = Math.max(0, getEffectiveTotalMinutes(live.patients.filter((patient) => patient.workflowStatus !== "SUSPENDED")));
    const invader = findOverflowInvaderForTargetSlot({
      reservations: others,
      shift: input.shift,
      targetSlotIndex: input.slotIndex,
      targetSurgeonId: live.surgeonId,
      excludeReservationId: live.id,
    });
    if (invader) {
      return { ok: false, status: 409, error: "El hueco está invadido por otra reserva.", code: "overflow_conflict" } as const;
    }
    const overflow = findOverflowConflictAgainstOccupiedSlots({
      reservations: others,
      shift: input.shift,
      ownerReservationId: live.id,
      ownerSlotIndex: input.slotIndex,
      ownerUsedMinutes: used,
    });
    if (overflow) {
      return { ok: false, status: 409, error: "La duración invade un tramo ocupado.", code: "overflow_conflict" } as const;
    }

    await tx.reservation.update({
      where: { id: live.id },
      data: {
        date: new Date(`${input.date}T00:00:00.000Z`),
        resourceId: input.resourceId,
        shift: targetShift,
        slotIndex: input.slotIndex,
        updatedByUserId: input.actorUserId,
      },
    });
    await tx.scheduleChange.create({
      data: {
        reservationId: live.id,
        changeType: "RESCHEDULE",
        actorUserId: input.actorUserId,
      },
    });
    return { ok: true } as const;
  });
}
