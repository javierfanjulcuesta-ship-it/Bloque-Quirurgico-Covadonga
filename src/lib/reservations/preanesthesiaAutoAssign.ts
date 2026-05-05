/**
 * Autocita preanestesia: lunes/jueves, ventana 10:00–12:30 (Europe/Madrid), tramos de 10 min, máx 16/día.
 * La cita debe caer en un día natural estrictamente anterior a la fecha de intervención (YYYY-MM-DD de la reserva).
 */

import type { PrismaClient } from "@prisma/client";

const TZ = "Europe/Madrid";

/** Inicio 10:00; 16 tramos de 10 min → último inicio 12:30 (fin 12:40). */
export const PREANESTHESIA_SLOTS_PER_DAY = 16;
export const PREANESTHESIA_SLOT_MINUTES_FROM_MIDNIGHT = Array.from(
  { length: PREANESTHESIA_SLOTS_PER_DAY },
  (_, i) => 10 * 60 + i * 10,
);

export function todayYmdMadrid(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(now);
}

export function compareYmd(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

/** Último día natural permitido para la cita (el día anterior a la cirugía). */
export function latestPreanesthesiaYmdBeforeSurgery(surgeryYmd: string): string {
  return addDaysYmd(surgeryYmd, -1);
}

export function isMondayOrThursdayYmd(ymd: string): boolean {
  const [y, mo, d] = ymd.split("-").map(Number);
  const utcNoon = Date.UTC(y, mo - 1, d, 12, 0, 0);
  const w = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date(utcNoon));
  return w === "Mon" || w === "Thu";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function minutesToHm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/** Clave estable para ocupación: YYYY-MM-DD|HH:mm en reloj Madrid. */
export function madridSlotKeyFromUtc(d: Date): string {
  const ymd = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${ymd}|${hh}:${mm}`;
}

/** UTC instant cuyo reloj en Madrid coincide con ymd + hora local. */
export function utcDateForMadridWallClock(ymd: string, hour: number, minute: number): Date {
  const [Y, M, D] = ymd.split("-").map(Number);
  const lo = Date.UTC(Y, M - 1, D - 1, 0, 0, 0);
  const hi = Date.UTC(Y, M - 1, D + 2, 0, 0, 0);
  for (let t = lo; t < hi; t += 60_000) {
    const dt = new Date(t);
    const ymdOk = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(dt);
    if (ymdOk !== ymd) continue;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(dt);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "-1", 10);
    const mi = parseInt(parts.find((p) => p.type === "minute")?.value ?? "-1", 10);
    if (h === hour && mi === minute) return dt;
  }
  return new Date(Date.UTC(Y, M - 1, D, Math.max(0, hour - 2), minute, 0));
}

export async function loadPreanesthesiaOccupiedKeys(
  client: Pick<PrismaClient, "patientInBlock">,
): Promise<Set<string>> {
  const rows = await client.patientInBlock.findMany({
    where: {
      preanesthesiaAppointmentAt: { not: null },
      preanesthesiaStatus: "SCHEDULED",
    },
    select: { preanesthesiaAppointmentAt: true },
  });
  const set = new Set<string>();
  for (const r of rows) {
    if (!r.preanesthesiaAppointmentAt) continue;
    set.add(madridSlotKeyFromUtc(r.preanesthesiaAppointmentAt));
  }
  return set;
}

export function findFirstPreanesthesiaSlotUtc(params: {
  surgeryYmd: string;
  todayYmd: string;
  occupiedKeys: Set<string>;
}): { atUtc: Date; key: string } | null {
  const latest = latestPreanesthesiaYmdBeforeSurgery(params.surgeryYmd);
  if (compareYmd(latest, params.todayYmd) < 0) return null;
  for (let ymd = params.todayYmd; compareYmd(ymd, latest) <= 0; ymd = addDaysYmd(ymd, 1)) {
    if (!isMondayOrThursdayYmd(ymd)) continue;
    for (const mins of PREANESTHESIA_SLOT_MINUTES_FROM_MIDNIGHT) {
      const hour = Math.floor(mins / 60);
      const minute = mins % 60;
      const hm = minutesToHm(mins);
      const key = `${ymd}|${hm}`;
      if (params.occupiedKeys.has(key)) continue;
      const atUtc = utcDateForMadridWallClock(ymd, hour, minute);
      return { atUtc, key };
    }
  }
  return null;
}
