/**
 * Datos de ejemplo para la DEMO: reservas, asignaciones de anestesistas,
 * mensajes y notificaciones. Todos los nombres y datos son ficticios o anonimizados.
 * Uso: llamar loadDemoSeed() desde la pantalla de acceso (Cargar datos de ejemplo).
 */

import type { Reservation, PatientInBlock, AnesthetistAssignment, MessageToGestor, AppNotification } from "./types";
import type { ResourceId, Shift } from "./types";
import { ASSIGNMENT_PREANESTHESIA } from "./types";
import { getWeekStart, getWeekDays, toISODate } from "./utils";
import { setStoredReservationsForDemo } from "./storageMensajesYNotificaciones";
import { setStoredAnesthetistAssignments } from "./storageAnesthetistAssignments";

const KEY_MENSAJES = "bloque_quirurgico_mensajes_gestor";
const KEY_NOTIFICACIONES = "bloque_quirurgico_notificaciones";

const SURGEON_ID = "demo-cirujano";
const ENDOSCOPISTA_ID = "demo-endoscopista";
const ANESTESISTA_ID = "demo-anestesista";
const GESTOR_ANESTESISTA_ID = "demo-gestor-anestesista";
const GESTOR_ID = "demo-gestor";

function buildSeedReservations(): Reservation[] {
  const weekStart = getWeekStart(new Date());
  const weekDays = getWeekDays(weekStart);
  const mon = toISODate(weekDays[0]!);
  const tue = toISODate(weekDays[1]!);
  const wed = toISODate(weekDays[2]!);
  const created = new Date().toISOString();

  return [
    // Q1 Lunes mañana slot 0: reservado sin pacientes (hueco parcial)
    {
      id: "res-seed-1",
      resourceId: "Q1" as ResourceId,
      date: mon,
      shift: "morning" as Shift,
      slotIndex: 0,
      surgeonId: SURGEON_ID,
      patients: [],
      status: "pending",
      createdAt: created,
    },
    // Q2 Lunes mañana slot 1: con un paciente (programación parcial)
    {
      id: "res-seed-2",
      resourceId: "Q2" as ResourceId,
      date: mon,
      shift: "morning" as Shift,
      slotIndex: 1,
      surgeonId: SURGEON_ID,
      patients: [
        {
          id: "pat-seed-1",
          name: "Paciente ejemplo 1",
          numeroHistoria: "HC-DEMO-001",
          procedure: "Cirugía menor ejemplo",
          estimatedDurationMinutes: 45,
          anesthesiaType: "Local",
          entidadFinanciadora: "SNS",
          admissionType: "ambulatorio",
          notes: "",
          order: 0,
        } as PatientInBlock,
      ],
      status: "pending",
      createdAt: created,
    },
    // Q3 Martes mañana slot 0: con dos pacientes (uno privado para ver naranja)
    {
      id: "res-seed-3",
      resourceId: "Q3" as ResourceId,
      date: tue,
      shift: "morning" as Shift,
      slotIndex: 0,
      surgeonId: SURGEON_ID,
      patients: [
        {
          id: "pat-seed-2",
          name: "Paciente ejemplo 2",
          numeroHistoria: "HC-DEMO-002",
          procedure: "Procedimiento ejemplo A",
          estimatedDurationMinutes: 60,
          anesthesiaType: "Regional",
          entidadFinanciadora: "SNS",
          admissionType: "ambulatorio",
          notes: "",
          order: 0,
        } as PatientInBlock,
        {
          id: "pat-seed-3",
          name: "Paciente ejemplo 3",
          numeroHistoria: "HC-DEMO-003",
          procedure: "Procedimiento ejemplo B",
          estimatedDurationMinutes: 30,
          anesthesiaType: "Sedación",
          entidadFinanciadora: "Privado",
          admissionType: "ambulatorio",
          notes: "",
          order: 1,
        } as PatientInBlock,
      ],
      status: "pending",
      createdAt: created,
    },
    // Procedimientos menores Miércoles: endoscopista con un paciente
    {
      id: "res-seed-4",
      resourceId: "procedimientos-menores" as ResourceId,
      date: wed,
      shift: "morning" as Shift,
      slotIndex: 0,
      surgeonId: ENDOSCOPISTA_ID,
      patients: [
        {
          id: "pat-seed-4",
          numeroHistoria: "HC-DEMO-004",
          procedure: "Endoscopia ejemplo",
          estimatedDurationMinutes: 40,
          anesthesiaType: "Sedación",
          entidadFinanciadora: "SNS",
          admissionType: "ambulatorio",
          notes: "",
          order: 0,
        } as PatientInBlock,
      ],
      status: "pending",
      createdAt: created,
    },
  ];
}

