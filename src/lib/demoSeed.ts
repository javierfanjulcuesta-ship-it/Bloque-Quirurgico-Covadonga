/**
 * Datos de ejemplo para la DEMO: reservas, asignaciones de anestesistas,
 * mensajes, notificaciones y escenarios operativos de Gestión de citas.
 * Todos los nombres y datos son ficticios.
 */

import type { Reservation, PatientInBlock, AnesthetistAssignment, MessageToGestor, AppNotification } from "./types";
import type { ResourceId, Shift } from "./types";
import { ASSIGNMENT_PREANESTHESIA } from "./types";
import { getWeekStart, getWeekDays, toISODate } from "./utils";
import { setStoredReservationsForDemo } from "./storageMensajesYNotificaciones";
import { setStoredAnesthetistAssignments } from "./storageAnesthetistAssignments";
import { setDemoGestionCitasState } from "./demoGestionCitasState";
import { LOCAL_NO_ANESTHETIST } from "./gestionCitas";

const KEY_MENSAJES = "bloque_quirurgico_mensajes_gestor";
const KEY_NOTIFICACIONES = "bloque_quirurgico_notificaciones";

const SURGEON_ID = "demo-cirujano";
const ENDOSCOPISTA_ID = "demo-endoscopista";
const ANESTESISTA_ID = "demo-anestesista";
const GESTOR_ANESTESISTA_ID = "demo-gestor-anestesista";
const GESTOR_ID = "demo-gestor";

function nextWeekDays(): Date[] {
  const currentMonday = getWeekStart(new Date());
  const nextMonday = new Date(currentMonday);
  nextMonday.setDate(currentMonday.getDate() + 7);
  return getWeekDays(nextMonday);
}

function isoAtLocal(ymd: string, hour: number, minute: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0).toISOString();
}

function buildSeedReservations(): Reservation[] {
  const weekStart = getWeekStart(new Date());
  const weekDays = getWeekDays(weekStart);
  const mon = toISODate(weekDays[0]!);
  const tue = toISODate(weekDays[1]!);
  const wed = toISODate(weekDays[2]!);
  const [nextMonD, nextTueD, nextWedD, nextThuD, nextFriD] = nextWeekDays();
  const nextMon = toISODate(nextMonD!);
  const nextTue = toISODate(nextTueD!);
  const nextWed = toISODate(nextWedD!);
  const nextThu = toISODate(nextThuD!);
  const nextFri = toISODate(nextFriD!);
  const created = new Date().toISOString();
  const pastPreanesthesia = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  return [
    // Escenarios básicos de calendario de la semana actual.
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
          name: "Paciente ejemplo 4",
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

    // Semana siguiente: variedad deliberada para probar la worklist de Gestión de citas.
    {
      id: "res-citas-next-1",
      resourceId: "Q1" as ResourceId,
      date: nextMon,
      shift: "morning" as Shift,
      slotIndex: 0,
      surgeonId: SURGEON_ID,
      patients: [
        {
          id: "pat-citas-missing-contact",
          name: "Paciente Demo Contacto",
          numeroHistoria: "HC-DEMO-C01",
          procedure: "Procedimiento sintético 1",
          estimatedDurationMinutes: 55,
          anesthesiaType: "General",
          entidadFinanciadora: "Mutua Demo",
          admissionType: "ambulatorio",
          notes: "",
          order: 0,
          preanesthesiaStatus: "SCHEDULED",
          preanesthesiaAppointmentAt: pastPreanesthesia,
          financingStatus: "DENEGADA",
        } as PatientInBlock,
      ],
      status: "confirmed",
      createdAt: created,
    },
    {
      id: "res-citas-next-2",
      resourceId: "Q2" as ResourceId,
      date: nextTue,
      shift: "morning" as Shift,
      slotIndex: 0,
      surgeonId: SURGEON_ID,
      patients: [
        {
          id: "pat-citas-future-pre",
          name: "Paciente Demo Cita",
          numeroHistoria: "HC-DEMO-C02",
          procedure: "Procedimiento sintético 2",
          estimatedDurationMinutes: 70,
          anesthesiaType: "Regional",
          entidadFinanciadora: "Mutua Demo",
          admissionType: "ambulatorio",
          notes: "",
          order: 0,
          patientPhone: "+34 600 000 102",
          patientEmail: "paciente.c02@example.test",
          preanesthesiaStatus: "SCHEDULED",
          preanesthesiaAppointmentAt: isoAtLocal(nextMon, 10, 20),
          financingStatus: "PENDING",
        } as PatientInBlock,
      ],
      status: "confirmed",
      createdAt: created,
    },
    {
      id: "res-citas-next-3",
      resourceId: "Q3" as ResourceId,
      date: nextWed,
      shift: "morning" as Shift,
      slotIndex: 1,
      surgeonId: SURGEON_ID,
      patients: [
        {
          id: "pat-citas-private-local",
          name: "Paciente Demo Local",
          numeroHistoria: "HC-DEMO-C03",
          procedure: "Procedimiento sintético 3",
          estimatedDurationMinutes: 35,
          anesthesiaType: LOCAL_NO_ANESTHETIST,
          entidadFinanciadora: "Privado",
          admissionType: "ambulatorio",
          notes: "",
          order: 0,
          patientPhone: "+34 600 000 103",
          patientEmail: "paciente.c03@example.test",
          preanesthesiaStatus: "PENDING",
          financingStatus: "PENDING",
        } as PatientInBlock,
      ],
      status: "confirmed",
      createdAt: created,
    },
    {
      id: "res-citas-next-4",
      resourceId: "Q1" as ResourceId,
      date: nextThu,
      shift: "afternoon" as Shift,
      slotIndex: 0,
      surgeonId: SURGEON_ID,
      patients: [
        {
          id: "pat-citas-no-apto",
          name: "Paciente Demo No Apto",
          numeroHistoria: "HC-DEMO-C04",
          procedure: "Procedimiento sintético 4",
          estimatedDurationMinutes: 80,
          anesthesiaType: "General",
          entidadFinanciadora: "Mutua Demo",
          admissionType: "ingreso",
          notes: "",
          order: 0,
          patientPhone: "+34 600 000 104",
          patientEmail: "paciente.c04@example.test",
          preanesthesiaStatus: "NO APTO",
          financingStatus: "APROBADA",
        } as PatientInBlock,
      ],
      status: "confirmed",
      createdAt: created,
    },
    {
      id: "res-citas-next-5",
      resourceId: "Q2" as ResourceId,
      date: nextFri,
      shift: "morning" as Shift,
      slotIndex: 1,
      surgeonId: SURGEON_ID,
      patients: [
        {
          id: "pat-citas-past-pre",
          name: "Paciente Demo Seguimiento",
          numeroHistoria: "HC-DEMO-C05",
          procedure: "Procedimiento sintético 5",
          estimatedDurationMinutes: 50,
          anesthesiaType: "Sedación",
          entidadFinanciadora: "Mutua Demo",
          admissionType: "ambulatorio",
          notes: "",
          order: 0,
          patientPhone: "+34 600 000 105",
          patientEmail: "paciente.c05@example.test",
          preanesthesiaStatus: "SCHEDULED",
          preanesthesiaAppointmentAt: pastPreanesthesia,
          financingStatus: "APROBADA",
        } as PatientInBlock,
      ],
      status: "confirmed",
      createdAt: created,
    },
  ];
}

