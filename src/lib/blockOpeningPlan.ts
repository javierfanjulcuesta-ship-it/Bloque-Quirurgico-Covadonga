/**
 * Lógica de apertura del bloque quirúrgico.
 * - Verifica si un slot puede reservarse según BlockOpeningPlan
 * - Calcula minutos programados por recurso/turno
 * - Determina si la apertura es "justificable" (minutos >= umbral)
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { TRANSITION_MINUTES_PER_PROCEDURE } from "@/lib/constants";
import type { Shift } from "./types";

export type BlockOpeningStatus = "OPEN" | "CLOSED" | "URGENT_RESERVED";
export type DbClient = PrismaClient | Prisma.TransactionClient;

export interface BlockOpeningPlanView {
  id: string;
  date: string;
  resourceId: string;
  shift: Shift;
  status: BlockOpeningStatus;
  minRequiredMinutes: number;
  reservedUrgentMinutes: number;
  notes: string | null;
  approvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Resultado de comprobación: ¿puede un usuario reservar en este (date, resourceId, shift)? */
export type CanReserveResult =
  | { ok: true }
  | { ok: false; reason: "block_closed"; message: string }
  | { ok: false; reason: "block_urgent_reserved"; message: string };

function shiftToDb(shift: Shift): "MORNING" | "AFTERNOON" {
  return shift === "morning" ? "MORNING" : "AFTERNOON";
}

function toView(plan: {
  id: string;
  date: Date;
  resourceId: string;
  shift: "MORNING" | "AFTERNOON";
  status: BlockOpeningStatus;
  minRequiredMinutes: number;
  reservedUrgentMinutes: number;
  notes: string | null;
  approvedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): BlockOpeningPlanView {
  return {
    id: plan.id,
    date: plan.date.toISOString().slice(0, 10),
    resourceId: plan.resourceId,
    shift: plan.shift === "MORNING" ? "morning" : "afternoon",
    status: plan.status,
    minRequiredMinutes: plan.minRequiredMinutes,
    reservedUrgentMinutes: plan.reservedUrgentMinutes,
    notes: plan.notes,
    approvedByUserId: plan.approvedByUserId,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

/**
 * Comprueba el estado persistido del bloque. Los gestores pueden hacer override
 * deliberado; cirujanos/endoscopistas no pueden reservar CLOSED/URGENT_RESERVED.
 * La ausencia de plan mantiene compatibilidad: se interpreta como OPEN.
 */
export async function canReserveSlot(
  dateStr: string,
  resourceId: string,
  shift: Shift,
  isGestor: boolean,
  db: DbClient = prisma,
): Promise<CanReserveResult> {
  if (isGestor) return { ok: true };

  const plan = await db.blockOpeningPlan.findUnique({
    where: {
      date_resourceId_shift: {
        date: new Date(`${dateStr}T00:00:00.000Z`),
        resourceId,
        shift: shiftToDb(shift),
      },
    },
    select: { status: true },
  });

  if (!plan || plan.status === "OPEN") return { ok: true };
  if (plan.status === "CLOSED") {
    return {
      ok: false,
      reason: "block_closed",
      message: "El bloque está cerrado para reservas en ese recurso y turno.",
    };
  }
  return {
    ok: false,
    reason: "block_urgent_reserved",
    message: "El bloque está reservado para urgencias en ese recurso y turno.",
  };
}

/**
 * Calcula los minutos programados en un (date, shift, resource).
 * Suma: estimatedDurationMinutes + TRANSITION_MINUTES_PER_PROCEDURE por cada paciente.
 */
export async function getProgrammedMinutes(
  dateStr: string,
  resourceId: string,
  shift: Shift,
  db: DbClient = prisma,
): Promise<number> {
  const dateObj = new Date(`${dateStr}T00:00:00.000Z`);
  const reservations = await db.reservation.findMany({
    where: {
      date: dateObj,
      resourceId,
      shift: shiftToDb(shift),
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
  minRequiredMinutes: number,
): boolean {
  if (minRequiredMinutes <= 0) return false;
  return programmedMinutes < minRequiredMinutes;
}

/** Obtiene el plan persistido para un (date, resourceId, shift). */
export async function getBlockOpeningPlan(
  dateStr: string,
  resourceId: string,
  shift: Shift,
  db: DbClient = prisma,
): Promise<BlockOpeningPlanView | null> {
  const plan = await db.blockOpeningPlan.findUnique({
    where: {
      date_resourceId_shift: {
        date: new Date(`${dateStr}T00:00:00.000Z`),
        resourceId,
        shift: shiftToDb(shift),
      },
    },
  });
  return plan ? toView(plan as Parameters<typeof toView>[0]) : null;
}

/** Serializa un registro Prisma BlockOpeningPlan para la API. */
export function toBlockOpeningPlanView(plan: Parameters<typeof toView>[0]): BlockOpeningPlanView {
  return toView(plan);
}
