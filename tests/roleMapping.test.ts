import test from "node:test";
import assert from "node:assert/strict";
import { roleToFrontend } from "../src/lib/roleMapping";

test("roleToFrontend maps every known role", () => {
  assert.equal(roleToFrontend("GESTOR"), "gestor");
  assert.equal(roleToFrontend("GESTOR_ANESTESISTA"), "gestor-anestesista");
  assert.equal(roleToFrontend("ANESTESISTA"), "anestesista");
  assert.equal(roleToFrontend("CIRUJANO"), "cirujano");
  assert.equal(roleToFrontend("ENDOSCOPISTA"), "endoscopista");
  assert.equal(roleToFrontend("GESTION_CITAS"), "gestion-citas");
});

test("roleToFrontend fails closed for unknown or malformed roles", () => {
  for (const invalid of ["ADMIN", "", "gestor_total", "unknown"]) {
    assert.throws(() => roleToFrontend(invalid), /Rol de usuario no reconocido/);
  }
});
