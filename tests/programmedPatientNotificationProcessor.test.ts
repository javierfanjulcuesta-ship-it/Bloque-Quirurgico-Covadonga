import assert from "node:assert/strict";
import test from "node:test";
import {
  processLeasedProgrammedPatientNotification,
  type ProgrammedPatientOutboxStore,
} from "../src/lib/email/programmedPatientNotificationProcessor";
import { PROGRAMMED_PATIENT_NOTIFICATION_MAX_ATTEMPTS } from "../src/lib/email/programmedPatientNotificationOutbox";

function makeStore() {
  const sent: Array<{ id: string; sentAt: Date }> = [];
  const failed: Array<{ id: string; attemptCount: number; nextAttemptAt: Date; lastError: string }> = [];
  const store: ProgrammedPatientOutboxStore = {
    async markSent(params) {
      sent.push(params);
    },
    async markFailed(params) {
      failed.push(params);
    },
  };
  return { store, sent, failed };
}

const baseMessage = {
  id: "outbox-demo-1",
  recipientEmail: "gestion-citas@demo.invalid",
  subject: "[QxFlow][NUEVA CITA] Paciente programado",
  bodyText: "Contenido sintético sin datos reales.",
  attemptCount: 1,
};

test("marks a leased notification sent only after delivery succeeds", async () => {
  const state = makeStore();
  let deliveries = 0;
  const now = new Date("2026-08-17T19:00:00.000Z");

  const result = await processLeasedProgrammedPatientNotification({
    message: baseMessage,
    store: state.store,
    now,
    deliver: async ({ to, subject, textBody }) => {
      deliveries += 1;
      assert.equal(to, "gestion-citas@demo.invalid");
      assert.match(subject, /NUEVA CITA/);
      assert.match(textBody, /sintético/);
    },
  });

  assert.deepEqual(result, { outcome: "sent", attemptCount: 1 });
  assert.equal(deliveries, 1);
  assert.equal(state.sent.length, 1);
  assert.equal(state.failed.length, 0);
});

test("schedules a bounded retry without marking sent when delivery fails", async () => {
  const state = makeStore();
  const now = new Date("2026-08-17T19:00:00.000Z");

  const result = await processLeasedProgrammedPatientNotification({
    message: { ...baseMessage, attemptCount: 2 },
    store: state.store,
    now,
    deliver: async () => {
      throw new Error("provider unavailable\nsecret-looking diagnostic that must stay bounded");
    },
  });

  assert.equal(result.outcome, "retry_scheduled");
  assert.equal(state.sent.length, 0);
  assert.equal(state.failed.length, 1);
  assert.equal(state.failed[0]?.attemptCount, 2);
  assert.ok((state.failed[0]?.nextAttemptAt.getTime() ?? 0) > now.getTime());
  assert.doesNotMatch(state.failed[0]?.lastError ?? "", /\n/);
  assert.ok((state.failed[0]?.lastError.length ?? 0) <= 500);
});

test("stops retrying after the configured maximum attempts", async () => {
  const state = makeStore();
  const result = await processLeasedProgrammedPatientNotification({
    message: { ...baseMessage, attemptCount: PROGRAMMED_PATIENT_NOTIFICATION_MAX_ATTEMPTS },
    store: state.store,
    deliver: async () => {
      throw new Error("provider unavailable");
    },
  });

  assert.equal(result.outcome, "exhausted");
  assert.equal(state.failed[0]?.attemptCount, PROGRAMMED_PATIENT_NOTIFICATION_MAX_ATTEMPTS);
  assert.equal(state.sent.length, 0);
});

test("invalid payload is terminal and never calls a provider", async () => {
  const state = makeStore();
  let deliveries = 0;
  const result = await processLeasedProgrammedPatientNotification({
    message: { ...baseMessage, bodyText: null },
    store: state.store,
    deliver: async () => {
      deliveries += 1;
    },
  });

  assert.equal(result.outcome, "invalid_payload");
  assert.equal(deliveries, 0);
  assert.equal(state.failed[0]?.attemptCount, PROGRAMMED_PATIENT_NOTIFICATION_MAX_ATTEMPTS);
});
