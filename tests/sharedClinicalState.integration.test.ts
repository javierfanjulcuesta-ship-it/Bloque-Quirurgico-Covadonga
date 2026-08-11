import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { setAnesthetistUnavailability } from "../src/lib/reservations/anesthetistUnavailabilityService";
import { setPreanesthesiaAssessment } from "../src/lib/reservations/preanesthesiaAssessment";

const prisma = new PrismaClient();
const ANESTHETIST = "shared-state-anesthetist";
const SURGEON = "shared-state-surgeon";
const RESERVATION = "shared-state-reservation";
const PATIENT = "shared-state-patient";
const DATE = "2031-04-07";

async function cleanup(): Promise<void> {
  await prisma.userAuditEvent.deleteMany({
    where: { OR: [{ userId: ANESTHETIST }, { actorUserId: ANESTHETIST }] },
  });
  await prisma.anesthetistUnavailability.deleteMany({ where: { anesthetistId: ANESTHETIST } });
  await prisma.reservationEvent.deleteMany({ where: { reservationId: RESERVATION } });
  await prisma.patientInBlock.deleteMany({ where: { id: PATIENT } });
  await prisma.reservation.deleteMany({ where: { id: RESERVATION } });
  await prisma.user.deleteMany({ where: { id: { in: [ANESTHETIST, SURGEON] } } });
}

before(async () => {
  await cleanup();
  await prisma.user.createMany({
    data: [
      {
        id: ANESTHETIST,
        email: "shared-state-anesthetist@test.invalid",
        passwordHash: "not-a-real-password-hash",
        name: "Anestesista estado compartido",
        role: "ANESTESISTA",
        approved: true,
      },
      {
        id: SURGEON,
        email: "shared-state-surgeon@test.invalid",
        passwordHash: "not-a-real-password-hash",
        name: "Cirujano estado compartido",
        role: "CIRUJANO",
        approved: true,
      },
    ],
  });
  await prisma.reservation.create({
    data: {
      id: RESERVATION,
      date: new Date("2031-04-10T00:00:00.000Z"),
      resourceId: "Q1",
      shift: "MORNING",
      slotIndex: 0,
      surgeonId: SURGEON,
      status: "CONFIRMED",
    },
  });
  await prisma.patientInBlock.create({
    data: {
      id: PATIENT,
      reservationId: RESERVATION,
      historyNumber: "TEST-SHARED-STATE",
      procedure: "Procedimiento ficticio",
      estimatedDurationMinutes: 30,
      anesthesiaType: "General",
      insuranceType: "Privado",
      orderIndex: 0,
      preanesthesiaStatus: "SCHEDULED",
      preanesthesiaAppointmentAt: new Date("2031-04-07T08:00:00.000Z"),
    },
  });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("anesthetist unavailability is shared in PostgreSQL and audited atomically", async () => {
  await setAnesthetistUnavailability(prisma, {
    anesthetistId: ANESTHETIST,
    actorUserId: ANESTHETIST,
    date: DATE,
    morning: true,
    afternoon: true,
  });

  let rows = await prisma.anesthetistUnavailability.findMany({
    where: { anesthetistId: ANESTHETIST, date: DATE },
    orderBy: { shift: "asc" },
  });
  assert.equal(rows.length, 2);

  await setAnesthetistUnavailability(prisma, {
    anesthetistId: ANESTHETIST,
    actorUserId: ANESTHETIST,
    date: DATE,
    morning: false,
    afternoon: true,
  });

  rows = await prisma.anesthetistUnavailability.findMany({
    where: { anesthetistId: ANESTHETIST, date: DATE },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.shift, "AFTERNOON");

  const audits = await prisma.userAuditEvent.findMany({
    where: { userId: ANESTHETIST, eventType: "ANESTHETIST_UNAVAILABILITY_UPDATED" },
  });
  assert.equal(audits.length, 2);
});

test("NOT_FIT survives centrally and clearing restores scheduled when appointment exists", async () => {
  const marked = await setPreanesthesiaAssessment(prisma, {
    patientId: PATIENT,
    actorUserId: ANESTHETIST,
    action: "NOT_FIT",
  });
  assert.equal(marked.ok, true);
  if (marked.ok) assert.equal(marked.preanesthesiaStatus, "NOT_FIT");

  const persisted = await prisma.patientInBlock.findUniqueOrThrow({ where: { id: PATIENT } });
  assert.equal(persisted.preanesthesiaStatus, "NOT_FIT");

  const cleared = await setPreanesthesiaAssessment(prisma, {
    patientId: PATIENT,
    actorUserId: ANESTHETIST,
    action: "CLEAR_NOT_FIT",
  });
  assert.equal(cleared.ok, true);
  if (cleared.ok) assert.equal(cleared.preanesthesiaStatus, "SCHEDULED");

  const events = await prisma.reservationEvent.findMany({
    where: { reservationId: RESERVATION, eventType: "RESERVATION_PATIENT_UPDATED" },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(events.length, 2);
  assert.ok(events[0]!.detailsJson?.includes("preanesthesia_marked_not_fit"));
  assert.ok(events[1]!.detailsJson?.includes("preanesthesia_not_fit_cleared"));
});
