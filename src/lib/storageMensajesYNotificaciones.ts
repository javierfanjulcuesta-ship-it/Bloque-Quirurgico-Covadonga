/**
 * Persistencia en localStorage: mensajes al gestor, notificaciones in-app y reservas creadas en la app.
 * Al leer se usa parse seguro para que datos corruptos no rompan la app.
 */

import type { MessageToGestor, AppNotification, Reservation, Shift } from "./types";
import { RESOURCES } from "./constants";
import { safeParseJSON } from "./storageSafe";

const KEY_MENSAJES = "bloque_quirurgico_mensajes_gestor";
const KEY_NOTIFICACIONES = "bloque_quirurgico_notificaciones";
const KEY_NO_APTO = "bloque_quirurgico_pacientes_no_apto";
const KEY_RECORDATORIO_SEMANA = "bloque_quirurgico_recordatorio_semana";
const KEY_HUECOS_LIBERADOS_SEMANA = "bloque_quirurgico_huecos_liberados_semana";
const KEY_FESTIVOS = "bloque_quirurgico_festivos";
const KEY_RESERVATIONS = "bloque_quirurgico_reservations";

export type NoAptoEntry = { reservationId: string; patientId: string };

export function getMessagesToGestor(): MessageToGestor[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY_MENSAJES);
  const parsed = safeParseJSON<unknown>(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function addMessageToGestor(msg: Omit<MessageToGestor, "id" | "date">): void {
  const list = getMessagesToGestor();
  const newMsg: MessageToGestor = {
    ...msg,
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
  };
  list.unshift(newMsg);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY_MENSAJES, JSON.stringify(list));
  }
}

export function getNotifications(): AppNotification[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY_NOTIFICACIONES);
  const parsed = safeParseJSON<unknown>(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function getNotificationsForUser(userId: string): AppNotification[] {
  return getNotifications().filter((n) => n.userId === userId);
}

export function addNotification(notification: Omit<AppNotification, "id" | "date" | "read">): void {
  const list = getNotifications();
  const newOne: AppNotification = {
    ...notification,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    read: false,
  };
  list.unshift(newOne);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY_NOTIFICACIONES, JSON.stringify(list));
  }
}

export function markNotificationRead(id: string): void {
  const list = getNotifications();
  const idx = list.findIndex((n) => n.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], read: true };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY_NOTIFICACIONES, JSON.stringify(list));
  }
}

export function markAllNotificationsReadForUser(userId: string): void {
  const list = getNotifications();
  let changed = false;
  const updated = list.map((n) => {
    if (n.userId === userId && !n.read) {
      changed = true;
      return { ...n, read: true };
    }
    return n;
  });
  if (changed && typeof window !== "undefined") {
    window.localStorage.setItem(KEY_NOTIFICACIONES, JSON.stringify(updated));
  }
}

// --- Pacientes marcados como no aptos en consulta de preanestesia ---
export function getNoAptoList(): NoAptoEntry[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY_NO_APTO);
  const parsed = safeParseJSON<unknown>(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function isPacienteNoApto(reservationId: string, patientId: string): boolean {
  return getNoAptoList().some(
    (e) => e.reservationId === reservationId && e.patientId === patientId
  );
}

export function addNoApto(reservationId: string, patientId: string): void {
  const list = getNoAptoList();
  if (list.some((e) => e.reservationId === reservationId && e.patientId === patientId)) return;
  list.push({ reservationId, patientId });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY_NO_APTO, JSON.stringify(list));
  }
}

/** Clave de la semana para la que ya se envió el recordatorio miércoles (lunes en ISO, ej. "2025-03-17") */
export function getRecordatorioSentWeek(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY_RECORDATORIO_SEMANA);
}

export function setRecordatorioSentWeek(weekMondayIso: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY_RECORDATORIO_SEMANA, weekMondayIso);
  }
}

/** Semana para la que ya se envió la notificación de huecos liberados (jueves): lunes en ISO de la semana siguiente. */
export function getHuecosLiberadosSentWeek(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY_HUECOS_LIBERADOS_SEMANA);
}

export function setHuecosLiberadosSentWeek(weekMondayIso: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY_HUECOS_LIBERADOS_SEMANA, weekMondayIso);
  }
}

// --- Días festivos (bloquean reservas; el gestor los marca en Calendario completo) ---
export function getFestivos(): string[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY_FESTIVOS);
  const parsed = safeParseJSON<unknown>(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function addFestivo(isoDate: string): void {
  const list = getFestivos();
  if (list.includes(isoDate)) return;
  list.push(isoDate);
  list.sort();
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY_FESTIVOS, JSON.stringify(list));
  }
}

export function removeFestivo(isoDate: string): void {
  const list = getFestivos().filter((d) => d !== isoDate);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY_FESTIVOS, JSON.stringify(list));
  }
}

export function isFestivo(isoDate: string): boolean {
  return getFestivos().includes(isoDate);
}

// --- Reservas creadas en la app (cirujano / endoscopista / gestor programación) ---
const VALID_RESOURCE_IDS = new Set<string>(RESOURCES.map((r) => r.id));
const VALID_SHIFTS: Shift[] = ["morning", "afternoon"];

function isValidReservation(r: unknown): r is Reservation {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.trim()) return false;
  if (typeof o.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return false;
  if (!VALID_RESOURCE_IDS.has(o.resourceId as string)) return false;
  if (!VALID_SHIFTS.includes(o.shift as Shift)) return false;
  if (typeof o.slotIndex !== "number" || !Number.isFinite(o.slotIndex) || o.slotIndex < 0) return false;
  if (typeof o.surgeonId !== "string" || !o.surgeonId) return false;
  if (!Array.isArray(o.patients)) return false;
  const status = o.status as string;
  if (status !== "pending" && status !== "confirmed" && status !== "cancelled") return false;
  return true;
}

function reservationSlotKey(r: Reservation): string {
  return `${r.date}-${r.resourceId}-${r.shift}-${r.slotIndex}`;
}

export function getStoredReservations(): Reservation[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY_RESERVATIONS);
  const parsed = safeParseJSON<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidReservation);
}

/** Añade o actualiza una reserva (misma ranura = actualiza). Así el gestor ve las reservas creadas por cirujanos/endoscopistas. */
export function addOrUpdateStoredReservation(reservation: Reservation): void {
  const key = reservationSlotKey(reservation);
  const list = getStoredReservations().filter((r) => reservationSlotKey(r) !== key);
  list.push(reservation);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY_RESERVATIONS, JSON.stringify(list));
  }
}

/** Sustituye todas las reservas (solo para cargar datos de ejemplo en modo DEMO). */
export function setStoredReservationsForDemo(reservations: Reservation[]): void {
  if (typeof window === "undefined") return;
  const valid = Array.isArray(reservations) ? reservations.filter(isValidReservation) : [];
  window.localStorage.setItem(KEY_RESERVATIONS, JSON.stringify(valid));
}
