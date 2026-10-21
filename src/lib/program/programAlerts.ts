/**
 * Alertas de solo lectura del programa semanal.
 * No escriben reservas ni mueven anestesistas.
 */

import { QUIRUFANO_IDS } from "@/lib/constants";
import { ASSIGNMENT_FULL_SHIFT } from "@/lib/types";
import { getEffectiveTotalMinutes, getSlots } from "@/lib/utils";

export const SURGEONS_PER_SHIFT_ALERT = 3;

const OR_IDS = new Set<string>(QUIRUFANO_IDS);
const KNOWN_RESOURCES = new Set<string>([
  ...QUIRUFANO_IDS,
  "ENDO",
  "procedimientos-menores",
  "tecnicas-dolor",
  "endoscopias",
]);

function canonicalRoom(resourceId: string): string {
  return resourceId === "endoscopias" ? "ENDO" : resourceId;
}

export interface ProgramAlertPatient {
  id?: string;
  caseLabel?: string;
  procedure?: string;
  estimatedDurationMinutes?: number;
  workflowStatus?: string;
  scheduleStatus?: string;
}

export interface ProgramAlertReservation {
  id: string;
  date: string;
  resourceId?: string | null;
  shift: string;
  slotIndex: number;
  surgeonId: string;
  status: string;
  patients?: ProgramAlertPatient[];
}

export interface ProgramAlertAssignment {
  date: string;
  shift: string;
  assignmentType: string;
  resourceId: string;
  anesthetistId?: string;
}

export interface PendingRoomCase {
  id: string;
  label: string;
  date?: string | null;
  detail?: string;
}

export interface ProgramAlertOverlap {
  kind: "overlap";
  date: string;
  resourceId: string;
  shift: "morning" | "afternoon";
  reservationAId: string;
  reservationBId: string;
  surgeonAId: string;
  surgeonBId: string;
  overlapMinutes: number;
}

export interface ProgramAlertWithoutRoom {
  kind: "without_room";
  id: string;
  label: string;
  date?: string | null;
  detail?: string;
}

export interface ProgramAlertMissingAnesthetist {
  kind: "missing_anesthetist";
  date: string;
  shift: "morning" | "afternoon";
  resourceId: string;
  patientCount: number;
}

export interface ProgramAlertTooManySurgeons {
  kind: "too_many_surgeons";
  date: string;
  shift: "morning" | "afternoon";
  surgeonIds: string[];
  surgeonCount: number;
}

export interface ProgramAlertIdleEndoscopy {
  kind: "idle_endoscopy";
  date: string;
  shift: "morning" | "afternoon";
  resourceId: string;
  anesthetistId?: string;
}

export type ProgramAlert =
  | ProgramAlertOverlap
  | ProgramAlertWithoutRoom
  | ProgramAlertMissingAnesthetist
  | ProgramAlertTooManySurgeons
  | ProgramAlertIdleEndoscopy;

export interface ProgramAlertCounts {
  iq: number;
  surgeons: number;
  minutes: number;
}

export interface ProgramAlertsResult {
  counts: ProgramAlertCounts;
  alerts: ProgramAlert[];
}

function normalizeShift(shift: string): "morning" | "afternoon" | null {
  const value = shift.trim().toLowerCase();
  if (value === "morning" || value === "mañana" || value === "manana") return "morning";
  if (value === "afternoon" || value === "tarde") return "afternoon";
  return null;
}

function isActiveReservation(reservation: ProgramAlertReservation): boolean {
  const status = reservation.status.trim().toLowerCase();
  return status === "pending" || status === "confirmed";
}

export function isActiveProgramPatient(patient: ProgramAlertPatient): boolean {
  const workflow = (patient.workflowStatus ?? "ACTIVE").trim().toUpperCase();
  if (workflow === "SUSPENDED" || workflow === "CANCELLED") return false;
  const schedule = (patient.scheduleStatus ?? "SCHEDULED").trim().toUpperCase();
  return schedule !== "CANCELLED";
}

function activePatients(reservation: ProgramAlertReservation): ProgramAlertPatient[] {
  if (!isActiveReservation(reservation)) return [];
  return (reservation.patients ?? []).filter(isActiveProgramPatient);
}

function clockMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function reservationClockInterval(
  reservation: ProgramAlertReservation,
): { shift: "morning" | "afternoon"; start: number; end: number } | null {
  const shift = normalizeShift(reservation.shift);
  if (!shift) return null;
  const patients = activePatients(reservation);
  if (patients.length === 0) return null;
  const slots = getSlots(shift);
  const slot = slots[reservation.slotIndex];
  if (!slot) return null;
  const start = clockMinutes(slot.start);
  if (start == null) return null;
  const duration = Math.max(0, getEffectiveTotalMinutes(patients));
  if (duration <= 0) return null;
  return { shift, start, end: start + duration };
}

function hasOrCoverage(
  assignments: ProgramAlertAssignment[],
  date: string,
  shift: "morning" | "afternoon",
  resourceId: string,
): boolean {
  return assignments.some((assignment) => {
    if (assignment.assignmentType.trim().toUpperCase() !== "OR") return false;
    if (assignment.date !== date) return false;
    if (normalizeShift(assignment.shift) !== shift) return false;
    return canonicalRoom(assignment.resourceId) === canonicalRoom(resourceId) || assignment.resourceId === ASSIGNMENT_FULL_SHIFT;
  });
}

function roomLabel(reservation: ProgramAlertReservation, patient: ProgramAlertPatient): string {
  const who = patient.caseLabel?.trim() || "Caso";
  const procedure = patient.procedure?.trim();
  return procedure ? `${who} — ${procedure}` : who;
}

