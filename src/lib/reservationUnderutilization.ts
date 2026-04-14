/**
 * Detección de holgura amplia en bloques reservados (misma lógica de minutos que el modal de programación).
 * Agrupa tramos consecutivos mismo día/sala/turno/cirujano titular.
 */

import type { Reservation, Shift } from "@/lib/types";
import { LARGE_BLOCK_REMAINDER_MINUTES } from "@/lib/constants";
import { getSlotDurationMinutes, getEffectiveTotalMinutes } from "@/lib/utils";

/**
 * A partir de este tiempo libre (min) se sugiere “caso medio” en lugar de “corto”.
 * Coherente con tramos de 60–90 min típicos: ≥90 suele alcanzar para un procedimiento medio + margen.
 */
export const HOLGURA_SUGGESTION_MEDIUM_MINUTES = 90;

/** Nivel de sugerencia operativa (solo si ya hay holgura ≥ LARGE_BLOCK_REMAINDER_MINUTES). */
export type HolguraSuggestionLevel = "short" | "medium";

/**
 * Regla: menos de 60 min → null (no entra en infrautilizado). 60–89 → corto. ≥90 → medio.
 * Textos prudentes (“podría”), sin prometer encaje real (anestesia, recursos, etc.).
 */
export function holguraSuggestionLevel(minutesFree: number): HolguraSuggestionLevel | null {
  if (minutesFree < LARGE_BLOCK_REMAINDER_MINUTES) return null;
  if (minutesFree < HOLGURA_SUGGESTION_MEDIUM_MINUTES) return "short";
  return "medium";
}

export function holguraSuggestionBadgeLabel(level: HolguraSuggestionLevel): string {
  return level === "medium" ? "Caso medio" : "Caso corto";
}

/** Frase para tooltip o línea secundaria. */
export function holguraSuggestionPhrase(minutesFree: number): string | null {
  const level = holguraSuggestionLevel(minutesFree);
  if (!level) return null;
  return level === "medium"
    ? "Podría caber otro caso medio (orientativo)."
    : "Podría caber otro caso corto (orientativo).";
}

export interface UnderutilizationHint {
  /** Minutos libres estimados (reservado − tiempo efectivo de pacientes). */
  minutesFree: number;
  /** Número de tramos (slots) consecutivos en el grupo. */
  slotSpan: number;
}

/** Una fila del resumen semanal de bloques con holgura amplia (primer tramo del grupo). */
export interface UnderutilizedBlockSummary {
  date: string;
  firstReservationId: string;
  resourceId: string;
  shift: Shift;
  /** Primer slotIndex del bloque consecutivo (para enlace a programación en /cirujano). */
  startSlotIndex: number;
  surgeonId: string;
  minutesFree: number;
  slotSpan: number;
  patientCount: number;
}

function isActiveReservation(r: Reservation): boolean {
  return r.status !== "cancelled" && r.status !== "released";
}

/** Agrupa reservas consecutivas por slotIndex (mismo date, resourceId, shift, surgeonId). */
export function groupConsecutiveReservationChains(reservations: Reservation[]): Reservation[][] {
  const byKey = new Map<string, Reservation[]>();
  for (const r of reservations) {
    if (!isActiveReservation(r)) continue;
    const key = `${r.date}\0${r.resourceId}\0${r.shift}\0${r.surgeonId}`;
    const arr = byKey.get(key) ?? [];
    arr.push(r);
    byKey.set(key, arr);
  }
  const chains: Reservation[][] = [];
  for (const arr of byKey.values()) {
    arr.sort((a, b) => a.slotIndex - b.slotIndex);
    let chain: Reservation[] = [];
    for (const r of arr) {
      if (chain.length === 0) {
        chain = [r];
      } else {
        const last = chain[chain.length - 1]!;
        if (r.slotIndex === last.slotIndex + 1) {
          chain.push(r);
        } else {
          chains.push(chain);
          chain = [r];
        }
      }
    }
    if (chain.length > 0) chains.push(chain);
  }
  return chains;
}

