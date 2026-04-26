/**
 * Helpers de datos: reservas en periodo, construcción de SlotViews para el calendario.
 * No duplica la lógica de la V1; es la fuente única en V2.
 */

import type { Reservation, SlotView, User, BlockOpeningPlan } from "./types";
import { RESOURCES } from "./constants";
import { getWeekDays, getSlots, toISODate, getSlotDurationMinutes, getEffectiveTotalMinutes } from "./utils";
import { isPrivateFunding, reservationHasSespa } from "./patientInsurance";
import { deriveReservationBlockState } from "./reservationState";

/** Huecos con reserva activa en cuadrícula; CANCELLED/RELEASED no bloquean el slot (fila sigue en BD). */
function isSlotOccupyingReservation(r: Reservation): boolean {
  return r.status !== "cancelled" && r.status !== "released";
}

/** Reservas en un rango de fechas (incluidas from y to). */
export function getReservationsInPeriod(
  dateFrom: string,
  dateTo: string,
  reservations: Reservation[]
): Reservation[] {
  return reservations.filter(
    (r) =>
      r.date >= dateFrom &&
      r.date <= dateTo &&
      isSlotOccupyingReservation(r)
  );
}

export interface BuildSlotViewsOptions {
  /** Si es gestor, se muestran nombres de cirujano y pacientes en las celdas */
  asGestor?: boolean;
  /** ID del usuario actual para marcar isMyReservation y status reserved/occupied */
  currentUserId?: string;
  /** Lista de usuarios para resolver surgeonName */
  users?: User[];
  /** Planes de apertura: slots con CLOSED/URGENT_RESERVED no son reservables por cirujanos */
  blockPlans?: BlockOpeningPlan[];
  /** Si es gestor, los slots bloqueados siguen siendo reservables (gestor puede abrir excepciones) */
  asGestorForBlocks?: boolean;
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
  const { asGestor = false, currentUserId, users = [], blockPlans = [], asGestorForBlocks = false } = options;
  const days = getWeekDays(weekStart);
  const views: SlotView[] = [];
  const resourceIds = RESOURCES.map((r) => r.id);
  const morningCount = getSlots("morning").length;
  const afternoonCount = getSlots("afternoon").length;

  const getSurgeonName = (surgeonId: string) =>
    surgeonId === "[otro]" ? "Otro cirujano" : users.find((u) => u.id === surgeonId)?.name;

  /** Plan para (date, resourceId, shift): si CLOSED o URGENT_RESERVED, bloquea para no-gestores */
  const getBlockReason = (dateStr: string, resourceId: string, shift: "morning" | "afternoon") => {
    if (asGestorForBlocks) return undefined;
    const plan = blockPlans.find(
      (p) => p.date === dateStr && p.resourceId === resourceId && p.shift === shift
    );
    if (plan && (plan.status === "CLOSED" || plan.status === "URGENT_RESERVED")) {
      return plan.status as "CLOSED" | "URGENT_RESERVED";
    }
    return undefined;
  };

