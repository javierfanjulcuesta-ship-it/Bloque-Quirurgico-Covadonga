import assert from "node:assert/strict";
import test from "node:test";
import {
  claimNextProgrammedPatientNotification,
  type ProgrammedPatientLeaseStore,
} from "../src/lib/email/programmedPatientNotificationLease";
import { PROGRAMMED_PATIENT_NOTIFICATION_LEASE_MS } from "../src/lib/email/programmedPatientNotificationOutbox";

function baseMessage(id: string, attemptCount = 1) {
  return {
    id,
    recipientEmail: "gestion-citas@demo.invalid",
    subject: "[QxFlow][NUEVA CITA] Paciente programado",
    bodyText: "Contenido sintético sin datos reales.",
    attemptCount,
  };
}

test("claims one due message and exposes the incremented attempt count", async () => {
  const calls: string[] = [];
  const now = new Date("2026-08-17T20:30:00.000Z");
  const store: ProgrammedPatientLeaseStore = {
    async findCandidate() {
      calls.push("find");
      return { id: "outbox-1" };
    },
    async tryClaim({ id, leaseUntil }) {
      calls.push(`claim:${id}`);
      assert.equal(leaseUntil.getTime(), now.getTime() + PROGRAMMED_PATIENT_NOTIFICATION_LEASE_MS);
      return true;
    },
    async readClaimed(id) {
      calls.push(`read:${id}`);
      return baseMessage(id, 2);
    },
  };

  const message = await claimNextProgrammedPatientNotification({ store, now });
  assert.equal(message?.id, "outbox-1");
  assert.equal(message?.attemptCount, 2);
  assert.deepEqual(calls, ["find", "claim:outbox-1", "read:outbox-1"]);
});

test("losing a concurrent claim retries instead of returning the same message", async () => {
  const candidates = ["outbox-raced", "outbox-next"];
  let findIndex = 0;
  const claimed: string[] = [];
  const store: ProgrammedPatientLeaseStore = {
    async findCandidate() {
      const id = candidates[Math.min(findIndex, candidates.length - 1)]!;
      findIndex += 1;
      return { id };
    },
    async tryClaim({ id }) {
      claimed.push(id);
      return id === "outbox-next";
    },
    async readClaimed(id) {
      return baseMessage(id, 1);
    },
  };

  const message = await claimNextProgrammedPatientNotification({ store, maxCandidateRetries: 3 });
  assert.equal(message?.id, "outbox-next");
  assert.deepEqual(claimed, ["outbox-raced", "outbox-next"]);
});

test("returns null when there is no due message", async () => {
  let claimed = false;
  const store: ProgrammedPatientLeaseStore = {
    async findCandidate() {
      return null;
    },
    async tryClaim() {
      claimed = true;
      return true;
    },
    async readClaimed() {
      return baseMessage("unexpected");
    },
  };

  const message = await claimNextProgrammedPatientNotification({ store });
  assert.equal(message, null);
  assert.equal(claimed, false);
});

test("never reads or delivers a candidate that could not be claimed", async () => {
  let reads = 0;
  const store: ProgrammedPatientLeaseStore = {
    async findCandidate() {
      return { id: "outbox-raced" };
    },
    async tryClaim() {
      return false;
    },
    async readClaimed() {
      reads += 1;
      return baseMessage("outbox-raced");
    },
  };

  const message = await claimNextProgrammedPatientNotification({
    store,
    maxCandidateRetries: 1,
  });
  assert.equal(message, null);
  assert.equal(reads, 0);
});
