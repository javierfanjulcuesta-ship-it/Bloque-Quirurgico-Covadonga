import test from "node:test";
import assert from "node:assert/strict";
import { CONTACT_REQUEST_MAX_BYTES, parseContactInput } from "../src/lib/contactInput";
import { readTextBodyWithLimit } from "../src/lib/http/requestBody";

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

test("bounded reader rejects a streamed body even without Content-Length", async () => {
  const limit = 16;
  const request = new Request("http://localhost/contact", {
    method: "POST",
    body: "x".repeat(limit + 1),
  });
  assert.equal(request.headers.has("content-length"), false);

  const result = await readTextBodyWithLimit(request, limit);
  assert.deepEqual(result, { ok: false, reason: "too_large" });
});

test("bounded reader counts UTF-8 bytes and returns accepted text", async () => {
  const text = "áéí";
  const request = new Request("http://localhost/contact", {
    method: "POST",
    body: text,
  });

  const accepted = await readTextBodyWithLimit(request, Buffer.byteLength(text, "utf8"));
  assert.deepEqual(accepted, { ok: true, text });
});

test("bounded reader rejects declared oversized bodies before reading", async () => {
  const request = new Request("http://localhost/login", {
    method: "POST",
    headers: { "content-length": "100" },
    body: "{}",
  });

  const result = await readTextBodyWithLimit(request, 8);
  assert.deepEqual(result, { ok: false, reason: "too_large" });
});
