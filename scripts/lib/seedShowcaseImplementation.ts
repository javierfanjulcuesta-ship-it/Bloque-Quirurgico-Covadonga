/**
 * Dataset showcase: una semana laboral (lun–vie) en Q1, Q2, Q3 con casos variados.
 * Las etiquetas son «Paciente Prueba NN» y «TEST-00NN». No se escriben en la base:
 * el alta guarda solo caseLabel.
 * Idempotente en ese rango: borra reservas existentes en Q1–Q3 para esas fechas antes de insertar.
 *
 * Requisitos previos: usuarios en BD (cirujanos/endoscopistas + gestor recomendado).
 * Flujo típico:
 *   npm run reset:showcase   (tras confirmación SHOWCASE)
 *   npm run seed:showcase
 *
 * Semana objetivo (lunes UTC 00:00):
 *   SHOWCASE_WEEK_MONDAY=2026-05-05  (opcional; si no se define, se usa el lunes de la semana actual en UTC)
 */

import { PrismaClient, ReservationOrigin, ReservationStatus, Shift } from "@prisma/client";
import { caseLabelFromOrder } from "../../src/lib/patients/caseLabel";

const prisma = new PrismaClient();

const SHOWCASE_RESOURCES = ["Q1", "Q2", "Q3"] as const;

