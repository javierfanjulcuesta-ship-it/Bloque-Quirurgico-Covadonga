/**
 * Constantes del Bloque Quirúrgico - Hospital Covadonga
 * División: Quirófanos (Q1, Q2, Q3), Sala de procedimientos menores, Zona de técnicas del dolor.
 */

import type { ResourceId, TimeSlot, UserRole } from "./types";

/** Recursos del bloque: 3 quirófanos + procedimientos menores + técnicas del dolor */
export const RESOURCES: { id: ResourceId; label: string }[] = [
  { id: "Q1", label: "Q1" },
  { id: "Q2", label: "Q2" },
  { id: "Q3", label: "Q3" },
  { id: "procedimientos-menores", label: "Procedimientos menores" },
  { id: "tecnicas-dolor", label: "Técnicas del dolor" },
];

/** Horario: mañana 08:00-14:30, tarde 15:00-20:00 */
export const SHIFT_TIMES = {
  morning: { start: "08:00", end: "14:30" },
  afternoon: { start: "15:00", end: "20:00" },
} as const;

/** Tramos de la mañana: primer tramo 1.5h, resto 1h */
export const MORNING_SLOTS: TimeSlot[] = [
  { id: "m0", start: "08:00", end: "09:30", durationMinutes: 90, isFirstSlot: true },
  { id: "m1", start: "09:30", end: "10:30", durationMinutes: 60, isFirstSlot: false },
  { id: "m2", start: "10:30", end: "11:30", durationMinutes: 60, isFirstSlot: false },
  { id: "m3", start: "11:30", end: "12:30", durationMinutes: 60, isFirstSlot: false },
  { id: "m4", start: "12:30", end: "13:30", durationMinutes: 60, isFirstSlot: false },
  { id: "m5", start: "13:30", end: "14:30", durationMinutes: 60, isFirstSlot: false },
];

/** Tramos de la tarde: primer tramo 1.5h, resto 1h */
export const AFTERNOON_SLOTS: TimeSlot[] = [
  { id: "a0", start: "15:00", end: "16:30", durationMinutes: 90, isFirstSlot: true },
  { id: "a1", start: "16:30", end: "17:30", durationMinutes: 60, isFirstSlot: false },
  { id: "a2", start: "17:30", end: "18:30", durationMinutes: 60, isFirstSlot: false },
  { id: "a3", start: "18:30", end: "19:30", durationMinutes: 60, isFirstSlot: false },
  { id: "a4", start: "19:30", end: "20:00", durationMinutes: 30, isFirstSlot: false },
];

/** Días laborables */
export const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes"] as const;

/** Consulta de preanestesia: lunes y jueves mañana, máx 12 pacientes */
export const PREANESTHESIA_DAYS: ("monday" | "thursday")[] = ["monday", "thursday"];
export const PREANESTHESIA_MAX_PATIENTS = 12;

/** Cierre reserva: jueves 00:00 cierra la semana siguiente; máximo 4 semanas por delante */
export const SCHEDULING_DEADLINE_DAY = 4;
export const SCHEDULING_DEADLINE_WEEK_OFFSET = -1;

/** Recordatorio automático: miércoles se avisa a cirujanos con huecos sin pacientes */
export const NOTIFICATION_DAY = 3;

/** Minutos extra por procedimiento: limpieza, anestesia y colocación (norma: solo 10 min por procedimiento) */
export const TRANSITION_MINUTES_PER_PROCEDURE = 10;

/** Recursos que puede reservar cada rol: cirujano solo Q1–Q3; endoscopista solo procedimientos menores y técnicas del dolor */
export function getAllowedResourcesForRole(role: UserRole): ResourceId[] {
  if (role === "endoscopista") {
    return ["procedimientos-menores", "tecnicas-dolor"];
  }
  if (role === "cirujano") {
    return ["Q1", "Q2", "Q3"];
  }
  return ["Q1", "Q2", "Q3", "procedimientos-menores", "tecnicas-dolor"];
}
