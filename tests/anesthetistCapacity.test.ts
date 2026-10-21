import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findCapacityExcesses } from "../src/lib/anesthesia/capacity";
import {
  catalogMaxForName,
  effectiveMaxSimultaneousOr,
} from "../src/lib/anesthesia/capacityCatalog";
import { assignmentOutsideRange, validateAssignmentWeekRange } from "../src/lib/anesthesia/assignmentRange";

test("capacity check uses the resolved number and does not name people", () => {
  const source = readFileSync("src/lib/anesthesia/capacity.ts", "utf8");
  assert.equal(/carcelen|fanjul|dura/i.test(source), false);

  const threeRooms = ["Q1", "Q2", "Q3"].map((resourceId) => ({
    date: "2031-11-06",
    shift: "MORNING",
    assignmentType: "OR",
    resourceId,
    anesthetistId: "an-1",
  }));
  assert.equal(findCapacityExcesses(threeRooms, new Map([["an-1", 2]])).length, 1);
  assert.equal(findCapacityExcesses(threeRooms, new Map([["an-1", 3]])).length, 0);
  assert.equal(findCapacityExcesses(threeRooms, new Map()).length, 1);
});

test("catalog data sets Carcelen and Fanjul to 3 and Dura to 2, and a saved profile wins", () => {
  assert.equal(catalogMaxForName("Luis Cárcelen"), 3);
  assert.equal(catalogMaxForName("Marta Fanjul"), 3);
  assert.equal(catalogMaxForName("Elena Dura"), 2);
  assert.equal(catalogMaxForName("Otra Persona"), null);
  assert.equal(effectiveMaxSimultaneousOr(null, "Luis Cárcelen"), 3);
  assert.equal(effectiveMaxSimultaneousOr(2, "Luis Cárcelen"), 2);
  assert.equal(effectiveMaxSimultaneousOr(null, "Sin catálogo"), 2);
});

test("assignment replace is limited to one week and ignores rows outside it", () => {
  const week = validateAssignmentWeekRange("2031-11-02", "2031-11-06");
  assert.equal(week.ok, true);
  if (!week.ok) return;
  assert.equal(assignmentOutsideRange("2031-11-09", week.range), true);
  assert.equal(assignmentOutsideRange("2031-11-04", week.range), false);
  assert.equal(validateAssignmentWeekRange("2031-11-02", "2031-11-10").ok, false);
});

test("real unavailability stays in Postgres and the assignment route replaces only the week", () => {
  const storage = readFileSync("src/lib/storageAnesthetistUnavailability.ts", "utf8");
  const screen = readFileSync("src/components/anestesista/SolicitarNoDisponibilidad.tsx", "utf8");
  const route = readFileSync("src/app/api/anesthetist-assignments/route.ts", "utf8");
  assert.match(storage, /En modo real la no disponibilidad debe guardarse mediante la API/);
  assert.match(screen, /\/api\/anesthetist-unavailability/);
  assert.match(route, /replaceAssignmentWeek/);
  assert.match(route, /anesthetist_capacity_exceeded/);
  assert.equal(route.includes("deleteMany({})"), false);
  assert.match(readFileSync("prisma/schema.prisma", "utf8"), /model AnesthetistUnavailability/);
  assert.match(readFileSync("prisma/schema.prisma", "utf8"), /model AnesthetistProfile/);
});
