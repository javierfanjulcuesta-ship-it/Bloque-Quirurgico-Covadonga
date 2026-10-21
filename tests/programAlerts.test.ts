import test from "node:test";
import assert from "node:assert/strict";
import { buildProgramAlerts } from "../src/lib/program/programAlerts";
import {
  decideIncomingResource,
  missingFieldsLeaveRoomPending,
  recognizeResourceId,
} from "../src/lib/program/recognizeResource";
import { parseReservationEmail } from "../src/lib/email/parseReservationEmail";

function reservation(overrides: Partial<Parameters<typeof buildProgramAlerts>[0]["reservations"][number]> & {
  id: string;
  surgeonId: string;
  slotIndex: number;
}) {
  return {
    date: "2031-10-24",
    resourceId: "Q1",
    shift: "morning",
    status: "confirmed",
    patients: [{ id: `${overrides.id}-p`, estimatedDurationMinutes: 50, procedure: "caso" }],
    ...overrides,
  };
}

test("minute overlap in the same operating room alerts across adjacent slots", () => {
  const result = buildProgramAlerts({
    reservations: [
      reservation({ id: "a", surgeonId: "corona", slotIndex: 2, patients: [{ estimatedDurationMinutes: 80 }] }),
      reservation({ id: "b", surgeonId: "lopez", slotIndex: 3, patients: [{ estimatedDurationMinutes: 40 }] }),
    ],
    assignments: [{ date: "2031-10-24", shift: "morning", assignmentType: "OR", resourceId: "Q1", anesthetistId: "an-1" }],
  });

  const overlap = result.alerts.find((alert) => alert.kind === "overlap");
  assert.ok(overlap && overlap.kind === "overlap");
  assert.equal(overlap.resourceId, "Q1");
  assert.ok(overlap.overlapMinutes > 0);
  assert.equal(result.counts.iq, 2);
  assert.equal(result.counts.surgeons, 2);
  assert.equal(result.counts.minutes, 120);
});

test("the same surgeon can continue into the next slot without an overlap alert", () => {
  const result = buildProgramAlerts({
    reservations: [
      reservation({ id: "a", surgeonId: "corona", slotIndex: 2, patients: [{ estimatedDurationMinutes: 80 }] }),
      reservation({ id: "b", surgeonId: "corona", slotIndex: 3, patients: [{ estimatedDurationMinutes: 40 }] }),
    ],
  });
  assert.equal(result.alerts.some((alert) => alert.kind === "overlap"), false);
});

test("patients without a recognized room stay pending and are not called Q1", () => {
  const result = buildProgramAlerts({
    reservations: [
      reservation({
        id: "pending",
        surgeonId: "muel",
        slotIndex: 0,
        resourceId: null,
        patients: [{ numeroHistoria: "TEST-0001", estimatedDurationMinutes: 30, procedure: "Procedimiento prueba" }],
      }),
    ],
  });
  assert.equal(result.alerts.filter((alert) => alert.kind === "without_room").length, 1);
  assert.equal(result.alerts.some((alert) => alert.kind === "overlap"), false);
});

test("a day and shift with patients and no operating-room anesthetist is flagged", () => {
  const result = buildProgramAlerts({
    reservations: [reservation({ id: "a", surgeonId: "corona", slotIndex: 1 })],
    assignments: [],
  });
  const missing = result.alerts.find((alert) => alert.kind === "missing_anesthetist");
  assert.ok(missing && missing.kind === "missing_anesthetist");
  assert.equal(missing.resourceId, "Q1");
});

test("a full-shift anesthetist covers the operating room", () => {
  const result = buildProgramAlerts({
    reservations: [reservation({ id: "a", surgeonId: "corona", slotIndex: 1 })],
    assignments: [{ date: "2031-10-24", shift: "morning", assignmentType: "OR", resourceId: "__full_shift__" }],
  });
  assert.equal(result.alerts.some((alert) => alert.kind === "missing_anesthetist"), false);
});

test("more than three surgeons in one shift is an alert, not a block", () => {
  const result = buildProgramAlerts({
    reservations: ["s1", "s2", "s3", "s4"].map((surgeonId, index) =>
      reservation({
        id: surgeonId,
        surgeonId,
        slotIndex: index,
        resourceId: index === 3 ? "Q2" : "Q1",
        patients: [{ estimatedDurationMinutes: 20 }],
      }),
    ),
    assignments: [
      { date: "2031-10-24", shift: "morning", assignmentType: "OR", resourceId: "Q1" },
      { date: "2031-10-24", shift: "morning", assignmentType: "OR", resourceId: "Q2" },
    ],
  });
  const crowded = result.alerts.find((alert) => alert.kind === "too_many_surgeons");
  assert.ok(crowded && crowded.kind === "too_many_surgeons");
  assert.equal(crowded.surgeonCount, 4);
});

test("suspended patients do not count as IQ or occupy the room", () => {
  const result = buildProgramAlerts({
    reservations: [
      reservation({
        id: "a",
        surgeonId: "corona",
        slotIndex: 2,
        patients: [{ estimatedDurationMinutes: 80, workflowStatus: "SUSPENDED" }],
      }),
      reservation({ id: "b", surgeonId: "lopez", slotIndex: 3 }),
    ],
    assignments: [{ date: "2031-10-24", shift: "morning", assignmentType: "OR", resourceId: "Q1" }],
  });
  assert.equal(result.counts.iq, 1);
  assert.equal(result.alerts.some((alert) => alert.kind === "overlap"), false);
});

test("anesthetist in endoscopy or menores without patients is an alert and is not moved", () => {
  const result = buildProgramAlerts({
    reservations: [],
    assignments: [
      { date: "2031-10-24", shift: "morning", assignmentType: "OR", resourceId: "endoscopias", anesthetistId: "an-1" },
    ],
  });
  assert.equal(result.alerts.some((alert) => alert.kind === "idle_endoscopy"), true);
  assert.equal(result.counts.iq, 0);
});

test("unrecognized room never falls back to Q1", () => {
  assert.equal(recognizeResourceId("sala norte"), null);
  assert.equal(recognizeResourceId(""), null);
  assert.equal(recognizeResourceId(undefined), null);
  assert.deepEqual(decideIncomingResource("Q1"), { action: "use", resourceId: "Q1" });
  assert.deepEqual(decideIncomingResource("quirofano"), { action: "pending" });
  assert.equal(missingFieldsLeaveRoomPending(["Quirófano/Recurso (Q1, Q2, Q3, procedimientos menores o técnicas del dolor)"]), true);
  assert.equal(missingFieldsLeaveRoomPending(["Fecha", "Quirófano/Recurso"]), false);

  const parsed = parseReservationEmail({
    subject: "Reserva mañana 15/01/2031 slot 2",
    bodyPlain: "HC-TEST procedimiento: artroscopia 30 min general SESPA",
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(missingFieldsLeaveRoomPending(parsed.missingFields), true);
    assert.equal(JSON.stringify(parsed).includes('"resourceId":"Q1"'), false);
  }
});
