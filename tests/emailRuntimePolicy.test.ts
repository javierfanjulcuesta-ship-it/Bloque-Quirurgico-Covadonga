import test from "node:test";
import assert from "node:assert/strict";
import { emailProviderUnavailableMessage, isEmailMockAllowed } from "../src/lib/email/emailRuntimePolicy";

test("email mock is forbidden in production", () => {
  assert.equal(isEmailMockAllowed("production"), false);
});

test("email mock remains available outside production", () => {
  assert.equal(isEmailMockAllowed("development"), true);
  assert.equal(isEmailMockAllowed("test"), true);
  assert.equal(isEmailMockAllowed(undefined), true);
});

test("provider failures expose operational messages without secret material", () => {
  assert.equal(emailProviderUnavailableMessage("smtp"), "El proveedor SMTP no está disponible");
  assert.equal(emailProviderUnavailableMessage("graph"), "Microsoft Graph no está disponible");
  assert.equal(emailProviderUnavailableMessage(), "No hay ningún proveedor de correo real configurado");
});
