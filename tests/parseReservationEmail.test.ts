import test from "node:test";
import assert from "node:assert/strict";
import { parseReservationEmail } from "../src/lib/email/parseReservationEmail";

test("reservation email no longer defaults a missing slot to slot 0", () => {
  const result = parseReservationEmail({
    subject: "Reserva Q1 mañana 15/01/2031",
    bodyPlain: "HC-TEST procedimiento: artroscopia 30 min general SESPA",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.missingFields?.some((field) => field.includes("Slot/Tramo")));
  }
});

test("reservation email rejects out-of-range slot instead of clamping it", () => {
  const result = parseReservationEmail({
    subject: "Reserva Q1 mañana 15/01/2031 slot 9",
    bodyPlain: "HC-TEST procedimiento: artroscopia 30 min general SESPA",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.missingFields?.some((field) => field.includes("Slot/Tramo")));
  }
});

test("reservation email recognizes SESPA explicitly", () => {
  const result = parseReservationEmail({
    subject: "Reserva Q1 mañana 15/01/2031 slot 2",
    bodyPlain: "HC-TEST procedimiento: artroscopia 30 min general SESPA",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.slotIndex, 2);
    assert.equal(result.data.patients?.[0]?.entidadFinanciadora, "SESPA");
  }
});
