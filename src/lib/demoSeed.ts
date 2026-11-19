/**
 * Datos de ejemplo para la DEMO: una semana laboral ficticia de bloque,
 * la semana siguiente para Gestión de citas, asignaciones, mensajes y avisos.
 * Todos los pacientes, teléfonos y correos son inventados. No hay datos reales.
 */

import type { Reservation, PatientInBlock, AnesthetistAssignment, MessageToGestor, AppNotification, AnesthetistUnavailability, SolicitudRecursosId } from "./types";
import type { ResourceId, Shift } from "./types";
import { ASSIGNMENT_PREANESTHESIA } from "./types";
import { getWeekStart, getWeekDays, toISODate } from "./utils";
import { setStoredReservationsForDemo } from "./storageMensajesYNotificaciones";
import { setStoredAnesthetistAssignments } from "./storageAnesthetistAssignments";
import { setDemoGestionCitasState, type DemoGestionCitasState } from "./demoGestionCitasState";
import { LOCAL_NO_ANESTHETIST } from "./gestionCitas";

const KEY_MENSAJES = "bloque_quirurgico_mensajes_gestor";
const KEY_NOTIFICACIONES = "bloque_quirurgico_notificaciones";
const KEY_NO_APTO = "bloque_quirurgico_pacientes_no_apto";
const KEY_UNAVAILABILITY = "bloque_quirurgico_anesthetist_unavailability";
const KEY_RESERVATIONS = "bloque_quirurgico_reservations";

const SURGEON_ID = "demo-cirujano";
const ENDOSCOPISTA_ID = "demo-endoscopista";
const ANESTESISTA_ID = "demo-anestesista";
const GESTOR_ANESTESISTA_ID = "demo-gestor-anestesista";
const GESTOR_ID = "demo-gestor";
const VEGA_ID = "demo-cirujano-vega";
const SOLER_ID = "demo-cirujano-soler";
const CAMPOS_ID = "demo-cirujano-campos";
const FERRER_ID = "demo-anestesista-ferrer";

type SeedPatient = {
  id: string;
  name: string;
  numeroHistoria: string;
  procedure: string;
  estimatedDurationMinutes: number;
  anesthesiaType: string;
  entidadFinanciadora: string;
  admissionType?: "ingreso" | "ambulatorio";
  order?: number;
  patientPhone?: string;
  patientEmail?: string;
  preanesthesiaStatus?: string;
  preanesthesiaAppointmentAt?: string;
  financingStatus?: string;
  solicitudRecursos?: SolicitudRecursosId;
};

export interface DemoSeedSnapshot {
  reservations: Reservation[];
  assignments: AnesthetistAssignment[];
  messages: MessageToGestor[];
  notifications: AppNotification[];
  unavailability: AnesthetistUnavailability[];
  noApto: Array<{ reservationId: string; patientId: string }>;
  gestionCitas: DemoGestionCitasState;
}

function isoAtLocal(ymd: string, hour: number, minute: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0).toISOString();
}

function patient(input: SeedPatient): PatientInBlock {
  const phone = input.patientPhone ?? `+34 600 000 ${input.numeroHistoria.slice(-3)}`;
  const email = input.patientEmail ?? `${input.numeroHistoria.toLowerCase()}@example.test`;
  return {
    id: input.id,
    name: input.name,
    numeroHistoria: input.numeroHistoria,
    procedure: input.procedure,
    estimatedDurationMinutes: input.estimatedDurationMinutes,
    anesthesiaType: input.anesthesiaType,
    entidadFinanciadora: input.entidadFinanciadora,
    admissionType: input.admissionType ?? "ambulatorio",
    notes: "",
    order: input.order ?? 0,
    patientPhone: phone,
    patientEmail: email,
    preanesthesiaStatus: input.preanesthesiaStatus,
    preanesthesiaAppointmentAt: input.preanesthesiaAppointmentAt,
    financingStatus: input.financingStatus,
    solicitudRecursos: input.solicitudRecursos,
  };
}

function reservation(
  id: string,
  resourceId: ResourceId,
  date: string,
  shift: Shift,
  slotIndex: number,
  surgeonId: string,
  patients: PatientInBlock[],
  status: Reservation["status"],
  createdAt: string,
): Reservation {
  return { id, resourceId, date, shift, slotIndex, surgeonId, patients, status, createdAt };
}

