import assert from "node:assert/strict";
import test from "node:test";
import { findFreeOpenings, occupancyFromAnonymousRows, occupancyFromReservations } from "../src/lib/mailbox/availability";

test("free openings avoid occupied minutes and prefer the habitual room", () => {
  const occupied = occupancyFromAnonymousRows([
    { date: "2031-10-20", shift: "morning", resourceId: "Q1", durationMinutes: 120 },
  ]);
  const openings = findFreeOpenings({
    dates: ["2031-10-20"],
    durationMinutes: 60,
    surgeonName: "Huéscar",
    explicitShift: "morning",
    occupied,
  });
  assert.equal(openings[0]?.resourceId, "Q2");
  assert.equal(openings[0]?.preferred, true);
  assert.equal(openings.some((opening) => opening.resourceId === "Q1" && opening.startMinutes === 8 * 60), false);
  assert.equal(JSON.stringify(openings).includes("Paciente"), false);
});

test("anesthesia quota blocks another operating room and endoscopy stays on ENDO", () => {
  const blocked = findFreeOpenings({
    dates: ["2031-10-21"],
    durationMinutes: 45,
    explicitShift: "afternoon",
    occupied: occupancyFromAnonymousRows([
      { date: "2031-10-21", shift: "tarde", resourceId: "Q1", durationMinutes: 300 },
    ]),
    anesthesia: {
      assignments: [{
        date: "2031-10-21",
        shift: "afternoon",
        assignmentType: "OR",
        resourceId: "Q1",
        anesthetistId: "anestesista-demo",
      }],
      maxByAnesthetistId: new Map([["anestesista-demo", 1]]),
    },
  });
  assert.equal(blocked.length, 0);

  const endo = findFreeOpenings({
    dates: ["2031-10-21"],
    durationMinutes: 30,
    surgeonRole: "endoscopista",
    explicitShift: "morning",
  });
  assert.deepEqual(endo.map((opening) => opening.resourceId), ["ENDO"]);
});

test("stored reservations become anonymous occupied blocks", () => {
  const blocks = occupancyFromReservations([{
    id: "r1",
    date: "2031-10-22",
    resourceId: "Q3",
    shift: "morning",
    slotIndex: 0,
    surgeonId: "demo-cirujano",
    status: "confirmed",
    patients: [{ caseLabel: "Caso 1", estimatedDurationMinutes: 50 }],
  }]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.resourceId, "Q3");
  assert.equal(JSON.stringify(blocks).includes("Caso"), false);
});
