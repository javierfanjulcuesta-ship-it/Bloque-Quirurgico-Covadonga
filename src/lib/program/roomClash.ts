/**
 * Aviso de choque por minutos en Q1–Q3 y capacidad semanal.
 * No graba reservas ni enseña el nombre del paciente.
 */

import { QUIRUFANO_IDS } from "@/lib/constants";
import { reservationClockInterval, type ProgramAlertReservation } from "@/lib/program/programAlerts";
import { getSlots } from "@/lib/utils";

const OR_IDS = new Set<string>(QUIRUFANO_IDS);

export interface RoomClashProposal {
  date: string;
  resourceId: string;
  shift: string;
  slotIndex: number;
  durationMinutes: number;
  surgeonId: string;
}

export interface RoomClashWarning {
  date: string;
  shift: "morning" | "afternoon";
  resourceId: string;
  overlapMinutes: number;
  alternativeResourceId: string | null;
  /** booking: dos cirujanos. spill: el caso se sale de su hueco. */
  kind?: "booking" | "spill";
}

export interface CapacityCell {
  date: string;
  shift: "morning" | "afternoon";
  resourceId: string;
  capacityMinutes: number;
  usedMinutes: number;
  freeMinutes: number;
}

interface ClockInterval {
  start: number;
  end: number;
}

function normalizeShift(shift: string): "morning" | "afternoon" | null {
  const value = shift.trim().toLowerCase();
  if (value === "morning" || value === "mañana" || value === "manana") return "morning";
  if (value === "afternoon" || value === "tarde") return "afternoon";
  return null;
}

function clockMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function overlapMinutes(left: ClockInterval, right: ClockInterval): number {
  return Math.min(left.end, right.end) - Math.max(left.start, right.start);
}

function proposalInterval(proposal: RoomClashProposal, shift: "morning" | "afternoon"): ClockInterval | null {
  const slot = getSlots(shift)[proposal.slotIndex];
  if (!slot) return null;
  const start = clockMinutes(slot.start);
  if (start == null) return null;
  const duration = Math.max(0, proposal.durationMinutes);
  if (duration <= 0) return null;
  return { start, end: start + duration };
}

export function shiftCapacityMinutes(shift: "morning" | "afternoon"): number {
  return getSlots(shift).reduce((sum, slot) => sum + slot.durationMinutes, 0);
}

function occupiedIntervals(
  reservations: ProgramAlertReservation[],
  date: string,
  shift: "morning" | "afternoon",
  resourceId: string,
  ignoreSurgeonId?: string,
): ClockInterval[] {
  return reservations.flatMap((reservation) => {
    if (reservation.date !== date) return [];
    if ((reservation.resourceId ?? "").trim() !== resourceId) return [];
    if (ignoreSurgeonId && reservation.surgeonId === ignoreSurgeonId) return [];
    const interval = reservationClockInterval(reservation);
    if (!interval || interval.shift !== shift) return [];
    return [{ start: interval.start, end: interval.end }];
  });
}

export function findRoomClashes(input: {
  proposals: RoomClashProposal[];
  reservations: ProgramAlertReservation[];
}): RoomClashWarning[] {
  const groups = new Map<string, { date: string; shift: "morning" | "afternoon"; resourceId: string; surgeonId: string; intervals: ClockInterval[] }>();
  for (const proposal of input.proposals) {
    const shift = normalizeShift(proposal.shift);
    const resourceId = proposal.resourceId.trim();
    if (!shift || !OR_IDS.has(resourceId)) continue;
    const interval = proposalInterval(proposal, shift);
    if (!interval) continue;
    const key = `${proposal.date}|${shift}|${resourceId}|${proposal.surgeonId}`;
    const group = groups.get(key) ?? {
      date: proposal.date,
      shift,
      resourceId,
      surgeonId: proposal.surgeonId,
      intervals: [],
    };
    group.intervals.push(interval);
    groups.set(key, group);
  }

  const warnings: RoomClashWarning[] = [];
  for (const group of groups.values()) {
    const others = occupiedIntervals(
      input.reservations,
      group.date,
      group.shift,
      group.resourceId,
      group.surgeonId,
    );
    let overlap = 0;
    for (const proposed of group.intervals) {
      for (const taken of others) overlap = Math.max(overlap, overlapMinutes(proposed, taken));
    }
    if (overlap <= 0) continue;
    const alternativeResourceId = QUIRUFANO_IDS.find((candidate) => {
      if (candidate === group.resourceId) return false;
      const taken = occupiedIntervals(input.reservations, group.date, group.shift, candidate);
      return group.intervals.every((proposed) => taken.every((slot) => overlapMinutes(proposed, slot) <= 0));
    }) ?? null;
    warnings.push({
      date: group.date,
      shift: group.shift,
      resourceId: group.resourceId,
      overlapMinutes: overlap,
      alternativeResourceId,
      kind: "booking",
    });
  }
  return warnings;
}

