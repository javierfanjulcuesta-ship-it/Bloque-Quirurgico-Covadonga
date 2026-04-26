import type { Prisma, PrismaClient } from "@prisma/client";
import { getEffectiveTotalMinutes, getSlotDurationMinutes, getSlots } from "@/lib/utils";

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface ActiveReservationInContext {
  id: string;
  surgeonId: string;
  slotIndex: number;
  patients: Array<{ estimatedDurationMinutes: number }>;
}

export async function getActiveReservationsInContext(
  db: DbClient,
  params: { date: string; resourceId: string; shift: "morning" | "afternoon" }
): Promise<ActiveReservationInContext[]> {
  const dateObj = new Date(`${params.date}T00:00:00.000Z`);
  const shiftEnum = params.shift === "morning" ? "MORNING" : "AFTERNOON";
  const rows = await db.reservation.findMany({
    where: {
      date: dateObj,
      resourceId: params.resourceId,
      shift: shiftEnum,
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: {
      id: true,
      surgeonId: true,
      slotIndex: true,
      patients: { select: { estimatedDurationMinutes: true } },
    },
  });
  return rows;
}

function overflowInvadedSlots(
  shift: "morning" | "afternoon",
  slotIndex: number,
  usedMinutes: number
): number[] {
  const baseMinutes = getSlotDurationMinutes(shift, slotIndex);
  let overflow = usedMinutes - baseMinutes;
  if (overflow <= 0) return [];

  const invaded: number[] = [];
  const slotCount = getSlots(shift).length;
  for (let next = slotIndex + 1; next < slotCount && overflow > 0; next++) {
    invaded.push(next);
    overflow -= getSlotDurationMinutes(shift, next);
  }
  return invaded;
}

export function findOverflowInvaderForTargetSlot(params: {
  reservations: ActiveReservationInContext[];
  shift: "morning" | "afternoon";
  targetSlotIndex: number;
  targetSurgeonId: string;
  excludeReservationId?: string;
}): ActiveReservationInContext | null {
  for (const r of params.reservations) {
    if (params.excludeReservationId && r.id === params.excludeReservationId) continue;
    // Permite bloques del mismo titular (flujo actual de varios tramos consecutivos).
    if (r.surgeonId === params.targetSurgeonId) continue;
    if ((r.patients?.length ?? 0) <= 0) continue;
    const used = Math.max(0, getEffectiveTotalMinutes(r.patients));
    const invaded = overflowInvadedSlots(params.shift, r.slotIndex, used);
    if (invaded.includes(params.targetSlotIndex)) return r;
  }
  return null;
}

export function findOverflowConflictAgainstOccupiedSlots(params: {
  reservations: ActiveReservationInContext[];
  shift: "morning" | "afternoon";
  ownerReservationId?: string;
  ownerSlotIndex: number;
  ownerUsedMinutes: number;
}): ActiveReservationInContext | null {
  const invaded = overflowInvadedSlots(params.shift, params.ownerSlotIndex, params.ownerUsedMinutes);
  if (invaded.length === 0) return null;

  for (const slotIdx of invaded) {
    const occupied = params.reservations.find(
      (r) =>
        r.slotIndex === slotIdx &&
        (params.ownerReservationId ? r.id !== params.ownerReservationId : true) &&
        (r.patients?.length ?? 0) > 0
    );
    if (occupied) return occupied;
  }
  return null;
}