  days.forEach((date) => {
    const dateStr = toISODate(date);
    resourceIds.forEach((resourceId) => {
      for (let i = 0; i < morningCount; i++) {
        const res = reservations.find(
          (r) =>
            r.date === dateStr &&
            r.resourceId === resourceId &&
            r.shift === "morning" &&
            r.slotIndex === i &&
            isSlotOccupyingReservation(r)
        );
        const isMine =
          currentUserId &&
          res &&
          res.surgeonId === currentUserId;
        const hasPrivate = res ? res.patients?.some((p) => isPrivateFunding(p.entidadFinanciadora)) : false;
        const hasSespa = res ? reservationHasSespa(res) : false;
        const usedMinutes = res ? getEffectiveTotalMinutes(res.patients ?? []) : 0;
        const totalMinutes = getSlotDurationMinutes("morning", i);
        const freeMinutes = Math.max(0, totalMinutes - usedMinutes);
        const blockReason = getBlockReason(dateStr, resourceId, "morning");
        const isEmptyReservation = (res?.patients?.length ?? 0) === 0;
        const baseStatus = res
          ? (isEmptyReservation && (asGestor || !!isMine) ? "reserved" : "occupied")
          : (blockReason ? "blocked" : "free");
        views.push({
          resourceId,
          date: dateStr,
          shift: "morning",
          slotIndex: i,
          status: baseStatus,
          blockReason: blockReason,
          reservationId: res?.id,
          isMyReservation: !!isMine,
          surgeonName: asGestor && res ? getSurgeonName(res.surgeonId) : undefined,
          patientsCount: res ? (res.patients?.length ?? 0) : undefined,
          patientNames:
            asGestor && res
              ? (res.patients ?? []).map((p) => p.name ?? p.numeroHistoria)
              : undefined,
          hasPrivate: hasPrivate || undefined,
          hasSespa: hasSespa || undefined,
          usedMinutes: usedMinutes || undefined,
          totalMinutes: totalMinutes || undefined,
          freeMinutes: freeMinutes || undefined,
          reservationBlockState: res ? deriveReservationBlockState(res) : undefined,
        });
      }
      for (let i = 0; i < afternoonCount; i++) {
        const res = reservations.find(
          (r) =>
            r.date === dateStr &&
            r.resourceId === resourceId &&
            r.shift === "afternoon" &&
            r.slotIndex === i &&
            isSlotOccupyingReservation(r)
        );
        const isMine =
          currentUserId &&
          res &&
          res.surgeonId === currentUserId;
        const hasPrivate = res ? res.patients?.some((p) => isPrivateFunding(p.entidadFinanciadora)) : false;
        const hasSespa = res ? reservationHasSespa(res) : false;
        const usedMinutes = res ? getEffectiveTotalMinutes(res.patients ?? []) : 0;
        const totalMinutes = getSlotDurationMinutes("afternoon", i);
        const freeMinutes = Math.max(0, totalMinutes - usedMinutes);
        const blockReason = getBlockReason(dateStr, resourceId, "afternoon");
        const isEmptyReservation = (res?.patients?.length ?? 0) === 0;
        const baseStatus = res
          ? (isEmptyReservation && (asGestor || !!isMine) ? "reserved" : "occupied")
          : (blockReason ? "blocked" : "free");
        views.push({
          resourceId,
          date: dateStr,
          shift: "afternoon",
          slotIndex: i,
          status: baseStatus,
          blockReason: blockReason,
          reservationId: res?.id,
          isMyReservation: !!isMine,
          surgeonName: asGestor && res ? getSurgeonName(res.surgeonId) : undefined,
          patientsCount: res ? (res.patients?.length ?? 0) : undefined,
          patientNames:
            asGestor && res
              ? (res.patients ?? []).map((p) => p.name ?? p.numeroHistoria)
              : undefined,
          hasPrivate: hasPrivate || undefined,
          hasSespa: hasSespa || undefined,
          usedMinutes: usedMinutes || undefined,
          totalMinutes: totalMinutes || undefined,
          freeMinutes: freeMinutes || undefined,
          reservationBlockState: res ? deriveReservationBlockState(res) : undefined,
        });
      }
    });
  });

  // Fase visual de arrastre: si una reserva con pacientes supera el tramo base,
  // marca los tramos posteriores del mismo recurso/turno como ocupados por continuación.
  const viewByKey = new Map<string, SlotView>();
  for (const v of views) {
    viewByKey.set(`${v.date}__${v.resourceId}__${v.shift}__${v.slotIndex}`, v);
  }

