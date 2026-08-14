import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/anestesista/ValoracionPreanestesia.tsx", "utf8");

test("demo preanesthesia never reads a persisted real email recipient", () => {
  const demoEmailGuard = source.indexOf("const surgeonEmail = modoDemo");
  const profileRead = source.indexOf("getProfile(r.surgeonId)");
  assert.ok(demoEmailGuard >= 0, "missing demo recipient guard");
  assert.ok(profileRead > demoEmailGuard, "profile email lookup must be behind demo guard");
  assert.ok(source.includes("? null\n        : (getProfile"));
});

test("demo preanesthesia never opens mailto", () => {
  const mailGuard = source.indexOf("if (!modoDemo && row.surgeonEmail)");
  const windowOpen = source.indexOf("window.open(mailto");
  assert.ok(mailGuard >= 0, "missing demo mailto guard");
  assert.ok(windowOpen > mailGuard, "window.open must remain behind the real-mode guard");
  assert.ok(source.includes("DEMO nunca construye ni abre mailto:"));
});

test("demo preanesthesia confirms local-only status without claiming email delivery", () => {
  assert.ok(source.includes("registrada localmente en la demostración; no se ha abierto ni enviado ningún correo"));
});
