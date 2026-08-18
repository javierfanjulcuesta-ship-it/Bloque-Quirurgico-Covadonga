import type { PatientInBlock, Reservation } from "./types";
import { isPrivateFunding } from "./patientInsurance";
import { getSlots, getWeekStart, toISODate } from "./utils";

export const LOCAL_NO_ANESTHETIST = "Local (no precisa anestesista)";

export type PreanesthesiaOperationalStatus =
  | "APTO"
  | "PENDIENTE_CON_CITA"
  | "PENDIENTE_SIN_CITA"
  | "NO_APTO"
  | "NO_PRECISA";

export type AuthorizationOperationalStatus = "PENDIENTE" | "APROBADA" | "DENEGADA" | "NO_PRECISA";
export type ConfirmationOperationalStatus =
  | "PENDIENTE"
  | "CONFIRMADO_CON_PACIENTE"
  | "NO_LOCALIZADO"
  | "REQUIERE_NUEVA_LLAMADA"
  | "INCIDENCIA";

export interface GestionCitasOverlay {
  confirmationStatus?: ConfirmationOperationalStatus;
  authorizationStatus?: Exclude<AuthorizationOperationalStatus, "NO_PRECISA">;
  attemptCount?: number;
  lastAttemptAt?: string;
  note?: string;
}

export interface GestionCitasRow {
  reservationId: string;
  patientId: string;
  patientName: string;
  historyNumber: string;
  procedure: string;
  surgeryDate: string;
  surgeryTime: string;
  resourceId: string;
  surgeonId: string;
  patientPhone?: string;
  patientEmail?: string;
  anesthesiaType: string;
  preanesthesiaStatus: PreanesthesiaOperationalStatus;
  preanesthesiaAppointmentAt?: string;
  authorizationStatus: AuthorizationOperationalStatus;
  confirmationStatus: ConfirmationOperationalStatus;
  attemptCount: number;
  globalStatus: "LISTO" | "REQUIERE_ATENCION" | "PENDIENTE";
  priority: number;
  reasons: string[];
}