function alternativeRoom(
  reservations: ProgramAlertReservation[],
  date: string,
  shift: "morning" | "afternoon",
  resourceId: string,
  interval: ClockInterval,
): string | null {
  return QUIRUFANO_IDS.find((candidate) => {
    if (candidate === resourceId) return false;
    const taken = occupiedIntervals(reservations, date, shift, candidate);
    return taken.every((slot) => overlapMinutes(interval, slot) <= 0);
  }) ?? null;
}

/** Avisos del día: un caso que invade el hueco siguiente, o dos cirujanos solapados. */
export function findDayRoomWarnings(
  date: string,
  reservations: ProgramAlertReservation[],
): RoomClashWarning[] {
  const warnings: RoomClashWarning[] = [];
  for (const reservation of reservations) {
    if (reservation.date !== date) continue;
    const resourceId = (reservation.resourceId ?? "").trim();
    if (!OR_IDS.has(resourceId)) continue;
    const interval = reservationClockInterval(reservation);
    if (!interval) continue;
    const slot = getSlots(interval.shift)[reservation.slotIndex];
    if (!slot) continue;
    const slotStart = clockMinutes(slot.start);
    if (slotStart == null) continue;
    const spill = interval.end - (slotStart + slot.durationMinutes);
    if (spill <= 0) continue;
    warnings.push({
      date,
      shift: interval.shift,
      resourceId,
      overlapMinutes: spill,
      alternativeResourceId: alternativeRoom(reservations, date, interval.shift, resourceId, interval),
      kind: "spill",
    });
  }

  const proposals: RoomClashProposal[] = reservations.flatMap((reservation) => {
    if (reservation.date !== date) return [];
    const interval = reservationClockInterval(reservation);
    const resourceId = (reservation.resourceId ?? "").trim();
    if (!interval || !OR_IDS.has(resourceId)) return [];
    return [{
      date,
      resourceId,
      shift: interval.shift,
      slotIndex: reservation.slotIndex,
      durationMinutes: interval.end - interval.start,
      surgeonId: reservation.surgeonId,
    }];
  });
  return [...warnings, ...findRoomClashes({ proposals, reservations })];
}

export function describeRoomClash(warning: RoomClashWarning): string {
  const shift = warning.shift === "afternoon" ? "tarde" : "mañana";
  const alternative = warning.alternativeResourceId
    ? `${warning.alternativeResourceId} está libre en ese turno.`
    : "No hay otro quirófano libre en ese turno.";
  const against = warning.kind === "spill" ? "el hueco siguiente" : "otra reserva";
  return `${warning.resourceId} el ${warning.date} por la ${shift} se solapa ${warning.overlapMinutes} min con ${against}. ${alternative}`;
}

export function weeklyRoomCapacity(input: {
  dates: string[];
  reservations: ProgramAlertReservation[];
}): CapacityCell[] {
  const shifts: Array<"morning" | "afternoon"> = ["morning", "afternoon"];
  const cells: CapacityCell[] = [];
  for (const date of input.dates) {
    for (const shift of shifts) {
      const capacityMinutes = shiftCapacityMinutes(shift);
      for (const resourceId of QUIRUFANO_IDS) {
        const usedMinutes = occupiedIntervals(input.reservations, date, shift, resourceId)
          .reduce((sum, interval) => sum + Math.max(0, interval.end - interval.start), 0);
        cells.push({
          date,
          shift,
          resourceId,
          capacityMinutes,
          usedMinutes,
          freeMinutes: capacityMinutes - usedMinutes,
        });
      }
    }
  }
  return cells;
}
