import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/lib/reservations.ts", "utf8");

test("demo patient cancellation uses local reservation state instead of the real API", () => {
  const fnStart = source.indexOf("export async function cancelPatient(");
  const demoGuard = source.indexOf("if (modoDemo)", fnStart);
  const storedLookup = source.indexOf("getStoredReservations().find", demoGuard);
  const apiCall = source.indexOf("return cancelReservationPatient", fnStart);

  assert.ok(fnStart >= 0, "cancelPatient entrypoint missing");
  assert.ok(demoGuard > fnStart, "demo guard missing from cancelPatient");
  assert.ok(storedLookup > demoGuard, "demo cancellation must read local reservations");
  assert.ok(apiCall > storedLookup, "real cancellation API must remain after the demo-only branch");
  assert.ok(!source.includes("Cancelar paciente no disponible en modo demo"));
});

test("demo last-patient cancellation preserves the existing retention deadline policy", () => {
  assert.ok(source.includes('import { isReservationRetentionStillAllowed } from "./schedulingDeadline"'));
  assert.ok(source.includes("const retainEmptySlot = wasLastPatient && isReservationRetentionStillAllowed(reservation.date)"));
  assert.ok(source.includes('slotOutcome: wasLastPatient ? (retainEmptySlot ? "retained" : "released") : null'));
});

test("demo full reservation cancellation is local-only and marks the reservation cancelled", () => {
  const fnStart = source.indexOf("export async function cancelReservationEntry(");
  const demoGuard = source.indexOf("if (modoDemo)", fnStart);
  const localWrite = source.indexOf("addOrUpdateStoredReservation(updated)", demoGuard);
  const apiCall = source.indexOf("return cancelReservationApi", fnStart);

  assert.ok(fnStart >= 0, "cancelReservationEntry entrypoint missing");
  assert.ok(demoGuard > fnStart, "demo guard missing from full cancellation");
  assert.ok(source.includes('const updated: Reservation = { ...reservation, status: "cancelled" }'));
  assert.ok(localWrite > demoGuard, "demo full cancellation must persist locally");
  assert.ok(apiCall > localWrite, "real API call must remain outside the demo branch");
  assert.ok(!source.includes("Cancelar reserva no disponible en modo demo"));
});
