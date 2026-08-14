import test from "node:test";
import assert from "node:assert/strict";
import {
  emailProviderUnavailableMessage,
  isEmailMockAllowed,
  shouldForceEmailMock,
} from "../src/lib/email/emailRuntimePolicy";

test("email mock is forbidden in production outside preview", () => {
  assert.equal(isEmailMockAllowed("production", "production"), false);
  assert.equal(isEmailMockAllowed("production", undefined), false);
});

test("Vercel preview always forces mock email", () => {
  assert.equal(shouldForceEmailMock("preview"), true);
  assert.equal(shouldForceEmailMock("production"), false);
  assert.equal(isEmailMockAllowed("production", "preview"), true);
});

test("email mock remains available outside production", () => {
  assert.equal(isEmailMockAllowed("development", "development"), true);
  assert.equal(isEmailMockAllowed("test", "development"), true);
  assert.equal(isEmailMockAllowed(undefined, "development"), true);
});

test("provider failures expose operational messages without secret material", () => {
  assert.equal(emailProviderUnavailableMessage("smtp"), "El proveedor SMTP no está disponible");
  assert.equal(emailProviderUnavailableMessage("graph"), "Microsoft Graph no está disponible");
  assert.equal(emailProviderUnavailableMessage(), "No hay ningún proveedor de correo real configurado");
});
