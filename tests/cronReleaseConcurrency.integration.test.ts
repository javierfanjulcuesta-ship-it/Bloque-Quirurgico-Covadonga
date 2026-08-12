import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { releasePendingReservationIfEligible } from "../src/lib/reservations/releasePendingReservationIfEligible";
import { withSchedulingContextLock } from "../src/lib/reservations/bookingContextLock";

const prisma = new PrismaClient();
const USER_ID = "cron-race-surgeon";
const DATE = "2020-01-06"; // cierre ampliamente vencido
const RESOURCE = "Q2";
const AUDIT_FAILURE_ID = "cron-audit-failure-reservation";
const AUDIT_TRIGGER = "qxflow_test_fail_cron_release_audit";
const AUDIT_TRIGGER_FN = "qxflow_test_fail_cron_release_audit_fn";

async function removeAuditFailureTrigger(): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${AUDIT_TRIGGER} ON "ReservationEvent"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${AUDIT_TRIGGER_FN}()`);
}

async function cleanup(): Promise<void> {
  await removeAuditFailureTrigger();
  const reservations = await prisma.reservation.findMany({
    where: {
      date: new Date(`${DATE}T00:00:00.000Z`),
      resourceId: RESOURCE,
      surgeonId: USER_ID,
    },
    select: { id: true },
  });
  const ids = reservations.map((r) => r.id);
  if (ids.length) {
    await prisma.reservationEvent.deleteMany({ where: { reservationId: { in: ids } } });
    await prisma.patientInBlock.deleteMany({ where: { reservationId: { in: ids } } });
    await prisma.reservation.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { id: USER_ID } });
}

before(async () => {
  await cleanup();
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: "cron-race-surgeon@test.invalid",
      passwordHash: "not-a-real-password-hash",
      name: "Cirujano ficticio cron",
      role: "CIRUJANO",
      approved: true,
    },
  });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function addPatientIfReservationStillActive(reservationId: string): Promise<"added" | "inactive"> {
  return withSchedulingContextLock(
    { date: DATE, resourceId: RESOURCE, shift: "morning" },
    async (tx) => {
      const live = await tx.reservation.findUnique({
        where: { id: reservationId },
        select: { status: true },
      });
      if (!live || (live.status !== "PENDING" && live.status !== "CONFIRMED")) return "inactive" as const;

      await tx.patientInBlock.create({
        data: {
          reservationId,
          historyNumber: `TEST-${reservationId}`,
          procedure: "Procedimiento ficticio",
          estimatedDurationMinutes: 30,
          anesthesiaType: "General",
          insuranceType: "Privado",
          orderIndex: 0,
          isDeferredUrgency: true,
          specialCircuitReason: "Prueba automatizada de carrera cron",
        },
      });
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: "CONFIRMED" },
      });
      return "added" as const;
    },
  );
}

test("cron release and patient add cannot produce a RELEASED reservation with patients", async () => {
  for (let i = 0; i < 12; i++) {
    const reservation = await prisma.reservation.create({
      data: {
        id: `cron-race-reservation-${i}`,
        date: new Date(`${DATE}T00:00:00.000Z`),
        resourceId: RESOURCE,
        shift: "MORNING",
        slotIndex: i,
        surgeonId: USER_ID,
        status: "PENDING",
      },
    });

    const candidate = {
      id: reservation.id,
      date: reservation.date,
      resourceId: reservation.resourceId,
      shift: reservation.shift,
      slotIndex: reservation.slotIndex,
      surgeonId: reservation.surgeonId,
    };

    const [releaseResult, addResult] = await Promise.all([
      releasePendingReservationIfEligible(candidate),
      addPatientIfReservationStillActive(reservation.id),
    ]);

    const final = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      include: { patients: true, events: true },
    });

    assert.notEqual(
      final.status === "RELEASED" && final.patients.length > 0,
      true,
      `estado imposible en iteración ${i}`,
    );

    if (releaseResult.released) {
      assert.equal(final.status, "RELEASED");
      assert.equal(final.patients.length, 0);
      assert.equal(addResult, "inactive");
      assert.equal(final.events.filter((e) => e.eventType === "RESERVATION_RELEASED").length, 1);
    } else if (addResult === "added") {
      assert.equal(final.status, "CONFIRMED");
      assert.equal(final.patients.length, 1);
      assert.equal(final.events.filter((e) => e.eventType === "RESERVATION_RELEASED").length, 0);
    }
  }
});

test("release audit failure rolls back the RELEASED status", async () => {
  const reservation = await prisma.reservation.create({
    data: {
      id: AUDIT_FAILURE_ID,
      date: new Date(`${DATE}T00:00:00.000Z`),
      resourceId: RESOURCE,
      shift: "MORNING",
      slotIndex: 99,
      surgeonId: USER_ID,
      status: "PENDING",
    },
  });

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION ${AUDIT_TRIGGER_FN}()
    RETURNS trigger AS $$
    BEGIN
      IF NEW."reservationId" = '${AUDIT_FAILURE_ID}' AND NEW."eventType"::text = 'RESERVATION_RELEASED' THEN
        RAISE EXCEPTION 'forced cron release audit failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER ${AUDIT_TRIGGER}
    BEFORE INSERT ON "ReservationEvent"
    FOR EACH ROW EXECUTE FUNCTION ${AUDIT_TRIGGER_FN}()
  `);

  try {
    await assert.rejects(
      releasePendingReservationIfEligible({
        id: reservation.id,
        date: reservation.date,
        resourceId: reservation.resourceId,
        shift: reservation.shift,
        slotIndex: reservation.slotIndex,
        surgeonId: reservation.surgeonId,
      }),
      /forced cron release audit failure/,
    );

    const final = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      include: { events: true },
    });
    assert.equal(final.status, "PENDING");
    assert.equal(final.releasedAt, null);
    assert.equal(final.events.filter((e) => e.eventType === "RESERVATION_RELEASED").length, 0);
  } finally {
    await removeAuditFailureTrigger();
  }
});
