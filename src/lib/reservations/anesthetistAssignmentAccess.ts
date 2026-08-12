import type { Shift } from "@prisma/client";

export const ASSIGNMENT_FULL_SHIFT_RESOURCE = "__full_shift__";

export interface AssignmentAccessRow {
  date: string;
  shift: Shift;
  assignmentType: "OR" | "PREANESTHESIA";
  resourceId: string;
  anesthetistId: string;
}

export interface ReservationAssignmentContext {
  date: Date | string;
  shift: Shift | string;
  resourceId: string;
}

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

/**
 * Una asignación OR cubre las reservas de ese recurso o, si es turno completo,
 * todas las reservas OR del mismo día y turno. Las asignaciones de preanestesia
 * nunca conceden acceso a casos quirúrgicos.
 */
export function assignmentCoversReservation(
  assignment: Pick<AssignmentAccessRow, "date" | "shift" | "assignmentType" | "resourceId">,
  reservation: ReservationAssignmentContext,
): boolean {
  if (assignment.assignmentType !== "OR") return false;
  if (assignment.date !== dateOnly(reservation.date)) return false;
  if (String(assignment.shift) !== String(reservation.shift)) return false;
  return assignment.resourceId === ASSIGNMENT_FULL_SHIFT_RESOURCE || assignment.resourceId === reservation.resourceId;
}

export function assignedAnesthetistIdsForReservation(
  assignments: AssignmentAccessRow[],
  reservation: ReservationAssignmentContext,
): string[] {
  return [...new Set(
    assignments
      .filter((assignment) => assignmentCoversReservation(assignment, reservation))
      .map((assignment) => assignment.anesthetistId),
  )];
}

/** Clave usada para comprobar rápidamente en listados si una reserva está asignada. */
export function assignmentCoverageKeys(
  assignments: Array<Pick<AssignmentAccessRow, "date" | "shift" | "assignmentType" | "resourceId">>,
): Set<string> {
  const keys = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.assignmentType !== "OR") continue;
    keys.add(`${assignment.date}|${assignment.shift}|${assignment.resourceId}`);
  }
  return keys;
}

export function coverageKeysMatchReservation(
  keys: Set<string>,
  reservation: ReservationAssignmentContext,
): boolean {
  const date = dateOnly(reservation.date);
  const shift = String(reservation.shift);
  return (
    keys.has(`${date}|${shift}|${reservation.resourceId}`) ||
    keys.has(`${date}|${shift}|${ASSIGNMENT_FULL_SHIFT_RESOURCE}`)
  );
}