function buildSeedAssignments(): AnesthetistAssignment[] {
  const weekStart = getWeekStart(new Date());
  const weekDays = getWeekDays(weekStart);
  const mon = toISODate(weekDays[0]!);
  const tue = toISODate(weekDays[1]!);
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
      fromEmail: "contacto@ejemplo.test",
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

function seedGestionCitasState(): void {
  setDemoGestionCitasState({
    "pat-citas-missing-contact": {
      confirmationStatus: "PENDIENTE",
      authorizationStatus: "DENEGADA",
      attemptCount: 0,
    },
    "pat-citas-future-pre": {
      confirmationStatus: "PENDIENTE",
      authorizationStatus: "PENDIENTE",
      attemptCount: 0,
    },
    "pat-citas-private-local": {
      confirmationStatus: "CONFIRMADO_CON_PACIENTE",
      attemptCount: 1,
      lastAttemptAt: new Date().toISOString(),
    },
    "pat-citas-no-apto": {
      confirmationStatus: "CONFIRMADO_CON_PACIENTE",
      authorizationStatus: "APROBADA",
      attemptCount: 1,
      lastAttemptAt: new Date().toISOString(),
    },
    "pat-citas-past-pre": {
      confirmationStatus: "NO_LOCALIZADO",
      authorizationStatus: "APROBADA",
      attemptCount: 2,
      lastAttemptAt: new Date().toISOString(),
    },
  });
}

/**
 * Carga en localStorage un conjunto coherente de datos sintéticos para la demo.
 * No modifica la sesión actual ni realiza llamadas a /api.
 */
export function loadDemoSeed(): void {
  if (typeof window === "undefined") return;
  try {
    setStoredReservationsForDemo(buildSeedReservations());
    setStoredAnesthetistAssignments(buildSeedAssignments());
    window.localStorage.setItem(KEY_MENSAJES, JSON.stringify(buildSeedMessages()));
    window.localStorage.setItem(KEY_NOTIFICACIONES, JSON.stringify(buildSeedNotifications()));
    seedGestionCitasState();
  } catch {
    // ignorar fallo local de la demostración
  }
}
