/**
 * Utilidades: fechas, semana laboral, reglas de programación
 */

import {
  MORNING_SLOTS,
  AFTERNOON_SLOTS,
  TRANSITION_MINUTES_PER_PROCEDURE,
} from "./constants";
import type { Shift } from "./types";

export function formatDate(date: Date): string {
  return date.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getWeekDays(weekStart: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }
  return days;
}

/** Semana completa (7 días) a partir del lunes. */
export function getFullWeekDays(weekStartMonday: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartMonday);
    d.setDate(weekStartMonday.getDate() + i);
    days.push(d);
  }
  return days;
}

/** Cuadrícula de semanas: filas = semanas, columnas = 7 días (L-D). */
export function getCalendarGridWeeks(periodStartMonday: Date, numWeeks: number): Date[][] {
  const grid: Date[][] = [];
  const start = new Date(periodStartMonday);
  start.setHours(0, 0, 0, 0);
  for (let w = 0; w < numWeeks; w++) {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + w * 7);
    grid.push(getFullWeekDays(weekStart));
  }
  return grid;
}

const MAX_DAYS_AHEAD = 28;

export function canScheduleWeek(weekStart: Date): boolean {
  const d = new Date(weekStart);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d.getTime() < today.getTime()) return true;
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + MAX_DAYS_AHEAD);
  return d.getTime() <= maxDate.getTime();
}

export { isNextWeekReserveClosed, isReservationRetentionStillAllowed } from "./schedulingDeadline";

export function canReserveOnDate(date: Date, festivos?: string[], asGestor?: boolean): boolean {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  const iso = toISODate(d);
  if (festivos?.length && festivos.includes(iso)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d.getTime() < today.getTime()) return false;
  if (asGestor) return true;
  return canScheduleWeek(d);
}

export function getSlots(shift: Shift) {
  return shift === "morning" ? MORNING_SLOTS : AFTERNOON_SLOTS;
}

export function getSlotDurationMinutes(shift: Shift, slotIndex: number): number {
  const slots = getSlots(shift);
  const slot = slots[slotIndex];
  return slot ? slot.durationMinutes : 60;
}

export function getEffectiveTotalMinutes(
  patients: { estimatedDurationMinutes?: number }[]
): number {
  return patients.reduce(
    (sum, p) => sum + (p.estimatedDurationMinutes || 0) + TRANSITION_MINUTES_PER_PROCEDURE,
    0
  );
}

/**
 * Minutos efectivos solo de filas con duración estimada > 0 (procedimiento + transición).
 * Sirve para holgura en el modal sin contar líneas de paciente vacías en borrador.
 */
export function getEffectiveTotalMinutesFilledRows(
  patients: { estimatedDurationMinutes?: number }[]
): number {
  return patients.reduce((sum, p) => {
    const m =
      typeof p.estimatedDurationMinutes === "number" &&
      Number.isFinite(p.estimatedDurationMinutes) &&
      p.estimatedDurationMinutes > 0
        ? p.estimatedDurationMinutes
        : 0;
    if (m <= 0) return sum;
    return sum + m + TRANSITION_MINUTES_PER_PROCEDURE;
  }, 0);
}

export function isToday(date: Date): boolean {
  const today = new Date();
  return toISODate(date) === toISODate(today);
}

export function isPast(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d < today;
}
