import { ASSIGNMENT_FULL_SHIFT } from "@/lib/types";
import { DEFAULT_MAX_SIMULTANEOUS_OR } from "./capacityCatalog";

const RESOURCES_THAT_COUNT = new Set<string>([
  "Q1",
  "Q2",
  "Q3",
  "procedimientos-menores",
  "tecnicas-dolor",
  "endoscopias",
  ASSIGNMENT_FULL_SHIFT,
]);

export interface CapacityAssignment {
  date: string;
  shift: string;
  assignmentType: string;
  resourceId: string;
  anesthetistId: string;
}

export interface CapacityExcess {
  anesthetistId: string;
  date: string;
  shift: "morning" | "afternoon";
  count: number;
  maxSimultaneousOr: number;
}

function normalizeShift(shift: string): "morning" | "afternoon" | null {
  const value = shift.trim().toLowerCase();
  if (value === "morning") return "morning";
  if (value === "afternoon") return "afternoon";
  return null;
}

/**
 * Compara asignaciones OR con el cupo ya resuelto de cada persona.
 * No consulta nombres ni el catálogo: solo el número que recibe.
 */
export function findCapacityExcesses(
  assignments: CapacityAssignment[],
  maxByAnesthetistId: ReadonlyMap<string, number>,
  defaultMax: number = DEFAULT_MAX_SIMULTANEOUS_OR,
): CapacityExcess[] {
  const counts = new Map<string, number>();
  for (const assignment of assignments) {
    if (assignment.assignmentType.trim().toUpperCase() !== "OR") continue;
    if (!RESOURCES_THAT_COUNT.has(assignment.resourceId)) continue;
    const shift = normalizeShift(assignment.shift);
    if (!shift) continue;
    const key = `${assignment.anesthetistId}|${assignment.date}|${shift}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const excesses: CapacityExcess[] = [];
  for (const [key, count] of counts) {
    const [anesthetistId, date, shift] = key.split("|") as [string, string, "morning" | "afternoon"];
    const maxSimultaneousOr = maxByAnesthetistId.get(anesthetistId) ?? defaultMax;
    if (count > maxSimultaneousOr) {
      excesses.push({ anesthetistId, date, shift, count, maxSimultaneousOr });
    }
  }
  return excesses.sort((a, b) =>
    a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift) || a.anesthetistId.localeCompare(b.anesthetistId),
  );
}
