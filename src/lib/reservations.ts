/**
 * Capa de acceso a reservas con transición demo/API.
 * modoDemo activo → localStorage
 * modoDemo desactivado → API real
 */

import type { Reservation, PatientInBlock } from "./types";
import { modoDemo } from "./config";
import { getStoredReservations, addOrUpdateStoredReservation } from "./storageMensajesYNotificaciones";
import {
  fetchReservations,
  createReservation,
  mapPatientToApi,
  ReservationsApiError,
} from "./api/reservations";

export interface FetchFilters {
  dateFrom?: string;
  dateTo?: string;
  resourceId?: string;
}

export { ReservationsApiError };

/** Obtiene reservas (localStorage si modoDemo, API si no) */
export async function getReservations(filters?: FetchFilters): Promise<Reservation[]> {
  if (modoDemo) {
    const list = getStoredReservations();
    if (!filters) return Promise.resolve(list);
    let result = list;
    if (filters.dateFrom) result = result.filter((r) => r.date >= filters.dateFrom!);
    if (filters.dateTo) result = result.filter((r) => r.date <= filters.dateTo!);
    if (filters.resourceId) result = result.filter((r) => r.resourceId === filters.resourceId);
    return Promise.resolve(result);
  }
  return fetchReservations(filters);
}

export interface CreateReservationData {
  date: string;
  resourceId: string;
  shift: string;
  slotIndex: number;
  surgeonId: string;
  patients?: Omit<PatientInBlock, "id" | "order">[];
}

/** Crea una reserva (localStorage si modoDemo, API si no) */
export async function createReservationEntry(data: CreateReservationData): Promise<Reservation> {
  if (modoDemo) {
    const now = new Date().toISOString();
    const patientsWithId: PatientInBlock[] = (data.patients ?? []).map((p, i) => ({
      ...p,
      id: `pat-${Date.now()}-${i}`,
      order: i,
      admissionType: p.admissionType ?? "ambulatorio",
      solicitudRecursos: p.solicitudRecursos,
    }));
    const res: Reservation = {
      id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      resourceId: data.resourceId as Reservation["resourceId"],
      date: data.date,
      shift: data.shift as Reservation["shift"],
      slotIndex: data.slotIndex,
      surgeonId: data.surgeonId,
      patients: patientsWithId,
      status: "pending",
      createdAt: now,
    };
    addOrUpdateStoredReservation(res);
    return Promise.resolve(res);
  }
  const apiPatients = (data.patients ?? []).map((p, i) => mapPatientToApi({ ...p, order: i }));
  return createReservation({
    date: data.date,
    resourceId: data.resourceId,
    shift: data.shift,
    slotIndex: data.slotIndex,
    patients: apiPatients,
  });
}
