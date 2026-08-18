import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("simulated outgoing mailbox is explicitly local-only and visibly not sent", () => {
  const page = readFileSync("src/app/gestion-citas/correo-simulado/page.tsx", "utf8");
  assert.match(page, /DEMO — ESTE CORREO NO HA SALIDO DE QxFlow/);
  assert.match(page, /No llama a `\/api`, SMTP ni Microsoft Graph/);
  assert.doesNotMatch(page, /fetch\s*\(/);
});

test("authorization denial mirrors only to the responsible surgeon and simulated email", () => {
  const layout = readFileSync("src/app/gestion-citas/layout.tsx", "utf8");
  assert.match(layout, /responsibleUserId:\s*reservation\.surgeonId/);
  assert.match(layout, /addResponsibleSurgeonInAppNotification/);
  assert.match(layout, /category:\s*"AUTORIZACION_DENEGADA"/);
  assert.match(layout, /addDemoOutgoingMail/);
  assert.doesNotMatch(layout, /getNotifications\(\)/);
  assert.doesNotMatch(layout, /fetch\s*\(/);
});

test("denial observer emits only on a transition into DENEGADA, not on initial hydration", () => {
  const layout = readFileSync("src/app/gestion-citas/layout.tsx", "utf8");
  assert.match(layout, /if \(!previous\) return/);
  assert.match(layout, /before === "DENEGADA" \|\| after !== "DENEGADA"/);
  assert.match(layout, /processingRef\.current\.has\(patientId\)/);
});

test("demo reset also clears the simulated outgoing mailbox", () => {
  const reset = readFileSync("src/lib/demoReset.ts", "utf8");
  assert.match(reset, /DEMO_OUTGOING_MAIL_STORAGE_KEY/);
});

test("mailbox state model has the approved simulated delivery progression", () => {
  const store = readFileSync("src/lib/demoOutgoingMail.ts", "utf8");
  assert.match(store, /"GENERADO" \| "PREPARADO" \| "ENTREGA_SIMULADA"/);
  assert.match(store, /"NUEVA_CITA"/);
  assert.match(store, /"CAMBIO"/);
  assert.match(store, /"ANULACION"/);
  assert.match(store, /"HUECO_LIBERADO"/);
  assert.match(store, /"AUTORIZACION_DENEGADA"/);
});
