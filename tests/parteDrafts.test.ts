import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSuspensionReason, patientInitials, renderParte } from "../src/lib/drafts/parteTemplate";
import { isEndoscopyCase, resolveParteRecipients } from "../src/lib/drafts/recipients";
import { minimizeReservation, stripSensitiveKeys } from "../src/lib/agent/minimize";

test("parte uses server initials, the fixed line and signature, and no extra guidance", () => {
  const rendered = renderParte([{
    date: "2031-10-24",
    shift: "morning",
    slotIndex: 2,
    fullName: "Paciente Prueba 01",
    procedure: "Procedimiento prueba",
  }]);
  assert.equal(patientInitials("Paciente Prueba 01"), "P.P.0.");
  assert.equal(rendered.body.includes("Paciente Prueba"), false);
  assert.match(rendered.body, /viernes 24\/10 · 10:30 · MAÑANA · P\.P\.0\. — Procedimiento prueba/);
  assert.match(rendered.body, /Gestor QxFlow · Bloque quirúrgico · Hospital Covadonga\n603 618 877\nquirofano\.covadonga@riberacare\.com$/);
  assert.equal(/orientativ|aplicación|puede consultar/i.test(rendered.body), false);
});

test("suspension keeps an enumerated reason on the draft and does not delete the patient", () => {
  assert.equal(isSuspensionReason("SIN_SEGURO"), true);
  assert.equal(isSuspensionReason("CATARRAL"), true);
  assert.equal(isSuspensionReason("CANCELACION_CIRUJANO"), true);
  assert.equal(isSuspensionReason("OTRO"), true);
  assert.equal(isSuspensionReason("sin seguro"), false);
  const rendered = renderParte([{
    date: "2031-10-24",
    shift: "morning",
    slotIndex: 2,
    fullName: "Paciente Prueba 01",
    procedure: "Procedimiento prueba",
  }], "SIN_SEGURO");
  assert.match(rendered.body, /^Motivo: SIN_SEGURO\n/);
  const suspend = readFileSync("src/app/api/reservations/[id]/patient/suspend/route.ts", "utf8");
  assert.match(suspend, /workflowStatus: "SUSPENDED"/);
  assert.equal(suspend.includes("delete"), false);
  assert.equal(suspend.includes("sendEmail"), false);
});

test("surgeon teams share one parte and endoscopy goes only to the configured endoscopist", () => {
  const users = [
    { id: "b", name: "Burgos", email: "b@example.test" },
    { id: "j", name: "La Jara", email: "j@example.test" },
    { id: "e", name: "Endo", email: "e@example.test" },
  ];
  const team = resolveParteRecipients({
    surgeonId: "b",
    surgeonName: "Burgos",
    resourceId: "Q1",
    users,
    teams: [],
  });
  assert.deepEqual(team.userIds.sort(), ["b", "j"]);

  const endoscopy = resolveParteRecipients({
    surgeonId: "b",
    surgeonName: "Burgos",
    resourceId: "endoscopias",
    users,
    teams: [],
    endoscopyUserId: "e",
  });
  assert.deepEqual(endoscopy.userIds, ["e"]);
  assert.equal(isEndoscopyCase("ENDO"), true);
  assert.equal(isEndoscopyCase("procedimientos-menores", "endoscopia diagnóstica"), true);
  const missing = resolveParteRecipients({
    surgeonId: "b",
    surgeonName: "Burgos",
    resourceId: "endoscopias",
    users,
    teams: [],
  });
  assert.deepEqual(missing.userIds, []);
  assert.match(missing.warning ?? "", /endoscopista/);
});

test("agent week minimization drops phone, email and hashes", () => {
  const minimized = minimizeReservation({
    id: "r1",
    date: "2031-10-24",
    resourceId: "Q1",
    shift: "MORNING",
    slotIndex: 1,
    surgeonName: "Corona",
    patients: [{
      caseLabel: "Caso 1",
      procedure: "Procedimiento prueba",
      estimatedDurationMinutes: 40,
    }],
  });
  const stripped = stripSensitiveKeys({
    summary: "mover",
    patientPhone: "CONTACTO-FICTICIO",
    patientEmail: "CORREO-FICTICIO",
    passwordHash: "SECRETO-FICTICIO",
    nested: { dni: "DOCUMENTO-FICTICIO", historyNumber: "TEST-0002" },
  });
  const serialized = JSON.stringify({ minimized, stripped });
  assert.equal(serialized.includes("CONTACTO-FICTICIO"), false);
  assert.equal(serialized.includes("CORREO-FICTICIO"), false);
  assert.equal(serialized.includes("SECRETO-FICTICIO"), false);
  assert.equal(serialized.includes("DOCUMENTO-FICTICIO"), false);
  assert.equal(serialized.includes("TEST-0002"), false);
  assert.equal(minimized.patients[0]?.caseLabel, "Caso 1");
  assert.equal(minimized.surgeonInitials, "C.");
});

test("webhook and cron do not send partes or create reservations from mail", () => {
  const webhook = readFileSync("src/lib/email/processIncomingEmail.ts", "utf8");
  const sendRoute = readFileSync("src/app/api/outbound-drafts/[id]/send/route.ts", "utf8");
  const cron = readFileSync("src/app/api/cron/programmed-patient-notifications/route.ts", "utf8");
  assert.equal(webhook.includes("createReservationInDb"), false);
  assert.equal(webhook.includes("sendReply"), false);
  assert.match(webhook, /proposal\.create/);
  assert.match(sendRoute, /draft\.status !== "PENDING_APPROVAL"/);
  assert.equal(cron.includes("outbound-drafts"), false);
  assert.match(readFileSync("src/app/api/agent/week/route.ts", "utf8"), /hasAgentServiceToken/);
  assert.equal(readFileSync("src/app/api/agent/week/route.ts", "utf8").includes("patientPhone"), false);
});
