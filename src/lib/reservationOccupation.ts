import type { Reservation } from "./types";
import { getEffectiveTotalMinutes, getSlotDurationMinutes } from "./utils";

export interface ReservationOccupation {
  reservedMinutes: number;
  occupiedMinutes: number;
  remainingMinutes: number;
  utilizationRatio: number;
  hasClinicalActivity: boolean;
}

export type ReservationVisualState = "empty" | "partial" | "complete";

function hasClinicalActivity(reservation: Reservation): boolean {
  if (!reservation.patients?.length) return false;
  return reservation.patients.some((p) => {
    const history = (p.numeroHistoria ?? "").trim();
    const procedure = (p.procedure ?? "").trim();
    const anesthesia = (p.anesthesiaType ?? "").trim();
    const insurance = (p.entidadFinanciadora ?? "").trim();
    const notes = (p.notes ?? "").trim();
    const hasMeaningfulHistory = history.length > 0 && !history.toUpperCase().startsWith("PEND-");
    const hasMeaningfulProcedure =
      procedure.length > 0 &&
      !procedure.toLowerCase().startsWith("procedimiento pendiente") &&
      !procedure.toLowerCase().includes("[pendiente");
    const hasMeaningfulAnesthesia = anesthesia.length > 0 && anesthesia.toLowerCase() !== "pendiente";
    const hasMeaningfulInsurance = insurance.length > 0 && insurance.toLowerCase() !== "pendiente";
    const hasMeaningfulNotes = notes.length > 0 && !notes.toLowerCase().includes("[pendiente");
    return hasMeaningfulHistory || hasMeaningfulProcedure || hasMeaningfulAnesthesia || hasMeaningfulInsurance || hasMeaningfulNotes;
  });
}

export function calculateReservationOccupation(
  reservation: Reservation,
  reservedMinutesOverride?: number,
  occupiedMinutesOverride?: number
): ReservationOccupation {
  const reservedMinutes =
    typeof reservedMinutesOverride === "number"
      ? Math.max(0, reservedMinutesOverride)
      : Math.max(0, getSlotDurationMinutes(reservation.shift, reservation.slotIndex));
  const occupiedRaw =
    typeof occupiedMinutesOverride === "number"
      ? Math.max(0, occupiedMinutesOverride)
      : Math.max(0, getEffectiveTotalMinutes(reservation.patients ?? []));
  const occupiedMinutes = Math.min(reservedMinutes, occupiedRaw);
  const remainingMinutes = Math.max(0, reservedMinutes - occupiedMinutes);
  const utilizationRatio = reservedMinutes > 0 ? occupiedMinutes / reservedMinutes : 0;
  return {
    reservedMinutes,
    occupiedMinutes,
    remainingMinutes,
    utilizationRatio,
    hasClinicalActivity: hasClinicalActivity(reservation),
  };
}

export function getReservationVisualState(
  reservation: Reservation,
  occupation = calculateReservationOccupation(reservation)
): ReservationVisualState {
  if (occupation.occupiedMinutes <= 0) return "empty";
  if (occupation.occupiedMinutes >= occupation.reservedMinutes) return "complete";
  return "partial";
}

export interface SplitSlotOccupation {
  reservationId: string;
  slotIndex: number;
  reservedMinutes: number;
  occupiedMinutes: number;
  remainingMinutes: number;
}

export interface SequentialProcedurePlacement {
  patientId: string;
  procedure: string;
  startMinuteOffset: number;
  endMinuteOffset: number;
  durationWithBuffer: number;
}

export function placeProceduresSequentially(patients: Array<{
  id?: string;
  procedure?: string;
  estimatedDurationMinutes?: number;
  order?: number;
}>): SequentialProcedurePlacement[] {
  const sorted = [...patients]
    .map((p, i) => ({ ...p, _fallbackOrder: i }))
    .sort((a, b) => (a.order ?? a._fallbackOrder) - (b.order ?? b._fallbackOrder));
  let currentOffset = 0;
  return sorted.map((p, i) => {
    const duration = Math.max(0, (p.estimatedDurationMinutes ?? 0) + 10);
    const placement: SequentialProcedurePlacement = {
      patientId: p.id ?? `patient-${i + 1}`,
      procedure: p.procedure ?? `Procedimiento ${i + 1}`,
      startMinuteOffset: currentOffset,
      endMinuteOffset: currentOffset + duration,
      durationWithBuffer: duration,
    };
    currentOffset += duration;
    return placement;
  });
}

export function getNextFreeMinuteOffset(patients: Array<{
  estimatedDurationMinutes?: number;
  order?: number;
}>): number {
  const placements = placeProceduresSequentially(
    patients.map((p, i) => ({
      id: `patient-${i}`,
      procedure: "",
      estimatedDurationMinutes: p.estimatedDurationMinutes,
      order: p.order,
    }))
  );
  return placements.length > 0 ? placements[placements.length - 1]!.endMinuteOffset : 0;
}

/**
 * Distribuye tiempo ocupado sobre un bloque contiguo del mismo titular/recurso/turno.
 * Si el primer slot acumula toda la carga clínica del bloque, reparte el tiempo de forma secuencial.
 */
export function splitReservationIntoSlots(
  reservation: Reservation,
  sameContextReservations: Reservation[]
): SplitSlotOccupation[] {
  const sorted = [...sameContextReservations]
    .filter(
      (r) =>
        r.date === reservation.date &&
        r.resourceId === reservation.resourceId &&
        r.shift === reservation.shift &&
        r.surgeonId === reservation.surgeonId &&
        (r.externalSurgeonName ?? "") === (reservation.externalSurgeonName ?? "") &&
        r.status !== "cancelled"
    )
    .sort((a, b) => a.slotIndex - b.slotIndex);
  if (sorted.length === 0) return [];

  const currentPos = sorted.findIndex((r) => r.id === reservation.id);
  if (currentPos < 0) return [];

  let start = currentPos;
  while (start > 0 && sorted[start]!.slotIndex === sorted[start - 1]!.slotIndex + 1) start -= 1;
  let end = currentPos;
  while (end < sorted.length - 1 && sorted[end + 1]!.slotIndex === sorted[end]!.slotIndex + 1) end += 1;
  const contiguous = sorted.slice(start, end + 1);

  const totalReserved = contiguous.reduce((sum, r) => sum + getSlotDurationMinutes(r.shift, r.slotIndex), 0);
  const allPatients = contiguous.flatMap((r, reservationOrder) =>
    (r.patients ?? []).map((p, patientOrder) => ({
      id: p.id,
      procedure: p.procedure,
      estimatedDurationMinutes: p.estimatedDurationMinutes,
      order: typeof p.order === "number" ? p.order + reservationOrder * 1000 : patientOrder + reservationOrder * 1000,
    }))
  );
  const placements = placeProceduresSequentially(allPatients);
  const totalOccupiedRaw = placements.length > 0 ? placements[placements.length - 1]!.endMinuteOffset : 0;
  let remainingToAllocate = Math.min(totalReserved, Math.max(0, totalOccupiedRaw));

  return contiguous.map((r) => {
    const slotReserved = getSlotDurationMinutes(r.shift, r.slotIndex);
    const slotOccupied = Math.min(slotReserved, remainingToAllocate);
    remainingToAllocate -= slotOccupied;
    return {
      reservationId: r.id,
      slotIndex: r.slotIndex,
      reservedMinutes: slotReserved,
      occupiedMinutes: slotOccupied,
      remainingMinutes: Math.max(0, slotReserved - slotOccupied),
    };
  });
}
