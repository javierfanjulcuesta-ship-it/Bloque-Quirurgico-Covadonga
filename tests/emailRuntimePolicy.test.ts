import test from "node:test";
import assert from "node:assert/strict";
import {
  emailProviderUnavailableMessage,
  isEmailMockAllowed,
  shouldForceEmailMock,
} from "../src/lib/email/emailRuntimePolicy";

test("email mock is forbidden in production outside preview and isolated demo", () => {
  assert.equal(isEmailMockAllowed("production", "production", "real"), false);
  assert.equal(isEmailMockAllowed("production", undefined, undefined), false);
});

test("Vercel preview always forces mock email", () => {
  assert.equal(shouldForceEmailMock("preview", "real"), true);
  assert.equal(shouldForceEmailMock("production", "real"), false);
  assert.equal(isEmailMockAllowed("production", "preview", "real"), true);
});

test("isolated demo always forces mock email even in a production build", () => {
  assert.equal(shouldForceEmailMock("production", "isolated-demo"), true);
  assert.equal(shouldForceEmailMock(undefined, "isolated-demo"), true);
  assert.equal(isEmailMockAllowed("production", "production", "isolated-demo"), true);
});

test("email mock remains available outside production", () => {
  assert.equal(isEmailMockAllowed("development", "development", "real"), true);
  assert.equal(isEmailMockAllowed("test", "development", "real"), true);
  assert.equal(isEmailMockAllowed(undefined, "development", "real"), true);
});

test("provider failures expose operational messages without secret material", () => {
  assert.equal(emailProviderUnavailableMessage("smtp"), "El proveedor SMTP no está disponible");
  assert.equal(emailProviderUnavailableMessage("graph"), "Microsoft Graph no está disponible");
  assert.equal(emailProviderUnavailableMessage(), "No hay ningún proveedor de correo real configurado");
});
