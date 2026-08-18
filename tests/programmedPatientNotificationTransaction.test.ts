import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { formatPreanesthesiaAppointmentMadrid } from "../src/lib/email/enqueueProgrammedPatientAfterScheduling";

const phase2Source = fs.readFileSync(
  path.join(process.cwd(), "src/lib/reservations/patientCircuitPhase2.ts"),
  "utf8",
);
const enqueueSource = fs.readFileSync(
  path.join(process.cwd(), "src/lib/email/enqueueProgrammedPatientAfterScheduling.ts"),
  "utf8",
);

test("formats the persisted preanesthesia appointment in Europe/Madrid with exact minute", () => {
  assert.equal(
    formatPreanesthesiaAppointmentMadrid(new Date("2026-08-20T08:30:00.000Z")),
    "2026-08-20 10:30",
  );
  assert.equal(formatPreanesthesiaAppointmentMadrid(null), null);
});

test("queues management notification only after phase-2 processing and inside the same transaction", () => {
  const loopIndex = phase2Source.indexOf("for (const p of params.patients)");
  const enqueueIndex = phase2Source.indexOf("await enqueueProgrammedPatientsAfterScheduling(tx");
  const functionEndIndex = phase2Source.indexOf("export async function applyAndLogPatientCircuitPhase2(");
  assert.ok(loopIndex >= 0);
  assert.ok(enqueueIndex > loopIndex);
  assert.ok(functionEndIndex > enqueueIndex);
  assert.match(phase2Source, /recipientEmail: adminEmail/);
});

test("notification composition reads persisted reservation and patient state and never calls an email provider", () => {
  assert.match(enqueueSource, /tx\.reservation\.findUnique/);
  assert.match(enqueueSource, /tx\.patientInBlock\.findMany/);
  assert.match(enqueueSource, /preanesthesiaAppointmentAt: true/);
  assert.match(enqueueSource, /enqueueProgrammedPatientNotification\(tx/);
  assert.doesNotMatch(enqueueSource, /sendMail|nodemailer|graphClient|fetch\(/i);
});

test("technical identifiers are used only for persistence lookup/idempotency, not supplied to the email builder", () => {
  const builderCall = enqueueSource.slice(
    enqueueSource.indexOf("buildProgrammedPatientNotificationEmail({"),
    enqueueSource.indexOf("await enqueueProgrammedPatientNotification", enqueueSource.indexOf("buildProgrammedPatientNotificationEmail({")),
  );
  assert.doesNotMatch(builderCall, /reservationId|patientId|surgeonId|actorUserId|createdByUserId/);
  assert.match(builderCall, /responsibleProfessionalName/);
  assert.match(builderCall, /appointmentLabel/);
});
