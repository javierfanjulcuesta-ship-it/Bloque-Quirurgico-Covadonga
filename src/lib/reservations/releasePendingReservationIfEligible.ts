import { prisma } from "@/lib/db/prisma";
import { isReservationRetentionStillAllowed } from "@/lib/schedulingDeadline";
import { withSchedulingContextLock } from "@/lib/reservations/bookingContextLock";
import { writeReservationEvent } from "@/lib/reservations/logReservationEvent";
import type { Shift } from "@/lib/types";

export interface PendingReleaseCandidate {
  id: string;
  date: Date;
  resourceId: string;
  shift: "MORNING" | "AFTERNOON";
  slotIndex: number;
  surgeonId: string;
}

export type PendingReleaseResult =
  | { released: true; reservation: PendingReleaseCandidate }
  | {
      released: false;
      reason: "missing" | "not_pending" | "has_patients" | "retention_still_allowed" | "context_changed";
    };

function apiShift(shift: "MORNING" | "AFTERNOON"): Shift {
  return shift === "MORNING" ? "morning" : "afternoon";
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Libera un hold vacío únicamente después de volver a comprobar su estado dentro
 * del mismo advisory lock que utilizan las mutaciones de reserva/paciente.
 *
 * Estado y evento RESERVATION_RELEASED se escriben en la misma transacción: si la
 * auditoría no puede persistirse, la reserva no queda liberada silenciosamente.
 */
export async function releasePendingReservationIfEligible(
  candidate: PendingReleaseCandidate,
): Promise<PendingReleaseResult> {
  const candidateDate = ymd(candidate.date);
  const candidateShift = apiShift(candidate.shift);

  return withSchedulingContextLock(
    { date: candidateDate, resourceId: candidate.resourceId, shift: candidateShift },
    async (tx) => {
      const live = await tx.reservation.findUnique({
        where: { id: candidate.id },
        select: {
          id: true,
          date: true,
          resourceId: true,
          shift: true,
          slotIndex: true,
          surgeonId: true,
          status: true,
          _count: { select: { patients: true } },
        },
      });

      if (!live) return { released: false, reason: "missing" } as const;
      if (
        ymd(live.date) !== candidateDate ||
        live.resourceId !== candidate.resourceId ||
        live.shift !== candidate.shift ||
        live.slotIndex !== candidate.slotIndex
      ) {
        return { released: false, reason: "context_changed" } as const;
      }
      if (live.status !== "PENDING") {
        return { released: false, reason: "not_pending" } as const;
      }
      if (live._count.patients !== 0) {
        return { released: false, reason: "has_patients" } as const;
      }
      if (isReservationRetentionStillAllowed(candidateDate)) {
        return { released: false, reason: "retention_still_allowed" } as const;
      }

      const releasedAt = new Date();
      const updated = await tx.reservation.updateMany({
        where: {
          id: live.id,
          status: "PENDING",
          patients: { none: {} },
        },
        data: {
          status: "RELEASED",
          releasedAt,
          releaseReason: "cierre_automatico_programacion",
        },
      });

      if (updated.count !== 1) {
        return { released: false, reason: "not_pending" } as const;
      }

      await writeReservationEvent(tx, {
        eventType: "RESERVATION_RELEASED",
        reservationId: live.id,
        actorUserId: null,
        origin: "app",
        detailsJson: {
          trigger: "cron_deadline",
          date: candidateDate,
          resourceId: live.resourceId,
          shift: live.shift,
          slotIndex: live.slotIndex,
        },
      });

      return {
        released: true,
        reservation: {
          id: live.id,
          date: live.date,
          resourceId: live.resourceId,
          shift: live.shift,
          slotIndex: live.slotIndex,
          surgeonId: live.surgeonId,
        },
      } as const;
    },
  );
}
