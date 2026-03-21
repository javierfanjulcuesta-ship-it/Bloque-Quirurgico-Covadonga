/**
 * Persistencia en localStorage: asignaciones de anestesista a cada turno (recurso + fecha + mañana/tarde).
 * Un anestesista puede estar en hasta 2 recursos a la vez. Lectura con parse seguro.
 */

import type { AnesthetistAssignment, ResourceId } from "./types";
import { ASSIGNMENT_FULL_SHIFT, ASSIGNMENT_PREANESTHESIA } from "./types";
import { RESOURCES } from "./constants";
import { safeParseJSON } from "./storageSafe";

const KEY_ASSIGNMENTS = "bloque_quirurgico_anesthetist_assignments";
const VALID_RESOURCE_IDS = new Set<string>([...RESOURCES.map((r) => r.id), ASSIGNMENT_FULL_SHIFT, ASSIGNMENT_PREANESTHESIA]);

function isValidAssignment(a: unknown): a is AnesthetistAssignment {
  if (!a || typeof a !== "object") return false;
  const o = a as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return false;
  if (typeof o.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return false;
  if (o.shift !== "morning" && o.shift !== "afternoon") return false;
  const type = o.assignmentType as string;
  const rid = o.resourceId as string;
  if (type !== "OR" && type !== "PREANESTHESIA") return false;
  if (type === "PREANESTHESIA" && rid !== ASSIGNMENT_PREANESTHESIA) return false;
  if (type === "OR" && !VALID_RESOURCE_IDS.has(rid)) return false;
  if (typeof o.anesthetistId !== "string" || !o.anesthetistId) return false;
  return true;
}

/** Migra legacy (solo slotType) a nuevo formato */
function migrateLegacy(a: unknown): AnesthetistAssignment | null {
  if (!a || typeof a !== "object") return null;
  const o = a as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return null;
  if (typeof o.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return null;
  if (o.shift !== "morning" && o.shift !== "afternoon") return null;
  if (typeof o.anesthetistId !== "string" || !o.anesthetistId) return null;
  const slotType = o.slotType as string;
  if (slotType === "consulta-preanestesia") {
    return {
      id: o.id as string,
      date: o.date as string,
      shift: o.shift as "morning" | "afternoon",
      assignmentType: "PREANESTHESIA",
      resourceId: ASSIGNMENT_PREANESTHESIA,
      anesthetistId: o.anesthetistId as string,
    };
  }
  if (RESOURCES.some((r) => r.id === slotType)) {
    return {
      id: o.id as string,
      date: o.date as string,
      shift: o.shift as "morning" | "afternoon",
      assignmentType: "OR",
      resourceId: slotType,
      anesthetistId: o.anesthetistId as string,
    };
  }
  return null;
}

export function getStoredAnesthetistAssignments(): AnesthetistAssignment[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY_ASSIGNMENTS);
  const parsed = safeParseJSON<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((a) => (isValidAssignment(a) ? a : migrateLegacy(a))).filter((a): a is AnesthetistAssignment => a !== null);
}

export function setStoredAnesthetistAssignments(list: AnesthetistAssignment[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_ASSIGNMENTS, JSON.stringify(list));
}

export function addOrUpdateAssignment(
  date: string,
  shift: "morning" | "afternoon",
  assignmentType: "OR" | "PREANESTHESIA",
  resourceId: string,
  anesthetistId: string
): void {
  const list = getStoredAnesthetistAssignments();
  const existing = list.find(
    (a) => a.date === date && a.shift === shift && a.assignmentType === assignmentType && a.resourceId === resourceId
  );
  const newOne: AnesthetistAssignment = {
    id: existing?.id ?? `assign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date,
    shift,
    assignmentType,
    resourceId,
    anesthetistId,
  };
  const next = existing
    ? list.map((a) => (a.id === existing.id ? newOne : a))
    : [...list.filter((a) => !(a.date === date && a.shift === shift && a.assignmentType === assignmentType && a.resourceId === resourceId)), newOne];
  setStoredAnesthetistAssignments(next);
}

/** Recursos OR que cuentan para la regla "máx 2 a la vez" */
const RESOURCES_FOR_ALARM = new Set<string>(["Q1", "Q2", "Q3", "procedimientos-menores", "tecnicas-dolor"]);

/**
 * Agrupa asignaciones OR por (date, shift) y devuelve los anesthetistId que tienen más de maxPerShift.
 * __full_shift__ cuenta como 1. Recursos concretos cuentan 1 cada uno.
 */
export function getAnesthetistsOverLimit(
  assignments: AnesthetistAssignment[],
  maxPerShift: number = 2
): { date: string; shift: "morning" | "afternoon"; anesthetistId: string; count: number }[] {
  const byKey = new Map<string, Map<string, number>>();
  for (const a of assignments) {
    if (a.assignmentType !== "OR") continue;
    const count = RESOURCES_FOR_ALARM.has(a.resourceId) || a.resourceId === ASSIGNMENT_FULL_SHIFT ? 1 : 0;
    if (count === 0) continue;
    const key = `${a.date}|${a.shift}`;
    if (!byKey.has(key)) byKey.set(key, new Map());
    const perAnesthetist = byKey.get(key)!;
    perAnesthetist.set(a.anesthetistId, (perAnesthetist.get(a.anesthetistId) ?? 0) + count);
  }
  const result: { date: string; shift: "morning" | "afternoon"; anesthetistId: string; count: number }[] = [];
  byKey.forEach((perAnesthetist, key) => {
    const [date, shift] = key.split("|") as [string, "morning" | "afternoon"];
    perAnesthetist.forEach((count, anesthetistId) => {
      if (count > maxPerShift) result.push({ date, shift, anesthetistId, count });
    });
  });
  return result;
}