function assign(
  id: string,
  date: string,
  shift: Shift,
  resourceId: string,
  anesthetistId: string,
  assignmentType: "OR" | "PREANESTHESIA" = "OR",
): AnesthetistAssignment {
  return { id, date, shift, assignmentType, resourceId, anesthetistId };
}

export function createDemoSeedSnapshot(now = new Date()): DemoSeedSnapshot {
  const weekDays = getWeekDays(getWeekStart(now));
  const mon = toISODate(weekDays[0]!);
  const tue = toISODate(weekDays[1]!);
  const wed = toISODate(weekDays[2]!);
  const thu = toISODate(weekDays[3]!);
  const fri = toISODate(weekDays[4]!);
  const [nextMonD, nextTueD, nextWedD, nextThuD, nextFriD] = nextWeekDaysFrom(now);
  const nextMon = toISODate(nextMonD!);
  const nextTue = toISODate(nextTueD!);
  const nextWed = toISODate(nextWedD!);
  const nextThu = toISODate(nextThuD!);
  const nextFri = toISODate(nextFriD!);
  const created = now.toISOString();
  const pastPreanesthesia = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const fridayMorningConsult = isoAtLocal(fri, 9, 0);

  const reservations: Reservation[] = [
    reservation("res-mon-q1-0", "Q1", mon, "morning", 0, SURGEON_ID, [
      patient({
        id: "pat-mon-cole",
        name: "Andrés Molina",
        numeroHistoria: "HC-DEMO-101",
        procedure: "Colecistectomía laparoscópica",
        estimatedDurationMinutes: 75,
        anesthesiaType: "General",
        entidadFinanciadora: "SESPA",
        admissionType: "ingreso",
        preanesthesiaStatus: "APTO",
        financingStatus: "APROBADA",
        solicitudRecursos: "rayo",
      }),
    ], "confirmed", created),
    reservation("res-mon-q1-2", "Q1", mon, "morning", 2, SURGEON_ID, [
      patient({
        id: "pat-mon-hernia",
        name: "Beatriz Luján",
        numeroHistoria: "HC-DEMO-102",
        procedure: "Hernioplastia inguinal",
        estimatedDurationMinutes: 45,
        anesthesiaType: "Raquídea",
        entidadFinanciadora: "SESPA",
        preanesthesiaStatus: "APTO",
        financingStatus: "APROBADA",
      }),
    ], "confirmed", created),
    reservation("res-mon-q1-4", "Q1", mon, "morning", 4, SURGEON_ID, [], "pending", created),
    reservation("res-mon-q2-0", "Q2", mon, "morning", 0, VEGA_ID, [
      patient({
        id: "pat-mon-tiroides",
        name: "Carmen Ibáñez",
        numeroHistoria: "HC-DEMO-103",
        procedure: "Tiroidectomía total",
        estimatedDurationMinutes: 80,
        anesthesiaType: "General",
        entidadFinanciadora: "Privado",
        admissionType: "ingreso",
        preanesthesiaStatus: "APTO",
        solicitudRecursos: "ninguno",
      }),
    ], "confirmed", created),
    reservation("res-mon-q2-2", "Q2", mon, "morning", 2, VEGA_ID, [
      patient({
        id: "pat-mon-hemitiroides",
        name: "Diego Pardo",
        numeroHistoria: "HC-DEMO-104",
        procedure: "Hemitiroidectomía",
        estimatedDurationMinutes: 50,
        anesthesiaType: "General",
        entidadFinanciadora: "Mutua Demo",
        admissionType: "ingreso",
        financingStatus: "PENDIENTE",
        patientPhone: "",
        patientEmail: "",
      }),
    ], "confirmed", created),
    reservation("res-mon-q3-0", "Q3", mon, "morning", 0, SOLER_ID, [
      patient({
        id: "pat-mon-rodilla",
        name: "Elena Ruiz",
        numeroHistoria: "HC-DEMO-105",
        procedure: "Artroplastia de rodilla",
        estimatedDurationMinutes: 80,
        anesthesiaType: "Raquídea",
        entidadFinanciadora: "Privado",
        admissionType: "ingreso",
        preanesthesiaStatus: "APTO",
        solicitudRecursos: "caja-instrumental-ptc-ptr",
      }),
    ], "confirmed", created),
    reservation("res-mon-q3-2", "Q3", mon, "morning", 2, SOLER_ID, [
      patient({
        id: "pat-mon-artro",
        name: "Fernando Gil",
        numeroHistoria: "HC-DEMO-106",
        procedure: "Artroscopia de rodilla",
        estimatedDurationMinutes: 45,
        anesthesiaType: "Raquídea",
        entidadFinanciadora: "SESPA",
        preanesthesiaStatus: "APTO",
        financingStatus: "APROBADA",
      }),
    ], "confirmed", created),
    reservation("res-mon-pm-0", "procedimientos-menores", mon, "morning", 0, ENDOSCOPISTA_ID, [
      patient({
        id: "pat-mon-colo",
        name: "Gloria Santos",
        numeroHistoria: "HC-DEMO-107",
        procedure: "Colonoscopia",
        estimatedDurationMinutes: 40,
        anesthesiaType: "Sedación",
        entidadFinanciadora: "SESPA",
        preanesthesiaStatus: "APTO",
        financingStatus: "APROBADA",
      }),
    ], "confirmed", created),
    reservation("res-mon-pm-1", "procedimientos-menores", mon, "morning", 1, ENDOSCOPISTA_ID, [
      patient({
        id: "pat-mon-gastro",
        name: "Héctor Navas",
        numeroHistoria: "HC-DEMO-108",
        procedure: "Gastroscopia",
        estimatedDurationMinutes: 25,
        anesthesiaType: "Sedación",
        entidadFinanciadora: "SESPA",
        preanesthesiaStatus: "APTO",
        financingStatus: "APROBADA",
      }),
    ], "confirmed", created),
    reservation("res-mon-td-0", "tecnicas-dolor", mon, "morning", 0, ENDOSCOPISTA_ID, [
      patient({
        id: "pat-mon-dolor",
        name: "Inés Calvo",
        numeroHistoria: "HC-DEMO-109",
        procedure: "Bloqueo epidural lumbar",
        estimatedDurationMinutes: 30,
        anesthesiaType: "Sedación",
        entidadFinanciadora: "SESPA",
        preanesthesiaStatus: "APTO",
        financingStatus: "APROBADA",
      }),
    ], "confirmed", created),
    reservation("res-mon-aft-q2", "Q2", mon, "afternoon", 0, CAMPOS_ID, [
      patient({
        id: "pat-mon-histero",
        name: "Julia Ortega",
        numeroHistoria: "HC-DEMO-110",
        procedure: "Histeroscopia quirúrgica",
        estimatedDurationMinutes: 35,
        anesthesiaType: "Sedación",
        entidadFinanciadora: "SESPA",
        preanesthesiaStatus: "APTO",
        financingStatus: "APROBADA",
      }),
    ], "confirmed", created),
    reservation("res-mon-aft-q3", "Q3", mon, "afternoon", 0, SOLER_ID, [
      patient({
        id: "pat-mon-osteosintesis",
        name: "Kilian Romero",
        numeroHistoria: "HC-DEMO-111",
        procedure: "Extracción de material de osteosíntesis",
        estimatedDurationMinutes: 40,
        anesthesiaType: "Raquídea",
        entidadFinanciadora: "SESPA",
        preanesthesiaStatus: "APTO",
        financingStatus: "APROBADA",
      }),
    ], "confirmed", created),
    reservation("res-mon-aft-pm", "procedimientos-menores", mon, "afternoon", 0, ENDOSCOPISTA_ID, [
      patient({
        id: "pat-mon-polipectomia",
        name: "Laura Benítez",
        numeroHistoria: "HC-DEMO-112",
        procedure: "Polipectomía endoscópica",
        estimatedDurationMinutes: 30,
        anesthesiaType: "Sedación",
        entidadFinanciadora: "Mutua Demo",
        financingStatus: "APROBADA",
        preanesthesiaStatus: "APTO",
      }),
    ], "confirmed", created),

    reservation("res-tue-q1-0", "Q1", tue, "morning", 0, SURGEON_ID, [
      patient({
        id: "pat-tue-eventracion",
        name: "Manuel Costa",
        numeroHistoria: "HC-DEMO-201",
        procedure: "Eventroplastia",
        estimatedDurationMinutes: 40,
        anesthesiaType: "General",
        entidadFinanciadora: "SESPA",
        admissionType: "ingreso",
        preanesthesiaStatus: "APTO",
        financingStatus: "APROBADA",
        order: 0,
      }),
      patient({
        id: "pat-tue-lipoma",
        name: "Nuria Delgado",
        numeroHistoria: "HC-DEMO-202",
        procedure: "Exéresis de lipoma",
        estimatedDurationMinutes: 25,
        anesthesiaType: "Local",
        entidadFinanciadora: "Privado",
        preanesthesiaStatus: "APTO",
        order: 1,
      }),
    ], "confirmed", created),
    reservation("res-tue-q2-0", "Q2", tue, "morning", 0, SOLER_ID, [
      patient({
        id: "pat-tue-radio",
        name: "Óscar Belmonte",
        numeroHistoria: "HC-DEMO-203",
        procedure: "Osteosíntesis de radio distal",
        estimatedDurationMinutes: 55,
        anesthesiaType: "Regional",
        entidadFinanciadora: "SESPA",
        admissionType: "ingreso",
        preanesthesiaStatus: "APTO",
        financingStatus: "APROBADA",
        solicitudRecursos: "rayo",
      }),
    ], "confirmed", created),
    reservation("res-tue-q3-0", "Q3", tue, "morning", 0, VEGA_ID, [], "pending", created),
    reservation("res-tue-pm-0", "procedimientos-menores", tue, "morning", 0, ENDOSCOPISTA_ID, [
      patient({
        id: "pat-tue-ecoendo",
        name: "Patricia León",
        numeroHistoria: "HC-DEMO-204",
        procedure: "Ecoendoscopia",
        estimatedDurationMinutes: 40,
        anesthesiaType: "Sedación",
        entidadFinanciadora: "SESPA",
        preanesthesiaStatus: "APTO",
        financingStatus: "APROBADA",
      }),
    ], "confirmed", created),
    reservation("res-tue-td-1", "tecnicas-dolor", tue, "morning", 1, ENDOSCOPISTA_ID, [
      patient({
        id: "pat-tue-infiltracion",
        name: "Raúl Marín",
        numeroHistoria: "HC-DEMO-205",
        procedure: "Infiltración facetaria lumbar",
        estimatedDurationMinutes: 20,
        anesthesiaType: LOCAL_NO_ANESTHETIST,
        entidadFinanciadora: "SESPA",
        financingStatus: "APROBADA",
      }),
    ], "confirmed", created),
    reservation("res-tue-aft-q2", "Q2", tue, "afternoon", 0, CAMPOS_ID, [
      patient({
        id: "pat-tue-mioma",
        name: "Rosa Almeida",
        numeroHistoria: "HC-DEMO-206",
        procedure: "Miomectomía histeroscópica",
        estimatedDurationMinutes: 50,
        anesthesiaType: "Sedación",
        entidadFinanciadora: "Mutua Demo",
        financingStatus: "PENDIENTE",
        preanesthesiaStatus: "APTO",
      }),
    ], "confirmed", created),

    reservation("res-wed-q2-0", "Q2", wed, "morning", 0, SURGEON_ID, [
      patient({
        id: "pat-wed-umbilical",
        name: "Sergio Paredes",
        numeroHistoria: "HC-DEMO-301",
        procedure: "Hernioplastia umbilical",
        estimatedDurationMinutes: 40,
        anesthesiaType: "Raquídea",
        entidadFinanciadora: "SESPA",
        financingStatus: "APROBADA",
        preanesthesiaAppointmentAt: fridayMorningConsult,
      }),
    ], "confirmed", created),
    reservation("res-wed-q3-1", "Q3", wed, "morning", 1, SOLER_ID, [
      patient({
        id: "pat-wed-hallux",
        name: "Teresa Blanco",
        numeroHistoria: "HC-DEMO-302",
        procedure: "Corrección de hallux valgus",
        estimatedDurationMinutes: 50,
        anesthesiaType: "Raquídea",
        entidadFinanciadora: "SESPA",
        financingStatus: "APROBADA",
        preanesthesiaStatus: "APTO",
      }),
    ], "confirmed", created),
    reservation("res-wed-pm-0", "procedimientos-menores", wed, "morning", 0, ENDOSCOPISTA_ID, [
      patient({
        id: "pat-wed-colo",
        name: "Unai Crespo",
        numeroHistoria: "HC-DEMO-303",
        procedure: "Colonoscopia de control",
        estimatedDurationMinutes: 35,
        anesthesiaType: "Sedación",
        entidadFinanciadora: "SESPA",
        financingStatus: "APROBADA",
        preanesthesiaStatus: "APTO",
      }),
    ], "confirmed", created),
    reservation("res-wed-aft-q1", "Q1", wed, "afternoon", 0, VEGA_ID, [
      patient({
        id: "pat-wed-fundu",
        name: "Vanesa Rivas",
        numeroHistoria: "HC-DEMO-304",
        procedure: "Funduplicatura laparoscópica",
        estimatedDurationMinutes: 80,
        anesthesiaType: "General",
        entidadFinanciadora: "Privado",
        admissionType: "ingreso",
        preanesthesiaStatus: "APTO",
      }),
    ], "confirmed", created),

    reservation("res-thu-q1-0", "Q1", thu, "morning", 0, VEGA_ID, [
      patient({
        id: "pat-thu-safena",
        name: "Guillermo Prieto",
        numeroHistoria: "HC-DEMO-401",
        procedure: "Safenectomía",
        estimatedDurationMinutes: 50,
        anesthesiaType: "Raquídea",
        entidadFinanciadora: "SESPA",
        financingStatus: "APROBADA",
        preanesthesiaStatus: "APTO",
      }),
    ], "confirmed", created),
    reservation("res-thu-q2-0", "Q2", thu, "morning", 0, CAMPOS_ID, [
      patient({
        id: "pat-thu-histerectomia",
        name: "Helena Cruz",
        numeroHistoria: "HC-DEMO-402",
        procedure: "Histerectomía laparoscópica",
        estimatedDurationMinutes: 80,
        anesthesiaType: "General",
        entidadFinanciadora: "Mutua Demo",
        admissionType: "ingreso",
        financingStatus: "DENEGADA",
        preanesthesiaStatus: "APTO",
      }),
    ], "confirmed", created),
    reservation("res-thu-pm-0", "procedimientos-menores", thu, "morning", 0, ENDOSCOPISTA_ID, [
      patient({
        id: "pat-thu-gastro",
        name: "Iván Serra",
        numeroHistoria: "HC-DEMO-403",
        procedure: "Gastroscopia con biopsia",
        estimatedDurationMinutes: 30,
        anesthesiaType: "Sedación",
        entidadFinanciadora: "SESPA",
        financingStatus: "APROBADA",
        preanesthesiaStatus: "APTO",
      }),
    ], "confirmed", created),
    reservation("res-thu-aft-q1", "Q1", thu, "afternoon", 0, SURGEON_ID, [
      patient({
        id: "pat-thu-noapto",
        name: "Jimena Solís",
        numeroHistoria: "HC-DEMO-404",
        procedure: "Hernioplastia bilateral",
        estimatedDurationMinutes: 70,
        anesthesiaType: "General",
        entidadFinanciadora: "SESPA",
        admissionType: "ingreso",
        financingStatus: "APROBADA",
        preanesthesiaStatus: "NO APTO",
      }),
    ], "confirmed", created),

    reservation("res-fri-q3-0", "Q3", fri, "morning", 0, SURGEON_ID, [
      patient({
        id: "pat-fri-eventro",
        name: "Lorenzo Martín",
        numeroHistoria: "HC-DEMO-501",
        procedure: "Eventroplastia con malla",
        estimatedDurationMinutes: 70,
        anesthesiaType: "General",
        entidadFinanciadora: "SESPA",
        admissionType: "ingreso",
        financingStatus: "APROBADA",
        preanesthesiaStatus: "APTO",
      }),
    ], "confirmed", created),
    reservation("res-fri-q2-0", "Q2", fri, "morning", 0, SOLER_ID, [
      patient({
        id: "pat-fri-hombro",
        name: "Marta Quirós",
        numeroHistoria: "HC-DEMO-502",
        procedure: "Artroscopia de hombro",
        estimatedDurationMinutes: 60,
        anesthesiaType: "General",
        entidadFinanciadora: "Privado",
        admissionType: "ingreso",
        preanesthesiaStatus: "APTO",
        solicitudRecursos: "mesa-hombro",
      }),
    ], "confirmed", created),
    reservation("res-fri-td-0", "tecnicas-dolor", fri, "morning", 0, ENDOSCOPISTA_ID, [
      patient({
        id: "pat-fri-radiofrecuencia",
        name: "Nicolás Vega",
        numeroHistoria: "HC-DEMO-503",
        procedure: "Radiofrecuencia de rama medial",
        estimatedDurationMinutes: 30,
        anesthesiaType: "Sedación",
        entidadFinanciadora: "SESPA",
        financingStatus: "APROBADA",
        preanesthesiaStatus: "APTO",
      }),
    ], "confirmed", created),
    reservation("res-fri-aft-q1", "Q1", fri, "afternoon", 0, CAMPOS_ID, [], "pending", created),

    // Semana siguiente: trabajo de Gestión de citas, todavía sin cerrar.
    reservation("res-citas-next-1", "Q1", nextMon, "morning", 0, SURGEON_ID, [
      patient({
        id: "pat-citas-missing-contact",
        name: "Paula Benítez",
        numeroHistoria: "HC-DEMO-C01",
        procedure: "Colecistectomía laparoscópica",
        estimatedDurationMinutes: 55,
        anesthesiaType: "General",
        entidadFinanciadora: "Mutua Demo",
        patientPhone: "",
        patientEmail: "",
        preanesthesiaStatus: "SCHEDULED",
        preanesthesiaAppointmentAt: pastPreanesthesia,
        financingStatus: "DENEGADA",
      }),
    ], "confirmed", created),
    reservation("res-citas-next-2", "Q2", nextTue, "morning", 0, VEGA_ID, [
      patient({
        id: "pat-citas-future-pre",
        name: "Marcos Vidal",
        numeroHistoria: "HC-DEMO-C02",
        procedure: "Hemitiroidectomía",
        estimatedDurationMinutes: 50,
        anesthesiaType: "General",
        entidadFinanciadora: "Mutua Demo",
        patientPhone: "+34 600 000 102",
        patientEmail: "hc-demo-c02@example.test",
        preanesthesiaStatus: "SCHEDULED",
        preanesthesiaAppointmentAt: isoAtLocal(nextMon, 10, 20),
        financingStatus: "PENDING",
      }),
    ], "confirmed", created),
    reservation("res-citas-next-3", "Q3", nextWed, "morning", 1, SOLER_ID, [
      patient({
        id: "pat-citas-private-local",
        name: "Aitana Roldán",
        numeroHistoria: "HC-DEMO-C03",
        procedure: "Exéresis de quiste sebáceo",
        estimatedDurationMinutes: 25,
        anesthesiaType: LOCAL_NO_ANESTHETIST,
        entidadFinanciadora: "Privado",
        patientPhone: "+34 600 000 103",
        patientEmail: "hc-demo-c03@example.test",
        preanesthesiaStatus: "PENDING",
        financingStatus: "PENDING",
      }),
    ], "confirmed", created),
    reservation("res-citas-next-4", "Q1", nextThu, "afternoon", 0, SURGEON_ID, [
      patient({
        id: "pat-citas-no-apto",
        name: "Clara Méndez",
        numeroHistoria: "HC-DEMO-C04",
        procedure: "Eventroplastia",
        estimatedDurationMinutes: 70,
        anesthesiaType: "General",
        entidadFinanciadora: "Mutua Demo",
        admissionType: "ingreso",
        patientPhone: "+34 600 000 104",
        patientEmail: "hc-demo-c04@example.test",
        preanesthesiaStatus: "NO APTO",
        financingStatus: "APROBADA",
      }),
    ], "confirmed", created),
    reservation("res-citas-next-5", "Q2", nextFri, "morning", 1, CAMPOS_ID, [
      patient({
        id: "pat-citas-past-pre",
        name: "Hugo Pereira",
        numeroHistoria: "HC-DEMO-C05",
        procedure: "Histeroscopia",
        estimatedDurationMinutes: 35,
        anesthesiaType: "Sedación",
        entidadFinanciadora: "Mutua Demo",
        patientPhone: "+34 600 000 105",
        patientEmail: "hc-demo-c05@example.test",
        preanesthesiaStatus: "SCHEDULED",
        preanesthesiaAppointmentAt: pastPreanesthesia,
        financingStatus: "APROBADA",
      }),
    ], "confirmed", created),
  ];

  const assignments: AnesthetistAssignment[] = [
    assign("assign-mon-q1", mon, "morning", "Q1", ANESTESISTA_ID),
    assign("assign-mon-pm", mon, "morning", "procedimientos-menores", ANESTESISTA_ID),
    assign("assign-mon-q3", mon, "morning", "Q3", GESTOR_ANESTESISTA_ID),
    assign("assign-mon-td", mon, "morning", "tecnicas-dolor", GESTOR_ANESTESISTA_ID),
    assign("assign-mon-q2", mon, "morning", "Q2", FERRER_ID),
    assign("assign-mon-pre", mon, "morning", ASSIGNMENT_PREANESTHESIA, GESTOR_ANESTESISTA_ID, "PREANESTHESIA"),
    assign("assign-mon-aft-q2", mon, "afternoon", "Q2", GESTOR_ANESTESISTA_ID),
    assign("assign-tue-q1", tue, "morning", "Q1", ANESTESISTA_ID),
    assign("assign-tue-pm", tue, "morning", "procedimientos-menores", ANESTESISTA_ID),
    assign("assign-tue-q2", tue, "morning", "Q2", GESTOR_ANESTESISTA_ID),
    assign("assign-tue-q3", tue, "morning", "Q3", FERRER_ID),
    assign("assign-wed-q2", wed, "morning", "Q2", ANESTESISTA_ID),
    assign("assign-wed-q1", wed, "afternoon", "Q1", FERRER_ID),
    assign("assign-thu-pre", thu, "morning", ASSIGNMENT_PREANESTHESIA, ANESTESISTA_ID, "PREANESTHESIA"),
    assign("assign-thu-q1", thu, "morning", "Q1", GESTOR_ANESTESISTA_ID),
    assign("assign-thu-q2", thu, "morning", "Q2", FERRER_ID),
    assign("assign-fri-q3", fri, "morning", "Q3", ANESTESISTA_ID),
    assign("assign-fri-td", fri, "morning", "tecnicas-dolor", GESTOR_ANESTESISTA_ID),
  ];

  const messages: MessageToGestor[] = [
    {
      id: "msg-seed-1",
      fromUserId: SURGEON_ID,
      fromName: "Cirujano Demo",
      fromEmail: "cirujano@demo",
      subject: "Hueco del lunes sin pacientes",
      body: "Mensaje ficticio. He dejado reservado el último tramo del lunes en Q1 por si entra una hernia corta. Si no lo completo antes del cierre, puede liberarse.",
      date: created,
    },
    {
      id: "msg-seed-2",
      fromUserId: "anon",
      fromName: "Usuario sin acceso",
      fromEmail: "contacto@ejemplo.test",
      subject: "Solicitud de acceso (ejemplo)",
      body: "Mensaje ficticio enviado desde la pantalla de contacto. Sirve para enseñar la bandeja de coordinación.",
      date: created,
    },
    {
      id: "msg-seed-3",
      fromUserId: ENDOSCOPISTA_ID,
      fromName: "Endoscopista Demo",
      fromEmail: "endoscopista@demo",
      subject: "Listado de endoscopias del lunes",
      body: "Mensaje ficticio. El lunes por la mañana hay colonoscopia, gastroscopia y un bloqueo en técnicas del dolor. ¿Puede confirmar la sedación de procedimientos menores?",
      date: created,
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: "notif-seed-1",
      userId: GESTOR_ID,
      title: "Nuevo mensaje (ejemplo)",
      message: "Cirujano Demo ha escrito sobre el hueco del lunes sin pacientes.",
      date: created,
      read: false,
    },
    {
      id: "notif-seed-2",
      userId: GESTOR_ID,
      title: "Mensaje desde la pantalla de acceso (ejemplo)",
      message: "Un usuario sin acceso ha solicitado entrar. Revise Mensajes.",
      date: created,
      read: false,
    },
    {
      id: "notif-seed-3",
      userId: GESTOR_ANESTESISTA_ID,
      title: "Nuevo mensaje de endoscopias",
      message: "Endoscopista Demo ha consultado la sedación del lunes.",
      date: created,
      read: false,
    },
    {
      id: "notif-seed-4",
      userId: SURGEON_ID,
      title: "Autorización denegada",
      message: "Paula Benítez · semana siguiente · Q1. La autorización de la entidad financiadora figura como DENEGADA. Dato ficticio de la demostración.",
      date: created,
      read: false,
    },
    {
      id: "notif-seed-5",
      userId: ENDOSCOPISTA_ID,
      title: "Paciente de endoscopia confirmado",
      message: "Gloria Santos (HC-DEMO-107) figura confirmada para la colonoscopia del lunes. Dato ficticio.",
      date: created,
      read: false,
    },
  ];

  const reviewed = created;
  const gestionCitas: DemoGestionCitasState = {
    "pat-mon-cole": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed, lastAttemptAt: reviewed },
    "pat-mon-hernia": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-mon-tiroides": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", attemptCount: 1, reviewedAt: reviewed },
    "pat-mon-hemitiroides": { confirmationStatus: "PENDIENTE", authorizationStatus: "PENDIENTE", attemptCount: 0 },
    "pat-mon-rodilla": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", attemptCount: 1, reviewedAt: reviewed },
    "pat-mon-artro": { confirmationStatus: "REQUIERE_NUEVA_LLAMADA", authorizationStatus: "APROBADA", attemptCount: 1, lastAttemptAt: reviewed },
    "pat-mon-colo": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-mon-gastro": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-mon-dolor": { confirmationStatus: "NO_LOCALIZADO", authorizationStatus: "APROBADA", attemptCount: 2, lastAttemptAt: reviewed },
    "pat-mon-histero": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-mon-osteosintesis": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-mon-polipectomia": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-tue-eventracion": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-tue-lipoma": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", attemptCount: 1, reviewedAt: reviewed },
    "pat-tue-radio": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-tue-ecoendo": { confirmationStatus: "PENDIENTE", authorizationStatus: "APROBADA", attemptCount: 0 },
    "pat-tue-infiltracion": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-tue-mioma": { confirmationStatus: "PENDIENTE", authorizationStatus: "PENDIENTE", attemptCount: 0 },
    "pat-wed-umbilical": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-wed-hallux": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-wed-colo": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-wed-fundu": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", attemptCount: 1, reviewedAt: reviewed },
    "pat-thu-safena": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-thu-histerectomia": { confirmationStatus: "INCIDENCIA", authorizationStatus: "DENEGADA", attemptCount: 2, lastAttemptAt: reviewed },
    "pat-thu-gastro": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-thu-noapto": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, reviewedAt: reviewed },
    "pat-fri-eventro": { confirmationStatus: "PENDIENTE", authorizationStatus: "APROBADA", attemptCount: 0 },
    "pat-fri-hombro": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", attemptCount: 1, reviewedAt: reviewed },
    "pat-fri-radiofrecuencia": { confirmationStatus: "PENDIENTE", authorizationStatus: "APROBADA", attemptCount: 0 },
    "pat-citas-missing-contact": { confirmationStatus: "PENDIENTE", authorizationStatus: "DENEGADA", attemptCount: 0 },
    "pat-citas-future-pre": { confirmationStatus: "PENDIENTE", authorizationStatus: "PENDIENTE", attemptCount: 0 },
    "pat-citas-private-local": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", attemptCount: 1, lastAttemptAt: reviewed },
    "pat-citas-no-apto": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA", attemptCount: 1, lastAttemptAt: reviewed },
    "pat-citas-past-pre": { confirmationStatus: "NO_LOCALIZADO", authorizationStatus: "APROBADA", attemptCount: 2, lastAttemptAt: reviewed },
  };

  const unavailability: AnesthetistUnavailability[] = [
    { id: "unavail-ferrer-thu-aft", anesthetistId: FERRER_ID, date: thu, shift: "afternoon" },
    { id: "unavail-anest-fri-aft", anesthetistId: ANESTESISTA_ID, date: fri, shift: "afternoon" },
  ];

  return {
    reservations,
    assignments,
    messages,
    notifications,
    unavailability,
    noApto: [{ reservationId: "res-thu-aft-q1", patientId: "pat-thu-noapto" }],
    gestionCitas,
  };
}

