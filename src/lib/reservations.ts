/**
 * Capa de acceso a reservas con transición demo/API.
 * modoDemo activo → localStorage
 * modoDemo desactivado → API real
 */

import type { Reservation, PatientInBlock } from "./types";
import { modoDemo } from "./config";
import { getStoredReservations, addOrUpdateStoredReservation } from "./storageMensajesYNotificaciones";
import { isReservationRetentionStillAllowed } from "./schedulingDeadline";
import { recordDemoAuditEvent } from "./demoAudit";
import { isDemoSlotClosed } from "./demoBlockClosures";
import {
  fetchReservations,
  createReservation,
  cancelReservationPatient,
  cancelReservation as cancelReservationApi,
  updateReservationPatient as updateReservationPatientApi,
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
  patients?: Omit<PatientInBlock, "id" | "order">[];
}

/** Crea una reserva (localStorage si modoDemo, API si no) */
export async function createReservationEntry(data: CreateReservationData): Promise<Reservation> {
  if (modoDemo) {
    if (
      isDemoSlotClosed({
        date: data.date,
        resourceId: data.resourceId as Reservation["resourceId"],
        shift: data.shift as Reservation["shift"],
        slotIndex: data.slotIndex,
      })
    ) {
      throw new ReservationsApiError("Este tramo está cerrado por gestión en la DEMO.", 409);
    }

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
    recordDemoAuditEvent({
      action: "reservation.created",
      entityType: "reservation",
      entityId: res.id,
      reservationId: res.id,
    });
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
  });
}

export interface CancelPatientResult {
  reservation: Reservation;
  slotOutcome: "retained" | "released" | null;
  message?: string;
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
  patientEmail?: string;
  patientPhone?: string;
}

/**
 * Cancela un paciente.
 * En DEMO opera solo sobre localStorage y reproduce la política ya existente de retención:
 * si era el último paciente, el tramo queda vacío mientras siga dentro del plazo; pasado el
 * cierre, la reserva local se marca cancelada para que el hueco vuelva a quedar disponible.
 */
export async function cancelPatient(
  reservationId: string,
  patientId: string,
  reason?: string
): Promise<CancelPatientResult> {
  if (modoDemo) {
    const reservation = getStoredReservations().find((item) => item.id === reservationId);
    if (!reservation || reservation.status === "cancelled") {
      throw new ReservationsApiError("Reserva DEMO no encontrada.", 404);
    }
    const patientIndex = reservation.patients.findIndex((patient) => patient.id === patientId);
    if (patientIndex < 0) {
      throw new ReservationsApiError("Paciente DEMO no encontrado.", 404);
    }

    const patients = reservation.patients.filter((patient) => patient.id !== patientId);
    const wasLastPatient = patients.length === 0;
    const retainEmptySlot = wasLastPatient && isReservationRetentionStillAllowed(reservation.date);
    const updated: Reservation = {
      ...reservation,
      patients,
      status: wasLastPatient && !retainEmptySlot ? "cancelled" : reservation.status,
    };
    addOrUpdateStoredReservation(updated);
    recordDemoAuditEvent({
      action: "patient.cancelled",
      entityType: "patient",
      entityId: patientId,
      reservationId,
    });
    void reason;

    return Promise.resolve({
      reservation: updated,
      slotOutcome: wasLastPatient ? (retainEmptySlot ? "retained" : "released") : null,
      message:
        wasLastPatient
          ? retainEmptySlot
            ? "Paciente anulado en DEMO. El hueco sigue reservado sin pacientes."
            : "Paciente anulado en DEMO. El hueco queda liberado en la demostración."
          : "Paciente anulado en DEMO.",
    });
  }
  return cancelReservationPatient(reservationId, patientId, reason);
}

/** Cancelar una reserva completa (liberar bloque). */
export async function cancelReservationEntry(
  reservationId: string,
  reason?: string,
  opts?: { force?: boolean }
): Promise<Reservation> {
  if (modoDemo) {
    const reservation = getStoredReservations().find((item) => item.id === reservationId);
    if (!reservation || reservation.status === "cancelled") {
      throw new ReservationsApiError("Reserva DEMO no encontrada.", 404);
    }
    const updated: Reservation = { ...reservation, status: "cancelled" };
    addOrUpdateStoredReservation(updated);
    recordDemoAuditEvent({
      action: "reservation.cancelled",
      entityType: "reservation",
      entityId: reservationId,
      reservationId,
    });
    void reason;
    void opts;
    return Promise.resolve(updated);
  }
  return cancelReservationApi(reservationId, reason, opts);
}

function applyDefinedPatientFields(patient: PatientInBlock, data: UpdatePatientData): PatientInBlock {
  const next = { ...patient };
  if (data.numeroHistoria !== undefined) next.numeroHistoria = data.numeroHistoria;
  if (data.name !== undefined) next.name = data.name;
  if (data.procedure !== undefined) next.procedure = data.procedure;
  if (data.estimatedDurationMinutes !== undefined) next.estimatedDurationMinutes = data.estimatedDurationMinutes;
  if (data.anesthesiaType !== undefined) next.anesthesiaType = data.anesthesiaType;
  if (data.entidadFinanciadora !== undefined) next.entidadFinanciadora = data.entidadFinanciadora;
  if (data.admissionType !== undefined) next.admissionType = data.admissionType;
  if (data.notes !== undefined) next.notes = data.notes;
  if (data.solicitudRecursos !== undefined) next.solicitudRecursos = data.solicitudRecursos;
  if (data.patientEmail !== undefined) next.patientEmail = data.patientEmail.trim() || undefined;
  if (data.patientPhone !== undefined) next.patientPhone = data.patientPhone.trim() || undefined;
  return next;
}

/** Actualiza un paciente dentro de una reserva existente. */
export async function updateReservationPatientEntry(data: UpdatePatientData): Promise<Reservation> {
  if (modoDemo) {
    const reservation = getStoredReservations().find((item) => item.id === data.reservationId);
    if (!reservation) {
      throw new ReservationsApiError("Reserva DEMO no encontrada.", 404);
    }
    const patientIndex = reservation.patients.findIndex((patient) => patient.id === data.patientId);
    if (patientIndex < 0) {
      throw new ReservationsApiError("Paciente DEMO no encontrado.", 404);
    }
    const patients = reservation.patients.map((patient) =>
      patient.id === data.patientId ? applyDefinedPatientFields(patient, data) : patient
    );
    const updated: Reservation = { ...reservation, patients };
    addOrUpdateStoredReservation(updated);
    recordDemoAuditEvent({
      action: "patient.updated",
      entityType: "patient",
      entityId: data.patientId,
      reservationId: data.reservationId,
    });
    return Promise.resolve(updated);
  }
  return updateReservationPatientApi(data);
}
