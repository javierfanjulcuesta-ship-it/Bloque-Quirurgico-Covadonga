/**
 * Lógica de apertura del bloque quirúrgico.
 * - Verifica si un slot puede reservarse según BlockOpeningPlan
 * - Calcula minutos programados por recurso/turno
 * - Determina si la apertura es "justificable" (minutos >= umbral)
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
 * - CLOSED → no puede reservar
 * - URGENT_RESERVED → no puede reservar (capacidad protegida para urgencias)
 * - OPEN o sin plan → puede reservar (por defecto OPEN para compatibilidad)
 */
export async function canReserveSlot(
  dateStr: string,
  resourceId: string,
  shift: Shift,
  isGestor: boolean
): Promise<CanReserveResult> {
  if (isGestor) return { ok: true };

  const dateObj = new Date(dateStr + "T00:00:00.000Z");
  const shiftEnum = shift === "morning" ? "MORNING" : "AFTERNOON";

  const plan = await prisma.blockOpeningPlan.findUnique({
    where: {
      date_resourceId_shift: { date: dateObj, resourceId, shift: shiftEnum },
    },
  });

  if (!plan) return { ok: true }; // Sin plan = OPEN por defecto

  if (plan.status === "CLOSED") {
    return {
      ok: false,
      reason: "block_closed",
      message: "El recurso está cerrado para este turno. No se aceptan reservas.",
    };
  }

  if (plan.status === "URGENT_RESERVED") {
    return {
      ok: false,
      reason: "block_urgent_reserved",
      message: "Este turno está reservado para urgencias. No se aceptan reservas normales.",
    };
  }

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
 * Si no existe, devuelve null (interpretado como OPEN por defecto).
 */
export async function getBlockOpeningPlan(
  dateStr: string,
  resourceId: string,
  shift: Shift
) {
  const dateObj = new Date(dateStr + "T00:00:00.000Z");
  const shiftEnum = shift === "morning" ? "MORNING" : "AFTERNOON";

  const plan = await prisma.blockOpeningPlan.findUnique({
    where: {
      date_resourceId_shift: { date: dateObj, resourceId, shift: shiftEnum },
    },
  });

  if (!plan) return null;

  return {
    id: plan.id,
    date: dateObj.toISOString().slice(0, 10),
    shift: plan.shift === "MORNING" ? "morning" : "afternoon",
    resourceId: plan.resourceId,
    status: plan.status,
    minRequiredMinutes: plan.minRequiredMinutes,
    reservedUrgentMinutes: plan.reservedUrgentMinutes,
    notes: plan.notes ?? undefined,
    approvedByUserId: plan.approvedByUserId ?? undefined,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}
