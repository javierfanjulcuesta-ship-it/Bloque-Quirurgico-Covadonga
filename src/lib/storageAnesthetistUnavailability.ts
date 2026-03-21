/**
 * Persistencia en localStorage: solicitudes de no disponibilidad del anestesista (fecha + turno mañana/tarde).
 * Lectura con parse seguro para no romper ante datos corruptos.
 */

import type { AnesthetistUnavailability, Shift } from "./types";
import { safeParseJSON } from "./storageSafe";

const KEY = "bloque_quirurgico_anesthetist_unavailability";

function isValidEntry(u: unknown): u is AnesthetistUnavailability {
  if (!u || typeof u !== "object") return false;
  const o = u as Record<string, unknown>;
  if (typeof o.anesthetistId !== "string" || !o.anesthetistId) return false;
  if (typeof o.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return false;
  if (o.shift !== "morning" && o.shift !== "afternoon") return false;
  return true;
}

function getStore(): AnesthetistUnavailability[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY);
  const parsed = safeParseJSON<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidEntry);
}

function setStore(list: AnesthetistUnavailability[]): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  }
}

export function getStoredUnavailability(anesthetistId: string): AnesthetistUnavailability[] {
  return getStore().filter((u) => u.anesthetistId === anesthetistId);
}

export function isUnavailable(anesthetistId: string, date: string, shift: Shift): boolean {
  return getStore().some(
    (u) => u.anesthetistId === anesthetistId && u.date === date && u.shift === shift
  );
}

/** Para un anestesista y una fecha, devuelve { morning: true/false, afternoon: true/false } */
export function getUnavailabilityForDate(anesthetistId: string, date: string): { morning: boolean; afternoon: boolean } {
  const list = getStore().filter((u) => u.anesthetistId === anesthetistId && u.date === date);
  return {
    morning: list.some((u) => u.shift === "morning"),
    afternoon: list.some((u) => u.shift === "afternoon"),
  };
}

/** Añade o quita no disponibilidad para (anesthetistId, date, shift). Si add es false, elimina. */
export function setUnavailability(anesthetistId: string, date: string, shift: Shift, add: boolean): void {
  const list = getStore();
  const key = (a: AnesthetistUnavailability) =>
    a.anesthetistId === anesthetistId && a.date === date && a.shift === shift;
  if (add) {
    if (list.some(key)) return;
    list.push({
      id: `unav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      anesthetistId,
      date,
      shift,
    });
  } else {
    const next = list.filter((x) => !key(x));
    if (next.length === list.length) return;
    setStore(next);
    return;
  }
  setStore(list);
}

/** Todas las indisponibilidades (para que el gestor pueda comprobar cualquier anestesista) */
export function getAllUnavailability(): AnesthetistUnavailability[] {
  return getStore();
}
