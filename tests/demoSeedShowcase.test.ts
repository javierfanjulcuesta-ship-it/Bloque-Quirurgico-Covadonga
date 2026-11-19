import assert from "node:assert/strict";
import test from "node:test";

import { createDemoSeedSnapshot } from "../src/lib/demoSeed";
import { MOCK_USERS } from "../src/lib/dataHelpers";
import { isSespa } from "../src/lib/patientInsurance";
import { ASSIGNMENT_PREANESTHESIA } from "../src/lib/types";

const SESPA_CAPABLE = new Set(["demo-anestesista", "demo-gestor-anestesista"]);

test("la semana demo es ficticia, coherente y cabe en el bloque", () => {
  const snapshot = createDemoSeedSnapshot(new Date("2026-11-19T12:00:00"));
  const userIds = new Set(MOCK_USERS.map((user) => user.id));
  const slots = new Set<string>();

  assert.ok(snapshot.reservations.length >= 20, "la semana debe parecer un bloque real, no tres huecos");

  for (const reservation of snapshot.reservations) {
    assert.ok(userIds.has(reservation.surgeonId), reservation.surgeonId);
    const key = `${reservation.date}|${reservation.resourceId}|${reservation.shift}|${reservation.slotIndex}`;
    assert.equal(slots.has(key), false, `hueco duplicado ${key}`);
    slots.add(key);

    for (const patient of reservation.patients) {
      assert.match(patient.numeroHistoria, /^HC-DEMO-/);
      assert.match(patient.name ?? "", /\S/);
      assert.doesNotMatch(patient.name ?? "", /ejemplo/i);
      if (patient.patientEmail) assert.match(patient.patientEmail, /@example\.test$/);
      if (patient.patientPhone) assert.match(patient.patientPhone, /^\+34 600 000 /);
    }
  }

  const loads = new Map<string, number>();
  for (const assignment of snapshot.assignments) {
    if (assignment.assignmentType !== "OR") continue;
    const key = `${assignment.anesthetistId}|${assignment.date}|${assignment.shift}`;
    loads.set(key, (loads.get(key) ?? 0) + 1);
    const sameSlot = snapshot.reservations.filter(
      (reservation) =>
        reservation.date === assignment.date &&
        reservation.shift === assignment.shift &&
        reservation.resourceId === assignment.resourceId,
    );
    const needsSespa = sameSlot.some((reservation) => reservation.patients.some((patient) => isSespa(patient.entidadFinanciadora)));
    if (needsSespa) assert.ok(SESPA_CAPABLE.has(assignment.anesthetistId), assignment.id);
  }
  for (const [key, count] of loads) {
    assert.ok(count <= 2, `${key} tiene ${count} quirófanos`);
  }

  assert.ok(snapshot.assignments.some((assignment) => assignment.resourceId === ASSIGNMENT_PREANESTHESIA));
  assert.ok(snapshot.messages.length >= 2);
  assert.ok(snapshot.notifications.some((notification) => notification.userId === "demo-cirujano"));
  assert.ok(snapshot.unavailability.length >= 1);
  assert.equal(JSON.stringify(snapshot).includes("@hospital"), false);
});
