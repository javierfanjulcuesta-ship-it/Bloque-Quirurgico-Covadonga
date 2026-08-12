/**
 * Lógica centralizada de cierre de programación.
 * Único punto de configuración en lib/constants.ts:
 * - SCHEDULING_DEADLINE_DAY (4 = jueves)
 * - SCHEDULING_DEADLINE_HOUR, SCHEDULING_DEADLINE_MINUTE (por defecto 0)
 *
 * Regla: el jueves a las 00:00 de Europe/Madrid de la semana N cierra la reserva
 * para la semana N+1. No depende de la zona horaria del proceso (Vercel/Node).
 */

import {
  SCHEDULING_DEADLINE_DAY,
  SCHEDULING_DEADLINE_HOUR,
  SCHEDULING_DEADLINE_MINUTE,
} from "./constants";
import {
  addDaysYmd,
  todayYmdMadrid,
  utcDateForMadridWallClock,
} from "./reservations/preanesthesiaAutoAssign";

/** Días desde el lunes de la semana del slot hasta el jueves anterior. */
const DAYS_BACK_TO_DEADLINE = 8 - SCHEDULING_DEADLINE_DAY;

function assertDateOnly(ymd: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error(`Fecha inválida para cierre de programación: ${ymd}`);
  }
  const [year, month, day] = ymd.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error(`Fecha inválida para cierre de programación: ${ymd}`);
  }
}

/** Lunes de la semana que contiene ymd, sin depender de la TZ del proceso. */
export function mondayYmdForWeek(ymd: string): string {
  assertDateOnly(ymd);
  const [year, month, day] = ymd.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay(); // 0=dom, 1=lun
  const daysSinceMonday = (weekday + 6) % 7;
  return addDaysYmd(ymd, -daysSinceMonday);
}

/**
 * Devuelve el instante UTC de cierre para la semana que contiene slotDateIso,
 * interpretando la hora configurada en Europe/Madrid.
 */
export function getDeadlineForSlotWeek(slotDateIso: string): Date {
  const slotWeekMonday = mondayYmdForWeek(slotDateIso);
  const deadlineYmd = addDaysYmd(slotWeekMonday, -DAYS_BACK_TO_DEADLINE);
  return utcDateForMadridWallClock(
    deadlineYmd,
    SCHEDULING_DEADLINE_HOUR,
    SCHEDULING_DEADLINE_MINUTE,
  );
}

/**
 * Indica si una reserva vacía (0 pacientes) puede seguir retenida por el cirujano.
 * Solo hasta el jueves 00:00 Europe/Madrid de la semana anterior a la del slot.
 */
export function isReservationRetentionStillAllowed(slotDateIso: string, now = new Date()): boolean {
  return now < getDeadlineForSlotWeek(slotDateIso);
}

/**
 * Indica si el slot está en la semana siguiente y ya pasó el cierre de la semana
 * actual. Todas las comparaciones de calendario se hacen en Europe/Madrid.
 */
export function isNextWeekReserveClosed(slotDateIso: string, now = new Date()): boolean {
  const todayMadrid = todayYmdMadrid(now);
  const currentWeekMonday = mondayYmdForWeek(todayMadrid);
  const thisWeekDeadlineYmd = addDaysYmd(currentWeekMonday, SCHEDULING_DEADLINE_DAY - 1);
  const thisWeekDeadline = utcDateForMadridWallClock(
    thisWeekDeadlineYmd,
    SCHEDULING_DEADLINE_HOUR,
    SCHEDULING_DEADLINE_MINUTE,
  );
  if (now < thisWeekDeadline) return false;

  const nextWeekMonday = addDaysYmd(currentWeekMonday, 7);
  return mondayYmdForWeek(slotDateIso) === nextWeekMonday;
}
