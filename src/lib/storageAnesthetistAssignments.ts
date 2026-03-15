/**
 * Persistencia en localStorage: asignaciones de anestesista a cada turno (recurso + fecha + mañana/tarde).
 * Un anestesista puede estar en hasta 2 recursos a la vez; si se asigna a más de 2 se muestra alarma al gestor.
 */

import type { AnesthetistAssignment, ResourceId } from "./types";

const KEY_ASSIGNMENTS = "bloque_quirurgico_anesthetist_assignments";

export function getStoredAnesthetistAssignments(): AnesthetistAssignment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY_ASSIGNMENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AnesthetistAssignment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setStoredAnesthetistAssignments(list: AnesthetistAssignment[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_ASSIGNMENTS, JSON.stringify(list));
}

export function addOrUpdateAssignment(
  date: string,
  shift: "morning" | "afternoon",
  slotType: AnesthetistAssignment["slotType"],
  anesthetistId: string
): void {
  const list = getStoredAnesthetistAssignments();
  const existing = list.find(
    (a) => a.date === date && a.shift === shift && a.slotType === slotType
  );
  const newOne: AnesthetistAssignment = {
    id: existing?.id ?? `assign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date,
    shift,
    slotType,
    anesthetistId,
  };
  const next = existing
    ? list.map((a) => (a.id === existing.id ? newOne : a))
    : [...list, newOne];
  setStoredAnesthetistAssignments(next);
}

/** Recursos que cuentan para la regla "máx 2 a la vez" (quirófanos + endoscopias + técnicas dolor) */
const RESOURCES_FOR_ALARM: ResourceId[] = [
  "Q1",
  "Q2",
  "Q3",
  "procedimientos-menores",
  "tecnicas-dolor",
];

/**
 * Agrupa asignaciones por (date, shift) y devuelve los anesthetistId que tienen más de maxPerShift asignaciones
 * en ese mismo día y turno (solo cuenta slotType que sean recursos, no consulta-preanestesia si se desea).
 * Por defecto maxPerShift = 2.
 */
export function getAnesthetistsOverLimit(
  assignments: AnesthetistAssignment[],
  maxPerShift: number = 2
): { date: string; shift: "morning" | "afternoon"; anesthetistId: string; count: number }[] {
  const byKey = new Map<string, Map<string, number>>();
  for (const a of assignments) {
    if (!RESOURCES_FOR_ALARM.includes(a.slotType as ResourceId)) continue;
    const key = `${a.date}|${a.shift}`;
    if (!byKey.has(key)) byKey.set(key, new Map());
    const perAnesthetist = byKey.get(key)!;
    perAnesthetist.set(a.anesthetistId, (perAnesthetist.get(a.anesthetistId) ?? 0) + 1);
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
