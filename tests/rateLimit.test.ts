import test from "node:test";
import assert from "node:assert/strict";
import {
  checkLoginRateLimit,
  checkRateLimit,
  resetLoginRateLimitOnSuccess,
} from "../src/lib/auth/rateLimit";

function requestForIp(ip: string): Request {
  return new Request("https://example.test/api/auth/login", {
    headers: { "x-forwarded-for": ip },
  });
}

test("generic rate limiter allows maxAttempts and blocks the next attempt", () => {
  const request = requestForIp("198.51.100.10");
  for (let i = 0; i < 5; i++) {
    assert.equal(checkRateLimit(request, "contact-test", { maxAttempts: 5 }).ok, true);
  }
  const blocked = checkRateLimit(request, "contact-test", { maxAttempts: 5 });
  assert.equal(blocked.ok, false);
  assert.ok((blocked.retryAfterSec ?? 0) > 0);
});

test("login throttling does not let one account lock every user behind the same NAT", () => {
  const request = requestForIp("198.51.100.20");

  for (let i = 0; i < 5; i++) {
    assert.equal(checkLoginRateLimit(request, "first.user@example.test").ok, true);
  }
  assert.equal(checkLoginRateLimit(request, "first.user@example.test").ok, false);

  // Same hospital/public IP, different account: independent allowance.
  assert.equal(checkLoginRateLimit(request, "second.user@example.test").ok, true);
});

test("login identity normalization shares the same counter without storing clear email", () => {
  const request = requestForIp("198.51.100.30");

  for (let i = 0; i < 5; i++) {
    assert.equal(checkLoginRateLimit(request, "  Mixed.Case@Example.Test  ").ok, true);
  }
  assert.equal(checkLoginRateLimit(request, "mixed.case@example.test").ok, false);
});

test("successful login reset only clears the matching IP and identity", () => {
  const request = requestForIp("198.51.100.40");
  const otherRequest = requestForIp("198.51.100.41");
  const identity = "reset.user@example.test";

  for (let i = 0; i < 5; i++) {
    assert.equal(checkLoginRateLimit(request, identity).ok, true);
    assert.equal(checkLoginRateLimit(otherRequest, identity).ok, true);
  }

  assert.equal(checkLoginRateLimit(request, identity).ok, false);
  assert.equal(checkLoginRateLimit(otherRequest, identity).ok, false);

  resetLoginRateLimitOnSuccess(request, identity);
  assert.equal(checkLoginRateLimit(request, identity).ok, true);
  assert.equal(checkLoginRateLimit(otherRequest, identity).ok, false);
});
