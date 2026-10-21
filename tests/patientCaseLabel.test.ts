import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { stripSensitiveKeys } from "../src/lib/agent/minimize";
import { isOutboundDraftExpired, outboundDraftExpiresAt } from "../src/lib/drafts/draftExpiry";
import { formatParteLine } from "../src/lib/drafts/parteTemplate";
import { caseLabelFromOrder, displayCaseLabel, operationalPatient } from "../src/lib/patients/caseLabel";

test("case labels are Caso N and ignore a raw history", () => {
  assert.equal(caseLabelFromOrder(0), "Caso 1");
  assert.equal(caseLabelFromOrder(4), "Caso 5");
  assert.equal(displayCaseLabel({ caseLabel: "Caso 3", numeroHistoria: "TEST-0009" }), "Caso 3");
  assert.equal(displayCaseLabel({ numeroHistoria: "TEST-0009", order: 1 }), "Caso 2");
});

test("the client patient drops name, phone and email", () => {
  const stored = operationalPatient({
    order: 0,
    name: "Paciente Prueba 01",
    numeroHistoria: "TEST-0001",
    patientEmail: "correo@example.test",
    patientPhone: "600000000",
    procedure: "Procedimiento de prueba",
  });
  assert.equal(stored.caseLabel, "Caso 1");
  assert.equal(stored.numeroHistoria, "Caso 1");
  assert.equal(stored.name, undefined);
  assert.equal(stored.patientEmail, undefined);
  assert.equal(stored.patientPhone, undefined);
  assert.equal(stored.procedure, "Procedimiento de prueba");
});

test("proposal payloads drop history and keep the procedure", () => {
  const stripped = stripSensitiveKeys({
    historyNumber: "TEST-0002",
    fullName: "Paciente Prueba 02",
    initials: "P.P.0.",
    surgeonInitials: "C.",
    procedure: "Procedimiento de prueba",
    nested: { dni: "DOCUMENTO-FICTICIO", patientPhone: "CONTACTO" },
  }) as Record<string, unknown>;
  const serialized = JSON.stringify(stripped);
  assert.equal(serialized.includes("TEST-0002"), false);
  assert.equal(serialized.includes("Paciente Prueba"), false);
  assert.equal(serialized.includes("DOCUMENTO"), false);
  assert.equal(stripped.procedure, "Procedimiento de prueba");
  assert.equal(stripped.surgeonInitials, "C.");
});

test("parte initials come only from a session name", () => {
  const fromExcel = formatParteLine({
    date: "2026-10-19",
    shift: "morning",
    slotIndex: 0,
    fullName: "Paciente Prueba 01",
    procedure: "Procedimiento de prueba",
  });
  assert.match(fromExcel ?? "", /P\.P\.0\./);
  assert.equal((fromExcel ?? "").includes("Paciente Prueba"), false);

  const fromDatabase = formatParteLine({
    date: "2026-10-19",
    shift: "morning",
    slotIndex: 0,
    caseLabel: "Caso 1",
    procedure: "Procedimiento de prueba",
  });
  assert.match(fromDatabase ?? "", /Caso 1/);
  assert.equal((fromDatabase ?? "").includes("P.P."), false);
});

test("outbound drafts expire after seven days", () => {
  const created = new Date("2026-10-21T12:00:00.000Z");
  const expires = outboundDraftExpiresAt(created);
  assert.equal(expires.toISOString(), "2026-10-28T12:00:00.000Z");
  assert.equal(isOutboundDraftExpired(expires, new Date("2026-10-28T12:00:00.000Z")), true);
  assert.equal(isOutboundDraftExpired(expires, new Date("2026-10-28T11:59:00.000Z")), false);
});

test("the case-label migration removes identifying columns", () => {
  const sql = readFileSync("prisma/migrations/20261021160000_patient_case_label/migration.sql", "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "caseLabel"/);
  assert.match(sql, /DROP COLUMN IF EXISTS "historyNumber"/);
  assert.match(sql, /DROP COLUMN IF EXISTS "fullName"/);
  assert.match(sql, /DROP COLUMN IF EXISTS "patientEmail"/);
  assert.match(sql, /DROP COLUMN IF EXISTS "patientPhone"/);
  assert.match(sql, /DROP COLUMN IF EXISTS "beforeJson"/);
  assert.match(sql, /DROP COLUMN IF EXISTS "afterJson"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "expiresAt"/);
  assert.match(sql, /'Caso '/);
  assert.equal(/SET "caseLabel" = .*(fullName|historyNumber)/.test(sql), false);
});
