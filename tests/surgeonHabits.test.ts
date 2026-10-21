import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  annotateInferredHabits,
  missingFieldsLeaveShiftPending,
  suggestSurgeonHabit,
  TURNO_INFERIDO,
  QUIROFANO_INFERIDO,
} from "../src/lib/surgeons/habits";

test("catalog suggests morning for Muel, Huescar and Corona, afternoon for Blanco, and Q2 for Huescar", () => {
  const muel = suggestSurgeonHabit({ explicitShift: null, surgeonName: "Andrés Muel" });
  assert.equal(muel.shift, "morning");
  assert.equal(muel.resourceId, null);
  assert.deepEqual(muel.flags, [TURNO_INFERIDO]);

  const huescar = suggestSurgeonHabit({ explicitShift: "unknown", explicitResourceId: "unknown", surgeonName: "Huéscar" });
  assert.equal(huescar.shift, "morning");
  assert.equal(huescar.resourceId, "Q2");
  assert.deepEqual(huescar.flags, [TURNO_INFERIDO, QUIROFANO_INFERIDO]);

  assert.equal(suggestSurgeonHabit({ surgeonName: "Corona" }).shift, "morning");
  assert.equal(suggestSurgeonHabit({ surgeonName: "Blanco García" }).shift, "afternoon");
});

test("an explicit shift is kept and a saved habit wins over the catalog without creating a reservation", () => {
  const explicit = suggestSurgeonHabit({ explicitShift: "afternoon", surgeonName: "Muel" });
  assert.equal(explicit.shift, "afternoon");
  assert.deepEqual(explicit.flags, []);

  const saved = suggestSurgeonHabit({
    surgeonName: "Muel",
    saved: { defaultShift: "afternoon", preferredResourceId: "Q3", active: true },
  });
  assert.equal(saved.shift, "afternoon");
  assert.equal(saved.resourceId, "Q3");
  assert.ok(saved.flags.includes(TURNO_INFERIDO));
  assert.equal(readFileSync("src/lib/surgeons/habits.ts", "utf8").includes("createReservation"), false);
});

test("preview marks TURNO_INFERIDO and leaves the detected shift untouched", () => {
  const [block] = annotateInferredHabits(
    [{
      shift: "unknown" as const,
      resourceId: "unknown",
      detectedSurgeon: "Huéscar",
      hasIssue: false,
      reviewStatus: "valid" as const,
    }],
    [],
  );
  assert.equal(block?.shift, "unknown");
  assert.equal(block?.reviewStatus, "review");
  assert.ok(block?.inferences?.includes(TURNO_INFERIDO));
  assert.match(block?.suggestionNote ?? "", /no se graba sola/);
  assert.equal(missingFieldsLeaveShiftPending(["Turno (mañana/morning o tarde/afternoon)"]), true);
  assert.equal(missingFieldsLeaveShiftPending(["Turno", "Slot/Tramo"]), false);
});

test("incoming mail with only a missing shift does not create a reservation", () => {
  const source = readFileSync("src/lib/email/processIncomingEmail.ts", "utf8");
  const marker = source.indexOf("if (missingFieldsLeaveShiftPending");
  assert.ok(marker > 0);
  assert.match(source.slice(marker, marker + 1800), /No se ha grabado la reserva/);
  assert.equal(source.includes("createReservationInDb"), false);
  assert.equal(source.includes("sendReply"), false);
});
