import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createReservationInDb } from "../src/lib/reservations/createReservationInDb";

const prisma = new PrismaClient();

const SURGEON_A = "booking-integrity-surgeon-a";
const SURGEON_B = "booking-integrity-surgeon-b";
const TEST_DATES = ["2031-01-13", "2031-01-14"];

async function cleanup(): Promise<void> {
  const reservations = await prisma.reservation.findMany({
    where: {
      date: {
        in: TEST_DATES.map((d) => new Date(`${d}T00:00:00.000Z`)),
      },
      resourceId: "Q1",
    },
    select: { id: true },
  });
  const ids = reservations.map((r) => r.id);
  if (ids.length) {
    await prisma.reservationEvent.deleteMany({ where: { reservationId: { in: ids } } });
    await prisma.patientInBlock.deleteMany({ where: { reservationId: { in: ids } } });
    await prisma.reservation.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { id: { in: [SURGEON_A, SURGEON_B] } } });
}

before(async () => {
  await cleanup();
  await prisma.user.createMany({
    data: [
      {
        id: SURGEON_A,
        email: "surgeon-a@booking-integrity.test",
        passwordHash: "not-a-real-password-hash",
        name: "Cirujano A Test",
        role: "CIRUJANO",
        approved: true,
      },
      {
        id: SURGEON_B,
        email: "surgeon-b@booking-integrity.test",
        passwordHash: "not-a-real-password-hash",
        name: "Cirujano B Test",
        role: "CIRUJANO",
        approved: true,
      },
    ],
  });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("two concurrent writers for the same base slot cannot both succeed", async () => {
  const input = {
    date: TEST_DATES[0],
    resourceId: "Q1" as const,
    shift: "morning" as const,
    slotIndex: 2,
    patients: [],
  };

  const [a, b] = await Promise.all([
    createReservationInDb(input, SURGEON_A, { actorUserId: SURGEON_A }),
    createReservationInDb(input, SURGEON_B, { actorUserId: SURGEON_B }),
  ]);

  const results = [a, b];
  assert.equal(results.filter((r) => r.ok).length, 1);
  const rejected = results.find((r) => !r.ok);
  assert.ok(rejected && !rejected.ok);
  assert.equal(rejected.error, "slot_occupied");

  const stored = await prisma.reservation.findMany({
    where: {
      date: new Date(`${TEST_DATES[0]}T00:00:00.000Z`),
      resourceId: "Q1",
      shift: "MORNING",
      slotIndex: 2,
      status: { in: ["PENDING", "CONFIRMED"] },
    },
  });
  assert.equal(stored.length, 1);
});

test("concurrent different slots cannot create an overflow overlap", async () => {
  const longCase = {
    date: TEST_DATES[1],
    resourceId: "Q1" as const,
    shift: "morning" as const,
    slotIndex: 0,
    patients: [
      {
        historyNumber: "TEST-LONG",
        procedure: "Procedimiento ficticio largo",
        estimatedDurationMinutes: 100,
        anesthesiaType: "General",
        insuranceType: "Privado",
        orderIndex: 0,
        isDeferredUrgency: true,
        specialCircuitReason: "Prueba automatizada de concurrencia",
      },
    ],
  };

  const nextSlot = {
    date: TEST_DATES[1],
    resourceId: "Q1" as const,
    shift: "morning" as const,
    slotIndex: 1,
    patients: [
      {
        historyNumber: "TEST-NEXT",
        procedure: "Procedimiento ficticio corto",
        estimatedDurationMinutes: 20,
        anesthesiaType: "General",
        insuranceType: "Privado",
        orderIndex: 0,
        isDeferredUrgency: true,
        specialCircuitReason: "Prueba automatizada de concurrencia",
      },
    ],
  };

  const [a, b] = await Promise.all([
    createReservationInDb(longCase, SURGEON_A, { actorUserId: SURGEON_A }),
    createReservationInDb(nextSlot, SURGEON_B, { actorUserId: SURGEON_B }),
  ]);

  const results = [a, b];
  assert.equal(results.filter((r) => r.ok).length, 1);
  const rejected = results.find((r) => !r.ok);
  assert.ok(rejected && !rejected.ok);
  assert.equal(rejected.error, "overflow_conflict");

  const stored = await prisma.reservation.findMany({
    where: {
      date: new Date(`${TEST_DATES[1]}T00:00:00.000Z`),
      resourceId: "Q1",
      shift: "MORNING",
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    include: { patients: true },
  });
  assert.equal(stored.length, 1);
});
