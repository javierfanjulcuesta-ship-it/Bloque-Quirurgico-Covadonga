import assert from "node:assert/strict";
import test from "node:test";
import { buildProgrammedPatientNotificationEmail } from "../src/lib/email/programmedPatientNotificationEmail";

const baseInput = {
  patient: {
    fullName: "Paciente Demo",
    historyNumber: "DEMO-0001",
    procedure: "Procedimiento sintético",
    estimatedDurationMinutes: 75,
    anesthesiaType: "General",
    insuranceType: "Entidad Demo",
    admissionType: "ambulatorio",
    solicitudRecursos: "ninguno",
    notes: "Datos exclusivamente ficticios",
    patientEmail: "paciente@example.invalid",
    patientPhone: "000000000",
  },
  surgery: {
    date: "2026-08-24",
    startTime: "09:30",
    endTime: "10:30",
    resourceLabel: "Q2",
    shiftLabel: "Mañana",
    responsibleProfessionalName: "Cirujano Demo",
  },
  preanesthesia: {
    status: "SCHEDULED",
    appointmentLabel: "jueves 20/08/2026 10:20",
  },
};

test("includes patient, surgical schedule and assigned preanesthesia appointment", () => {
  const email = buildProgrammedPatientNotificationEmail(baseInput);
  assert.match(email.subject, /Paciente programado/);
  assert.match(email.text, /Paciente Demo/);
  assert.match(email.text, /DEMO-0001/);
  assert.match(email.text, /09:30-10:30/);
  assert.match(email.text, /Q2/);
  assert.match(email.text, /Cirujano Demo/);
  assert.match(email.text, /jueves 20\/08\/2026 10:20/);
});

test("states pending assignment instead of inventing a preanesthesia appointment", () => {
  const email = buildProgrammedPatientNotificationEmail({
    ...baseInput,
    preanesthesia: { status: "PENDING", appointmentLabel: null },
  });
  assert.match(email.text, /Pendiente de asignación/);
});

test("public builder has no fields for technical ids, auth or audit internals", () => {
  const inputShape = JSON.stringify(baseInput);
  for (const forbidden of ["reservationId", "patientId", "actorUserId", "password", "token", "detailsJson"]) {
    assert.equal(inputShape.includes(forbidden), false, `unexpected technical field ${forbidden}`);
  }

  const email = buildProgrammedPatientNotificationEmail(baseInput);
  for (const forbiddenValue of ["reservation-internal-id", "patient-internal-id", "secret-token"]) {
    assert.equal(email.text.includes(forbiddenValue), false);
  }
});
