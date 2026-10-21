import assert from "node:assert/strict";
import test from "node:test";
import { buildConfirmationChecklist } from "../src/lib/mailbox/confirmationChecklist";

test("mutua and missing staff block confirmation until the checklist is done", () => {
  const blocked = buildConfirmationChecklist({
    specialMaterial: "prótesis de prueba",
    insurance: "Mutua",
  });
  assert.equal(blocked.readyToConfirm, false);
  assert.deepEqual(blocked.steps.filter((step) => !step.done).map((step) => step.id), ["nursing", "material", "insurance"]);

  const ready = buildConfirmationChecklist({
    staffing: { date: "2031-10-20", shift: "morning", nurses: 2, tcae: 1 },
    specialMaterial: "prótesis de prueba",
    materialReady: true,
    insurance: "Mutua",
    insuranceAuthorized: true,
  });
  assert.equal(ready.readyToConfirm, true);
  assert.equal(JSON.stringify(ready).includes("Paciente"), false);
});

test("SNS does not need an extra insurance authorization", () => {
  const ready = buildConfirmationChecklist({
    staffing: { date: "2031-10-20", shift: "afternoon", nurses: 1, tcae: 1 },
    insurance: "SNS",
  });
  assert.equal(ready.readyToConfirm, true);
});