function normalize(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function isLocalWithoutAnesthetist(anesthesiaType: string | undefined): boolean {
  return normalize(anesthesiaType) === normalize(LOCAL_NO_ANESTHETIST);
}

export function derivePreanesthesiaOperationalStatus(
  patient: Pick<PatientInBlock, "anesthesiaType" | "preanesthesiaStatus" | "preanesthesiaAppointmentAt">,
  now = new Date(),
): PreanesthesiaOperationalStatus {
  if (isLocalWithoutAnesthetist(patient.anesthesiaType)) return "NO_PRECISA";

  const raw = normalize(patient.preanesthesiaStatus);
  if (raw === "no apto" || raw === "not fit" || raw === "unfit") return "NO_APTO";
  if (raw === "apto" || raw === "fit") return "APTO";

  if (patient.preanesthesiaAppointmentAt) {
    const at = new Date(patient.preanesthesiaAppointmentAt);
    if (Number.isFinite(at.getTime())) {
      // Regla acordada: una cita ya pasada se considera APTO salvo que exista NO APTO explícito.
      if (at.getTime() <= now.getTime()) return "APTO";
      return "PENDIENTE_CON_CITA";
    }
  }

  return "PENDIENTE_SIN_CITA";
}

export function deriveAuthorizationOperationalStatus(
  patient: Pick<PatientInBlock, "entidadFinanciadora" | "financingStatus">,
  overlay?: GestionCitasOverlay,
): AuthorizationOperationalStatus {
  if (isPrivateFunding(patient.entidadFinanciadora)) return "NO_PRECISA";
  const source = overlay?.authorizationStatus ?? patient.financingStatus ?? "PENDIENTE";
  const raw = normalize(source);
  if (raw === "aprobada" || raw === "approved") return "APROBADA";
  if (raw === "denegada" || raw === "denied") return "DENEGADA";
  return "PENDIENTE";
}

export function nextWorkingWeekBounds(now = new Date()): { from: string; to: string } {
  const currentMonday = getWeekStart(now);
  const nextMonday = new Date(currentMonday);
  nextMonday.setDate(currentMonday.getDate() + 7);
  const friday = new Date(nextMonday);
  friday.setDate(nextMonday.getDate() + 4);
  return { from: toISODate(nextMonday), to: toISODate(friday) };
}

function surgeryTimeForReservation(reservation: Reservation): string {
  const slot = getSlots(reservation.shift)[reservation.slotIndex];
  return slot?.start ?? (reservation.shift === "morning" ? "Mañana" : "Tarde");
}

function deriveGlobalStatus(params: {
  preanesthesia: PreanesthesiaOperationalStatus;
  authorization: AuthorizationOperationalStatus;
  confirmation: ConfirmationOperationalStatus;
  hasContact: boolean;
}): GestionCitasRow["globalStatus"] {
  if (
    params.preanesthesia === "NO_APTO" ||
    params.authorization === "DENEGADA" ||
    params.confirmation === "INCIDENCIA" ||
    !params.hasContact
  ) return "REQUIERE_ATENCION";

  const preResolved = params.preanesthesia === "APTO" || params.preanesthesia === "NO_PRECISA";
  const authResolved = params.authorization === "APROBADA" || params.authorization === "NO_PRECISA";
  if (preResolved && authResolved && params.confirmation === "CONFIRMADO_CON_PACIENTE") return "LISTO";
  return "PENDIENTE";
}

function priorityForRow(params: {
  preanesthesia: PreanesthesiaOperationalStatus;
  authorization: AuthorizationOperationalStatus;
  confirmation: ConfirmationOperationalStatus;
  hasContact: boolean;
}): number {
  if (!params.hasContact || params.preanesthesia === "NO_APTO" || params.authorization === "DENEGADA" || params.confirmation === "INCIDENCIA") return 10;
  if (params.confirmation === "PENDIENTE") return 20;
  if (params.confirmation === "NO_LOCALIZADO" || params.confirmation === "REQUIERE_NUEVA_LLAMADA") return 30;
  if (params.preanesthesia === "PENDIENTE_CON_CITA" || params.preanesthesia === "PENDIENTE_SIN_CITA") return 40;
  return 90;
}

export function buildGestionCitasRows(
  reservations: Reservation[],
  overlays: Record<string, GestionCitasOverlay> = {},
  now = new Date(),
): GestionCitasRow[] {
  const rows: GestionCitasRow[] = [];

  for (const reservation of reservations) {
    if (reservation.status === "cancelled" || reservation.status === "released") continue;
    for (const patient of reservation.patients ?? []) {
      if (patient.scheduleStatus === "CANCELLED") continue;
      const overlay = overlays[patient.id];
      const confirmation = overlay?.confirmationStatus ?? "PENDIENTE";
      const preanesthesia = derivePreanesthesiaOperationalStatus(patient, now);
      const authorization = deriveAuthorizationOperationalStatus(patient, overlay);
      const hasContact = !!(patient.patientPhone?.trim() || patient.patientEmail?.trim());
      const reasons: string[] = [];
      if (!patient.patientPhone?.trim()) reasons.push("Falta teléfono");
      if (!patient.patientEmail?.trim()) reasons.push("Falta email");
      if (preanesthesia === "NO_APTO") reasons.push("NO APTO");
      if (authorization === "DENEGADA") reasons.push("Autorización denegada");
      if (authorization === "PENDIENTE") reasons.push("Autorización pendiente");
      if (confirmation !== "CONFIRMADO_CON_PACIENTE") reasons.push("Confirmación pendiente");

      rows.push({
        reservationId: reservation.id,
        patientId: patient.id,
        patientName: patient.name?.trim() || patient.numeroHistoria,
        historyNumber: patient.numeroHistoria,
        procedure: patient.procedure,
        surgeryDate: reservation.date,
        surgeryTime: surgeryTimeForReservation(reservation),
        resourceId: reservation.resourceId,
        surgeonId: reservation.surgeonId,
        patientPhone: patient.patientPhone,
        patientEmail: patient.patientEmail,
        anesthesiaType: patient.anesthesiaType,
        preanesthesiaStatus: preanesthesia,
        preanesthesiaAppointmentAt: patient.preanesthesiaAppointmentAt,
        authorizationStatus: authorization,
        confirmationStatus: confirmation,
        attemptCount: overlay?.attemptCount ?? 0,
        globalStatus: deriveGlobalStatus({ preanesthesia, authorization, confirmation, hasContact }),
        priority: priorityForRow({ preanesthesia, authorization, confirmation, hasContact }),
        reasons,
      });
    }
  }

  return rows.sort((a, b) => a.priority - b.priority || a.surgeryDate.localeCompare(b.surgeryDate) || a.surgeryTime.localeCompare(b.surgeryTime));
}
