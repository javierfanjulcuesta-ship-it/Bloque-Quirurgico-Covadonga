/**
 * API de reservas. Todas las llamadas pasan por el cliente compartido resiliente.
 */

import type { Reservation, PatientInBlock } from "@/lib/types";
import type { ResourceId, Shift } from "@/lib/types";
import { deriveReservationBlockState } from "@/lib/reservationState";
import { ApiError, apiFetch } from "@/lib/api/client";

export interface ApiReservation {
  id: string;
  date: string;
  resourceId: string;
  shift: string;
  slotIndex: number;
  surgeonId: string;
  status: string;
  anesthetistId?: string;
  createdAt: string;
  patients: ApiPatient[];
}

export interface ApiPatient {
  id: string;
  historyNumber: string;
  fullName?: string;
  procedure: string;
  estimatedDurationMinutes: number;
  anesthesiaType: string;
  insuranceType: string;
  admissionType?: string;
  orderIndex: number;
  notes?: string;
  solicitudRecursos?: string;
  patientEmail?: string;
  patientPhone?: string;
  workflowStatus?: string;
  preanesthesiaStatus?: string;
  financingStatus?: string;
  preanesthesiaAppointmentAt?: string;
  isDeferredUrgency?: boolean;
  specialCircuitReason?: string;
}

export interface CreateReservationPayload {
  date: string;
  resourceId: string;
  shift: string;
  slotIndex: number;
  patients?: ApiPatientInput[];
  /** Cirujano/endoscopista responsable cuando programa un gestor (obligatorio en API para ese rol). */
  surgeonId?: string;
}

export interface ApiPatientInput {
  historyNumber: string;
  fullName?: string;
  procedure: string;
  estimatedDurationMinutes: number;
  anesthesiaType: string;
  insuranceType: string;
  admissionType?: string;
  orderIndex: number;
  notes?: string;
  solicitudRecursos?: string;
  patientEmail?: string;
  patientPhone?: string;
  isDeferredUrgency?: boolean;
  specialCircuitReason?: string;
}

export interface FetchReservationsFilters {
  dateFrom?: string;
  dateTo?: string;
  resourceId?: string;
}

/** GET devuelve turno en minúsculas (`toApiReservation`); otros clientes pueden enviar MORNING/AFTERNOON. */
function normalizeShiftFromApi(shift: string): Shift {
  const u = String(shift).trim().toUpperCase();
  return u === "MORNING" ? "morning" : "afternoon";
}

/** Convierte reserva de API al formato del frontend */
export function mapReservationFromApi(api: ApiReservation): Reservation {
  const mapped: Reservation = {
    id: api.id,
    date: api.date,
    resourceId: api.resourceId as ResourceId,
    shift: normalizeShiftFromApi(api.shift),
    slotIndex: api.slotIndex,
    surgeonId: api.surgeonId,
    status: (api.status.toLowerCase() as Reservation["status"]) || "pending",
    anesthetistId: api.anesthetistId,
    createdAt: api.createdAt,
    patients: api.patients.map(mapPatientFromApi),
  };
  mapped.blockState = deriveReservationBlockState(mapped);
  return mapped;
}

/** Convierte paciente de API al formato del frontend */
export function mapPatientFromApi(api: ApiPatient): PatientInBlock {
  return {
    id: api.id,
    name: api.fullName,
    numeroHistoria: api.historyNumber,
    procedure: api.procedure,
    estimatedDurationMinutes: api.estimatedDurationMinutes,
    anesthesiaType: api.anesthesiaType,
    entidadFinanciadora: api.insuranceType,
    admissionType: (api.admissionType as PatientInBlock["admissionType"]) ?? "ambulatorio",
    notes: api.notes ?? "",
    order: api.orderIndex,
    solicitudRecursos: api.solicitudRecursos as PatientInBlock["solicitudRecursos"],
    scheduleStatus: "SCHEDULED",
    patientEmail: api.patientEmail,
    patientPhone: api.patientPhone,
    workflowStatus: api.workflowStatus,
    preanesthesiaStatus: api.preanesthesiaStatus,
    financingStatus: api.financingStatus,
    preanesthesiaAppointmentAt: api.preanesthesiaAppointmentAt,
    isDeferredUrgency: api.isDeferredUrgency,
    specialCircuitReason: api.specialCircuitReason,
  };
}

/** Convierte reserva del frontend al payload de la API (para crear) */
export function mapReservationToApi(r: {
  date: string;
  resourceId: string;
  shift: string;
  slotIndex: number;
  patients: Omit<PatientInBlock, "id" | "order">[];
}): CreateReservationPayload {
  return {
    date: r.date,
    resourceId: r.resourceId,
    shift: r.shift,
    slotIndex: r.slotIndex,
    patients: r.patients.map((p, i) => mapPatientToApi({ ...p, order: i })),
  };
}

/** Convierte paciente del frontend al formato de la API */
export function mapPatientToApi(p: Omit<PatientInBlock, "id" | "order"> & { order?: number }): ApiPatientInput {
  return {
    historyNumber: p.numeroHistoria,
    fullName: p.name,
    procedure: p.procedure,
    estimatedDurationMinutes: p.estimatedDurationMinutes,
    anesthesiaType: p.anesthesiaType,
    insuranceType: p.entidadFinanciadora,
    admissionType: p.admissionType ?? "ambulatorio",
    orderIndex: p.order ?? 0,
    notes: p.notes ?? "",
    solicitudRecursos: p.solicitudRecursos,
    patientEmail: p.patientEmail?.trim() || undefined,
    patientPhone: p.patientPhone?.trim() || undefined,
    isDeferredUrgency: p.isDeferredUrgency === true ? true : undefined,
    specialCircuitReason: p.isDeferredUrgency && p.specialCircuitReason?.trim()
      ? p.specialCircuitReason.trim()
      : undefined,
  };
}