function buildSeedAssignments(): AnesthetistAssignment[] {
  const weekStart = getWeekStart(new Date());
  const weekDays = getWeekDays(weekStart);
  const mon = toISODate(weekDays[0]!);
  const tue = toISODate(weekDays[1]!);
  // Lunes y jueves para consulta preanestesia
  const thu = weekDays.length > 3 ? toISODate(weekDays[3]!) : mon;

  return [
    { id: "assign-seed-1", date: mon, shift: "morning", assignmentType: "OR" as const, resourceId: "Q1", anesthetistId: ANESTESISTA_ID },
    { id: "assign-seed-2", date: mon, shift: "morning", assignmentType: "OR" as const, resourceId: "Q2", anesthetistId: ANESTESISTA_ID },
    { id: "assign-seed-3", date: mon, shift: "morning", assignmentType: "PREANESTHESIA" as const, resourceId: ASSIGNMENT_PREANESTHESIA, anesthetistId: GESTOR_ANESTESISTA_ID },
    { id: "assign-seed-4", date: tue, shift: "morning", assignmentType: "OR" as const, resourceId: "Q3", anesthetistId: GESTOR_ANESTESISTA_ID },
    { id: "assign-seed-5", date: thu, shift: "morning", assignmentType: "PREANESTHESIA" as const, resourceId: ASSIGNMENT_PREANESTHESIA, anesthetistId: ANESTESISTA_ID },
  ];
}

function buildSeedMessages(): MessageToGestor[] {
  const now = new Date().toISOString();
  return [
    {
      id: "msg-seed-1",
      fromUserId: SURGEON_ID,
      fromName: "Cirujano Demo",
      fromEmail: "cirujano@demo",
      subject: "Consulta de disponibilidad (ejemplo)",
      body: "Mensaje de ejemplo para la demo. Solicitud ficticia de información sobre disponibilidad de quirófanos.",
      date: now,
    },
    {
      id: "msg-seed-2",
      fromUserId: "anon",
      fromName: "Usuario sin acceso",
      fromEmail: "contacto@ejemplo.org",
      subject: "Solicitud de acceso (ejemplo)",
      body: "Mensaje ficticio enviado desde la pantalla de contacto. Sirve para ver el flujo de mensajes en la demo.",
      date: now,
    },
  ];
}

function buildSeedNotifications(): AppNotification[] {
  const now = new Date().toISOString();
  return [
    {
      id: "notif-seed-1",
      userId: GESTOR_ID,
      title: "Nuevo mensaje (ejemplo)",
      message: "Cirujano Demo ha enviado un mensaje: Consulta de disponibilidad (ejemplo).",
      date: now,
      read: false,
    },
    {
      id: "notif-seed-2",
      userId: GESTOR_ID,
      title: "Mensaje desde pantalla de acceso (ejemplo)",
      message: "Usuario sin acceso ha enviado un mensaje. Revise la pestaña Mensajes.",
      date: now,
      read: false,
    },
  ];
}

/**
 * Carga en localStorage un conjunto coherente de datos de ejemplo para la demo:
 * reservas (huecos libres, reservados sin pacientes, con pacientes, uno con financiación privada),
 * asignaciones de anestesistas, mensajes al gestor y notificaciones.
 * No modifica la sesión actual. Ideal usar después de "Restablecer demo" para tener datos limpios y luego cargar ejemplos.
 */
export function loadDemoSeed(): void {
  if (typeof window === "undefined") return;
  try {
    setStoredReservationsForDemo(buildSeedReservations());
    setStoredAnesthetistAssignments(buildSeedAssignments());
    window.localStorage.setItem(KEY_MENSAJES, JSON.stringify(buildSeedMessages()));
    window.localStorage.setItem(KEY_NOTIFICACIONES, JSON.stringify(buildSeedNotifications()));
  } catch {
    // ignorar fallo
  }
}
