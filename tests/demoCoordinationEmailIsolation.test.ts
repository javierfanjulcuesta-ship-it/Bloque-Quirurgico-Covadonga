import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/ContactarCoordinacion.tsx", "utf8");

test("demo coordination never reads persisted manager email recipients", () => {
  const recipientGuard = source.indexOf("const gestorEmails = modoDemo");
  const profileRead = source.indexOf("getProfile(g.id)");
  assert.ok(recipientGuard >= 0, "missing demo recipient guard");
  assert.ok(profileRead > recipientGuard, "persisted profile lookup must remain behind demo guard");
  assert.ok(source.includes("? []\n      : gestores"));
});

test("demo coordination never opens mailto", () => {
  const mailGuard = source.indexOf("if (!modoDemo && gestorEmails.length > 0)");
  const windowOpen = source.indexOf("window.open(mailto");
  assert.ok(mailGuard >= 0, "missing demo mailto guard");
  assert.ok(windowOpen > mailGuard, "window.open must remain behind real-mode guard");
});

test("demo coordination clearly reports local-only delivery", () => {
  assert.ok(source.includes("No se abrirá ni enviará correo."));
  assert.ok(source.includes("no se ha abierto ni enviado ningún correo."));
});
