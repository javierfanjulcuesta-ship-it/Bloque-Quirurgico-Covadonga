import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { applyAndLogPatientCircuitPhase2 } from "../src/lib/reservations/patientCircuitPhase2";
import { madridSlotKeyFromUtc } from "../src/lib/reservations/preanesthesiaAutoAssign";

const prisma = new PrismaClient();
const USER_ID = "preanesthesia-concurrency-user";
const RESERVATION_IDS = ["preanesthesia-concurrency-r1", "preanesthesia-concurrency-r2"];
const PATIENT_IDS = ["preanesthesia-concurrency-p1", "preanesthesia-concurrency-p2"];
const SURGERY_DATE = "2031-01-20";
const TODAY = "2031-01-06";

async function cleanup(): Promise<void> {
  await prisma.reservationEvent.deleteMany({
    where: { reservationId: { in: RESERVATION_IDS } },
  });
  await prisma.patientInBlock.deleteMany({
    where: { id: { in: PATIENT_IDS } },
  });
  await prisma.reservation.deleteMany({
    where: { id: { in: RESERVATION_IDS } },
  });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
}

before(async () => {
  await cleanup();
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: "preanesthesia-concurrency@test.invalid",
      passwordHash: "not-a-real-password-hash",
      name: "Usuario ficticio preanestesia",
      role: "CIRUJANO",
      approved: true,
    },
  });

  for (let i = 0; i < 2; i++) {
    await prisma.reservation.create({
      data: {
        id: RESERVATION_IDS[i]!,
        date: new Date(`${SURGERY_DATE}T00:00:00.000Z`),
        resourceId: "Q1",
        shift: "MORNING",
        slotIndex: i,
        surgeonId: USER_ID,
        status: "CONFIRMED",
      },
    });
    await prisma.patientInBlock.create({
      data: {
        id: PATIENT_IDS[i]!,
        reservationId: RESERVATION_IDS[i]!,
        historyNumber: `TEST-PRE-${i + 1}`,
        procedure: "Procedimiento ficticio",
        estimatedDurationMinutes: 30,
        anesthesiaType: "General",
        insuranceType: "Privado",
        orderIndex: 0,
      },
    });
  }
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("two concurrent phase2 executions receive different preanesthesia slots", async () => {
  await Promise.all(
    PATIENT_IDS.map((patientId, i) =>
      applyAndLogPatientCircuitPhase2(prisma, {
        reservationId: RESERVATION_IDS[i]!,
        surgeryYmd: SURGERY_DATE,
        actorUserId: USER_ID,
        origin: "app",
        todayYmd: TODAY,
        patients: [
          {
            patientId,
            isDeferredUrgency: false,
            specialCircuitReason: null,
            patientEmail: null,
            patientPhone: null,
          },
        ],
      }),
    ),
  );

  const rows = await prisma.patientInBlock.findMany({
    where: { id: { in: PATIENT_IDS } },
    select: { id: true, preanesthesiaStatus: true, preanesthesiaAppointmentAt: true },
    orderBy: { id: "asc" },
  });

  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.preanesthesiaStatus === "SCHEDULED"));
  assert.ok(rows.every((row) => row.preanesthesiaAppointmentAt instanceof Date));

  const keys = rows.map((row) => madridSlotKeyFromUtc(row.preanesthesiaAppointmentAt!));
  assert.equal(new Set(keys).size, 2, `slots duplicados: ${keys.join(", ")}`);
});

test("re-running phase2 for an already scheduled patient is idempotent", async () => {
  const beforeRow = await prisma.patientInBlock.findUniqueOrThrow({
    where: { id: PATIENT_IDS[0] },
    select: { preanesthesiaAppointmentAt: true },
  });
  assert.ok(beforeRow.preanesthesiaAppointmentAt);

  await Promise.all([
    applyAndLogPatientCircuitPhase2(prisma, {
      reservationId: RESERVATION_IDS[0]!,
      surgeryYmd: SURGERY_DATE,
      actorUserId: USER_ID,
      origin: "app",
      todayYmd: TODAY,
      patients: [{
        patientId: PATIENT_IDS[0]!,
        isDeferredUrgency: false,
        specialCircuitReason: null,
        patientEmail: null,
        patientPhone: null,
      }],
    }),
    applyAndLogPatientCircuitPhase2(prisma, {
      reservationId: RESERVATION_IDS[0]!,
      surgeryYmd: SURGERY_DATE,
      actorUserId: USER_ID,
      origin: "app",
      todayYmd: TODAY,
      patients: [{
        patientId: PATIENT_IDS[0]!,
        isDeferredUrgency: false,
        specialCircuitReason: null,
        patientEmail: null,
        patientPhone: null,
      }],
    }),
  ]);

  const afterRow = await prisma.patientInBlock.findUniqueOrThrow({
    where: { id: PATIENT_IDS[0] },
    select: { preanesthesiaAppointmentAt: true },
  });
  assert.equal(afterRow.preanesthesiaAppointmentAt?.toISOString(), beforeRow.preanesthesiaAppointmentAt?.toISOString());
});
