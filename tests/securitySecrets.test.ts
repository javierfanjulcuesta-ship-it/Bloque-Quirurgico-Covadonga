import test from "node:test";
import assert from "node:assert/strict";
import { bearerToken, secretsEqual } from "../src/lib/security/secrets";
import { validateWebhookSecret } from "../src/lib/email/webhookAuth";
import { resolveUseRealReservationsApi } from "../src/lib/config";

const originalWebhookSecret = process.env.EMAIL_WEBHOOK_SECRET;

test("secret comparison accepts only exact non-empty matches", () => {
  assert.equal(secretsEqual("abc", "abc"), true);
  assert.equal(secretsEqual("abc", "abd"), false);
  assert.equal(secretsEqual("abc", "abcd"), false);
  assert.equal(secretsEqual("", ""), false);
  assert.equal(secretsEqual(null, "abc"), false);
});

test("bearer parser is strict and trims the token", () => {
  assert.equal(bearerToken("Bearer secret-token"), "secret-token");
  assert.equal(bearerToken("bearer   secret-token   "), "secret-token");
  assert.equal(bearerToken("Basic secret-token"), null);
  assert.equal(bearerToken(null), null);
});

test("email webhook accepts a strong header secret but rejects query-only secrets", () => {
  const secret = "0123456789abcdef0123456789abcdef";
  process.env.EMAIL_WEBHOOK_SECRET = secret;
  try {
    const headerRequest = new Request("https://example.test/api/email/webhook", {
      method: "POST",
      headers: { "x-email-webhook-secret": secret },
    });
    assert.equal(validateWebhookSecret(headerRequest), true);

    const queryRequest = new Request(`https://example.test/api/email/webhook?webhookSecret=${secret}`, {
      method: "POST",
    });
    assert.equal(validateWebhookSecret(queryRequest), false);

    const wrongHeaderRequest = new Request("https://example.test/api/email/webhook", {
      method: "POST",
      headers: { "x-email-webhook-secret": `${secret}x` },
    });
    assert.equal(validateWebhookSecret(wrongHeaderRequest), false);
  } finally {
    if (originalWebhookSecret === undefined) delete process.env.EMAIL_WEBHOOK_SECRET;
    else process.env.EMAIL_WEBHOOK_SECRET = originalWebhookSecret;
  }
});

test("email webhook rejects short configured secrets", () => {
  process.env.EMAIL_WEBHOOK_SECRET = "short-secret";
  try {
    const request = new Request("https://example.test/api/email/webhook", {
      method: "POST",
      headers: { "x-email-webhook-secret": "short-secret" },
    });
    assert.equal(validateWebhookSecret(request), false);
  } finally {
    if (originalWebhookSecret === undefined) delete process.env.EMAIL_WEBHOOK_SECRET;
    else process.env.EMAIL_WEBHOOK_SECRET = originalWebhookSecret;
  }
});

test("production cannot be forced back to browser-local reservation storage", () => {
  assert.equal(
    resolveUseRealReservationsApi({ nodeEnv: "production", demoMode: false, useRealApiEnv: "false" }),
    true,
  );
  assert.equal(
    resolveUseRealReservationsApi({ nodeEnv: "test", demoMode: false, useRealApiEnv: "false" }),
    true,
  );
});

test("development keeps the explicit real/local reservation API override", () => {
  assert.equal(
    resolveUseRealReservationsApi({ nodeEnv: "development", demoMode: true, useRealApiEnv: "false" }),
    false,
  );
  assert.equal(
    resolveUseRealReservationsApi({ nodeEnv: "development", demoMode: true, useRealApiEnv: "true" }),
    true,
  );
  assert.equal(
    resolveUseRealReservationsApi({ nodeEnv: "development", demoMode: true, useRealApiEnv: undefined }),
    false,
  );
});
