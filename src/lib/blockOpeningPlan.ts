/**
 * Lógica de apertura del bloque quirúrgico.
 * - Verifica si un slot puede reservarse según BlockOpeningPlan y overrides por slot
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

export type CanReserveResult =
  | { ok: true }
  | { ok: false; reason: "block_closed"; message: string }
  | { ok: false; reason: "block_urgent_reserved"; message: string };

function shiftToDb(shift: Shift): "MORNING" | "AFTERNOON" {
  return shift === "morning" ? "MORNING" : "AFTERNOON";
}

function statusResult(status: BlockOpeningStatus, scope: "slot" | "shift"): CanReserveResult {
  if (status === "OPEN") return { ok: true };
  if (status === "CLOSED") {
    return {
      ok: false,
      reason: "block_closed",
      message: scope === "slot"
        ? "Este tramo horario está cerrado para reservas."
        : "El bloque está cerrado para reservas en ese recurso y turno.",
    };
  }
  return {
    ok: false,
    reason: "block_urgent_reserved",
    message: scope === "slot"
      ? "Este tramo horario está reservado para urgencias."
      : "El bloque está reservado para urgencias en ese recurso y turno.",
  };
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
 * Comprueba primero un override exacto por slot y, si no existe, el plan grueso
 * del turno. Gestor conserva override deliberado. La ausencia de ambos = OPEN.
 */
export async function canReserveSlot(
  dateStr: string,
  resourceId: string,
  shift: Shift,
  slotIndex: number,
  isGestor: boolean,
  db: DbClient = prisma,
): Promise<CanReserveResult> {
  if (isGestor) return { ok: true };
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const shiftDb = shiftToDb(shift);

  const slotPlan = await db.blockSlotOpeningPlan.findUnique({
    where: {
      date_resourceId_shift_slotIndex: { date, resourceId, shift: shiftDb, slotIndex },
    },
    select: { status: true },
  });
  if (slotPlan) return statusResult(slotPlan.status, "slot");

  const plan = await db.blockOpeningPlan.findUnique({
    where: {
      date_resourceId_shift: { date, resourceId, shift: shiftDb },
    },
    select: { status: true },
  });
  return plan ? statusResult(plan.status, "shift") : { ok: true };
}

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
    for (const p of r.patients) total += (p.estimatedDurationMinutes || 0) + TRANSITION_MINUTES_PER_PROCEDURE;
  }
  return total;
}

export function isBelowJustificationThreshold(programmedMinutes: number, minRequiredMinutes: number): boolean {
  if (minRequiredMinutes <= 0) return false;
  return programmedMinutes < minRequiredMinutes;
}

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

export function toBlockOpeningPlanView(plan: Parameters<typeof toView>[0]): BlockOpeningPlanView {
  return toView(plan);
}
