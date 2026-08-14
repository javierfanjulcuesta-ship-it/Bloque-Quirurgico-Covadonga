import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const auditSource = readFileSync("src/lib/demoAudit.ts", "utf8");
const reservationsSource = readFileSync("src/lib/reservations.ts", "utf8");

test("demo audit uses a dedicated isolated-demo namespace and stores no clinical payload fields", () => {
  assert.ok(auditSource.includes('"qxflow:isolated-demo:v1:audit"'));
  assert.ok(!auditSource.includes("numeroHistoria"));
  assert.ok(!auditSource.includes("patientEmail"));
  assert.ok(!auditSource.includes("patientPhone"));
  assert.ok(!auditSource.includes("procedure"));
  assert.ok(!auditSource.includes("notes"));
});

test("demo reservation lifecycle records local audit events after local persistence", () => {
  for (const action of [
    'action: "reservation.created"',
    'action: "patient.updated"',
    'action: "patient.cancelled"',
    'action: "reservation.cancelled"',
  ]) {
    assert.ok(reservationsSource.includes(action), `missing ${action}`);
  }
  assert.ok(reservationsSource.includes('import { recordDemoAuditEvent } from "./demoAudit"'));
});

test("demo audit remains bounded and browser-local", () => {
  assert.ok(auditSource.includes("MAX_DEMO_AUDIT_EVENTS = 250"));
  assert.ok(auditSource.includes("window.localStorage"));
  assert.ok(!auditSource.includes("fetch("));
  assert.ok(!auditSource.includes("prisma"));
});
