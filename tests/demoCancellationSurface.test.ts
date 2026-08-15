import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/demo/anulaciones/page.tsx", "utf8");

test("demo cancellation surface fails closed outside demo", () => {
  const demoGuard = source.indexOf("if (!modoDemo)");
  const reservationCall = source.indexOf("cancelReservationEntry(");
  const patientCall = source.indexOf("cancelPatient(");
  assert.ok(demoGuard >= 0, "missing non-demo guard");
  assert.ok(reservationCall > demoGuard, "reservation cancellation must remain behind demo guard");
  assert.ok(patientCall > demoGuard, "patient cancellation must remain behind demo guard");
});

test("demo cancellation surface uses local reservation entrypoints and no direct API fetch", () => {
  assert.ok(source.includes("getReservations"));
  assert.ok(source.includes("cancelPatient"));
  assert.ok(source.includes("cancelReservationEntry"));
  assert.ok(!source.includes("fetch(\"/api"));
  assert.ok(!source.includes("fetch('/api"));
});

test("demo cancellation surface does not send email or open mailto", () => {
  assert.ok(!source.includes("mailto:"));
  assert.ok(!source.includes("window.open"));
  assert.ok(!source.includes("sendEmail"));
});