export function buildProgramAlerts(input: {
  reservations: ProgramAlertReservation[];
  assignments?: ProgramAlertAssignment[];
  pendingRooms?: PendingRoomCase[];
}): ProgramAlertsResult {
  const assignments = input.assignments ?? [];
  const alerts: ProgramAlert[] = [];
  let iq = 0;
  let minutes = 0;
  const surgeonIds = new Set<string>();

  for (const reservation of input.reservations) {
    const patients = activePatients(reservation);
    for (const patient of patients) {
      iq += 1;
      minutes += Math.max(0, patient.estimatedDurationMinutes ?? 0);
      if (reservation.surgeonId) surgeonIds.add(reservation.surgeonId);
      const resourceId = reservation.resourceId?.trim() ?? "";
      if (!resourceId || !KNOWN_RESOURCES.has(resourceId)) {
        alerts.push({
          kind: "without_room",
          id: `${reservation.id}:${patient.id ?? patient.caseLabel ?? iq}`,
          label: roomLabel(reservation, patient),
          date: reservation.date,
          detail: "Sala no reconocida. Queda pendiente, sin asignar Q1.",
        });
      }
    }
  }

  for (const pending of input.pendingRooms ?? []) {
    alerts.push({
      kind: "without_room",
      id: pending.id,
      label: pending.label,
      date: pending.date,
      detail: pending.detail ?? "Solicitud pendiente: la sala no se reconoció y no se asignó Q1.",
    });
  }

  const placed = input.reservations.flatMap((reservation) => {
    const interval = reservationClockInterval(reservation);
    const resourceId = reservation.resourceId?.trim() ?? "";
    if (!interval || !OR_IDS.has(resourceId)) return [];
    return [{ reservation, interval, resourceId }];
  });

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const left = placed[i]!;
      const right = placed[j]!;
      if (left.reservation.date !== right.reservation.date) continue;
      if (left.resourceId !== right.resourceId) continue;
      if (left.interval.shift !== right.interval.shift) continue;
      if (left.reservation.surgeonId === right.reservation.surgeonId) continue;
      const overlap = Math.min(left.interval.end, right.interval.end) - Math.max(left.interval.start, right.interval.start);
      if (overlap <= 0) continue;
      alerts.push({
        kind: "overlap",
        date: left.reservation.date,
        resourceId: left.resourceId,
        shift: left.interval.shift,
        reservationAId: left.reservation.id,
        reservationBId: right.reservation.id,
        surgeonAId: left.reservation.surgeonId,
        surgeonBId: right.reservation.surgeonId,
        overlapMinutes: overlap,
      });
    }
  }

  const occupiedRooms = new Map<string, { date: string; shift: "morning" | "afternoon"; resourceId: string; patientCount: number }>();
  const surgeonsByShift = new Map<string, Set<string>>();
  for (const reservation of input.reservations) {
    const shift = normalizeShift(reservation.shift);
    const resourceId = reservation.resourceId?.trim() ?? "";
    const patients = activePatients(reservation);
    const roomId = canonicalRoom(resourceId);
    if (!shift || patients.length === 0 || (!OR_IDS.has(roomId) && roomId !== "ENDO")) continue;
    const roomKey = `${reservation.date}|${shift}|${roomId}`;
    const room = occupiedRooms.get(roomKey) ?? {
      date: reservation.date,
      shift,
      resourceId: roomId,
      patientCount: 0,
    };
    room.patientCount += patients.length;
    occupiedRooms.set(roomKey, room);
    const surgeonKey = `${reservation.date}|${shift}`;
    const surgeons = surgeonsByShift.get(surgeonKey) ?? new Set<string>();
    surgeons.add(reservation.surgeonId);
    surgeonsByShift.set(surgeonKey, surgeons);
  }

  for (const room of occupiedRooms.values()) {
    if (!hasOrCoverage(assignments, room.date, room.shift, room.resourceId)) {
      alerts.push({
        kind: "missing_anesthetist",
        date: room.date,
        shift: room.shift,
        resourceId: room.resourceId,
        patientCount: room.patientCount,
      });
    }
  }

  for (const [key, surgeons] of surgeonsByShift) {
    if (surgeons.size <= SURGEONS_PER_SHIFT_ALERT) continue;
    const [date, shift] = key.split("|") as [string, "morning" | "afternoon"];
    alerts.push({
      kind: "too_many_surgeons",
      date,
      shift,
      surgeonIds: [...surgeons],
      surgeonCount: surgeons.size,
    });
  }

  const endoscopyResources = new Set(["procedimientos-menores", "endoscopias", "ENDO"]);
  for (const assignment of assignments) {
    const shift = normalizeShift(assignment.shift);
    if (!shift || assignment.assignmentType.trim().toUpperCase() !== "OR") continue;
    if (!endoscopyResources.has(assignment.resourceId)) continue;
    const assignedRoom = canonicalRoom(assignment.resourceId);
    const patientCount = input.reservations.reduce((sum, reservation) => {
      if (reservation.date !== assignment.date) return sum;
      if (normalizeShift(reservation.shift) !== shift) return sum;
      if (canonicalRoom(reservation.resourceId?.trim() ?? "") !== assignedRoom) return sum;
      return sum + activePatients(reservation).length;
    }, 0);
    if (patientCount === 0) {
      alerts.push({
        kind: "idle_endoscopy",
        date: assignment.date,
        shift,
        resourceId: assignment.resourceId,
        anesthetistId: assignment.anesthetistId,
      });
    }
  }

  return {
    counts: { iq, surgeons: surgeonIds.size, minutes },
    alerts,
  };
}
