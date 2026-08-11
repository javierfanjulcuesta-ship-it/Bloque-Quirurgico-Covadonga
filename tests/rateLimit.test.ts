import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetRateLimitForTests,
  checkLoginRateLimit,
  checkRateLimit,
  recordLoginFailure,
  resetLoginRateLimitOnSuccess,
} from "../src/lib/auth/rateLimit";

function requestFor(ip: string): Request {
  return new Request("https://example.test/api/auth/login", {
    headers: { "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  __resetRateLimitForTests();
});

test("allows five failed attempts and blocks the following request for the account", () => {
  const request = requestFor("203.0.113.10");
  const email = "User@Example.com";

  for (let i = 0; i < 5; i++) {
    assert.equal(checkLoginRateLimit(request, email).ok, true);
    recordLoginFailure(request, email);
  }

  const blocked = checkLoginRateLimit(request, email.toLowerCase());
  assert.equal(blocked.ok, false);
  assert.ok((blocked.retryAfterSec ?? 0) > 0);
});

test("a successful login clears only that account lock", () => {
  const request = requestFor("203.0.113.11");
  const email = "person@example.com";

  for (let i = 0; i < 5; i++) recordLoginFailure(request, email);
  assert.equal(checkLoginRateLimit(request, email).ok, false);

  resetLoginRateLimitOnSuccess(request, email);
  assert.equal(checkLoginRateLimit(request, email).ok, true);
});

test("account limit follows the account across source IPs", () => {
  const email = "target@example.com";
  for (let i = 0; i < 5; i++) {
    recordLoginFailure(requestFor(`198.51.100.${i + 1}`), email);
  }

  assert.equal(checkLoginRateLimit(requestFor("198.51.100.99"), email).ok, false);
});

test("shared IP does not lock a different account after five failures on one account", () => {
  const request = requestFor("192.0.2.20");
  for (let i = 0; i < 5; i++) recordLoginFailure(request, "first@example.com");

  assert.equal(checkLoginRateLimit(request, "first@example.com").ok, false);
  assert.equal(checkLoginRateLimit(request, "second@example.com").ok, true);
});

test("IP limiter still stops broad credential stuffing after twenty failures", () => {
  const request = requestFor("192.0.2.21");
  for (let i = 0; i < 20; i++) {
    const email = `user${i}@example.com`;
    assert.equal(checkLoginRateLimit(request, email).ok, true);
    recordLoginFailure(request, email);
  }

  assert.equal(checkLoginRateLimit(request, "new-target@example.com").ok, false);
});

test("generic limiter allows the configured quota and blocks the next request", () => {
  const request = requestFor("192.0.2.30");
  for (let i = 0; i < 5; i++) {
    assert.equal(checkRateLimit(request, "contact", { maxAttempts: 5 }).ok, true);
  }
  const blocked = checkRateLimit(request, "contact", { maxAttempts: 5 });
  assert.equal(blocked.ok, false);
  assert.ok((blocked.retryAfterSec ?? 0) > 0);
});
