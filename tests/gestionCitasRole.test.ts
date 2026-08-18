import test from "node:test";
import assert from "node:assert/strict";
import { hasPermission, normalizeRole, type Permission } from "../src/lib/auth/permissions";
import {
  hasAnesthetistAccess,
  hasGestionCitasAccess,
  hasGestorAccess,
  hasProgrammingAccess,
  roleLabel,
  type PatientInBlock,
  type Reservation,
} from "../src/lib/types";
import { roleToFrontend, roleToPrisma } from "../src/lib/roleMapping";
import {
  LOCAL_NO_ANESTHETIST,
  buildGestionCitasRows,
  deriveAuthorizationOperationalStatus,
  derivePreanesthesiaOperationalStatus,
  nextWorkingWeekBounds,
} from "../src/lib/gestionCitas";

function patient(overrides: Partial<PatientInBlock> = {}): PatientInBlock {
  return {
    id: "patient-demo",
    name: "Paciente sintético",
    numeroHistoria: "HC-DEMO-TEST",
    procedure: "Procedimiento sintético",
    estimatedDurationMinutes: 45,
    anesthesiaType: "General",
    entidadFinanciadora: "Mutua Demo",
    admissionType: "ambulatorio",
    notes: "",
    order: 0,
    patientPhone: "+34 600 000 000",
    patientEmail: "patient@example.test",
    preanesthesiaStatus: "PENDING",
    financingStatus: "PENDING",
    ...overrides,
  };
}

function reservation(patients: PatientInBlock[]): Reservation {
  return {
    id: "reservation-demo",
    resourceId: "Q1",
    date: "2026-08-25",
    shift: "morning",
    slotIndex: 0,
    surgeonId: "demo-cirujano",
    patients,
    status: "confirmed",
    createdAt: "2026-08-18T00:00:00.000Z",
  };
}

test("gestion-citas is a dedicated fail-closed role, not gestor/anesthetist/programming", () => {
  assert.equal(normalizeRole("gestion-citas"), "gestion-citas");
  assert.equal(normalizeRole("gestion_citas"), "gestion-citas");
  assert.equal(roleLabel("gestion-citas"), "Gestión de citas");
  assert.equal(hasGestionCitasAccess("gestion-citas"), true);
  assert.equal(hasGestorAccess("gestion-citas"), false);
  assert.equal(hasAnesthetistAccess("gestion-citas"), false);
  assert.equal(hasProgrammingAccess("gestion-citas"), false);
  assert.equal(roleToFrontend("GESTION_CITAS"), "gestion-citas");
  assert.equal(roleToPrisma("gestion-citas"), "GESTION_CITAS");
});

test("gestion-citas receives only its narrow operational permissions", () => {
  const allowed: Permission[] = [
    "appointments:view",
    "appointments:update-contact",
    "appointments:update-confirmation",
    "appointments:update-authorization",
  ];
  for (const permission of allowed) assert.equal(hasPermission("gestion-citas", permission), true, permission);

  const forbidden: Permission[] = [
    "booking:create",
    "booking:update",
    "booking:cancel",
    "booking:view:all",
    "booking:view:own",
    "patient:create",
    "patient:update",
    "patient:cancel",
    "schedule:view:all",
    "schedule:view:own",
    "anesthetist:assign",
    "metrics:view",
    "user:create",
    "user:list",
    "user:update",
    "user:approve",
    "user:deactivate",
    "user:reactivate",
    "or:open_close",
    "contact:view",
    "rules:edit",
  ];
  for (const permission of forbidden) assert.equal(hasPermission("gestion-citas", permission), false, permission);
});

test("Local (no precisa anestesista) is NO_PRECISA and is never derived as APTO", () => {
  assert.equal(
    derivePreanesthesiaOperationalStatus({
      anesthesiaType: LOCAL_NO_ANESTHETIST,
      preanesthesiaStatus: "APTO",
      preanesthesiaAppointmentAt: "2026-08-01T08:00:00.000Z",
    }, new Date("2026-08-18T12:00:00.000Z")),
    "NO_PRECISA",
  );
});

test("past preanesthesia is APTO unless explicit NO APTO", () => {
  const now = new Date("2026-08-18T12:00:00.000Z");
  assert.equal(
    derivePreanesthesiaOperationalStatus({
      anesthesiaType: "General",
      preanesthesiaStatus: "SCHEDULED",
      preanesthesiaAppointmentAt: "2026-08-17T08:00:00.000Z",
    }, now),
    "APTO",
  );
  assert.equal(
    derivePreanesthesiaOperationalStatus({
      anesthesiaType: "General",
      preanesthesiaStatus: "NO APTO",
      preanesthesiaAppointmentAt: "2026-08-17T08:00:00.000Z",
    }, now),
    "NO_APTO",
  );
});

test("private financing always derives NO_PRECISA authorization", () => {
  assert.equal(
    deriveAuthorizationOperationalStatus(
      { entidadFinanciadora: "Privado", financingStatus: "DENEGADA" },
      { authorizationStatus: "DENEGADA" },
    ),
    "NO_PRECISA",
  );
});

test("local-no-anesthetist private case can be LISTO without ever becoming APTO", () => {
  const p = patient({
    anesthesiaType: LOCAL_NO_ANESTHETIST,
    entidadFinanciadora: "Privado",
    preanesthesiaStatus: "PENDING",
  });
  const rows = buildGestionCitasRows(
    [reservation([p])],
    { [p.id]: { confirmationStatus: "CONFIRMADO_CON_PACIENTE", attemptCount: 1 } },
    new Date("2026-08-18T12:00:00.000Z"),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.preanesthesiaStatus, "NO_PRECISA");
  assert.equal(rows[0]!.authorizationStatus, "NO_PRECISA");
  assert.equal(rows[0]!.globalStatus, "LISTO");
});

test("missing phone or email is a top-priority preparation incident", () => {
  const incomplete = patient({ id: "missing-email", patientEmail: undefined, financingStatus: "APROBADA", preanesthesiaStatus: "APTO" });
  const pendingCall = patient({ id: "pending-call", financingStatus: "APROBADA", preanesthesiaStatus: "APTO" });
  const rows = buildGestionCitasRows(
    [reservation([pendingCall, incomplete])],
    {
      "missing-email": { confirmationStatus: "CONFIRMADO_CON_PACIENTE", authorizationStatus: "APROBADA" },
      "pending-call": { confirmationStatus: "PENDIENTE", authorizationStatus: "APROBADA" },
    },
    new Date("2026-08-18T12:00:00.000Z"),
  );
  assert.equal(rows[0]!.patientId, "missing-email");
  assert.equal(rows[0]!.priority, 10);
  assert.equal(rows[0]!.globalStatus, "REQUIERE_ATENCION");
  assert.ok(rows[0]!.reasons.includes("Falta email"));
  assert.equal(rows[1]!.priority, 20);
});

test("next-week worklist covers Monday through Friday with no invented proximity threshold", () => {
  const bounds = nextWorkingWeekBounds(new Date("2026-08-18T12:00:00.000Z"));
  assert.deepEqual(bounds, { from: "2026-08-24", to: "2026-08-28" });
});