function nextWeekDaysFrom(now: Date): Date[] {
  const currentMonday = getWeekStart(now);
  const nextMonday = new Date(currentMonday);
  nextMonday.setDate(currentMonday.getDate() + 7);
  return getWeekDays(nextMonday);
}

/**
 * Carga en localStorage la semana ficticia. Sustituye reservas, asignaciones,
 * mensajes, avisos, no disponibilidad, marcas de no apto y el estado de Gestión de citas.
 * No toca la sesión ni llama a /api.
 */
export function loadDemoSeed(): void {
  if (typeof window === "undefined") return;
  try {
    const snapshot = createDemoSeedSnapshot();
    setStoredReservationsForDemo(snapshot.reservations);
    setStoredAnesthetistAssignments(snapshot.assignments);
    window.localStorage.setItem(KEY_MENSAJES, JSON.stringify(snapshot.messages));
    window.localStorage.setItem(KEY_NOTIFICACIONES, JSON.stringify(snapshot.notifications));
    window.localStorage.setItem(KEY_NO_APTO, JSON.stringify(snapshot.noApto));
    window.localStorage.setItem(KEY_UNAVAILABILITY, JSON.stringify(snapshot.unavailability));
    setDemoGestionCitasState(snapshot.gestionCitas);
  } catch {
    // ignorar fallo local de la demostración
  }
}

/** Si el navegador aún no tiene reservas de la demo, carga la semana ficticia. */
export function ensureDemoSeed(): boolean {
  if (typeof window === "undefined") return false;
  if (window.localStorage.getItem(KEY_RESERVATIONS) != null) return false;
  loadDemoSeed();
  return true;
}
