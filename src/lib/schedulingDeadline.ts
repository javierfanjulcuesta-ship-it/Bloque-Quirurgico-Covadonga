/**
 * Lógica centralizada de cierre de programación.
 * Único punto de configuración en lib/constants.ts:
 * - SCHEDULING_DEADLINE_DAY (4 = jueves)
 * - SCHEDULING_DEADLINE_HOUR, SCHEDULING_DEADLINE_MINUTE (por defecto 0)
 *
 * Regla: el jueves a las 00:00 de la semana N cierra la reserva para la semana N+1.
 */

import { SCHEDULING_DEADLINE_DAY, SCHEDULING_DEADLINE_HOUR, SCHEDULING_DEADLINE_MINUTE } from "./constants";
import { getWeekStart } from "./utils";

/** Días desde el lunes de la semana del slot hasta el jueves anterior. Thursday = Lun + 3, luego -4. */
const DAYS_BACK_TO_DEADLINE = 8 - SCHEDULING_DEADLINE_DAY;

/**
 * Devuelve el instante de cierre para la semana que contiene slotDateIso.
 * La semana del slot se cierra el jueves HH:MM de la semana anterior.
 */
export function getDeadlineForSlotWeek(slotDateIso: string): Date {
  const slotWeekStart = getWeekStart(new Date(slotDateIso + "T12:00:00"));
  const deadline = new Date(slotWeekStart);
  deadline.setDate(slotWeekStart.getDate() - DAYS_BACK_TO_DEADLINE);
  deadline.setHours(SCHEDULING_DEADLINE_HOUR, SCHEDULING_DEADLINE_MINUTE, 0, 0);
  return deadline;
}

/**
 * Indica si una reserva vacía (0 pacientes) puede seguir retenida por el cirujano.
 * Solo hasta el jueves 00:00 de la semana anterior a la del slot.
 */
export function isReservationRetentionStillAllowed(slotDateIso: string): boolean {
  const deadline = getDeadlineForSlotWeek(slotDateIso);
  return new Date() < deadline;
}

/**
 * Indica si el slot está en la "semana siguiente" y ya pasó el cierre.
 * Usado en UI: si true, no se puede reservar huecos vacíos (solo programar en libres).
 */
export function isNextWeekReserveClosed(slotDateIso: string): boolean {
  const now = new Date();
  const currentWeekStart = getWeekStart(now);
  const thursday = new Date(currentWeekStart);
  thursday.setDate(currentWeekStart.getDate() + (SCHEDULING_DEADLINE_DAY - 1)); // Lun+3 = Jueves
  thursday.setHours(SCHEDULING_DEADLINE_HOUR, SCHEDULING_DEADLINE_MINUTE, 0, 0);
  if (now < thursday) return false;
  const nextWeekStart = new Date(currentWeekStart);
  nextWeekStart.setDate(currentWeekStart.getDate() + 7);
  const slotWeekStart = getWeekStart(new Date(slotDateIso + "T12:00:00"));
  return slotWeekStart.getTime() === nextWeekStart.getTime();
}