function chainReservedMinutes(chain: Reservation[]): number {
  return chain.reduce((sum, r) => sum + getSlotDurationMinutes(r.shift, r.slotIndex), 0);
}

function chainUsedMinutes(chain: Reservation[]): number {
  const allPatients = chain.flatMap((r) => r.patients ?? []);
  return getEffectiveTotalMinutes(allPatients);
}

/**
 * Lista ordenada (fecha → recurso → turno) de bloques con holgura ≥ umbral.
 */
export function listUnderutilizedBlocks(
  reservations: Reservation[],
  thresholdMinutes: number = LARGE_BLOCK_REMAINDER_MINUTES
): UnderutilizedBlockSummary[] {
  const chains = groupConsecutiveReservationChains(reservations);
  const out: UnderutilizedBlockSummary[] = [];
  for (const chain of chains) {
    const reserved = chainReservedMinutes(chain);
    const used = chainUsedMinutes(chain);
    const remainder = reserved - used;
    if (remainder < thresholdMinutes) continue;
    const first = chain[0]!;
    const allPatients = chain.flatMap((r) => r.patients ?? []);
    out.push({
      date: first.date,
      firstReservationId: first.id,
      resourceId: first.resourceId,
      shift: first.shift,
      startSlotIndex: first.slotIndex,
      surgeonId: first.surgeonId,
      minutesFree: Math.max(0, Math.round(remainder)),
      slotSpan: chain.length,
      patientCount: allPatients.length,
    });
  }
  out.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const rc = a.resourceId.localeCompare(b.resourceId);
    if (rc !== 0) return rc;
    if (a.shift !== b.shift) return a.shift.localeCompare(b.shift);
    return 0;
  });
  return out;
}

/**
 * Orden para el panel del gestor: más minutos libres primero (mayor oportunidad de aprovechamiento).
 * Empates: fecha ascendente → recurso → turno (orden estable tipo agenda).
 */
export function sortUnderutilizedBlocksForGestorPanel(blocks: UnderutilizedBlockSummary[]): UnderutilizedBlockSummary[] {
  return [...blocks].sort((a, b) => {
    if (b.minutesFree !== a.minutesFree) return b.minutesFree - a.minutesFree;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const rc = a.resourceId.localeCompare(b.resourceId);
    if (rc !== 0) return rc;
    return a.shift.localeCompare(b.shift);
  });
}

/**
 * Mapa reservationId → hint solo para la primera reserva de cada cadena con holgura ≥ umbral.
 */
export function buildUnderutilizationHintsByReservationId(
  reservations: Reservation[],
  thresholdMinutes: number = LARGE_BLOCK_REMAINDER_MINUTES
): Map<string, UnderutilizationHint> {
  const map = new Map<string, UnderutilizationHint>();
  for (const b of listUnderutilizedBlocks(reservations, thresholdMinutes)) {
    map.set(b.firstReservationId, { minutesFree: b.minutesFree, slotSpan: b.slotSpan });
  }
  return map;
}

export function countUnderutilizedGroups(reservations: Reservation[], thresholdMinutes?: number): number {
  return listUnderutilizedBlocks(reservations, thresholdMinutes ?? LARGE_BLOCK_REMAINDER_MINUTES).length;
}

/** Query string para abrir /cirujano con día, sala, turno y tramos del bloque preseleccionados. */
export function buildCirujanoProgramDeepLink(block: UnderutilizedBlockSummary): string {
  const q = new URLSearchParams({
    programDate: block.date,
    resourceId: block.resourceId,
    shift: block.shift,
    startSlot: String(block.startSlotIndex),
    span: String(block.slotSpan),
    surgeonId: block.surgeonId,
  });
  return `/cirujano?${q.toString()}`;
}
