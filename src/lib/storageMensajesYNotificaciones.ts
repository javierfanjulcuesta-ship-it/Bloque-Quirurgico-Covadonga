/**
 * Persistencia en localStorage: mensajes al gestor, notificaciones in-app y reservas creadas en la app.
 */

import type { MessageToGestor, AppNotification, Reservation } from "./types";

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
  try {
    const raw = window.localStorage.getItem(KEY_MENSAJES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MessageToGestor[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  try {
    const raw = window.localStorage.getItem(KEY_NOTIFICACIONES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  try {
    const raw = window.localStorage.getItem(KEY_NO_APTO);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NoAptoEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  try {
    const raw = window.localStorage.getItem(KEY_FESTIVOS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
function reservationSlotKey(r: Reservation): string {
  return `${r.date}-${r.resourceId}-${r.shift}-${r.slotIndex}`;
}

export function getStoredReservations(): Reservation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY_RESERVATIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Reservation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
