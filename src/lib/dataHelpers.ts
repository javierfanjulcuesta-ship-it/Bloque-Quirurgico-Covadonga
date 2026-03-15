/**
 * Helpers de datos: reservas en periodo, construcción de SlotViews para el calendario.
 * No duplica la lógica de la V1; es la fuente única en V2.
 */

import type { Reservation, SlotView, User } from "./types";
import { RESOURCES } from "./constants";
import { getWeekDays, getSlots, toISODate } from "./utils";

/** Reservas en un rango de fechas (incluidas from y to). */
export function getReservationsInPeriod(
  dateFrom: string,
  dateTo: string,
  reservations: Reservation[]
): Reservation[] {
  return reservations.filter(
    (r) => r.date >= dateFrom && r.date <= dateTo && r.status !== "cancelled"
  );
}

export interface BuildSlotViewsOptions {
  /** Si es gestor, se muestran nombres de cirujano y pacientes en las celdas */
  asGestor?: boolean;
  /** ID del usuario actual para marcar isMyReservation y status reserved/occupied */
  currentUserId?: string;
  /** Lista de usuarios para resolver surgeonName */
  users?: User[];
}

/**
 * Construye la lista de SlotView para una semana a partir de las reservas.
 * Recorre todos los recursos, los 5 días laborables y los tramos mañana/tarde.
 */
export function buildSlotViews(
  weekStart: Date,
  reservations: Reservation[],
  options: BuildSlotViewsOptions = {}
): SlotView[] {
  const { asGestor = false, currentUserId, users = [] } = options;
  const days = getWeekDays(weekStart);
  const views: SlotView[] = [];
  const resourceIds = RESOURCES.map((r) => r.id);
  const morningCount = getSlots("morning").length;
  const afternoonCount = getSlots("afternoon").length;

  const getSurgeonName = (surgeonId: string) =>
    users.find((u) => u.id === surgeonId)?.name;

  days.forEach((date) => {
    const dateStr = toISODate(date);
    resourceIds.forEach((resourceId) => {
      for (let i = 0; i < morningCount; i++) {
        const res = reservations.find(
          (r) =>
            r.date === dateStr &&
            r.resourceId === resourceId &&
            r.shift === "morning" &&
            r.slotIndex === i
        );
        const isMine =
          currentUserId &&
          res &&
          (res.surgeonId === currentUserId ||
            (res.coSurgeonIds && res.coSurgeonIds.includes(currentUserId)));
        views.push({
          resourceId,
          date: dateStr,
          shift: "morning",
          slotIndex: i,
          status: res ? (isMine && res.patients.length === 0 ? "reserved" : "occupied") : "free",
          reservationId: res?.id,
          isMyReservation: !!isMine,
          surgeonName: asGestor && res ? getSurgeonName(res.surgeonId) : undefined,
          patientsCount: res ? res.patients.length : undefined,
          patientNames:
            asGestor && res
              ? res.patients.map((p) => p.name ?? p.numeroHistoria)
              : undefined,
        });
      }
      for (let i = 0; i < afternoonCount; i++) {
        const res = reservations.find(
          (r) =>
            r.date === dateStr &&
            r.resourceId === resourceId &&
            r.shift === "afternoon" &&
            r.slotIndex === i
        );
        const isMine =
          currentUserId &&
          res &&
          (res.surgeonId === currentUserId ||
            (res.coSurgeonIds && res.coSurgeonIds.includes(currentUserId)));
        views.push({
          resourceId,
          date: dateStr,
          shift: "afternoon",
          slotIndex: i,
          status: res ? (isMine && res.patients.length === 0 ? "reserved" : "occupied") : "free",
          reservationId: res?.id,
          isMyReservation: !!isMine,
          surgeonName: asGestor && res ? getSurgeonName(res.surgeonId) : undefined,
          patientsCount: res ? res.patients.length : undefined,
          patientNames:
            asGestor && res
              ? res.patients.map((p) => p.name ?? p.numeroHistoria)
              : undefined,
        });
      }
    });
  });

  return views;
}

/** Usuarios de ejemplo para demo y login. Incluye gestor con contraseña inicial (ver passwords.ts). */
export const MOCK_USERS: User[] = [
  { id: "u-gestor", name: "Javier Fanjul Cuesta", email: "javier.fanjul.cuesta@gmail.com", role: "gestor-anestesista", approved: true },
  { id: "u1", name: "Dra. María García", email: "maria.garcia@hospital.local", role: "cirujano", approved: true },
  { id: "u2", name: "Dr. Juan López", email: "juan.lopez@hospital.local", role: "cirujano", approved: true },
  // Usuarios de prueba para ver el display según perfil (contraseña en blanco)
  { id: "u-cirujano-prueba", name: "Cirujano Prueba", email: "cirujano@prueba", role: "cirujano", approved: true },
  { id: "u-anestesista-prueba", name: "Anestesista Prueba", email: "anestesista@prueba", role: "anestesista", approved: true },
  { id: "u-gestor-prueba", name: "Gestor Prueba", email: "gestor@prueba", role: "gestor", approved: true },
];

function normalizedName(name: string): string {
  return name.toLowerCase().replace(/\s/g, "");
}

/** Busca usuario por correo o por "usuario" (nombre sin espacios). */
export function findUserByEmailOrUsername(users: User[], input: string): User | undefined {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return undefined;
  const byEmail = users.find((u) => u.email.toLowerCase() === trimmed);
  if (byEmail) return byEmail;
  if (!trimmed.includes("@")) {
    return users.find((u) => normalizedName(u.name) === trimmed);
  }
  return undefined;
}

export function getUsers(extraUsers: User[] = []): User[] {
  const byId = new Map<string, User>();
  MOCK_USERS.forEach((u) => byId.set(u.id, u));
  extraUsers.forEach((u) => byId.set(u.id, u));
  return Array.from(byId.values());
}
