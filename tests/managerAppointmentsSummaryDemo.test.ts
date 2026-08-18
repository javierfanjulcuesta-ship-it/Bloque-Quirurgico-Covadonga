import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("manager calendar exposes a separate Gestión de citas tab only through gestor access", () => {
  const layout = readFileSync("src/app/calendario/layout.tsx", "utf8");
  assert.match(layout, /hasGestorAccess\(user\.role\)/);
  assert.match(layout, /router\.push\("\/calendario\/gestion-citas"\)/);
  assert.match(layout, />\s*Gestión de citas\s*</);
});

test("manager appointments page is an aggregate-only current/next-week view", () => {
  const page = readFileSync("src/app/calendario/gestion-citas/page.tsx", "utf8");
  assert.match(page, /Semana actual/);
  assert.match(page, /Semana siguiente/);
  assert.match(page, /Llamadas pendientes/);
  assert.match(page, /Preanestesia a resolver/);
  assert.match(page, /Autorización pendiente/);
  assert.match(page, /Autorización denegada/);
  assert.match(page, /Listos/);
  assert.match(page, /no expone diagnósticos, ASA, medicación ni notas de anestesia/);
});

test("manager summary never renders patient-level identifiers or procedure fields", () => {
  const page = readFileSync("src/app/calendario/gestion-citas/page.tsx", "utf8");
  for (const forbidden of ["row.patientName", "row.historyNumber", "row.patientPhone", "row.patientEmail", "row.procedure", "row.anesthesiaType"]) {
    assert.equal(page.includes(forbidden), false, `manager summary must not render ${forbidden}`);
  }
});

test("manager summary remains local-only in DEMO and fails closed in real mode", () => {
  const page = readFileSync("src/app/calendario/gestion-citas/page.tsx", "utf8");
  assert.match(page, /if \(!modoDemo\)/);
  assert.match(page, /backend específico/);
  assert.doesNotMatch(page, /fetch\s*\(/);
});
