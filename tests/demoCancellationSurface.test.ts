import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cancellationSource = readFileSync("src/app/demo/anulaciones/page.tsx", "utf8");
const auditSource = readFileSync("src/app/demo/auditoria/page.tsx", "utf8");

test("demo cancellation surface fails closed outside demo", () => {
  const demoGuard = cancellationSource.indexOf("if (!modoDemo)");
  const reservationCall = cancellationSource.indexOf("cancelReservationEntry(");
  const patientCall = cancellationSource.indexOf("cancelPatient(");
  assert.ok(demoGuard >= 0, "missing non-demo guard");
  assert.ok(reservationCall > demoGuard, "reservation cancellation must remain behind demo guard");
  assert.ok(patientCall > demoGuard, "patient cancellation must remain behind demo guard");
});

test("demo cancellation surface uses local reservation entrypoints and no direct API fetch", () => {
  assert.ok(cancellationSource.includes("getReservations"));
  assert.ok(cancellationSource.includes("cancelPatient"));
  assert.ok(cancellationSource.includes("cancelReservationEntry"));
  assert.ok(!cancellationSource.includes("fetch(\"/api"));
  assert.ok(!cancellationSource.includes("fetch('/api"));
});

test("demo cancellation surface does not send email or open mailto", () => {
  assert.ok(!cancellationSource.includes("mailto:"));
  assert.ok(!cancellationSource.includes("window.open"));
  assert.ok(!cancellationSource.includes("sendEmail"));
});

test("demo audit viewer reads only the synthetic local audit store", () => {
  assert.ok(auditSource.includes("getDemoAuditEvents"));
  assert.ok(auditSource.includes("if (!modoDemo)"));
  assert.ok(!auditSource.includes("fetch(\"/api"));
  assert.ok(!auditSource.includes("fetch('/api"));
  assert.ok(!auditSource.includes("mailto:"));
  assert.ok(!auditSource.includes("window.open"));
});

test("demo audit viewer explicitly states that PHI fields are not stored", () => {
  assert.ok(auditSource.includes("no almacena nombres, historia clínica, procedimientos, contactos ni notas"));
});