  for (const res of reservations) {
    if (!isSlotOccupyingReservation(res)) continue;
    if ((res.patients?.length ?? 0) === 0) continue;

    const usedMinutes = Math.max(0, getEffectiveTotalMinutes(res.patients ?? []));
    const baseMinutes = getSlotDurationMinutes(res.shift, res.slotIndex);
    let overflowMinutes = usedMinutes - baseMinutes;
    if (overflowMinutes <= 0) continue;

    const slotCount = getSlots(res.shift).length;
    const sourceIsMine = currentUserId != null && res.surgeonId === currentUserId;
    const sourceHasPrivate = (res.patients ?? []).some((p) => isPrivateFunding(p.entidadFinanciadora));
    const sourceHasSespa = reservationHasSespa(res);
    const sourceSurgeonName = getSurgeonName(res.surgeonId);
    const sourcePatientNames = (res.patients ?? []).map((p) => p.name ?? p.numeroHistoria);
    const baseKey = `${res.date}__${res.resourceId}__${res.shift}__${res.slotIndex}`;
    const baseView = viewByKey.get(baseKey);

    for (let next = res.slotIndex + 1; next < slotCount && overflowMinutes > 0; next++) {
      const nextDuration = getSlotDurationMinutes(res.shift, next);
      const consumedHere = Math.min(overflowMinutes, nextDuration);
      const key = `${res.date}__${res.resourceId}__${res.shift}__${next}`;
      const target = viewByKey.get(key);
      if (!target) {
        overflowMinutes -= consumedHere;
        continue;
      }
      if (target.status === "blocked") {
        overflowMinutes -= consumedHere;
        continue;
      }

      const occupyingAtNext = reservations.find(
        (r) =>
          r.date === res.date &&
          r.resourceId === res.resourceId &&
          r.shift === res.shift &&
          r.slotIndex === next &&
          isSlotOccupyingReservation(r)
      );
      const nextPatientCount = occupyingAtNext?.patients?.length ?? 0;

      // No sustituir una reserva que ya tiene pacientes en este tramo (ni la propia en otro registro duplicado).
      if (nextPatientCount > 0) {
        target.overflowContinuationConflict = true;
        if (baseView) baseView.overflowContinuationConflict = true;
        continue;
      }

      // Solo libre o reserva vacía (reserved); no pisar continuación ya pintada por otra reserva.
      if (target.isOverflowContinuation && target.overflowFromReservationId && target.overflowFromReservationId !== res.id) {
        if (baseView) baseView.overflowContinuationConflict = true;
        continue;
      }

      if (target.isOverflowContinuation && target.overflowFromReservationId === res.id) {
        overflowMinutes -= consumedHere;
        continue;
      }

      if (target.status !== "free" && target.status !== "reserved") {
        target.overflowContinuationConflict = true;
        if (baseView) baseView.overflowContinuationConflict = true;
        continue;
      }

      target.status = "occupied";
      target.reservationId = res.id;
      target.isMyReservation = sourceIsMine;
      target.surgeonName = asGestor ? sourceSurgeonName : target.surgeonName;
      target.patientsCount = res.patients?.length ?? 0;
      target.patientNames = asGestor ? sourcePatientNames : target.patientNames;
      target.hasPrivate = sourceHasPrivate || undefined;
      target.hasSespa = sourceHasSespa || undefined;
      target.usedMinutes = consumedHere;
      target.totalMinutes = nextDuration;
      target.freeMinutes = Math.max(0, nextDuration - consumedHere);
      target.reservationBlockState = deriveReservationBlockState(res);
      target.isOverflowContinuation = true;
      target.overflowFromReservationId = res.id;

      overflowMinutes -= consumedHere;
    }
  }

  return views;
}

/** Usuarios de demostración para el selector de acceso (modo DEMO sin contraseña). */
export const MOCK_USERS: User[] = [
  { id: "demo-gestor-anestesista", name: "Gestor Anestesista Demo", email: "gestor-anestesista@demo", role: "gestor-anestesista", approved: true, canSespa: true },
  { id: "demo-gestor", name: "Gestor Demo", email: "gestor@demo", role: "gestor", approved: true },
  { id: "demo-anestesista", name: "Anestesista Demo", email: "anestesista@demo", role: "anestesista", approved: true, canSespa: true },
  { id: "demo-cirujano", name: "Cirujano Demo", email: "cirujano@demo", role: "cirujano", approved: true },
  { id: "demo-endoscopista", name: "Endoscopista Demo", email: "endoscopista@demo", role: "endoscopista", approved: true },
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

import { modoDemo } from "./config";
import { getUsersCache } from "./usersCache";

export function getUsers(extraUsers: User[] = []): User[] {
  const base = modoDemo ? MOCK_USERS : getUsersCache();
  const byId = new Map<string, User>();
  base.forEach((u) => byId.set(u.id, u));
  extraUsers.forEach((u) => byId.set(u.id, u));
  return Array.from(byId.values());
}
