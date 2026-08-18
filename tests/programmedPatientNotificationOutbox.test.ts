import assert from "node:assert/strict";
import test from "node:test";
import {
  PROGRAMMED_PATIENT_NOTIFICATION_MAX_ATTEMPTS,
  programmedPatientNotificationIdempotencyKey,
  programmedPatientNotificationNextAttemptAt,
  programmedPatientNotificationRetryDelayMs,
} from "../src/lib/email/programmedPatientNotificationOutbox";

test("uses a stable versioned idempotency key per reservation/patient", () => {
  const a = programmedPatientNotificationIdempotencyKey("reservation-1", "patient-1");
  const b = programmedPatientNotificationIdempotencyKey("reservation-1", "patient-1");
  const c = programmedPatientNotificationIdempotencyKey("reservation-1", "patient-2");

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^programmed-patient:v1:/);
});

test("retry schedule is exponential and capped", () => {
  assert.equal(programmedPatientNotificationRetryDelayMs(1), 60_000);
  assert.equal(programmedPatientNotificationRetryDelayMs(2), 120_000);
  assert.equal(programmedPatientNotificationRetryDelayMs(3), 240_000);
  assert.equal(programmedPatientNotificationRetryDelayMs(20), 360 * 60_000);
  assert.equal(PROGRAMMED_PATIENT_NOTIFICATION_MAX_ATTEMPTS, 8);
});

test("next attempt is derived deterministically from attempt count", () => {
  const now = new Date("2026-08-17T16:00:00.000Z");
  assert.equal(
    programmedPatientNotificationNextAttemptAt(4, now).toISOString(),
    "2026-08-17T16:08:00.000Z",
  );
});
