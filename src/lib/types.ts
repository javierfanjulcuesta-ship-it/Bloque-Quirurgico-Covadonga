/**
 * Tipos del Bloque Quirúrgico - Hospital Covadonga
 */

/** Perfiles de usuario del sistema (gestor-anestesista = visión gestor y anestesista; endoscopista = reserva solo procedimientos menores / técnicas del dolor) */
export type UserRole = "cirujano" | "anestesista" | "gestor" | "gestor-anestesista" | "endoscopista";

/** Indica si el rol tiene acceso al área de gestión */
export function hasGestorAccess(role: UserRole): boolean {
  return role === "gestor" || role === "gestor-anestesista";
}

/** Indica si el rol tiene acceso al área de anestesista */
export function hasAnesthetistAccess(role: UserRole): boolean {
  return role === "anestesista" || role === "gestor-anestesista";
}

/** Etiqueta para mostrar el rol */
export function roleLabel(role: UserRole): string {
  if (role === "gestor-anestesista") return "Gestor/Anestesista";
  if (role === "endoscopista") return "Endoscopista/otros";
  return role === "cirujano" ? "Cirujano" : role === "anestesista" ? "Anestesista" : "Gestor";
}

/** Roles que usan la pantalla de programación (calendario, reservas, etc.) */
export function hasProgrammingAccess(role: UserRole): boolean {
  return role === "cirujano" || role === "endoscopista";
}

/** Recursos del bloque: quirófanos Q1–Q3, sala de procedimientos menores, zona de técnicas del dolor */
export type ResourceId =
  | "Q1"
  | "Q2"
  | "Q3"
  | "procedimientos-menores"
  | "tecnicas-dolor";

/** Turno: mañana o tarde */
export type Shift = "morning" | "afternoon";

/** Estado de un hueco: libre, reservado por el usuario (sin pacientes) u ocupado */
export type SlotStatus = "free" | "reserved" | "occupied";

/** Usuario del sistema */
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  approved: boolean;
}

/** Tramo horario (hueco) dentro de un turno */
export interface TimeSlot {
  id: string;
  start: string;
  end: string;
  durationMinutes: number;
  isFirstSlot: boolean;
}

/** Reserva de un hueco por un cirujano */
export interface Reservation {
  id: string;
  resourceId: ResourceId;
  date: string;
  shift: Shift;
  slotIndex: number;
  surgeonId: string;
  coSurgeonIds?: string[];
  patients: PatientInBlock[];
  status: "pending" | "confirmed" | "cancelled";
  anesthetistId?: string;
  createdAt: string;
}

/** Ingreso o ambulatorio */
export type AdmissionType = "ingreso" | "ambulatorio";

/** Valor de solicitud de recursos (Rayo, Mesa de mano, etc.) */
export type SolicitudRecursosId = "rayo" | "mesa-mano" | "posicionamiento-cadera" | "caja-instrumental-ptc-ptr" | "mesa-hombro" | "ninguno";

/** Paciente dentro de un bloque reservado */
export interface PatientInBlock {
  id: string;
  name?: string;
  numeroHistoria: string;
  procedure: string;
  estimatedDurationMinutes: number;
  anesthesiaType: string;
  entidadFinanciadora: string;
  admissionType?: AdmissionType;
  notes: string;
  order: number;
  /** Solicitud de recursos: Rayo, Mesa de mano, Posicionamiento de cadera, etc. */
  solicitudRecursos?: SolicitudRecursosId;
}

/** Perfil extendido del usuario (foto, apellidos, teléfono, especialidad). Rellenado en primer acceso. */
export interface UserProfile {
  userId: string;
  photoDataUrl?: string;
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  especialidad: string;
  completedAt: string;
}

/** Vista del hueco para el calendario */
export interface SlotView {
  resourceId: ResourceId;
  date: string;
  shift: Shift;
  slotIndex: number;
  status: SlotStatus;
  reservationId?: string;
  isMyReservation?: boolean;
  surgeonName?: string;
  patientsCount?: number;
  patientNames?: string[];
  /** true si algún paciente tiene financiación privada */
  hasPrivate?: boolean;
  /** true si el anestesista actual está asignado a este slot */
  assignedToAnesthetist?: boolean;
}

/** Indisponibilidad del anestesista */
export interface AnesthetistUnavailability {
  id: string;
  anesthetistId: string;
  date: string;
  shift?: Shift;
}

/** Consulta de preanestesia */
export interface PreanesthesiaSlot {
  date: string;
  shift: "morning";
  maxPatients: number;
  assignedCount: number;
  patientIds: string[];
}

/** Cirugía anestesiada (histórico) */
export interface AnesthetizedSurgery {
  id: string;
  date: string;
  resourceId: ResourceId;
  surgeonName: string;
  patientNames: string[];
  procedure?: string;
}

/** Tipo de hueco en la asignación (legacy) */
export type AssignmentSlotType = "consulta-preanestesia" | ResourceId;

/** Tipo de asignación: OR = quirófano, PREANESTHESIA = consulta */
export type AssignmentType = "OR" | "PREANESTHESIA";

/** Sentineles para resourceId */
export const ASSIGNMENT_PREANESTHESIA = "__preanestesia__";
export const ASSIGNMENT_FULL_SHIFT = "__full_shift__";

/** Asignación de anestesista a un turno */
export interface AnesthetistAssignment {
  id: string;
  date: string;
  shift: Shift;
  /** OR = quirófano, PREANESTHESIA = consulta */
  assignmentType: AssignmentType;
  /** Recurso (Q1, Q2...) o __full_shift__ (turno completo) o __preanestesia__ */
  resourceId: string;
  anesthetistId: string;
  /** Legacy: equivale a resourceId si OR, o "consulta-preanestesia" si PREANESTHESIA */
  slotType?: AssignmentSlotType;
}

/** Mensaje al gestor */
export interface MessageToGestor {
  id: string;
  fromUserId: string;
  fromName: string;
  fromEmail?: string;
  subject: string;
  body: string;
  date: string;
}

/** Notificación in-app */
export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
}
