/**
 * Mueve uno o varios pacientes de una reserva a otra (mismo día), en una transacción.
 * Fase 1: mismo día; el paciente pasa a la reserva cabecera del bloque destino (hereda titular del hueco destino).
 * Ampliación: si el tiempo total no cabe en los tramos del bloque destino, intenta ocupar tramos consecutivos
 * libres o vacíos reutilizables por el mismo titular que el cabecero de destino.
 */

import { Prisma, ReservationOrigin, ReservationStatus, Shift } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getEffectiveTotalMinutes, getSlotDurationMinutes, getSlots } from "@/lib/utils";
import { logReservationEvent } from "./logReservationEvent";

export type MovePatientsResult =
  | { ok: true; sourceReservationId: string; destinationHeadReservationId: string; expansionSlotsCreated: number }
  | { ok: false; code: "validation" | "capacity" | "conflict"; message: string };

function dayStartUtc(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00.000Z`);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function prismaShiftToApp(s: Shift): "morning" | "afternoon" {
  return s === Shift.MORNING ? "morning" : "afternoon";
}

type ResMovePatient = {
  id: string;
  estimatedDurationMinutes: number;
  orderIndex: number;
  historyNumber: string;
  procedure: string;
  anesthesiaType: string;
  insuranceType: string;
};

type ResMoveRow = {
  id: string;
  date: Date;
  resourceId: string;
  shift: Shift;
  slotIndex: number;
  surgeonId: string;
  externalSurgeonName: string | null;
  status: ReservationStatus;
  origin: ReservationOrigin;
  createdByUserId: string | null;
  patients: ResMovePatient[];
};

function blockCapacityMinutes(shift: "morning" | "afternoon", rows: ResMoveRow[]): number {
  return rows.reduce((sum, r) => sum + getSlotDurationMinutes(shift, r.slotIndex), 0);
}

function findContiguousBlock(rows: ResMoveRow[], anchor: ResMoveRow): ResMoveRow[] {
  const sameTitular = rows.filter((r) => r.surgeonId === anchor.surgeonId);
  const sorted = [...sameTitular].sort((a, b) => a.slotIndex - b.slotIndex);
  const idx = sorted.findIndex((r) => r.id === anchor.id);
  if (idx === -1) return [anchor];
  let lo = idx;
  while (lo > 0 && sorted[lo - 1]!.slotIndex === sorted[lo]!.slotIndex - 1) lo--;
  let hi = idx;
  while (hi < sorted.length - 1 && sorted[hi + 1]!.slotIndex === sorted[hi]!.slotIndex + 1) hi++;
  return sorted.slice(lo, hi + 1);
}

function resolveHeadReservation(block: ResMoveRow[]): ResMoveRow {
  const withPatients = block.filter((r) => r.patients.length > 0);
  if (withPatients.length === 0) return [...block].sort((a, b) => a.slotIndex - b.slotIndex)[0]!;
  return [...withPatients].sort((a, b) => a.slotIndex - b.slotIndex)[0]!;
}

function minutesForPatients(patients: ResMovePatient[], ids: Set<string>): number {
  const list = patients.filter((p) => ids.has(p.id));
  return getEffectiveTotalMinutes(
    list.map((p) => ({
      id: p.id,
      numeroHistoria: "",
      procedure: "",
      estimatedDurationMinutes: p.estimatedDurationMinutes,
      anesthesiaType: "",
      entidadFinanciadora: "",
      order: p.orderIndex,
    }))
  );
}

function slotUsableForTitular(row: ResMoveRow | undefined, titularId: string): boolean {
  if (!row) return true;
  if (row.status === ReservationStatus.CANCELLED || row.status === ReservationStatus.RELEASED) return true;
  const empty = row.patients.length === 0;
  const titular = row.surgeonId === titularId;
  const reusable = empty && titular && (row.status === ReservationStatus.PENDING || row.status === ReservationStatus.CONFIRMED);
  return reusable;
}

async function loadContext(
  tx: Prisma.TransactionClient,
  dateIso: string,
  resourceId: string,
  shift: Shift
): Promise<ResMoveRow[]> {
  const rows = await tx.reservation.findMany({
    where: {
      date: dayStartUtc(dateIso),
      resourceId,
      shift,
      status: { notIn: [ReservationStatus.CANCELLED, ReservationStatus.RELEASED] },
    },
    orderBy: { slotIndex: "asc" },
    include: { patients: { orderBy: { orderIndex: "asc" } } },
  });
  return rows as ResMoveRow[];
}

export async function movePatientsBetweenReservationsInDb(params: {
  actorUserId: string;
  sourceReservationId: string;
  targetReservationId: string;
  patientIds: string[];
}): Promise<MovePatientsResult> {
  const { actorUserId, sourceReservationId, targetReservationId, patientIds } = params;
  const idSet = new Set(patientIds);
  if (idSet.size === 0) {
    return { ok: false, code: "validation", message: "Indique al menos un paciente a mover." };
  }

  let destinationHeadIdOut = "";

  try {
    const expansionCreated = await prisma.$transaction(async (tx) => {
      let expansionInner = 0;
      const source = await tx.reservation.findUnique({
        where: { id: sourceReservationId },
        include: { patients: { orderBy: { orderIndex: "asc" } } },
      });
      const targetAnchor = await tx.reservation.findUnique({
        where: { id: targetReservationId },
        include: { patients: { orderBy: { orderIndex: "asc" } } },
      });

      if (!source || !targetAnchor) throw new Error("NOT_FOUND");
      if (source.status === ReservationStatus.CANCELLED || source.status === ReservationStatus.RELEASED) {
        throw new Error("SOURCE_INACTIVE");
      }
      if (targetAnchor.status === ReservationStatus.CANCELLED || targetAnchor.status === ReservationStatus.RELEASED) {
        throw new Error("TARGET_INACTIVE");
      }

      const dateIso = isoDate(source.date);
      if (isoDate(targetAnchor.date) !== dateIso) throw new Error("DIFFERENT_DAY");

      for (const pid of idSet) {
        if (!source.patients.some((p) => p.id === pid)) throw new Error("PATIENT_NOT_IN_SOURCE");
      }

      const ctxSource = await loadContext(tx, dateIso, source.resourceId, source.shift);
      const ctxDest = await loadContext(tx, dateIso, targetAnchor.resourceId, targetAnchor.shift);

      const sourceBlock = findContiguousBlock(ctxSource, source as ResMoveRow);
      const destBlock = findContiguousBlock(ctxDest, targetAnchor as ResMoveRow);
      const sourceHead = resolveHeadReservation(sourceBlock);
      const destHead = resolveHeadReservation(destBlock);
      destinationHeadIdOut = destHead.id;

      const sourceIds = new Set(sourceBlock.map((r) => r.id));
      if (destBlock.some((r) => sourceIds.has(r.id))) {
        throw new Error("SAME_BLOCK");
      }

      if (sourceHead.id === destHead.id) throw new Error("SAME_BLOCK");

      const destShiftApp = prismaShiftToApp(destHead.shift);
      const movedPatients = source.patients.filter((p) => idSet.has(p.id));
      const movedMinutes = minutesForPatients(movedPatients as ResMovePatient[], idSet);

      const destExistingOther = destHead.patients.filter((p) => !idSet.has(p.id));
      const destExistingMinutes = getEffectiveTotalMinutes(
        destExistingOther.map((p) => ({
          id: p.id,
          numeroHistoria: p.historyNumber,
          procedure: p.procedure,
          estimatedDurationMinutes: p.estimatedDurationMinutes,
          anesthesiaType: p.anesthesiaType,
          entidadFinanciadora: p.insuranceType,
          order: p.orderIndex,
        }))
      );

      const neededTotal = destExistingMinutes + movedMinutes;
      let capacity = blockCapacityMinutes(destShiftApp, destBlock);
      let extraNeeded = Math.max(0, neededTotal - capacity);
      const titularId = destHead.surgeonId;

      const bySlot = new Map<number, ResMoveRow>();
      const allDestSlots = await tx.reservation.findMany({
        where: {
          date: dayStartUtc(dateIso),
          resourceId: destHead.resourceId,
          shift: destHead.shift,
        },
        include: { patients: true },
      });
      allDestSlots.forEach((r) => bySlot.set(r.slotIndex, r as ResMoveRow));

      const maxSlot = getSlots(destShiftApp).length - 1;
      const lastSlotInBlock = Math.max(...destBlock.map((r) => r.slotIndex));
      let scanIdx = lastSlotInBlock + 1;

      while (extraNeeded > 0) {
        let idx = -1;
        while (scanIdx <= maxSlot) {
          const at = bySlot.get(scanIdx);
          if (slotUsableForTitular(at, titularId)) {
            idx = scanIdx;
            break;
          }
          scanIdx += 1;
        }
        if (idx === -1) throw new Error("NO_EXPANSION");

        const slotMinutes = getSlotDurationMinutes(destShiftApp, idx);
        const at = bySlot.get(idx);
        if (at) {
          await tx.reservation.update({
            where: { id: at.id },
            data: {
              surgeonId: titularId,
              externalSurgeonName: destHead.externalSurgeonName,
              status: ReservationStatus.PENDING,
              updatedByUserId: actorUserId,
              cancelledAt: null,
              cancellationReason: null,
              releasedAt: null,
              releaseReason: null,
            },
          });
        } else {
          const created = await tx.reservation.create({
            data: {
              date: dayStartUtc(dateIso),
              resourceId: destHead.resourceId,
              shift: destHead.shift,
              slotIndex: idx,
              surgeonId: titularId,
              externalSurgeonName: destHead.externalSurgeonName,
              status: ReservationStatus.PENDING,
              origin: destHead.origin,
              createdByUserId: destHead.createdByUserId ?? actorUserId,
              updatedByUserId: actorUserId,
            },
          });
          bySlot.set(idx, {
            id: created.id,
            date: created.date,
            resourceId: created.resourceId,
            shift: created.shift,
            slotIndex: created.slotIndex,
            surgeonId: created.surgeonId,
            externalSurgeonName: created.externalSurgeonName,
            status: created.status,
            origin: created.origin,
            createdByUserId: created.createdByUserId,
            patients: [],
          });
        }
        expansionInner += 1;
        extraNeeded -= slotMinutes;
        capacity += slotMinutes;
        scanIdx = idx + 1;
      }

      const maxOrderDest = destHead.patients.reduce((m, p) => Math.max(m, p.orderIndex), -1);
      let nextOrder = maxOrderDest + 1;
      for (const p of movedPatients.sort((a, b) => a.orderIndex - b.orderIndex)) {
        await tx.patientInBlock.update({
          where: { id: p.id },
          data: {
            reservationId: destHead.id,
            orderIndex: nextOrder++,
          },
        });
      }

      const remainingOnSource = await tx.patientInBlock.count({ where: { reservationId: source.id } });
      if (remainingOnSource === 0) {
        await tx.reservation.update({
          where: { id: source.id },
          data: {
            status: ReservationStatus.PENDING,
            updatedByUserId: actorUserId,
          },
        });
      } else {
        await tx.reservation.update({
          where: { id: source.id },
          data: { updatedByUserId: actorUserId },
        });
      }

      await tx.reservation.update({
        where: { id: destHead.id },
        data: {
          status: ReservationStatus.CONFIRMED,
          updatedByUserId: actorUserId,
        },
      });

      const restDest = await tx.patientInBlock.findMany({
        where: { reservationId: destHead.id },
        orderBy: { orderIndex: "asc" },
      });
      for (let i = 0; i < restDest.length; i++) {
        await tx.patientInBlock.update({
          where: { id: restDest[i]!.id },
          data: { orderIndex: i },
        });
      }

      return expansionInner;
    });

    await logReservationEvent({
      eventType: "RESERVATION_UPDATED",
      reservationId: sourceReservationId,
      actorUserId,
      origin: "gestor",
      detailsJson: {
        action: "move_patients_out",
        patientIds: [...idSet],
        targetReservationId,
        expansionSlotsCreated: expansionCreated,
      },
    });
    await logReservationEvent({
      eventType: "RESERVATION_UPDATED",
      reservationId: targetReservationId,
      actorUserId,
      origin: "gestor",
      detailsJson: {
        action: "move_patients_in",
        patientIds: [...idSet],
        sourceReservationId,
        expansionSlotsCreated: expansionCreated,
      },
    });

    return {
      ok: true,
      sourceReservationId,
      destinationHeadReservationId: destinationHeadIdOut,
      expansionSlotsCreated: expansionCreated,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NOT_FOUND") return { ok: false, code: "validation", message: "Reserva origen o destino no encontrada." };
    if (msg === "SOURCE_INACTIVE" || msg === "TARGET_INACTIVE") {
      return { ok: false, code: "validation", message: "La reserva origen o destino no está activa." };
    }
    if (msg === "DIFFERENT_DAY") {
      return { ok: false, code: "validation", message: "En esta fase solo se permite mover pacientes dentro del mismo día." };
    }
    if (msg === "PATIENT_NOT_IN_SOURCE") {
      return { ok: false, code: "validation", message: "Algún paciente no pertenece al bloque origen." };
    }
    if (msg === "SAME_BLOCK") {
      return { ok: false, code: "validation", message: "El origen y el destino son el mismo bloque." };
    }
    if (msg === "NO_EXPANSION") {
      return {
        ok: false,
        code: "capacity",
        message: "No cabe el tiempo total en el bloque destino y no hay huecos consecutivos libres para ampliar.",
      };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2002" || err.code === "P2034")) {
      return { ok: false, code: "conflict", message: "Conflicto al mover (concurrencia). Intente de nuevo." };
    }
    return { ok: false, code: "validation", message: msg || "Error al mover pacientes." };
  }
}
