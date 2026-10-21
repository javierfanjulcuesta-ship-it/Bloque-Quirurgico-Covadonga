import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  canReadPatientIdentity,
  decryptField,
  isPatientIdentityStorageActive,
  planContactStorage,
  planIncomingEmailStorage,
  presentContactMessage,
  readIdentityConfig,
  readIdentityField,
  redactEventDetailsJson,
  redactOperationalError,
  type IdentityConfig,
} from "../src/lib/identity/patientIdentity";
import { purgeAllowed, PURGE_CONFIRM } from "../scripts/privacy/purge-identifying-text";

const ARMED: IdentityConfig = {
  requested: true,
  armed: true,
  encryptionKey: "clave-de-prueba-con-mas-de-32-caracteres",
  legalBasis: "base legal de prueba",
  retentionDays: 30,
};

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:5432/qxflow_preview?schema=public";

test("identity storage stays off unless every gate is set", () => {
  const config = readIdentityConfig({});
  assert.equal(config.requested, false);
  assert.equal(isPatientIdentityStorageActive(config), false);
  assert.equal(canReadPatientIdentity("gestor", config), false);
  assert.equal(isPatientIdentityStorageActive({ ...ARMED, requested: false }), false);
  assert.equal(isPatientIdentityStorageActive({ ...ARMED, armed: false }), false);
  assert.equal(isPatientIdentityStorageActive({ ...ARMED, encryptionKey: "corta" }), false);
  assert.equal(isPatientIdentityStorageActive({ ...ARMED, legalBasis: "corta" }), false);
});

test("a prepared key round-trips and a surgeon still cannot read it", () => {
  const ciphertext = planIncomingEmailStorage(
    {
      fromName: "Cirujano Demo",
      subject: "Reserva",
      bodyPlain: "Paciente Prueba 01 TEST-0001",
      bodyHtml: null,
    },
    ARMED,
    new Date("2031-01-01T00:00:00Z"),
  ).vault.find((field) => field.fieldName === "bodyPlain")?.ciphertext;

  assert.ok(ciphertext);
  assert.equal(decryptField(ciphertext, ARMED.encryptionKey), "Paciente Prueba 01 TEST-0001");
  assert.equal(ciphertext.includes("Paciente Prueba"), false);
  assert.equal(canReadPatientIdentity("cirujano", ARMED), false);
  assert.equal(canReadPatientIdentity("gestor", ARMED), true);
  assert.equal(readIdentityField(ciphertext, "cirujano", ARMED), null);
  assert.equal(readIdentityField(ciphertext, "gestor", ARMED), "Paciente Prueba 01 TEST-0001");
});

test("new email and contact rows keep identifying text out of the plain columns", () => {
  const email = planIncomingEmailStorage({
    fromName: "Cirujano Demo",
    subject: "Lista",
    bodyPlain: "Paciente Prueba 01",
    bodyHtml: "<p>Paciente Prueba 01</p>",
  });
  assert.equal(email.row.bodyPlain, null);
  assert.equal(email.row.bodyHtml, null);
  assert.equal(email.row.subject, "Correo recibido");
  assert.equal(email.row.identityMode, "redacted");
  assert.equal(email.vault.length, 0);
  assert.equal(JSON.stringify(email).includes("Paciente Prueba"), false);

  const contact = planContactStorage({
    fromName: "Usuario Prueba",
    fromEmail: "acceso@example.com",
    subject: "Necesito entrar",
    body: "Paciente Prueba 02",
  });
  assert.equal(contact.row.fromName, "Solicitante");
  assert.equal(contact.row.fromEmail, "acceso@example.com");
  assert.equal(contact.row.body, "[redactado]");
  assert.equal(contact.vault.length, 0);
  assert.deepEqual(presentContactMessage({
    fromName: "Usuario Prueba",
    subject: "Necesito entrar",
    body: "Paciente Prueba 02",
  }), {
    fromName: "Solicitante",
    subject: "Solicitud de acceso",
    body: "[redactado]",
  });
});

test("event details drop identifying keys and the purge stays manual", () => {
  const redacted = redactEventDetailsJson(JSON.stringify({
    historyNumber: "TEST-0001",
    fullName: "Paciente Prueba 01",
    date: "2031-10-20",
    caseLabel: "Caso 1",
  }));
  assert.match(redacted ?? "", /Caso 1/);
  assert.equal((redacted ?? "").includes("TEST-0001"), false);
  assert.equal((redacted ?? "").includes("Paciente Prueba"), false);
  assert.equal(redactOperationalError("Sala no reconocida. La solicitud queda pendiente y no se asigna Q1."), "Sala no reconocida. La solicitud queda pendiente y no se asigna Q1.");
  assert.equal(redactOperationalError("Paciente 1 (TEST-0001): duración estimada debe ser > 0"), "Mensaje operativo redactado");

  const migration = readFileSync("prisma/migrations/20261021170000_identity_storage_ready/migration.sql", "utf8");
  assert.equal(/UPDATE\s+"EmailMessage"/i.test(migration), false);
  assert.equal(/DROP\s+COLUMN\s+"bodyPlain"/i.test(migration), false);
  assert.match(migration, /PatientIdentityRecord/);

  const script = readFileSync("scripts/privacy/purge-identifying-text.ts", "utf8");
  const workflow = readFileSync(".github/workflows/pr-checks.yml", "utf8");
  const pkg = readFileSync("package.json", "utf8");
  assert.match(script, new RegExp(PURGE_CONFIRM));
  assert.equal(workflow.includes("purge-identifying-text"), false);
  assert.equal(pkg.includes("purge-identifying-text"), false);
  assert.equal(purgeAllowed({ DATABASE_URL: LOCAL }).ok, false);
  assert.equal(purgeAllowed({ DATABASE_URL: LOCAL, CONFIRM_PURGE_IDENTIFYING_TEXT: PURGE_CONFIRM }).ok, true);
  assert.equal(purgeAllowed({
    DATABASE_URL: "postgresql://user:pass@db.ejemplo.net/bloque",
    CONFIRM_PURGE_IDENTIFYING_TEXT: PURGE_CONFIRM,
  }).ok, false);
});
