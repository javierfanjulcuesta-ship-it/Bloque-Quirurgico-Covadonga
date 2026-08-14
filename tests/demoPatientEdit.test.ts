import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/lib/reservations.ts", "utf8");

test("demo patient updates stay in local reservation storage", () => {
  const fnStart = source.indexOf("export async function updateReservationPatientEntry");
  assert.ok(fnStart >= 0, "missing updateReservationPatientEntry");
  const demoGuard = source.indexOf("if (modoDemo)", fnStart);
  const readLocal = source.indexOf("getStoredReservations()", demoGuard);
  const writeLocal = source.indexOf("addOrUpdateStoredReservation(updated)", demoGuard);
  const apiCall = source.indexOf("return updateReservationPatientApi", demoGuard);

  assert.ok(demoGuard > fnStart, "demo guard must be inside patient update entrypoint");
  assert.ok(readLocal > demoGuard, "demo path must read local reservations");
  assert.ok(writeLocal > readLocal, "demo path must persist the edited reservation locally");
  assert.ok(apiCall > writeLocal, "real API call must remain after the complete demo branch");
});

test("demo patient update preserves identity and only applies defined fields", () => {
  assert.ok(source.includes("function applyDefinedPatientFields"));
  assert.ok(source.includes("const next = { ...patient }"));
  assert.ok(source.includes("if (data.numeroHistoria !== undefined)"));
  assert.ok(source.includes("if (data.patientEmail !== undefined)"));
  assert.ok(source.includes("if (data.patientPhone !== undefined)"));
  assert.ok(source.includes("Paciente DEMO no encontrado."));
  assert.ok(source.includes("Reserva DEMO no encontrada."));
});
