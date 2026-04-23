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
  createReservationBatch,
  updateReservationBlock as updateReservationBlockApi,
  cancelReservation as cancelReservationApi,
  cancelReservationPatient,
  updateReservationPatient as updateReservationPatientApi,
  movePatientsBetweenReservationsApi,
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
  /** En API real: cirujano titular del hueco. Si se omite, el backend usa la sesión. */
  surgeonId: string;
  externalSurgeonName?: string;
  patients?: Omit<PatientInBlock, "id" | "order">[];
}

export interface CreateReservationBatchData {
  slots: Array<{
    date: string;
    resourceId: string;
    shift: string;
    slotIndex: number;
  }>;
  surgeonId: string;
  externalSurgeonName?: string;
  patients?: Omit<PatientInBlock, "id" | "order">[];
  isBatchCreation?: boolean;
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
      externalSurgeonName: data.externalSurgeonName,
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
    surgeonId: data.surgeonId,
    externalSurgeonName: data.externalSurgeonName,
  });
}

export async function createReservationBatchEntry(data: CreateReservationBatchData): Promise<Reservation[]> {
  if (modoDemo) {
    const created: Reservation[] = [];
    const sorted = [...data.slots].sort((a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex);
    const now = new Date().toISOString();
    for (let i = 0; i < sorted.length; i++) {
      const slot = sorted[i]!;
      const patientsWithId: PatientInBlock[] =
        i === 0
          ? (data.patients ?? []).map((p, idx) => ({
              ...p,
              id: `pat-${Date.now()}-${idx}`,
              order: idx,
              admissionType: p.admissionType ?? "ambulatorio",
              solicitudRecursos: p.solicitudRecursos,
            }))
          : [];
      const res: Reservation = {
        id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        resourceId: slot.resourceId as Reservation["resourceId"],
        date: slot.date,
        shift: slot.shift as Reservation["shift"],
        slotIndex: slot.slotIndex,
        surgeonId: data.surgeonId,
        externalSurgeonName: data.externalSurgeonName,
        patients: patientsWithId,
        status: patientsWithId.length > 0 ? "confirmed" : "pending",
        createdAt: now,
      };
      addOrUpdateStoredReservation(res);
      created.push(res);
    }
    return Promise.resolve(created);
  }

  const apiPatients = (data.patients ?? []).map((p, i) => mapPatientToApi({ ...p, order: i }));
  return createReservationBatch({
    slots: data.slots,
    surgeonId: data.surgeonId,
    externalSurgeonName: data.externalSurgeonName,
    patients: apiPatients,
    isBatchCreation: data.isBatchCreation,
  });
}

export interface CancelPatientResult {
  reservation: Reservation;
  slotOutcome: "retained" | "released" | null;
}

/** Cancelar una reserva completa (liberar hueco). Requiere API real. */
export async function cancelReservationEntry(
  reservationId: string,
  reason?: string
): Promise<Reservation> {
  if (modoDemo) {
    throw new ReservationsApiError("Anular reserva no disponible en modo demo.", 400);
  }
  return cancelReservationApi(reservationId, reason);
}

export interface UpdatePatientData {
  reservationId: string;
  patientId: string;
  numeroHistoria?: string;
  name?: string;
  procedure?: string;
  estimatedDurationMinutes?: number;
  anesthesiaType?: string;
  entidadFinanciadora?: string;
  admissionType?: PatientInBlock["admissionType"];
  notes?: string;
  solicitudRecursos?: PatientInBlock["solicitudRecursos"];
}

export interface UpdateReservationBlockData {
  reservationId: string;
  surgeonId?: string;
  externalSurgeonName?: string;
  replacePatients?: boolean;
  patients?: Omit<PatientInBlock, "id" | "order">[];
}

/** Cancelar un paciente. En modoDemo no disponible (usa API real si useRealReservationsApi). */
export async function cancelPatient(
  reservationId: string,
  patientId: string,
  reason?: string
): Promise<CancelPatientResult> {
  if (modoDemo) {
    throw new ReservationsApiError("Cancelar paciente no disponible en modo demo.", 400);
  }
  return cancelReservationPatient(reservationId, patientId, reason);
}

/** Actualiza un paciente dentro de una reserva existente. */
export async function updateReservationPatientEntry(data: UpdatePatientData): Promise<Reservation> {
  if (modoDemo) {
    throw new ReservationsApiError("Editar paciente no disponible en modo demo.", 400);
  }
  return updateReservationPatientApi(data.reservationId, data.patientId, {
    historyNumber: data.numeroHistoria,
    fullName: data.name,
    procedure: data.procedure,
    estimatedDurationMinutes: data.estimatedDurationMinutes,
    anesthesiaType: data.anesthesiaType,
    insuranceType: data.entidadFinanciadora,
    admissionType: data.admissionType,
    notes: data.notes,
    solicitudRecursos: data.solicitudRecursos,
  });
}

export async function updateReservationBlockEntry(data: UpdateReservationBlockData): Promise<Reservation> {
  if (modoDemo) {
    throw new ReservationsApiError("Editar bloque no disponible en modo demo.", 400);
  }
  const apiPatients = (data.patients ?? []).map((p, i) => mapPatientToApi({ ...p, order: i }));
  return updateReservationBlockApi({
    reservationId: data.reservationId,
    surgeonId: data.surgeonId,
    externalSurgeonName: data.externalSurgeonName,
    replacePatients: data.replacePatients,
    patients: apiPatients,
  });
}

/** Mueve pacientes de una reserva a otra (mismo día). Requiere API real. */
export async function movePatientsBetweenReservationsEntry(payload: {
  sourceReservationId: string;
  targetReservationId: string;
  patientIds: string[];
}): Promise<{ destinationHeadReservationId: string; expansionSlotsCreated: number }> {
  if (modoDemo) {
    throw new ReservationsApiError("Mover pacientes entre bloques no disponible en modo demo.", 400);
  }
  return movePatientsBetweenReservationsApi(payload);
}
