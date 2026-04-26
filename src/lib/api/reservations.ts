/**
 * API de reservas. Llamadas directas al backend.
 */

import type { Reservation, PatientInBlock } from "@/lib/types";
import type { ResourceId, Shift } from "@/lib/types";
import { deriveReservationBlockState } from "@/lib/reservationState";

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

export async function fetchReservations(filters?: FetchReservationsFilters): Promise<Reservation[]> {
  const params = new URLSearchParams();
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.set("dateTo", filters.dateTo);
  if (filters?.resourceId) params.set("resourceId", filters.resourceId);
  const qs = params.toString();
  const url = `/api/reservations${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, { credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) throw new ReservationsApiError("Sesión expirada. Inicie sesión de nuevo.", 401);
    if (res.status === 403) throw new ReservationsApiError("No tiene permiso para ver reservas.", 403);
    throw new ReservationsApiError((data as { error?: string }).error ?? "Error al cargar reservas", res.status);
  }

  const list = (data as { reservations: ApiReservation[] }).reservations ?? [];
  return list.map(mapReservationFromApi);
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

  const res = await fetch("/api/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) throw new ReservationsApiError("Sesión expirada. Inicie sesión de nuevo.", 401);
    if (res.status === 403) throw new ReservationsApiError("No tiene permiso para crear esta reserva.", 403);
    if (res.status === 409) {
      const d = data as { error?: string; message?: string; code?: string };
      throw new ReservationsApiError(d.message ?? d.error ?? "Hueco ocupado.", 409, d.code);
    }
    throw new ReservationsApiError((data as { error?: string }).error ?? "Error al crear la reserva", res.status);
  }

  const reservation = (data as { reservation: ApiReservation }).reservation;
  return mapReservationFromApi(reservation);
}

async function patchReservation(id: string, path: string, body: unknown): Promise<Reservation> {
  const res = await fetch(`/api/reservations/${id}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) throw new ReservationsApiError("Sesión expirada. Inicie sesión de nuevo.", 401);
    if (res.status === 403) throw new ReservationsApiError((data as { error?: string }).error ?? "Sin permiso.", 403);
    if (res.status === 404) throw new ReservationsApiError((data as { error?: string }).error ?? "No encontrado.", 404);
    throw new ReservationsApiError((data as { error?: string }).error ?? "Error al actualizar", res.status);
  }

  const reservation = (data as { reservation: ApiReservation }).reservation;
  return mapReservationFromApi(reservation);
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
  const res = await fetch(`/api/reservations/${reservationId}/patient/cancel`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ patientId, reason }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) throw new ReservationsApiError("Sesión expirada. Inicie sesión de nuevo.", 401);
    if (res.status === 403) throw new ReservationsApiError((data as { error?: string }).error ?? "Sin permiso.", 403);
    if (res.status === 404) throw new ReservationsApiError((data as { error?: string }).error ?? "No encontrado.", 404);
    throw new ReservationsApiError((data as { error?: string }).error ?? "Error al cancelar", res.status);
  }

  const typed = data as {
    reservation: ApiReservation;
    slotOutcome?: "retained" | "released" | null;
    message?: string;
  };
  return {
    reservation: mapReservationFromApi(typed.reservation),
    slotOutcome: typed.slotOutcome ?? null,
    message: typeof typed.message === "string" ? typed.message : undefined,
  };
}

/** Cancelar reserva completa. */
export async function cancelReservation(
  reservationId: string,
  reason?: string,
  opts?: { force?: boolean }
): Promise<Reservation> {
  return patchReservation(reservationId, "/cancel", { reason, force: opts?.force === true });
}
