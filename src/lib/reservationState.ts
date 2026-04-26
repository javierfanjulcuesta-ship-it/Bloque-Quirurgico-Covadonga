import type { Reservation, ReservationBlockState } from "@/lib/types";
import { getSlotDurationMinutes, getEffectiveTotalMinutes } from "@/lib/utils";

export interface ReservationTimingSummary {
  totalMinutes: number;
  usedMinutes: number;
  freeMinutes: number;
}

export function getReservationTimingSummary(reservation: Reservation): ReservationTimingSummary {
  const totalMinutes = getSlotDurationMinutes(reservation.shift, reservation.slotIndex);
  const usedMinutes = Math.max(0, getEffectiveTotalMinutes(reservation.patients ?? []));
  const freeMinutes = Math.max(0, totalMinutes - usedMinutes);
  return { totalMinutes, usedMinutes, freeMinutes };
}

export function deriveReservationBlockState(reservation: Reservation): ReservationBlockState {
  if (reservation.status === "cancelled" || reservation.status === "released") return "CANCELLED";
  const patientCount = reservation.patients?.length ?? 0;
  if (patientCount === 0) return "EMPTY";
  const timing = getReservationTimingSummary(reservation);
  return timing.usedMinutes >= timing.totalMinutes ? "FULL" : "PARTIAL";
}
