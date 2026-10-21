/**
 * Hoja «Semana para imprimir».
 * Muestra la etiqueta Caso N. Las iniciales solo salen del Excel de la sesión,
 * en el parte, y no se leen de la reserva. No escribe ni guarda identificadores.
 */

import { RESOURCES } from "@/lib/constants";
import { slotClock } from "@/lib/drafts/parteTemplate";
import { caseLabelFromOrder } from "@/lib/patients/caseLabel";
import { isActiveProgramPatient } from "@/lib/program/programAlerts";
import { getDisplaySurgeonName } from "@/lib/surgeonTitular";
import { ASSIGNMENT_FULL_SHIFT, type PatientInBlock, type Shift } from "@/lib/types";

export interface PrintablePatient {
  caseLabel?: string | null;
  procedure?: string | null;
  order?: number;
  notes?: string;
  workflowStatus?: string;
  scheduleStatus?: string;
}

export interface PrintableReservation {
  id: string;
  date: string;
  shift: string;
  slotIndex: number;
  resourceId?: string | null;
  surgeonId: string;
  status: string;
  patients?: PrintablePatient[];
}

export interface PrintableAssignment {
  date: string;
  shift: string;
  assignmentType: string;
  resourceId: string;
  anesthetistId?: string;
}

export interface PrintableWeekRow {
  date: string;
  day: string;
  shift: Shift;
  shiftLabel: "MAÑANA" | "TARDE";
  resourceId: string;
  resourceLabel: string;
  surgeon: string;
  caseLabel: string;
  procedure: string;
  time: string;
  anesthetist: string;
}

const RESOURCE_ORDER = new Map(RESOURCES.map((resource, index) => [resource.id, index]));

function canonicalRoom(resourceId: string): string {
  return resourceId === "endoscopias" ? "ENDO" : resourceId;
}

function resourceLabel(resourceId: string): string {
  const canonical = canonicalRoom(resourceId);
  return RESOURCES.find((resource) => resource.id === canonical)?.label ?? canonical;
}

function normalizeShift(shift: string): Shift | null {
  const value = shift.trim().toLowerCase();
  if (value === "morning" || value === "mañana" || value === "manana") return "morning";
  if (value === "afternoon" || value === "tarde") return "afternoon";
  return null;
}

function dayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: "UTC" }).format(date);
  return `${weekday} ${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
}

function anesthetistName(
  assignments: PrintableAssignment[],
  users: ReadonlyArray<{ id: string; name: string }>,
  date: string,
  shift: Shift,
  resourceId: string,
): string {
  const room = canonicalRoom(resourceId);
  const covering = assignments.filter((assignment) => {
    if (assignment.assignmentType.trim().toUpperCase() !== "OR") return false;
    if (assignment.date !== date || normalizeShift(assignment.shift) !== shift) return false;
    return canonicalRoom(assignment.resourceId) === room || assignment.resourceId === ASSIGNMENT_FULL_SHIFT;
  });
  const specific = covering.filter((assignment) => assignment.resourceId !== ASSIGNMENT_FULL_SHIFT);
  const chosen = specific.length > 0 ? specific : covering;
  const names = [...new Set(chosen.map((assignment) => assignment.anesthetistId).filter((id): id is string => Boolean(id)))]
    .map((id) => users.find((user) => user.id === id)?.name?.trim() || id)
    .sort((a, b) => a.localeCompare(b, "es"));
  return names.join(" · ");
}

export function buildPrintableWeek(input: {
  from: string;
  to: string;
  reservations: PrintableReservation[];
  assignments?: PrintableAssignment[];
  users?: ReadonlyArray<{ id: string; name: string }>;
}): PrintableWeekRow[] {
  const assignments = input.assignments ?? [];
  const users = input.users ?? [];
  const rows: PrintableWeekRow[] = [];

  for (const reservation of input.reservations) {
    const shift = normalizeShift(reservation.shift);
    const status = reservation.status.trim().toLowerCase();
    if (!shift || (status !== "pending" && status !== "confirmed")) continue;
    if (reservation.date < input.from || reservation.date > input.to) continue;
    const resourceId = canonicalRoom((reservation.resourceId ?? "").trim());
    if (!resourceId) continue;
    const patients = [...(reservation.patients ?? [])]
      .filter((patient) => isActiveProgramPatient({
        workflowStatus: patient.workflowStatus,
        scheduleStatus: patient.scheduleStatus,
      }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const surgeon = getDisplaySurgeonName(
      { surgeonId: reservation.surgeonId, patients: patients as PatientInBlock[] },
      users,
    );
    for (const patient of patients) {
      rows.push({
        date: reservation.date,
        day: dayLabel(reservation.date),
        shift,
        shiftLabel: shift === "morning" ? "MAÑANA" : "TARDE",
        resourceId,
        resourceLabel: resourceLabel(resourceId),
        surgeon,
        caseLabel: patient.caseLabel?.trim() || caseLabelFromOrder(patient.order ?? 0),
        procedure: patient.procedure?.trim() || "—",
        time: slotClock(shift, reservation.slotIndex) ?? "—",
        anesthetist: anesthetistName(assignments, users, reservation.date, shift, resourceId),
      });
    }
  }

  const shiftRank = { morning: 0, afternoon: 1 };
  rows.sort((a, b) =>
    a.date.localeCompare(b.date)
    || shiftRank[a.shift] - shiftRank[b.shift]
    || (RESOURCE_ORDER.get(a.resourceId as (typeof RESOURCES)[number]["id"]) ?? 99)
      - (RESOURCE_ORDER.get(b.resourceId as (typeof RESOURCES)[number]["id"]) ?? 99)
    || a.time.localeCompare(b.time)
    || a.surgeon.localeCompare(b.surgeon, "es")
    || a.caseLabel.localeCompare(b.caseLabel, "es")
    || a.procedure.localeCompare(b.procedure, "es"),
  );
  return rows;
}
