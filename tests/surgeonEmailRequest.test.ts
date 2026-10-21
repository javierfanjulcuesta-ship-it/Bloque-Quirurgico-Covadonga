import assert from "node:assert/strict";
import test from "node:test";
import { planSurgeonEmailProposal } from "../src/lib/mailbox/surgeonEmailRequest";

test("a surgeon email becomes a structured proposal without the patient text", () => {
  const plan = planSurgeonEmailProposal({
    fromName: "Cirujano Demo",
    subject: "Solicitud 20/10/2031 mañana",
    bodyPlain: [
      "Paciente Prueba 01 TEST-0001 HC-999",
      "procedimiento: artroscopia",
      "80 min",
      "mutua",
      "material: prótesis de prueba",
    ].join("\n"),
  }, "2031-10-20");

  assert.equal(plan.type, "SURGEON_EMAIL");
  assert.equal(plan.payload.procedure, "artroscopia");
  assert.equal(plan.payload.date, "2031-10-20");
  assert.equal(plan.payload.shift, "morning");
  assert.equal(plan.payload.durationMinutes, 80);
  assert.equal(plan.payload.insurance, "Mutua");
  assert.equal(plan.payload.specialMaterial, "prótesis de prueba");
  assert.equal(plan.payload.surgeonName, "Cirujano Demo");
  assert.deepEqual(plan.payload.missing, []);
  const stored = JSON.stringify(plan);
  assert.equal(stored.includes("Paciente Prueba"), false);
  assert.equal(stored.includes("TEST-0001"), false);
  assert.equal(stored.includes("HC-999"), false);
});

test("missing scheduling fields stay listed and the body is not stored", () => {
  const plan = planSurgeonEmailProposal({
    subject: "Quiero un hueco",
    bodyPlain: "Cuando se pueda. Paciente Prueba 02",
  }, "2031-10-21");
  assert.deepEqual(plan.payload.missing, ["Cirujano", "Procedimiento", "Fecha", "Turno", "Duración", "Seguro"]);
  assert.equal(JSON.stringify(plan).includes("Paciente Prueba"), false);
  assert.equal(JSON.stringify(plan).includes("Cuando se pueda"), false);
});
