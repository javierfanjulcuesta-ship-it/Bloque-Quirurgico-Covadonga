/**
 * Dataset showcase: una semana laboral (lun–vie) en Q1, Q2, Q3 con casos variados.
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
        historyNumber: "HC-2026-1001",
        fullName: "María Iglesias Ruiz",
        procedure: "Artroscopia de rodilla",
        estimatedDurationMinutes: 55,
        anesthesiaType: "General inhalatoria",
        insuranceType: "Privado Ribera",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "HC-2026-1002",
        fullName: "Jorge Peral Domínguez",
        procedure: "Meniscectomía parcial",
        estimatedDurationMinutes: 55,
        anesthesiaType: "General + bloqueo femoral",
        insuranceType: "Privado mutua",
        orderIndex: 1,
        notes: null,
      },
      {
        historyNumber: "HC-2026-1003",
        fullName: "Lucía Sanz Vega",
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
        historyNumber: "HC-2026-1004",
        fullName: "Antonio Ferreño Gil",
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
        historyNumber: "HC-2026-1005",
        fullName: "Eva Mouriño Paz",
        procedure: "Colecistectomía laparoscópica",
        estimatedDurationMinutes: 75,
        anesthesiaType: "General",
        insuranceType: "Privado",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "HC-2026-1006",
        fullName: "Hugo Valdés Núñez",
        procedure: "Apendicectomía laparoscópica",
        estimatedDurationMinutes: 65,
        anesthesiaType: "General",
        insuranceType: "Privado mutua",
        orderIndex: 1,
        notes: null,
      },
      {
        historyNumber: "HC-2026-1007",
        fullName: "Nerea Codesal",
        procedure: "Biopsia hepática US",
        estimatedDurationMinutes: 40,
        anesthesiaType: "Sedación + local",
        insuranceType: "Privado",
        orderIndex: 2,
        notes: null,
      },
      {
        historyNumber: "HC-2026-1008",
        fullName: "Iker Blanco Fontán",
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
        historyNumber: "HC-2026-1009",
        fullName: "Rosa Lema Costas",
        procedure: "Mastectomía radical",
        estimatedDurationMinutes: 120,
        anesthesiaType: "General",
        insuranceType: "SESPA",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "HC-2026-1010",
        fullName: "Diego Suárez Prada",
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
        historyNumber: "HC-2026-1011",
        fullName: "Carlos Taboada Vila",
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
        historyNumber: "HC-2026-1012",
        fullName: "Sofía Carballeda",
        procedure: "RTU próstata",
        estimatedDurationMinutes: 90,
        anesthesiaType: "Raquianestesia",
        insuranceType: "SESPA",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "HC-2026-1013",
        fullName: "Miguel Armesto",
        procedure: "Litotricia flexible",
        estimatedDurationMinutes: 70,
        anesthesiaType: "General",
        insuranceType: "SESPA",
        orderIndex: 1,
        notes: null,
      },
      {
        historyNumber: "HC-2026-1014",
        fullName: "Paula Seoane",
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
        historyNumber: "HC-2026-1015",
        fullName: "Alberto Neira Mosquera",
        procedure: "Ligadura hemorroides III-IV",
        estimatedDurationMinutes: 45,
        anesthesiaType: "Sedación",
        insuranceType: "MUFACE",
        orderIndex: 0,
        notes: "Financiación 'otro' bucket.",
      },
      {
        historyNumber: "HC-2026-1016",
        fullName: "Cristina Pando López",
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
        historyNumber: "HC-2026-1017",
        fullName: "Valentina Ordóñez",
        procedure: "Tiroidectomía total",
        estimatedDurationMinutes: 95,
        anesthesiaType: "General",
        insuranceType: "Privado",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "HC-2026-1018",
        fullName: "Andrés Fojo Méndez",
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
        historyNumber: "HC-2026-1019",
        fullName: "Laura Grandal",
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
        historyNumber: "HC-2026-1020",
        fullName: "Manuel Touceda",
        procedure: "Artroplastia cadera cementada SESPA",
        estimatedDurationMinutes: 140,
        anesthesiaType: "General",
        insuranceType: "SESPA",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "HC-2026-1021",
        fullName: "Pilar Codesido",
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
        historyNumber: "HC-2026-1022",
        fullName: "Fernando Bao Iglesias",
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
        historyNumber: "HC-2026-1023",
        fullName: "Greta Villar Suárez",
        procedure: "Histerectomía laparoscópica",
        estimatedDurationMinutes: 95,
        anesthesiaType: "General",
        insuranceType: "Privado",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "HC-2026-1024",
        fullName: "Óscar Veiga Prada",
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
        historyNumber: "HC-2026-1025",
        fullName: "Aitana Rial",
        procedure: "Laparoscopia exploradora",
        estimatedDurationMinutes: 60,
        anesthesiaType: "General",
        insuranceType: "SESPA",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "HC-2026-1026",
        fullName: "Bruno Cid",
        procedure: "Drenaje colección subfrénica",
        estimatedDurationMinutes: 45,
        anesthesiaType: "General",
        insuranceType: "Privado",
        orderIndex: 1,
        notes: null,
      },
      {
        historyNumber: "HC-2026-1027",
        fullName: "Uxía Seoane",
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
        historyNumber: "HC-2026-1028",
        fullName: "Tania Bouzas",
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
        historyNumber: "HC-2026-1029",
        fullName: "Xoán Freire",
        procedure: "Amputación supracondílea",
        estimatedDurationMinutes: 100,
        anesthesiaType: "General",
        insuranceType: "SESPA",
        orderIndex: 0,
        notes: null,
      },
      {
        historyNumber: "HC-2026-1030",
        fullName: "Yolanda Meijide",
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
        historyNumber: "HC-2026-1031",
        fullName: "Zoe Arca",
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
                  historyNumber: p.historyNumber,
                  fullName: p.fullName,
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
