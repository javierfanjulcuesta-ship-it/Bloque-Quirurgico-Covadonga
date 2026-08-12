import test from "node:test";
import assert from "node:assert/strict";
import { CONTACT_REQUEST_MAX_BYTES, parseContactInput } from "../src/lib/contactInput";

test("valid contact payload is normalized without truncation", () => {
  const result = parseContactInput(JSON.stringify({
    fromName: "  Ana García  ",
    fromEmail: "  ANA@EXAMPLE.COM ",
    subject: "  Consulta  ",
    body: "  Necesito ayuda  ",
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data, {
    fromName: "Ana García",
    fromEmail: "ana@example.com",
    subject: "Consulta",
    body: "Necesito ayuda",
  });
});

test("malformed JSON is a client error instead of a server error", () => {
  const result = parseContactInput("{not-json");
  assert.deepEqual(result, { ok: false, status: 400, error: "JSON inválido" });
});

test("oversized requests are rejected", () => {
  const result = parseContactInput("x".repeat(CONTACT_REQUEST_MAX_BYTES + 1));
  assert.deepEqual(result, { ok: false, status: 413, error: "Solicitud demasiado grande" });
});

test("fields over their limits are rejected rather than silently truncated", () => {
  const result = parseContactInput(JSON.stringify({
    fromName: "A",
    fromEmail: "a@example.com",
    subject: "S",
    body: "x".repeat(5001),
  }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 400);
});
