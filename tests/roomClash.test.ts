import assert from "node:assert/strict";
import test from "node:test";
import {
  describeRoomClash,
  findRoomClashes,
  shiftCapacityMinutes,
  weeklyRoomCapacity,
} from "../src/lib/program/roomClash";
import type { ProgramAlertReservation } from "../src/lib/program/programAlerts";

function reservation(overrides: Partial<ProgramAlertReservation> & { minutes: number }): ProgramAlertReservation {
  return {
    id: overrides.id ?? "r1",
    date: overrides.date ?? "2031-10-20",
    resourceId: overrides.resourceId ?? "Q1",
    shift: overrides.shift ?? "morning",
    slotIndex: overrides.slotIndex ?? 0,
    surgeonId: overrides.surgeonId ?? "otro-cirujano",
    status: overrides.status ?? "confirmed",
    patients: [{
      caseLabel: "Caso 1",
      estimatedDurationMinutes: overrides.minutes,
      workflowStatus: "ACTIVE",
    }],
  };
}

const proposal = {
  date: "2031-10-20",
  resourceId: "Q1",
  shift: "morning",
  slotIndex: 1,
  durationMinutes: 60,
  surgeonId: "demo-cirujano",
};

test("a long case warns by minutes and suggests the first free operating room", () => {
  const warnings = findRoomClashes({
    proposals: [proposal],
    reservations: [reservation({ minutes: 120 })],
  });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.overlapMinutes, 40);
  assert.equal(warnings[0]?.alternativeResourceId, "Q2");
  const text = describeRoomClash(warnings[0]!);
  assert.match(text, /Q1 el 2031-10-20 por la mañana se solapa 40 min/);
  assert.match(text, /Q2 está libre/);
  assert.equal(text.includes("Paciente"), false);
  assert.equal(text.includes("TEST-"), false);
});

test("the same surgeon and a cancelled case do not warn", () => {
  assert.deepEqual(findRoomClashes({
    proposals: [proposal],
    reservations: [reservation({ minutes: 120, surgeonId: "demo-cirujano" })],
  }), []);
  assert.deepEqual(findRoomClashes({
    proposals: [proposal],
    reservations: [reservation({ minutes: 120, status: "cancelled" })],
  }), []);
});

test("when Q2 is also taken the suggestion moves to Q3, and then to none", () => {
  const q2Busy = findRoomClashes({
    proposals: [proposal],
    reservations: [
      reservation({ minutes: 120 }),
      reservation({ id: "r2", resourceId: "Q2", minutes: 120 }),
    ],
  });
  assert.equal(q2Busy[0]?.alternativeResourceId, "Q3");

  const none = findRoomClashes({
    proposals: [proposal],
    reservations: [
      reservation({ minutes: 120 }),
      reservation({ id: "r2", resourceId: "Q2", minutes: 120 }),
      reservation({ id: "r3", resourceId: "Q3", minutes: 120 }),
    ],
  });
  assert.equal(none[0]?.alternativeResourceId, null);
  assert.match(describeRoomClash(none[0]!), /No hay otro quirófano libre/);
});

test("weekly capacity counts clock minutes and can go below zero", () => {
  assert.equal(shiftCapacityMinutes("morning"), 390);
  assert.equal(shiftCapacityMinutes("afternoon"), 300);
  const cells = weeklyRoomCapacity({
    dates: ["2031-10-20"],
    reservations: [reservation({ minutes: 400, shift: "afternoon", resourceId: "Q2" })],
  });
  const q2 = cells.find((cell) => cell.shift === "afternoon" && cell.resourceId === "Q2");
  assert.equal(q2?.capacityMinutes, 300);
  assert.equal(q2?.usedMinutes, 410);
  assert.equal(q2?.freeMinutes, -110);
  const q1 = cells.find((cell) => cell.shift === "morning" && cell.resourceId === "Q1");
  assert.equal(q1?.usedMinutes, 0);
  assert.equal(q1?.freeMinutes, 390);
  assert.equal(JSON.stringify(cells).includes("Paciente"), false);
});
