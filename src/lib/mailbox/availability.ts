/**
 * Huecos libres a partir de bloques ocupados, sin nombre de paciente.
 * El Excel maestro no se lee aquí: quien ya lo revisó en memoria puede pasar filas anónimas.
 */

import { DEFAULT_MAX_SIMULTANEOUS_OR } from "@/lib/anesthesia/capacityCatalog";
import type { CapacityAssignment } from "@/lib/anesthesia/capacity";
import { QUIRUFANO_IDS, SHIFT_TIMES, TRANSITION_MINUTES_PER_PROCEDURE } from "@/lib/constants";
import { reservationClockInterval, type ProgramAlertReservation } from "@/lib/program/programAlerts";
import { suggestSurgeonHabit, type SavedSurgeonHabit } from "@/lib/surgeons/habits";

export interface OccupiedBlock {
  date: string;
  resourceId: string;
  shift: "morning" | "afternoon";
  startMinutes: number;
  endMinutes: number;
}

export interface AnonymousProgramRow {
  date: string;
  shift: string;
  resourceId: string;
  startMinutes?: number;
  durationMinutes: number;
}

export interface FreeOpening {
  date: string;
  resourceId: string;
  shift: "morning" | "afternoon";
  startMinutes: number;
  endMinutes: number;
  preferred: boolean;
}

export interface AnesthesiaLoad {
  assignments: CapacityAssignment[];
  maxByAnesthetistId?: ReadonlyMap<string, number>;
}

const OR_ROOMS = [...QUIRUFANO_IDS];
const ENDO_ROOMS = ["ENDO"];

function normalizeShift(shift: string): "morning" | "afternoon" | null {
  const value = shift.trim().toLowerCase();
  if (value === "morning" || value === "mañana" || value === "manana") return "morning";
  if (value === "afternoon" || value === "tarde") return "afternoon";
  return null;
}

function clock(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function shiftWindow(shift: "morning" | "afternoon"): { start: number; end: number } {
  return { start: clock(SHIFT_TIMES[shift].start), end: clock(SHIFT_TIMES[shift].end) };
}

function roomsFor(role: "cirujano" | "endoscopista", preferred: string | null): string[] {
  if (role === "endoscopista" || preferred === "ENDO") return ENDO_ROOMS;
  return OR_ROOMS;
}

export function occupancyFromAnonymousRows(rows: AnonymousProgramRow[]): OccupiedBlock[] {
  return rows.flatMap((row) => {
    const shift = normalizeShift(row.shift);
    const resourceId = row.resourceId.trim();
    if (!shift || !resourceId || row.durationMinutes <= 0) return [];
    const window = shiftWindow(shift);
    const start = row.startMinutes ?? window.start;
    return [{
      date: row.date,
      resourceId,
      shift,
      startMinutes: start,
      endMinutes: start + row.durationMinutes,
    }];
  });
}

export function occupancyFromReservations(reservations: ProgramAlertReservation[]): OccupiedBlock[] {
  return reservations.flatMap((reservation) => {
    const interval = reservationClockInterval(reservation);
    const resourceId = reservation.resourceId?.trim() ?? "";
    if (!interval || !resourceId) return [];
    return [{
      date: reservation.date,
      resourceId,
      shift: interval.shift,
      startMinutes: interval.start,
      endMinutes: interval.end,
    }];
  });
}

function anesthesiaAllows(date: string, shift: "morning" | "afternoon", resourceId: string, occupied: OccupiedBlock[], load: AnesthesiaLoad | undefined): boolean {
  if (!load) return true;
  const assigned = load.assignments.filter((item) => {
    if (item.assignmentType.trim().toUpperCase() !== "OR") return false;
    return item.date === date && normalizeShift(item.shift) === shift;
  });
  if (assigned.length === 0) return true;
  const people = new Set(assigned.map((item) => item.anesthetistId));
  let capacity = 0;
  for (const person of people) {
    capacity += load.maxByAnesthetistId?.get(person) ?? DEFAULT_MAX_SIMULTANEOUS_OR;
  }
  const rooms = new Set<string>([resourceId]);
  for (const block of occupied) {
    if (block.date === date && block.shift === shift) rooms.add(block.resourceId);
  }
  for (const item of assigned) {
    if (item.resourceId && item.resourceId !== "FULL_SHIFT") rooms.add(item.resourceId);
  }
  return rooms.size <= capacity;
}

function firstGap(
  window: { start: number; end: number },
  blocks: OccupiedBlock[],
  needed: number,
): { start: number; end: number } | null {
  const taken = blocks
    .map((block) => ({
      start: Math.max(window.start, block.startMinutes),
      end: Math.min(window.end, block.endMinutes),
    }))
    .filter((block) => block.end > block.start)
    .sort((left, right) => left.start - right.start);
  let cursor = window.start;
  for (const block of taken) {
    if (block.start - cursor >= needed) return { start: cursor, end: cursor + needed };
    cursor = Math.max(cursor, block.end);
  }
  if (window.end - cursor >= needed) return { start: cursor, end: cursor + needed };
  return null;
}

export function findFreeOpenings(input: {
  dates: string[];
  durationMinutes: number;
  transitionMinutes?: number;
  surgeonRole?: "cirujano" | "endoscopista";
  surgeonName?: string | null;
  explicitShift?: "morning" | "afternoon" | null;
  explicitResourceId?: string | null;
  savedHabit?: SavedSurgeonHabit | null;
  occupied?: OccupiedBlock[];
  anesthesia?: AnesthesiaLoad;
  limit?: number;
}): FreeOpening[] {
  const needed = Math.max(1, input.durationMinutes) + (input.transitionMinutes ?? TRANSITION_MINUTES_PER_PROCEDURE);
  const habit = suggestSurgeonHabit({
    explicitShift: input.explicitShift,
    explicitResourceId: input.explicitResourceId,
    surgeonName: input.surgeonName,
    saved: input.savedHabit,
  });
  const preferredShift = input.explicitShift ?? habit.shift;
  const preferredResource = input.explicitResourceId ?? habit.resourceId;
  const rooms = roomsFor(input.surgeonRole ?? "cirujano", preferredResource);
  const occupied = input.occupied ?? [];
  const openings: FreeOpening[] = [];
  for (const date of input.dates) {
    for (const shift of ["morning", "afternoon"] as const) {
      if (preferredShift && shift !== preferredShift) continue;
      for (const resourceId of rooms) {
        if (!anesthesiaAllows(date, shift, resourceId, occupied, input.anesthesia)) continue;
        const blocks = occupied.filter((block) => block.date === date && block.shift === shift && block.resourceId === resourceId);
        const gap = firstGap(shiftWindow(shift), blocks, needed);
        if (!gap) continue;
        openings.push({
          date,
          resourceId,
          shift,
          startMinutes: gap.start,
          endMinutes: gap.end,
          preferred: shift === preferredShift && (!preferredResource || resourceId === preferredResource),
        });
      }
    }
  }
  openings.sort((left, right) => Number(right.preferred) - Number(left.preferred)
    || left.date.localeCompare(right.date)
    || left.shift.localeCompare(right.shift)
    || left.resourceId.localeCompare(right.resourceId));
  return openings.slice(0, input.limit ?? 12);
}