function parseWeekMondayFromEnv(): Date {
  const raw = process.env.SHOWCASE_WEEK_MONDAY?.trim();
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00.000Z`);
  }
  return mondayUtcUtcMidnight(new Date());
}

/** Lunes 00:00 UTC de la semana que contiene `anchor` (interpretando `anchor` en UTC). */
function mondayUtcUtcMidnight(anchor: Date): Date {
  const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
  const dow = d.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + delta);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDaysUtc(monday: Date, days: number): Date {
  const d = new Date(monday);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function fridayEndUtc(monday: Date): Date {
  const d = addDaysUtc(monday, 4);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

type SeedPatient = {
  historyNumber: string;
  fullName: string | null;
  procedure: string;
  estimatedDurationMinutes: number;
  anesthesiaType: string;
  insuranceType: string;
  admissionType?: string | null;
  orderIndex: number;
  notes?: string | null;
  solicitudRecursos?: string | null;
};

type SeedReservation = {
  dayOffset: number;
  resourceId: (typeof SHOWCASE_RESOURCES)[number];
  shift: Shift;
  slotIndex: number;
  surgeonIndex: number;
  status: ReservationStatus;
  origin: ReservationOrigin;
  patients: SeedPatient[];
  cancellationReason?: string | null;
  releaseReason?: string | null;
};

const SEED_RESERVATIONS: SeedReservation[] = [
  // --- Lunes: overflow + SESPA + lleno + mezcla + infrautilizado ---
  {
    dayOffset: 0,
    resourceId: "Q1",
    shift: "MORNING",
    slotIndex: 0,
    surgeonIndex: 0,
    status: "CONFIRMED",
    origin: "GESTOR",
    patients: [
      {
        historyNumber: "TEST-0001",
        fullName: "Paciente Prueba 01",
        procedure: "Artroscopia de rodilla",
        estimatedDurationMinutes: 55,
        anesthesiaType: "General inhalatoria",
        insuranceType: "Privado Ribera",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "TEST-0002",
        fullName: "Paciente Prueba 02",
        procedure: "Meniscectomía parcial",
        estimatedDurationMinutes: 55,
        anesthesiaType: "General + bloqueo femoral",
        insuranceType: "Privado mutua",
        orderIndex: 1,
        notes: null,
      },
      {
        historyNumber: "TEST-0003",
        fullName: "Paciente Prueba 03",
        procedure: "Lavado articular",
        estimatedDurationMinutes: 30,
        anesthesiaType: "General corta",
        insuranceType: "Privado",
        orderIndex: 2,
        notes: "Caso largo encadenado: provoca desborde visual hacia tramos siguientes.",
      },
    ],
  },
  {
    dayOffset: 0,
    resourceId: "Q1",
    shift: "AFTERNOON",
    slotIndex: 0,
    surgeonIndex: 1,
    status: "CONFIRMED",
    origin: "APP",
    patients: [
      {
        historyNumber: "TEST-0004",
        fullName: "Paciente Prueba 04",
        procedure: "Hernioplastia inguinal SESPA",
        estimatedDurationMinutes: 95,
        anesthesiaType: "General",
        insuranceType: "SESPA",
        orderIndex: 0,
        notes: "Carga SESPA larga en primer tramo tarde (presión económica).",
      },
    ],
  },
  {
    dayOffset: 0,
    resourceId: "Q2",
    shift: "MORNING",
    slotIndex: 0,
    surgeonIndex: 2,
    status: "CONFIRMED",
    origin: "GESTOR",
    patients: [
      {
        historyNumber: "TEST-0005",
        fullName: "Paciente Prueba 05",
        procedure: "Colecistectomía laparoscópica",
        estimatedDurationMinutes: 75,
        anesthesiaType: "General",
        insuranceType: "Privado",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "TEST-0006",
        fullName: "Paciente Prueba 06",
        procedure: "Apendicectomía laparoscópica",
        estimatedDurationMinutes: 65,
        anesthesiaType: "General",
        insuranceType: "Privado mutua",
        orderIndex: 1,
        notes: null,
      },
      {
        historyNumber: "TEST-0007",
        fullName: "Paciente Prueba 07",
        procedure: "Biopsia hepática US",
        estimatedDurationMinutes: 40,
        anesthesiaType: "Sedación + local",
        insuranceType: "Privado",
        orderIndex: 2,
        notes: null,
      },
      {
        historyNumber: "TEST-0008",
        fullName: "Paciente Prueba 08",
        procedure: "Cierre de ostoma",
        estimatedDurationMinutes: 35,
        anesthesiaType: "General corta",
        insuranceType: "Privado",
        orderIndex: 3,
        notes: null,
      },
    ],
  },
  {
    dayOffset: 0,
    resourceId: "Q2",
    shift: "AFTERNOON",
    slotIndex: 1,
    surgeonIndex: 0,
    status: "CONFIRMED",
    origin: "GESTOR",
    patients: [
      {
        historyNumber: "TEST-0009",
        fullName: "Paciente Prueba 09",
        procedure: "Mastectomía radical",
        estimatedDurationMinutes: 120,
        anesthesiaType: "General",
        insuranceType: "SESPA",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "TEST-0010",
        fullName: "Paciente Prueba 10",
        procedure: "Vaciamiento ganglionar",
        estimatedDurationMinutes: 55,
        anesthesiaType: "General",
        insuranceType: "Privado Ribera",
        orderIndex: 1,
        notes: "Misma reserva: mezcla SESPA + privado (baja confianza en mapa).",
      },
    ],
  },
  {
    dayOffset: 0,
    resourceId: "Q3",
    shift: "MORNING",
    slotIndex: 0,
    surgeonIndex: 1,
    status: "CONFIRMED",
    origin: "APP",
    patients: [
      {
        historyNumber: "TEST-0011",
        fullName: "Paciente Prueba 11",
        procedure: "Hallux valgus bilateral (un solo pie esta sesión)",
        estimatedDurationMinutes: 35,
        anesthesiaType: "Bloqueo poplíteo + sedación",
        insuranceType: "Privado",
        orderIndex: 0,
        notes: "Un solo caso corto en mañana: hueco infrautilizado a nivel de turno.",
      },
    ],
  },
  // --- Martes: reserva vacía, SESPA denso, variación ---
  {
    dayOffset: 1,
    resourceId: "Q1",
    shift: "MORNING",
    slotIndex: 1,
    surgeonIndex: 3,
    status: "PENDING",
    origin: "APP",
    patients: [],
  },
  {
    dayOffset: 1,
    resourceId: "Q2",
    shift: "MORNING",
    slotIndex: 2,
    surgeonIndex: 2,
    status: "CONFIRMED",
    origin: "GESTOR",
    patients: [
      {
        historyNumber: "TEST-0012",
        fullName: "Paciente Prueba 12",
        procedure: "RTU próstata",
        estimatedDurationMinutes: 90,
        anesthesiaType: "Raquianestesia",
        insuranceType: "SESPA",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "TEST-0013",
        fullName: "Paciente Prueba 13",
        procedure: "Litotricia flexible",
        estimatedDurationMinutes: 70,
        anesthesiaType: "General",
        insuranceType: "SESPA",
        orderIndex: 1,
        notes: null,
      },
      {
        historyNumber: "TEST-0014",
        fullName: "Paciente Prueba 14",
        procedure: "Ureteroscopia",
        estimatedDurationMinutes: 55,
        anesthesiaType: "General",
        insuranceType: "SESPA",
        orderIndex: 2,
        notes: null,
      },
    ],
  },
  {
    dayOffset: 1,
    resourceId: "Q3",
    shift: "AFTERNOON",
    slotIndex: 0,
    surgeonIndex: 0,
    status: "CONFIRMED",
    origin: "APP",
    patients: [
      {
        historyNumber: "TEST-0015",
        fullName: "Paciente Prueba 15",
        procedure: "Ligadura hemorroides III-IV",
        estimatedDurationMinutes: 45,
        anesthesiaType: "Sedación",
        insuranceType: "MUFACE",
        orderIndex: 0,
        notes: "Financiación 'otro' bucket.",
      },
      {
        historyNumber: "TEST-0016",
        fullName: "Paciente Prueba 16",
        procedure: "Fístula perianal",
        estimatedDurationMinutes: 50,
        anesthesiaType: "Raqui + sedación",
        insuranceType: "Privado",
        orderIndex: 1,
        notes: null,
      },
    ],
  },
  // --- Miércoles: cancelada vacía, MUFACE, nota sustitución ---
  {
    dayOffset: 2,
    resourceId: "Q1",
    shift: "MORNING",
    slotIndex: 3,
    surgeonIndex: 1,
    status: "CONFIRMED",
    origin: "GESTOR",
    patients: [
      {
        historyNumber: "TEST-0017",
        fullName: "Paciente Prueba 17",
        procedure: "Tiroidectomía total",
        estimatedDurationMinutes: 95,
        anesthesiaType: "General",
        insuranceType: "Privado",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "TEST-0018",
        fullName: "Paciente Prueba 18",
        procedure: "Paratiroidectomía",
        estimatedDurationMinutes: 70,
        anesthesiaType: "General",
        insuranceType: "Privado mutua",
        orderIndex: 1,
        notes: "Sustituye caso previo cancelado por coordinación (simulado en notas).",
      },
    ],
  },
  {
    dayOffset: 2,
    resourceId: "Q2",
    shift: "MORNING",
    slotIndex: 0,
    surgeonIndex: 4,
    status: "CONFIRMED",
    origin: "APP",
    patients: [
      {
        historyNumber: "TEST-0019",
        fullName: "Paciente Prueba 19",
        procedure: "Bypass gástrico laparoscópico",
        estimatedDurationMinutes: 150,
        anesthesiaType: "General",
        insuranceType: "Privado",
        orderIndex: 0,
        notes: "Caso largo en tramo base: desborde hacia siguientes huecos libres.",
      },
    ],
  },
  {
    dayOffset: 2,
    resourceId: "Q3",
    shift: "MORNING",
    slotIndex: 4,
    surgeonIndex: 2,
    status: "CANCELLED",
    origin: "GESTOR",
    patients: [],
    cancellationReason: "Showcase: suspensión por falta de camas UCI",
  },
  {
    dayOffset: 2,
    resourceId: "Q1",
    shift: "AFTERNOON",
    slotIndex: 2,
    surgeonIndex: 3,
    status: "RELEASED",
    origin: "APP",
    patients: [],
    releaseReason: "showcase_liberacion_bolsa",
  },
  // --- Jueves: SESPA débil, overflow tarde en tramo corto ---
  {
    dayOffset: 3,
    resourceId: "Q2",
    shift: "MORNING",
    slotIndex: 1,
    surgeonIndex: 1,
    status: "CONFIRMED",
    origin: "GESTOR",
    patients: [
      {
        historyNumber: "TEST-0020",
        fullName: "Paciente Prueba 20",
        procedure: "Artroplastia cadera cementada SESPA",
        estimatedDurationMinutes: 140,
        anesthesiaType: "General",
        insuranceType: "SESPA",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "TEST-0021",
        fullName: "Paciente Prueba 21",
        procedure: "Sutura extensor largo dedo",
        estimatedDurationMinutes: 35,
        anesthesiaType: "Bloqueo + sedación",
        insuranceType: "SESPA",
        orderIndex: 1,
        notes: null,
      },
    ],
  },
  {
    dayOffset: 3,
    resourceId: "Q3",
    shift: "AFTERNOON",
    slotIndex: 3,
    surgeonIndex: 0,
    status: "CONFIRMED",
    origin: "APP",
    patients: [
      {
        historyNumber: "TEST-0022",
        fullName: "Paciente Prueba 22",
        procedure: "Artrodesis lumbar mínima",
        estimatedDurationMinutes: 110,
        anesthesiaType: "General",
        insuranceType: "Privado",
        orderIndex: 0,
        notes: "Tramo tarde 60 min base: desborde esperado sobre slot siguiente libre.",
      },
    ],
  },
  {
    dayOffset: 3,
    resourceId: "Q1",
    shift: "MORNING",
    slotIndex: 0,
    surgeonIndex: 2,
    status: "CONFIRMED",
    origin: "APP",
    patients: [
      {
        historyNumber: "TEST-0023",
        fullName: "Paciente Prueba 23",
        procedure: "Histerectomía laparoscópica",
        estimatedDurationMinutes: 95,
        anesthesiaType: "General",
        insuranceType: "Privado",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "TEST-0024",
        fullName: "Paciente Prueba 24",
        procedure: "Salpingooforectomía",
        estimatedDurationMinutes: 80,
        anesthesiaType: "General",
        insuranceType: "Privado mutua",
        orderIndex: 1,
        notes: null,
      },
    ],
  },
  // --- Viernes: mezcla final + tramo corto mal aprovechado ---
  {
    dayOffset: 4,
    resourceId: "Q1",
    shift: "MORNING",
    slotIndex: 2,
    surgeonIndex: 0,
    status: "CONFIRMED",
    origin: "GESTOR",
    patients: [
      {
        historyNumber: "TEST-0025",
        fullName: "Paciente Prueba 25",
        procedure: "Laparoscopia exploradora",
        estimatedDurationMinutes: 60,
        anesthesiaType: "General",
        insuranceType: "SESPA",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "TEST-0026",
        fullName: "Paciente Prueba 26",
        procedure: "Drenaje colección subfrénica",
        estimatedDurationMinutes: 45,
        anesthesiaType: "General",
        insuranceType: "Privado",
        orderIndex: 1,
        notes: null,
      },
      {
        historyNumber: "TEST-0027",
        fullName: "Paciente Prueba 27",
        procedure: "Biopsia peritoneal",
        estimatedDurationMinutes: 40,
        anesthesiaType: "Sedación",
        insuranceType: "Privado Ribera",
        orderIndex: 2,
        notes: null,
      },
    ],
  },
  {
    dayOffset: 4,
    resourceId: "Q2",
    shift: "AFTERNOON",
    slotIndex: 4,
    surgeonIndex: 1,
    status: "CONFIRMED",
    origin: "APP",
    patients: [
      {
        historyNumber: "TEST-0028",
        fullName: "Paciente Prueba 28",
        procedure: "Cistoscopia rígida",
        estimatedDurationMinutes: 25,
        anesthesiaType: "Sedación",
        insuranceType: "Privado",
        orderIndex: 0,
        notes: "Último tramo tarde (30 min): un solo caso corto = mala ocupación del tramo.",
      },
    ],
  },
  {
    dayOffset: 4,
    resourceId: "Q3",
    shift: "MORNING",
    slotIndex: 3,
    surgeonIndex: 3,
    status: "CONFIRMED",
    origin: "GESTOR",
    patients: [
      {
        historyNumber: "TEST-0029",
        fullName: "Paciente Prueba 29",
        procedure: "Amputación supracondílea",
        estimatedDurationMinutes: 100,
        anesthesiaType: "General",
        insuranceType: "SESPA",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "TEST-0030",
        fullName: "Paciente Prueba 30",
        procedure: "Desbridamiento tejidos",
        estimatedDurationMinutes: 45,
        anesthesiaType: "Sedación + local",
        insuranceType: "SESPA",
        orderIndex: 1,
        notes: null,
      },
    ],
  },
  {
    dayOffset: 4,
    resourceId: "Q3",
    shift: "AFTERNOON",
    slotIndex: 1,
    surgeonIndex: 2,
    status: "CONFIRMED",
    origin: "APP",
    patients: [
      {
        historyNumber: "TEST-0031",
        fullName: "Paciente Prueba 31",
        procedure: "Neuroestimulador medular (recambio)",
        estimatedDurationMinutes: 85,
        anesthesiaType: "General",
        insuranceType: "Privado",
        orderIndex: 0,
        notes: null,
      },
    ],
  },
];

async function main() {
  const weekMonday = parseWeekMondayFromEnv();
  const weekEnd = fridayEndUtc(weekMonday);

  const gestor =
    (await prisma.user.findFirst({
      where: { role: "GESTOR", approved: true, deletedAt: null },
      select: { id: true },
    })) ??
    (await prisma.user.findFirst({
      where: { role: "GESTOR_ANESTESISTA", approved: true, deletedAt: null },
      select: { id: true },
    }));

  const surgeons = await prisma.user.findMany({
    where: {
      approved: true,
      deletedAt: null,
      role: { in: ["CIRUJANO", "ENDOSCOPISTA"] },
    },
    orderBy: { email: "asc" },
    select: { id: true, name: true, email: true, role: true },
    take: 8,
  });

  if (surgeons.length === 0) {
    throw new Error("No hay cirujanos/endoscopistas aprobados en la BD. Ejecute el seed de usuarios antes.");
  }

  console.log(`Semana showcase (UTC): lunes ${weekMonday.toISOString().slice(0, 10)} … viernes ${addDaysUtc(weekMonday, 4).toISOString().slice(0, 10)}`);
  console.log(`Cirujanos disponibles: ${surgeons.length}`);

  const deleted = await prisma.reservation.deleteMany({
    where: {
      resourceId: { in: [...SHOWCASE_RESOURCES] },
      date: { gte: weekMonday, lte: weekEnd },
    },
  });
  console.log(`Reservas previas eliminadas en Q1–Q3 (rango): ${deleted.count}`);

  const actorId = gestor?.id ?? surgeons[0]!.id;

  for (const row of SEED_RESERVATIONS) {
    const date = addDaysUtc(weekMonday, row.dayOffset);
    const surgeon = surgeons[row.surgeonIndex % surgeons.length]!;

    await prisma.reservation.create({
      data: {
        date,
        resourceId: row.resourceId,
        shift: row.shift,
        slotIndex: row.slotIndex,
        surgeonId: surgeon.id,
        status: row.status,
        origin: row.origin,
        createdByUserId: actorId,
        updatedByUserId: actorId,
        cancellationReason: row.cancellationReason ?? null,
        releaseReason: row.releaseReason ?? null,
        cancelledAt: row.status === "CANCELLED" ? new Date() : null,
        releasedAt: row.status === "RELEASED" ? new Date() : null,
        patients:
          row.patients.length > 0
            ? {
                create: row.patients.map((p) => ({
                  caseLabel: caseLabelFromOrder(p.orderIndex),
                  procedure: p.procedure,
                  estimatedDurationMinutes: p.estimatedDurationMinutes,
                  anesthesiaType: p.anesthesiaType,
                  insuranceType: p.insuranceType,
                  admissionType: p.admissionType ?? "ambulatorio",
                  orderIndex: p.orderIndex,
                  notes: p.notes ?? null,
                  solicitudRecursos: p.solicitudRecursos ?? null,
                })),
              }
            : undefined,
      },
    });
  }

  const created = await prisma.reservation.count({
    where: {
      resourceId: { in: [...SHOWCASE_RESOURCES] },
      date: { gte: weekMonday, lte: weekEnd },
    },
  });
  const patients = await prisma.patientInBlock.count({
    where: {
      reservation: {
        resourceId: { in: [...SHOWCASE_RESOURCES] },
        date: { gte: weekMonday, lte: weekEnd },
      },
    },
  });

  console.log(`\nInsertadas ${SEED_RESERVATIONS.length} reservas; en rango hay ${created} reservas y ${patients} pacientes en bloque.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
