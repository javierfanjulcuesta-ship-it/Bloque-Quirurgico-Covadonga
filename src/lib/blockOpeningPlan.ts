/**
 * Lógica de apertura del bloque quirúrgico.
 * - Verifica si un slot puede reservarse según BlockOpeningPlan
 * - Calcula minutos programados por recurso/turno
 * - Determina si la apertura es "justificable" (minutos >= umbral)
 *
 * NOTA: BlockOpeningPlan no existe en schema desplegado. canReserveSlot siempre permite reservar.
 */

import { prisma } from "@/lib/db/prisma";
import { TRANSITION_MINUTES_PER_PROCEDURE } from "@/lib/constants";
import type { ResourceId, Shift } from "./types";

export type BlockOpeningStatus = "OPEN" | "CLOSED" | "URGENT_RESERVED";

/** Resultado de comprobación: ¿puede un usuario normal reservar en este (date, resourceId, shift)? */
export type CanReserveResult =
  | { ok: true }
  | { ok: false; reason: "block_closed"; message: string }
  | { ok: false; reason: "block_urgent_reserved"; message: string };

/**
 * Comprueba si un usuario normal (cirujano/endoscopista) puede reservar en un slot.
 * Modelo BlockOpeningPlan no existe en schema desplegado → siempre permite reservar.
 */
export async function canReserveSlot(
  _dateStr: string,
  _resourceId: string,
  _shift: Shift,
  isGestor: boolean
): Promise<CanReserveResult> {
  if (isGestor) return { ok: true };
  // BlockOpeningPlan no existe en schema. Tratar todos los slots como OPEN.
  return { ok: true };
}

/**
 * Calcula los minutos programados en un (date, shift, resource).
 * Suma: estimatedDurationMinutes + TRANSITION_MINUTES_PER_PROCEDURE por cada paciente.
 */
export async function getProgrammedMinutes(
  dateStr: string,
  resourceId: string,
  shift: Shift
): Promise<number> {
  const dateObj = new Date(dateStr + "T00:00:00.000Z");
  const shiftEnum = shift === "morning" ? "MORNING" : "AFTERNOON";

  const reservations = await prisma.reservation.findMany({
    where: {
      date: dateObj,
      resourceId,
      shift: shiftEnum,
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    include: { patients: true },
  });

  let total = 0;
  for (const r of reservations) {
    for (const p of r.patients) {
      total += (p.estimatedDurationMinutes || 0) + TRANSITION_MINUTES_PER_PROCEDURE;
    }
  }
  return total;
}

/**
 * Indica si un recurso es "no justificable": minutos programados < minRequiredMinutes.
 * Solo tiene sentido cuando status=OPEN y minRequiredMinutes > 0.
 */
export function isBelowJustificationThreshold(
  programmedMinutes: number,
  minRequiredMinutes: number
): boolean {
  if (minRequiredMinutes <= 0) return false;
  return programmedMinutes < minRequiredMinutes;
}

/**
 * Obtiene el plan de apertura para un (date, resourceId, shift).
 * BlockOpeningPlan no existe en schema desplegado → siempre devuelve null.
 */
export async function getBlockOpeningPlan(
  _dateStr: string,
  _resourceId: string,
  _shift: Shift
): Promise<null> {
  return null;
}