export class ReservationsApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ReservationsApiError";
  }
}

function responseObject(error: ApiError): { error?: string; message?: string; code?: string } {
  if (!error.responseBody || typeof error.responseBody !== "object") return {};
  return error.responseBody as { error?: string; message?: string; code?: string };
}

function asReservationError(
  error: unknown,
  messages: Partial<Record<number, string>>,
  fallback: string,
): never {
  if (!(error instanceof ApiError)) throw error;
  const body = responseObject(error);
  const message = messages[error.status] ?? body.message ?? body.error ?? error.message ?? fallback;
  throw new ReservationsApiError(message || fallback, error.status, body.code);
}

export async function fetchReservations(filters?: FetchReservationsFilters): Promise<Reservation[]> {
  const params = new URLSearchParams();
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.set("dateTo", filters.dateTo);
  if (filters?.resourceId) params.set("resourceId", filters.resourceId);
  const qs = params.toString();

  try {
    const data = await apiFetch<{ reservations?: ApiReservation[] }>(`/reservations${qs ? `?${qs}` : ""}`);
    return (data.reservations ?? []).map(mapReservationFromApi);
  } catch (error) {
    asReservationError(
      error,
      {
        401: "Sesión expirada. Inicie sesión de nuevo.",
        403: "No tiene permiso para ver reservas.",
      },
      "Error al cargar reservas",
    );
  }
}

export async function createReservation(payload: CreateReservationPayload): Promise<Reservation> {
  const body: Record<string, unknown> = {
    date: payload.date,
    resourceId: payload.resourceId,
    shift: payload.shift,
    slotIndex: payload.slotIndex,
    patients: (payload.patients ?? []).map((p) => ({
      ...p,
      orderIndex: p.orderIndex ?? 0,
    })),
  };
  if (payload.surgeonId) body.surgeonId = payload.surgeonId;

  try {
    const data = await apiFetch<{ reservation: ApiReservation }>("/reservations", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return mapReservationFromApi(data.reservation);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const response = responseObject(error);
      throw new ReservationsApiError(
        response.message ?? response.error ?? "Hueco ocupado.",
        409,
        response.code,
      );
    }
    asReservationError(
      error,
      {
        401: "Sesión expirada. Inicie sesión de nuevo.",
        403: "No tiene permiso para crear esta reserva.",
      },
      "Error al crear la reserva",
    );
  }
}

async function patchReservation(id: string, path: string, body: unknown): Promise<Reservation> {
  try {
    const data = await apiFetch<{ reservation: ApiReservation }>(`/reservations/${id}${path}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return mapReservationFromApi(data.reservation);
  } catch (error) {
    asReservationError(
      error,
      {
        401: "Sesión expirada. Inicie sesión de nuevo.",
        403: error instanceof ApiError ? error.message : "Sin permiso.",
        404: error instanceof ApiError ? error.message : "No encontrado.",
      },
      "Error al actualizar",
    );
  }
}

/** Añadir pacientes a reserva existente (hueco reservado). */
export async function addPatientsToReservation(
  reservationId: string,
  patients: ApiPatientInput[]
): Promise<Reservation> {
  return patchReservation(reservationId, "", {
    patients: patients.map((p, i) => ({ ...p, orderIndex: p.orderIndex ?? i })),
  });
}

/** Actualizar datos de un paciente en la reserva. */
export async function updateReservationPatient(
  reservationId: string,
  patientId: string,
  updates: Partial<Omit<ApiPatient, "id" | "orderIndex">> & { orderIndex?: number }
): Promise<Reservation> {
  return patchReservation(reservationId, "/patient", { patientId, ...updates });
}

/** Resultado de cancelar un paciente. slotOutcome indica qué pasa con el hueco cuando era el último. */
export interface CancelPatientResult {
  reservation: Reservation;
  slotOutcome: "retained" | "released" | null;
  /** Texto listo para mostrar al usuario (generado en servidor). */
  message?: string;
}

/** Cancelar un paciente de la reserva (elimina al paciente, deja hueco libre o bolsa común si era el último). */
export async function cancelReservationPatient(
  reservationId: string,
  patientId: string,
  reason?: string
): Promise<CancelPatientResult> {
  try {
    const data = await apiFetch<{
      reservation: ApiReservation;
      slotOutcome?: "retained" | "released" | null;
      message?: string;
    }>(`/reservations/${reservationId}/patient/cancel`, {
      method: "PATCH",
      body: JSON.stringify({ patientId, reason }),
    });

    return {
      reservation: mapReservationFromApi(data.reservation),
      slotOutcome: data.slotOutcome ?? null,
      message: typeof data.message === "string" ? data.message : undefined,
    };
  } catch (error) {
    asReservationError(
      error,
      {
        401: "Sesión expirada. Inicie sesión de nuevo.",
        403: error instanceof ApiError ? error.message : "Sin permiso.",
        404: error instanceof ApiError ? error.message : "No encontrado.",
      },
      "Error al cancelar",
    );
  }
}

/** Cancelar reserva completa. */
export async function cancelReservation(
  reservationId: string,
  reason?: string,
  opts?: { force?: boolean }
): Promise<Reservation> {
  return patchReservation(reservationId, "/cancel", { reason, force: opts?.force === true });
}
